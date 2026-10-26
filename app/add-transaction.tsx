import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

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
import { PageLayout } from '@/src/ui/PageLayout';
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

  return (
    <PageLayout title="Add transaction" subtitle="Fast capture before paying" loading={loading}>
      {error && !saving ? (
        <Text accessibilityRole="alert" className="mb-3 text-sm text-red-700">
          {error}
        </Text>
      ) : null}
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
        <View className="flex-row flex-wrap gap-2">
          {lines.map((line) => {
            const isActive = line.id === selectedLineId;
            return (
              <Pressable
                key={line.id}
                onPress={() => {
                  setSelectedLineId(line.id);
                  setConfirmWarning(false);
                  setOverrideOpen(false);
                  setMessage(null);
                }}
                className={`min-h-12 items-center justify-center rounded-full px-4 py-3 ${
                  isActive ? 'bg-emerald-100' : 'bg-slate-100'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${isActive ? 'text-emerald-700' : 'text-slate-700'}`}
                >
                  {line.name}
                </Text>
              </Pressable>
            );
          })}
          {lines.length === 0 ? (
            <Text className="text-sm text-slate-500">
              No active budget lines for this month. Add a line in Budget before recording an
              expense.
            </Text>
          ) : null}
        </View>
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
