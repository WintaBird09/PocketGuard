import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import {
  getExpenseReview,
  listExpenseLines,
  type ExpenseLineOption,
} from '@/src/data/transaction-entry';
import { openAppDatabase, type DatabaseLike } from '@/src/data/db';
import { localDateString, monthKeyForDate } from '@/src/domain/dates';
import { useDateOverrideRevision } from '@/src/domain/useDateOverrideRevision';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';

export default function CanISpendScreen() {
  const dateRevision = useDateOverrideRevision();
  const [database, setDatabase] = useState<DatabaseLike | null>(null);
  const [householdId, setHouseholdId] = useState('');
  const [lines, setLines] = useState<ExpenseLineOption[]>([]);
  const [lineId, setLineId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [dateSelection, setDateSelection] = useState(() => ({
    revision: dateRevision,
    date: localDateString(),
  }));
  const occurredOn =
    dateSelection.revision === dateRevision ? dateSelection.date : localDateString();
  const setOccurredOn = (date: string) => setDateSelection({ revision: dateRevision, date });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;

    const loadLines = async () => {
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
        const options = listExpenseLines(db, household.id, month);
        if (!active) return;
        setDatabase(db);
        setHouseholdId(household.id);
        setLines(options);
        setLineId((current) => current || options[0]?.id || '');
        setError(null);
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Unable to load budget lines.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadLines();
    return () => {
      active = false;
    };
  }, [occurredOn]);

  const amount = Number(amountInput);
  const reviewState = useMemo(() => {
    if (!database || !householdId || !lineId || !Number.isSafeInteger(amount) || amount <= 0) {
      return { review: null, error: null };
    }
    try {
      return {
        review: getExpenseReview(database, householdId, { lineId, amount, occurredOn }),
        error: null,
      };
    } catch (cause) {
      return {
        review: null,
        error: cause instanceof Error ? cause.message : 'Unable to calculate the spend check.',
      };
    }
  }, [amount, database, householdId, lineId, occurredOn]);
  const { review } = reviewState;

  const statusColor =
    review?.result.status === 'BLOCKED'
      ? 'text-red-700'
      : review?.result.status === 'WARN'
        ? 'text-amber-700'
        : 'text-emerald-700';

  return (
    <PageLayout title="Can I spend?" subtitle="Check the impact before paying" loading={loading}>
      {error ? (
        <Text accessibilityRole="alert" className="mb-3 text-sm text-red-700">
          {error}
        </Text>
      ) : null}
      {!loading && !error && lines.length === 0 ? (
        <Text className="mb-3 text-sm text-slate-600">
          No active budget lines are available for this date.
        </Text>
      ) : null}
      <View className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="mb-2 text-sm font-medium text-slate-700">Amount (XAF)</Text>
        <TextInput
          accessibilityLabel="Check amount in XAF"
          value={amountInput}
          onChangeText={setAmountInput}
          keyboardType="number-pad"
          placeholder="Enter a whole amount"
          className="min-h-12 rounded-xl border border-slate-200 px-4 py-3 text-2xl font-bold text-slate-900"
        />

        <Text className="mb-2 mt-4 text-sm font-medium text-slate-700">Budget line</Text>
        <View className="flex-row flex-wrap gap-2">
          {lines.map((line) => {
            const selected = line.id === lineId;
            return (
              <Pressable
                key={line.id}
                onPress={() => setLineId(line.id)}
                accessibilityRole="button"
                accessibilityLabel={`Budget line ${line.name}`}
                accessibilityState={{ selected }}
                className={`min-h-12 items-center justify-center rounded-full px-4 py-3 ${
                  selected ? 'bg-emerald-100' : 'bg-slate-100'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${selected ? 'text-emerald-700' : 'text-slate-700'}`}
                >
                  {line.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="mb-2 mt-4 text-sm font-medium text-slate-700">Date</Text>
        <TextInput
          accessibilityLabel="Check date"
          value={occurredOn}
          onChangeText={setOccurredOn}
          placeholder="YYYY-MM-DD"
          className="min-h-12 rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900"
        />
      </View>

      <View className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {review ? (
          <>
            <Text className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Spend check
            </Text>
            <Text className={`text-lg font-semibold ${statusColor}`}>
              {review.result.status}: {review.result.reason}
            </Text>
            <Text className="mt-2 text-sm text-slate-600">
              {formatXAF(review.spent)} spent of {formatXAF(review.planned)} planned.
            </Text>
            <Text className="mt-1 text-sm text-slate-600">
              Remaining after spend: {formatXAF(review.result.remainingAfter)}
            </Text>
          </>
        ) : reviewState.error ? (
          <Text accessibilityRole="alert" className="text-sm text-red-700">
            {reviewState.error}
          </Text>
        ) : (
          <Text className="text-sm text-slate-500">
            Enter a positive amount and valid date to check. Nothing will be saved.
          </Text>
        )}
      </View>
      <Text className="mt-4 text-center text-xs text-slate-500">
        This check never creates a transaction.
      </Text>
    </PageLayout>
  );
}
