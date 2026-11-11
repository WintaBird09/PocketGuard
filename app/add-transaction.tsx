import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { addBudgetLine, type LineKind } from '@/src/data/plan';
import { listIncomeStreams, type IncomeStream } from '@/src/data/income';
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
import { Banner } from '@/src/ui/controls';
import { MicButton } from '@/src/ui/MicButton';
import { PageLayout } from '@/src/ui/PageLayout';
import { matchLine, parseLocally, parseVoiceTransaction } from '@/src/voice/localParse';
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
import { getCurrencyCode } from '@/src/domain/currency';
import { confirmMomoImport, dismissMomoImport } from '@/src/momo/store';
import { momoDelayNotice } from '@/src/domain/momoDelayNotice';

export default function AddTransactionScreen() {
  const params = useLocalSearchParams<{
    autostart?: string;
    source?: string;
    momoImportId?: string;
    momoSource?: string;
    momoTransactionId?: string;
    momoAction?: string;
    momoAmount?: string;
    momoCounterparty?: string;
    momoPhone?: string;
    momoDateTime?: string;
    momoFee?: string;
    momoBalance?: string;
    momoUserMessage?: string;
    momoRecognized?: string;
  }>();
  const router = useRouter();
  const dateRevision = useDateOverrideRevision();
  const [database, setDatabase] = useState<DatabaseLike | null>(null);
  const [householdId, setHouseholdId] = useState('');
  const [lines, setLines] = useState<ExpenseLineOption[]>([]);
  const [incomeStreams, setIncomeStreams] = useState<IncomeStream[]>([]);
  const [selectedLineId, setSelectedLineId] = useState('');
  const [selectedIncomeStreamId, setSelectedIncomeStreamId] = useState('');
  const [amountInput, setAmountInput] = useState(params.momoAmount ?? '');
  const [direction, setDirection] = useState<'expense' | 'income' | 'loan' | 'loan_repayment'>(
    params.momoAction === 'RECEIVED' ? 'income' : 'expense',
  );
  const [entrySource, setEntrySource] = useState<'MANUAL' | 'VOICE'>(
    params.source === 'VOICE' ? 'VOICE' : 'MANUAL',
  );
  const momoAmount = Number(params.momoAmount);
  const momoFee = Number(params.momoFee);
  const momoBalance = Number(params.momoBalance);
  const momoDateTime = params.momoDateTime ?? '';
  const momoImport = useMemo(
    () =>
      params.momoImportId
        ? {
            id: params.momoImportId,
            source: params.momoSource ?? 'MOMO_PASTE',
            transactionId: params.momoTransactionId ?? null,
            item: {
              action: params.momoAction ?? null,
              amount: Number.isSafeInteger(momoAmount) ? momoAmount : null,
              counterpartyName: params.momoCounterparty ?? null,
              counterpartyPhone: params.momoPhone ?? null,
              dateTime: momoDateTime || null,
              fee: Number.isSafeInteger(momoFee) ? momoFee : 0,
              balanceAfter: Number.isSafeInteger(momoBalance) ? momoBalance : null,
              transactionId: params.momoTransactionId ?? null,
              userMessage: params.momoUserMessage ?? null,
              recognized: params.momoRecognized === 'true',
            },
          }
        : null,
    [
      momoAmount,
      momoBalance,
      momoDateTime,
      momoFee,
      params.momoAction,
      params.momoCounterparty,
      params.momoImportId,
      params.momoPhone,
      params.momoRecognized,
      params.momoSource,
      params.momoTransactionId,
      params.momoUserMessage,
    ],
  );
  const [note, setNote] = useState(
    [params.momoCounterparty, params.momoUserMessage]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(' - '),
  );
  const [occurredTime, setOccurredTime] = useState(momoDateTime.slice(11) || '12:00:00');
  const [dateSelection, setDateSelection] = useState(() => ({
    revision: dateRevision,
    date: momoDateTime.slice(0, 10) || localDateString(),
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
  const autoStarted = useRef(false);
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
        const streams = listIncomeStreams(db, household.id);
        if (!active) return;
        setDatabase(db);
        setHouseholdId(household.id);
        setLines(lineOptions);
        const suggestedLineId = matchLine(
          `${params.momoCounterparty ?? ''} ${params.momoUserMessage ?? ''}`,
          lineOptions,
        );
        setSelectedLineId((current) => current || suggestedLineId || lineOptions[0]?.id || '');
        const selectedLine =
          lineOptions.find((line) => line.id === selectedLineId) ?? lineOptions[0];
        setSelectedIncomeStreamId((current) => current || selectedLine?.incomeStreamId || '');
        setIncomeStreams(streams);
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
  }, [
    occurredOn,
    params.momoCounterparty,
    params.momoPhone,
    params.momoUserMessage,
    reload,
    selectedLineId,
  ]);

  const resetChecks = () => {
    setConfirmWarning(false);
    setOverrideOpen(false);
    setMessage(null);
  };

  // Fills the amount and budget line from what was said; the server parser is tried first.
  const applyVoice = async (text: string) => {
    if (!database || !householdId) return;
    setEntrySource('VOICE');
    const localDraft = parseVoiceTransaction(text, lines, localDateString());
    setDirection(localDraft.direction);
    setOccurredOn(localDraft.occurredOn);
    if (localDraft.amount !== null) setAmountInput(String(localDraft.amount));
    if (localDraft.lineId !== null) setSelectedLineId(localDraft.lineId);
    if (localDraft.description) setNote(localDraft.description);
    setParsing(true);
    let amountFound: number | null = null;
    let lineFound: string | null = null;
    let noteFound = localDraft.description;
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
    if (lineFound !== null) {
      setSelectedLineId(lineFound);
      setSelectedIncomeStreamId(lines.find((line) => line.id === lineFound)?.incomeStreamId ?? '');
    }
    if (noteFound) setNote(noteFound);
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

  useEffect(() => {
    if (params.autostart !== '1' || autoStarted.current || loading) return;
    autoStarted.current = true;
    void toggleVoice();
    // Voice is started once when the user chooses Voice from the add menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.autostart, loading]);

  const amount = Number(amountInput);
  const reviewState = useMemo(() => {
    if (
      direction === 'income' ||
      direction === 'loan_repayment' ||
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
          amount: amount + (momoImport?.item.fee ?? 0),
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
  }, [amount, database, direction, householdId, momoImport, occurredOn, selectedLineId]);
  const { review } = reviewState;

  const selectedLine = lines.find((line) => line.id === selectedLineId);
  const statusColor =
    review?.result.status === 'BLOCKED'
      ? 'text-red-700 dark:text-red-400'
      : review?.result.status === 'WARN'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-emerald-700 dark:text-emerald-400';
  const delayedMomoNotice = momoImport
    ? momoDelayNotice(momoImport.item.dateTime?.slice(0, 10) ?? null, localDateString())
    : null;
  const directionOptions =
    momoImport?.item.action === 'TRANSFER'
      ? [
          { value: 'expense' as const, label: 'Payment', icon: 'card-outline' as const },
          { value: 'loan' as const, label: 'Loan given', icon: 'hand-left-outline' as const },
          {
            value: 'loan_repayment' as const,
            label: 'Repay debt',
            icon: 'return-up-back-outline' as const,
          },
        ]
      : [
          { value: 'expense' as const, label: 'Expense', icon: 'arrow-up-circle-outline' as const },
          { value: 'income' as const, label: 'Income', icon: 'arrow-down-circle-outline' as const },
        ];

  const openDebtPayment = () => {
    router.push({
      pathname: '/debts',
      params: {
        pay: '1',
        amount: amountInput,
        date: occurredOn,
        note,
        ...(momoImport ? { momoImportId: momoImport.id } : {}),
      },
    });
  };

  const save = async () => {
    if (direction === 'loan_repayment') {
      openDebtPayment();
      return;
    }
    if (direction === 'income') {
      router.push({
        pathname: '/income',
        params: {
          add: '1',
          amount: amountInput,
          note,
          date: occurredOn,
          ...(momoImport ? { momoImportId: momoImport.id } : {}),
        },
      });
      return;
    }
    if (!database || !householdId) {
      setError('The local database is not ready yet.');
      return;
    }

    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      let override: { reason: string; authenticated: boolean } | undefined;
      const source = entrySource;
      const occurredAt = new Date(
        `${occurredOn}T${momoImport ? occurredTime : '12:00:00'}+01:00`,
      ).toISOString();
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
      if (momoImport) {
        if (review?.result.status === 'WARN' && !confirmWarning) {
          setConfirmWarning(true);
          setMessage(
            'This entry needs your confirmation because it will trigger a budget warning.',
          );
          return;
        }
        confirmMomoImport(database, householdId, momoImport.id, {
          amount,
          fee: momoImport.item.fee,
          direction,
          note,
          occurredAt,
          lineId: selectedLineId,
          counterpartyName: momoImport.item.counterpartyName,
          counterpartyPhone: momoImport.item.counterpartyPhone,
          overrideReason: override?.reason,
        });
        scheduleNotificationRefresh();
        setMessage('MoMo transaction confirmed and added.');
        setReload((current) => current + 1);
        router.back();
        return;
      }
      const submission = submitExpense(
        database,
        householdId,
        {
          lineId: selectedLineId,
          incomeStreamId: selectedIncomeStreamId || null,
          amount,
          note,
          occurredOn,
          source,
          rawText: source === 'VOICE' ? heard : null,
        },
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
      setSelectedIncomeStreamId(lines.find((line) => line.id === id)?.incomeStreamId ?? '');
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
        <Text accessibilityRole="alert" className="mb-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </Text>
      ) : null}
      <View className="mb-5 flex-row items-center gap-4 rounded-2xl bg-slate-900 dark:bg-slate-800 p-4">
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

      <View className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <View className="mb-4 flex-row rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {directionOptions.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={option.value === 'loan_repayment' ? 'Repay debt' : option.label}
              accessibilityState={{ selected: direction === option.value }}
              onPress={() => {
                if (option.value === 'income') {
                  router.push({
                    pathname: '/income',
                    params: {
                      add: '1',
                      amount: amountInput,
                      note,
                      date: occurredOn,
                      ...(momoImport ? { momoImportId: momoImport.id } : {}),
                    },
                  });
                  return;
                }
                if (option.value === 'loan_repayment') {
                  openDebtPayment();
                  return;
                }
                if (option.value === 'loan' && momoImport) {
                  router.push({
                    pathname: '/loan-form',
                    params: {
                      momoImportId: momoImport.id,
                      amount: amountInput,
                      personName: momoImport.item.counterpartyName ?? note,
                      personPhone: momoImport.item.counterpartyPhone ?? '',
                      lentOn: occurredOn,
                      time: occurredTime,
                      note,
                    },
                  });
                  return;
                }
                setDirection(option.value);
              }}
              className={`min-h-16 flex-1 items-center justify-center rounded-lg border px-1 py-2 ${
                direction === option.value
                  ? 'border-white bg-white shadow-sm dark:border-slate-600 dark:bg-slate-700'
                  : 'border-transparent'
              }`}
            >
              <Ionicons
                name={option.icon}
                size={19}
                color={direction === option.value ? '#047857' : '#64748b'}
              />
              <Text
                numberOfLines={2}
                className={`mt-1 text-center text-xs font-bold ${
                  direction === option.value
                    ? 'text-emerald-800 dark:text-emerald-200'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {delayedMomoNotice ? <Banner tone="info">{delayedMomoNotice}</Banner> : null}
        {momoImport ? (
          <View className="mb-3 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2">
            <Text className="text-xs text-slate-600 dark:text-slate-300">
              SMS balance after transaction
            </Text>
            <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
              {momoImport.item.balanceAfter === null
                ? 'Not included'
                : formatXAF(momoImport.item.balanceAfter)}
            </Text>
            {momoImport.item.fee > 0 ? (
              <Text className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Fee: {formatXAF(momoImport.item.fee)}. Included in the recorded expense total.
              </Text>
            ) : null}
            {!momoImport.item.recognized ? (
              <Text className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                Unrecognized MoMo message. Enter the details manually or dismiss it from the pending
                list.
              </Text>
            ) : null}
          </View>
        ) : null}
        <Text className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Amount ({getCurrencyCode()})
        </Text>
        <TextInput
          accessibilityLabel={`Amount in ${getCurrencyCode()}`}
          value={amountInput}
          onChangeText={(value) => {
            setAmountInput(value);
            setConfirmWarning(false);
            setOverrideOpen(false);
            setMessage(null);
          }}
          keyboardType="number-pad"
          placeholder="Enter a whole amount"
          className="min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-2xl font-bold text-slate-900 dark:text-slate-100"
        />

        {direction !== 'income' && direction !== 'loan_repayment' ? (
          <Text className="mb-2 mt-4 text-sm font-medium text-slate-700 dark:text-slate-200">
            Budget line
          </Text>
        ) : null}
        {direction !== 'income' && direction !== 'loan_repayment' ? (
          <BudgetLinePicker
            lines={lines}
            selectedId={selectedLineId}
            onSelect={(id) => {
              setSelectedLineId(id);
              setSelectedIncomeStreamId(lines.find((line) => line.id === id)?.incomeStreamId ?? '');
              setConfirmWarning(false);
              setOverrideOpen(false);
              setMessage(null);
            }}
            onCreate={createLine}
          />
        ) : null}
        {direction !== 'income' && direction !== 'loan_repayment' ? (
          <Text className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {selectedLine?.hardCap ? 'Hard cap line' : 'Flexible line'}
          </Text>
        ) : null}

        {direction === 'expense' ? (
          <Text className="mb-2 mt-4 text-sm font-medium text-slate-700 dark:text-slate-200">
            Income source
          </Text>
        ) : null}
        {direction === 'expense' ? (
          incomeStreams.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: !selectedIncomeStreamId }}
                onPress={() => setSelectedIncomeStreamId('')}
                className={`min-h-11 justify-center rounded-full px-4 py-2 ${
                  selectedIncomeStreamId
                    ? 'bg-slate-100 dark:bg-slate-800'
                    : 'bg-emerald-100 dark:bg-emerald-900/40'
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    selectedIncomeStreamId
                      ? 'text-slate-700 dark:text-slate-200'
                      : 'text-emerald-800 dark:text-emerald-300'
                  }`}
                >
                  Unassigned
                </Text>
              </Pressable>
              {incomeStreams.map((stream) => {
                const active = selectedIncomeStreamId === stream.id;
                return (
                  <Pressable
                    key={stream.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Income source ${stream.name}`}
                    accessibilityState={{ selected: active }}
                    onPress={() => setSelectedIncomeStreamId(stream.id)}
                    className={`min-h-11 justify-center rounded-full px-4 py-2 ${
                      active
                        ? 'bg-emerald-100 dark:bg-emerald-900/40'
                        : 'bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        active
                          ? 'text-emerald-800 dark:text-emerald-300'
                          : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {stream.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text className="text-xs text-slate-500 dark:text-slate-400">
              Add an income source from More → Income to trace this expense to its funding source.
            </Text>
          )
        ) : null}

        <Text className="mb-2 mt-4 text-sm font-medium text-slate-700 dark:text-slate-200">
          Date
        </Text>
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
          className="min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-base text-slate-900 dark:text-slate-100"
        />

        {momoImport ? (
          <>
            <Text className="mb-2 mt-4 text-sm font-medium text-slate-700 dark:text-slate-200">
              Time
            </Text>
            <TextInput
              accessibilityLabel="Transaction time"
              value={occurredTime}
              onChangeText={setOccurredTime}
              placeholder="HH:mm:ss"
              className="min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-base text-slate-900 dark:text-slate-100"
            />
            {momoImport.item.counterpartyPhone ? (
              <Text className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Counterparty phone from SMS: {momoImport.item.counterpartyPhone}
              </Text>
            ) : null}
          </>
        ) : null}

        <Text className="mb-2 mt-4 text-sm font-medium text-slate-700 dark:text-slate-200">
          Note
        </Text>
        <TextInput
          accessibilityLabel="Transaction note"
          value={note}
          onChangeText={setNote}
          placeholder="Optional details"
          className="min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-base text-slate-900 dark:text-slate-100"
        />
      </View>

      {direction !== 'income' && direction !== 'loan_repayment' ? (
        <View className="mt-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <Text className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Spend check
          </Text>
          {review ? (
            <>
              <Text className={`text-lg font-semibold ${statusColor}`}>
                {review.result.status}: {review.result.reason}
              </Text>
              <Text className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {formatXAF(review.spent)} spent of {formatXAF(review.planned)} planned.
              </Text>
              <Text className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Remaining after this entry: {formatXAF(review.result.remainingAfter)}
              </Text>
            </>
          ) : reviewState.error ? (
            <Text accessibilityRole="alert" className="text-sm text-red-700 dark:text-red-400">
              {reviewState.error}
            </Text>
          ) : (
            <Text className="text-sm text-slate-500 dark:text-slate-400">
              Enter a positive amount and valid date to review.
            </Text>
          )}
        </View>
      ) : null}

      {overrideOpen && review?.result.status === 'BLOCKED' ? (
        <View className="mt-5 rounded-2xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/30 p-5">
          <Text className="mb-2 text-sm font-bold text-red-800 dark:text-red-300">
            Override this hard cap
          </Text>
          <TextInput
            accessibilityLabel="Override reason"
            value={overrideReason}
            onChangeText={setOverrideReason}
            placeholder="Why is this needed?"
            className="min-h-12 rounded-xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 px-4 py-3 text-base text-slate-900 dark:text-slate-100"
          />
          <Text className="mt-2 text-xs text-red-700 dark:text-red-400">
            Overrides are recorded with your reason and shown in the Overrides report.
          </Text>
        </View>
      ) : null}
      {error ? (
        <Text className="mt-4 text-sm font-medium text-red-700 dark:text-red-400">{error}</Text>
      ) : null}
      {message ? (
        <Text className="mt-4 text-sm font-medium text-slate-700 dark:text-slate-200">
          {message}
        </Text>
      ) : null}

      <View className="mt-5 flex-row gap-3">
        {direction === 'expense' ? (
          <Link
            href="/can-i-spend"
            className="min-h-12 flex-1 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3"
          >
            <Text className="text-center text-base font-bold text-slate-900 dark:text-slate-100">
              Can I spend?
            </Text>
          </Link>
        ) : (
          <View className="flex-1" />
        )}
        <Pressable
          accessibilityRole="button"
          disabled={
            direction === 'income'
              ? !Number.isSafeInteger(amount) || amount <= 0 || saving
              : direction === 'loan_repayment'
                ? !Number.isSafeInteger(amount) || amount <= 0 || saving
                : !review || saving
          }
          onPress={() => void save()}
          className={`min-h-12 flex-1 rounded-2xl px-4 py-3 ${
            (direction !== 'income' && direction !== 'loan_repayment' && !review) || saving
              ? 'bg-slate-300'
              : review?.result.status === 'BLOCKED'
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
                  : direction === 'income'
                    ? 'Save income'
                    : 'Save'}
          </Text>
        </Pressable>
      </View>
      {momoImport ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (!database) return;
            dismissMomoImport(database, householdId, momoImport.id);
            router.back();
          }}
          className="mt-3 min-h-12 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3"
        >
          <Text className="font-semibold text-slate-700 dark:text-slate-200">Dismiss / Ignore</Text>
        </Pressable>
      ) : null}
    </PageLayout>
  );
}
