import { Link } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { addBudgetLine, type LineKind } from '@/src/data/plan';
import {
  getExpenseReview,
  listExpenseLines,
  submitExpense,
  type ExpenseLineOption,
} from '@/src/data/transaction-entry';
import { openAppDatabase, type DatabaseLike } from '@/src/data/db';
import { localDateString, monthKeyForDate } from '@/src/domain/dates';
import { useDateOverrideRevision } from '@/src/domain/useDateOverrideRevision';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { authenticateForOverride } from '@/src/security/appLock';
import { BudgetLinePicker } from '@/src/ui/BudgetLinePicker';
import { MicButton } from '@/src/ui/MicButton';
import { PageLayout } from '@/src/ui/PageLayout';
import { parseLocally } from '@/src/voice/localParse';
import { parseVoiceTranscript } from '@/src/voice/parser';
import {
  abortSpeechRecognition,
  getSpeechRecognitionSnapshot,
  startSpeechRecognition,
  stopSpeechRecognition,
  subscribeSpeechRecognition,
  type SpeechRecognitionSnapshot,
} from '@/src/voice/stt';
import { formatXAF } from '@/src/ui/theme';

export default function AddTransactionScreen() {
  const dateRevision = useDateOverrideRevision();
  const [database, setDatabase] = useState<DatabaseLike | null>(null);
  const [householdId, setHouseholdId] = useState('');
  const [lines, setLines] = useState<ExpenseLineOption[]>([]);
  const [selectedLineId, setSelectedLineId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [note, setNote] = useState('');
  const [dateSelection, setDateSelection] = useState(() => ({
    revision: dateRevision,
    date: localDateString(),
  }));
  const occurredOn =
    dateSelection.revision === dateRevision ? dateSelection.date : localDateString();
  const setOccurredOn = (date: string) => setDateSelection({ revision: dateRevision, date });
  const [confirmWarning, setConfirmWarning] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [speech, setSpeech] = useState<SpeechRecognitionSnapshot>(getSpeechRecognitionSnapshot());
  const [heard, setHeard] = useState('');
  const [parsing, setParsing] = useState(false);
  const waitingForVoice = useRef(false);
  const applyVoiceRef = useRef<(text: string) => Promise<void>>(async () => {});
  useEffect(() => {
    let active = true;

    const loadEntryOptions = async () => {
      setLoading(true);
      try {
        const db = await openAppDatabase();
        const household = db
          .prepare?.(
            'SELECT id FROM households WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;',
          )
          .get();
        if (!household || typeof household.id !== 'string') {
          throw new Error('The local household has not been initialized.');
        }
        const month = monthKeyForDate(new Date(`${occurredOn}T12:00:00`), 'Africa/Douala');
        const lineOptions = listExpenseLines(db, household.id, month);
        if (!active) return;
        setDatabase(db);
        setHouseholdId(household.id);
        setLines(lineOptions);
        setSelectedLineId((current) => current || lineOptions[0]?.id || '');
        setError(null);
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Unable to load budget lines.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadEntryOptions();
    return () => {
      active = false;
    };
  }, [occurredOn, reload]);

  const resetChecks = () => {
    setConfirmWarning(false);
    setOverrideOpen(false);
    setMessage(null);
  };

  // Fills the amount and budget line from what was said; the server parser is tried first.
  const applyVoice = async (text: string) => {
    if (!database || !householdId) return;
    setParsing(true);
    let amountFound: number | null = null;
    let lineFound: string | null = null;
    let noteFound = '';
    try {
      const response = await parseVoiceTranscript(database, householdId, text, occurredOn);
      const item = response.items.find((entry) => entry.intent === 'log_expense');
      if (item) {
        amountFound = item.amount_xaf > 0 ? item.amount_xaf : null;
        lineFound =
          item.line_id && lines.some((line) => line.id === item.line_id)
            ? item.line_id
            : item.line_guess_name
              ? parseLocally(item.line_guess_name, lines).lineId
              : null;
        noteFound = item.note;
      }
    } catch {
      // Offline or signed out: fall back to on-device parsing below.
    }
    if (amountFound === null || lineFound === null) {
      const local = parseLocally(text, lines);
      amountFound ??= local.amount;
      lineFound ??= local.lineId;
    }
    setParsing(false);
    resetChecks();
    if (amountFound !== null) setAmountInput(String(amountFound));
    if (lineFound !== null) setSelectedLineId(lineFound);
    if (noteFound && !note) setNote(noteFound);
    const lineName = lines.find((line) => line.id === lineFound)?.name;
    setMessage(
      amountFound === null && lineFound === null
        ? `Heard “${text}”, but couldn't find an amount or budget line. Try “20000 on fuel”.`
        : `Heard “${text}”. ${amountFound !== null ? `Amount ${formatXAF(amountFound)}. ` : 'No amount found. '}${
            lineName ? `Budget line: ${lineName}.` : 'No budget line matched, please pick one.'
          }`,
    );
  };
  useEffect(() => {
    applyVoiceRef.current = applyVoice;
  });

  useEffect(() => {
    const subscription = subscribeSpeechRecognition((next) => {
      setSpeech(next);
      if (next.status === 'error') {
        waitingForVoice.current = false;
        setError(next.error);
      } else if (next.status === 'idle' && waitingForVoice.current) {
        waitingForVoice.current = false;
        if (next.transcript.trim()) {
          setHeard(next.transcript);
          void applyVoiceRef.current(next.transcript);
        } else {
          setMessage('Nothing was heard. Tap the mic and try again.');
        }
      }
    });
    return () => {
      subscription.remove();
      waitingForVoice.current = false;
      abortSpeechRecognition();
    };
  }, []);

  const toggleVoice = async () => {
    setError(null);
    if (speech.status === 'listening' || speech.status === 'stopping') {
      stopSpeechRecognition();
      return;
    }
    waitingForVoice.current = true;
    setMessage(null);
    try {
      await startSpeechRecognition();
    } catch (cause) {
      waitingForVoice.current = false;
      setError(cause instanceof Error ? cause.message : 'Unable to start speech recognition.');
    }
  };

  const amount = Number(amountInput);
  const reviewState = useMemo(() => {
    if (
      !database ||
      !householdId ||
      !selectedLineId ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      return { review: null, error: null };
    }
    try {
      return {
        review: getExpenseReview(database, householdId, {
          lineId: selectedLineId,
          amount,
          occurredOn,
        }),
        error: null,
      };
    } catch (cause) {
      return {
        review: null,
        error: cause instanceof Error ? cause.message : 'Unable to calculate the spend check.',
      };
    }
  }, [amount, database, householdId, occurredOn, selectedLineId]);
  const { review } = reviewState;

  const selectedLine = lines.find((line) => line.id === selectedLineId);
  const statusColor =
    review?.result.status === 'BLOCKED'
      ? 'text-red-700'
      : review?.result.status === 'WARN'
        ? 'text-amber-700'
        : 'text-emerald-700';

  const save = async () => {
    if (!database || !householdId) {
      setError('The local database is not ready yet.');
      return;
    }

    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      let override: { reason: string; authenticated: boolean } | undefined;
      if (review?.result.status === 'BLOCKED') {
        if (!overrideOpen) {
          setOverrideOpen(true);
          setMessage(
            `BLOCKED: ${review.result.reason} To go ahead, type a reason and confirm with your fingerprint or PIN.`,
          );
          return;
        }
        if (!overrideReason.trim()) {
          setError('Type a reason for the override.');
          return;
        }
        const auth = await authenticateForOverride();
        if (!auth.ok) {
          setError(auth.message);
          return;
        }
        override = { reason: overrideReason, authenticated: true };
      }
      const submission = submitExpense(
        database,
        householdId,
        { lineId: selectedLineId, amount, note, occurredOn },
        confirmWarning,
        override,
      );
      if (!submission.saved) {
        if (submission.reason === 'confirmation-required') {
          setConfirmWarning(true);
          setMessage(
            'This entry needs your confirmation because it will trigger a budget warning.',
          );
          return;
        }
        setMessage(`BLOCKED: ${submission.review.result.reason}`);
        return;
      }

      scheduleNotificationRefresh();
      setAmountInput('');
      setNote('');
      setConfirmWarning(false);
      setOverrideOpen(false);
      setOverrideReason('');
      setMessage(
        override ? 'Override saved and recorded in the Overrides report.' : 'Transaction saved.',
      );
      setReload((current) => current + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this transaction.');
    } finally {
      setSaving(false);
    }
  };

  // Reuses an existing line of the same name instead of rejecting the duplicate.
  const createLine = (rawName: string, kind: LineKind): string | null => {
    const name = rawName.trim();
    if (!database || !householdId) return 'Your data is still loading.';
    if (!name) return 'Enter a name for the budget line.';
    const existing = lines.find((line) => line.name.toLowerCase() === name.toLowerCase());
    try {
      const id = existing?.id ?? addBudgetLine(database, householdId, { name, kind });
      if (!existing) {
        const month = monthKeyForDate(new Date(`${occurredOn}T12:00:00`), 'Africa/Douala');
        setLines(listExpenseLines(database, householdId, month));
      }
      setSelectedLineId(id);
      setConfirmWarning(false);
      setOverrideOpen(false);
      setMessage(existing ? `“${existing.name}” already exists, so it was selected.` : null);
      return null;
    } catch (cause) {
      return cause instanceof Error ? cause.message : 'Unable to add the budget line.';
    }
  };

  return (
    <PageLayout title="Add transaction" subtitle="Fast capture before paying" loading={loading}>
      {error && !saving ? (
        <Text accessibilityRole="alert" className="mb-3 text-sm text-red-700">
          {error}
        </Text>
      ) : null}
      <View className="mb-5 flex-row items-center gap-4 rounded-2xl bg-slate-900 p-4">
        <MicButton
          active={speech.status === 'listening'}
          busy={parsing || speech.status === 'stopping'}
          size={64}
          onPress={() => void toggleVoice()}
          label={speech.status === 'listening' ? 'Stop listening' : 'Fill by voice'}
        />
        <View className="flex-1">
          <Text className="text-base font-bold text-white">
            {speech.status === 'listening'
              ? 'Listening…'
              : parsing
                ? 'Working it out…'
                : 'Fill by voice'}
          </Text>
          <Text numberOfLines={2} className="mt-0.5 text-xs text-slate-300">
            {speech.status === 'listening' && speech.transcript
              ? speech.transcript
              : heard || 'Say something like “20000 on fuel”.'}
          </Text>
        </View>
      </View>

      <View className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Amount (XAF)
        </Text>
        <TextInput
          accessibilityLabel="Amount in XAF"
          value={amountInput}
          onChangeText={(value) => {
            setAmountInput(value);
            setConfirmWarning(false);
            setOverrideOpen(false);
            setMessage(null);
          }}
          keyboardType="number-pad"
          placeholder="Enter a whole amount"
          className="min-h-12 rounded-xl border border-slate-200 px-4 py-3 text-2xl font-bold text-slate-900"
        />

        <Text className="mb-2 mt-4 text-sm font-medium text-slate-700">Budget line</Text>
        <BudgetLinePicker
          lines={lines}
          selectedId={selectedLineId}
          onSelect={(id) => {
            setSelectedLineId(id);
            setConfirmWarning(false);
            setOverrideOpen(false);
            setMessage(null);
          }}
          onCreate={createLine}
        />
        <Text className="mt-2 text-xs text-slate-500">
          {selectedLine?.hardCap ? 'Hard cap line' : 'Flexible line'}
        </Text>

        <Text className="mb-2 mt-4 text-sm font-medium text-slate-700">Date</Text>
        <TextInput
          accessibilityLabel="Transaction date"
          value={occurredOn}
          onChangeText={(value) => {
            setOccurredOn(value);
            setConfirmWarning(false);
            setOverrideOpen(false);
            setMessage(null);
          }}
          placeholder="YYYY-MM-DD"
          className="min-h-12 rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900"
        />

        <Text className="mb-2 mt-4 text-sm font-medium text-slate-700">Note</Text>
        <TextInput
          accessibilityLabel="Transaction note"
          value={note}
          onChangeText={setNote}
          placeholder="Optional details"
          className="min-h-12 rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900"
        />
      </View>

      <View className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Spend check
        </Text>
        {review ? (
          <>
            <Text className={`text-lg font-semibold ${statusColor}`}>
              {review.result.status}: {review.result.reason}
            </Text>
            <Text className="mt-1 text-sm text-slate-600">
              {formatXAF(review.spent)} spent of {formatXAF(review.planned)} planned.
            </Text>
            <Text className="mt-1 text-sm text-slate-600">
              Remaining after this entry: {formatXAF(review.result.remainingAfter)}
            </Text>
          </>
        ) : reviewState.error ? (
          <Text accessibilityRole="alert" className="text-sm text-red-700">
            {reviewState.error}
          </Text>
        ) : (
          <Text className="text-sm text-slate-500">
            Enter a positive amount and valid date to review.
          </Text>
        )}
      </View>

      {overrideOpen && review?.result.status === 'BLOCKED' ? (
        <View className="mt-5 rounded-2xl border border-red-300 bg-red-50 p-5">
          <Text className="mb-2 text-sm font-bold text-red-800">Override this hard cap</Text>
          <TextInput
            accessibilityLabel="Override reason"
            value={overrideReason}
            onChangeText={setOverrideReason}
            placeholder="Why is this needed?"
            className="min-h-12 rounded-xl border border-red-200 bg-white px-4 py-3 text-base text-slate-900"
          />
          <Text className="mt-2 text-xs text-red-700">
            Overrides are recorded with your reason and shown in the Overrides report.
          </Text>
        </View>
      ) : null}
      {error ? <Text className="mt-4 text-sm font-medium text-red-700">{error}</Text> : null}
      {message ? <Text className="mt-4 text-sm font-medium text-slate-700">{message}</Text> : null}

      <View className="mt-5 flex-row gap-3">
        <Link
          href="/can-i-spend"
          className="min-h-12 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
        >
          <Text className="text-center text-base font-bold text-slate-900">Can I spend?</Text>
        </Link>
        <Pressable
          accessibilityRole="button"
          disabled={!review || saving}
          onPress={() => void save()}
          className={`min-h-12 flex-1 rounded-2xl px-4 py-3 ${
            !review || saving
              ? 'bg-slate-300'
              : review.result.status === 'BLOCKED'
                ? 'bg-red-700'
                : 'bg-emerald-600'
          }`}
        >
          <Text className="text-center text-base font-bold text-white">
            {saving
              ? 'Saving…'
              : confirmWarning
                ? 'Confirm warning & save'
                : review?.result.status === 'BLOCKED'
                  ? overrideOpen
                    ? 'Authenticate & override'
                    : 'Blocked – override…'
                  : 'Save'}
          </Text>
        </Pressable>
      </View>
    </PageLayout>
  );
}
