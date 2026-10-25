import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { openAppDatabase, type DatabaseLike } from '@/src/data/db';
import {
  confirmSavingsCommitment,
  getSavingsOverview,
  type SavingsOverview,
} from '@/src/data/savings';
import { monthKeyForDate } from '@/src/domain/dates';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';

export default function SavingsScreen() {
  const [overview, setOverview] = useState<SavingsOverview | null>(null);
  const [database, setDatabase] = useState<DatabaseLike | null>(null);
  const [householdId, setHouseholdId] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingCommitmentId, setSavingCommitmentId] = useState<string | null>(null);
  const [savedAmounts, setSavedAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadSavings = async () => {
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
          const monthKey = monthKeyForDate(new Date(), 'Africa/Douala');
          const snapshot = getSavingsOverview(db, household.id, monthKey);
          if (active) {
            setDatabase(db);
            setHouseholdId(household.id);
            setOverview(snapshot);
            setError(null);
          }
        } catch (cause) {
          if (active) {
            setError(cause instanceof Error ? cause.message : 'Unable to load savings data.');
          }
        } finally {
          if (active) setLoading(false);
        }
      };

      void loadSavings();
      return () => {
        active = false;
      };
    }, []),
  );

  const confirmCommitment = async (commitmentId: string) => {
    if (!database || !householdId) return;
    setSavingCommitmentId(commitmentId);
    setError(null);
    try {
      const savedAt = new Date().toISOString();
      const amount = Number(
        savedAmounts[commitmentId] ??
          overview?.commitments.find((item) => item.id === commitmentId)?.plannedAmount,
      );
      const confirmed = confirmSavingsCommitment(
        database,
        householdId,
        commitmentId,
        amount,
        savedAt,
      );
      if (confirmed) {
        scheduleNotificationRefresh();
        setOverview((current) => {
          if (!current) return current;
          const commitment = current.commitments.find((item) => item.id === commitmentId);
          if (!commitment) return current;
          const actualSaved = Number(savedAmounts[commitmentId] ?? commitment.plannedAmount);
          return {
            ...current,
            saved: current.saved + actualSaved,
            projectedGap: Math.max(0, current.target - current.saved - actualSaved),
            projectedTotal: current.projectedTotal - commitment.plannedAmount + actualSaved,
            shortfall: Math.max(
              0,
              current.target - (current.projectedTotal - commitment.plannedAmount + actualSaved),
            ),
            overdueMonths: current.overdueMonths.filter((month) => month !== commitment.month),
            commitments: current.commitments.map((item) =>
              item.id === commitmentId
                ? {
                    ...item,
                    savedAmount: actualSaved,
                    savedAt,
                  }
                : item,
            ),
          };
        });
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to confirm the savings commitment.',
      );
    } finally {
      setSavingCommitmentId(null);
    }
  };

  const progress = overview ? (overview.saved / overview.target) * 100 : 0;

  return (
    <PageLayout title="Savings" subtitle="Goals, commitments, and progress">
      {loading ? <Text className="text-sm text-slate-600">Loading persisted savings…</Text> : null}
      {error ? <Text className="mb-4 text-sm font-medium text-red-700">{error}</Text> : null}
      {!loading && !overview ? (
        <Text className="text-sm text-slate-600">No savings goal has been added yet.</Text>
      ) : null}
      {overview ? (
        <>
          <View className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <Text className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {overview.goalName}
            </Text>
            <Text className="mt-2 text-3xl font-bold text-slate-900">
              {formatXAF(overview.saved)}
            </Text>
            <Text className="mt-1 text-sm text-slate-600">
              of {formatXAF(overview.target)} target
            </Text>

            <View className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200">
              <View
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </View>

            <View className="mt-4 flex-row justify-between">
              <Text className="text-sm text-slate-600">Monthly commitment</Text>
              <Text className="text-sm font-semibold text-slate-900">
                {formatXAF(overview.monthlyCommitment)}
              </Text>
            </View>
            <View className="mt-2 flex-row justify-between">
              <Text className="text-sm text-slate-600">Projected gap</Text>
              <Text className="text-sm font-semibold text-amber-700">
                {formatXAF(overview.projectedGap)}
              </Text>
            </View>
          </View>

          <View className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <Text className="text-lg font-bold text-slate-900">Gap analysis</Text>
            <View className="mt-3 flex-row justify-between">
              <Text className="text-sm text-slate-600">
                Projected total if the plan is followed
              </Text>
              <Text className="text-sm font-semibold text-slate-900">
                {formatXAF(overview.projectedTotal)}
              </Text>
            </View>
            <View className="mt-2 flex-row justify-between">
              <Text className="text-sm text-slate-600">Goal</Text>
              <Text className="text-sm font-semibold text-slate-900">
                {formatXAF(overview.target)}
              </Text>
            </View>
            <View className="mt-2 flex-row justify-between border-t border-slate-200 pt-2">
              <Text className="text-sm font-bold text-slate-900">
                {overview.shortfall > 0 ? 'Shortfall' : 'Goal covered'}
              </Text>
              <Text
                className={`text-sm font-bold ${overview.shortfall > 0 ? 'text-red-700' : 'text-emerald-700'}`}
              >
                {formatXAF(overview.shortfall)}
              </Text>
            </View>
            {overview.overdueMonths.length > 0 ? (
              <Text className="mt-3 text-sm font-semibold text-red-700">
                Overdue, not yet confirmed: {overview.overdueMonths.join(', ')}
              </Text>
            ) : null}
          </View>

          <View className="mt-5 gap-3">
            <Text className="text-lg font-bold text-slate-900">This month’s commitments</Text>
            {overview.commitments.length ? (
              overview.commitments.map((commitment) => (
                <View
                  key={commitment.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-base font-semibold text-slate-900">
                      {commitment.month}
                    </Text>
                    <Text className="text-sm font-bold text-slate-700">
                      {formatXAF(commitment.plannedAmount)}
                    </Text>
                  </View>
                  {commitment.savedAt ? (
                    <Text className="mt-2 text-sm font-medium text-emerald-700">
                      Confirmed as saved
                    </Text>
                  ) : (
                    <View className="mt-3 flex-row items-center gap-3">
                      <TextInput
                        accessibilityLabel={`Saved amount for ${commitment.month}`}
                        className="min-w-28 rounded-xl border border-slate-200 px-3 py-3 text-base font-semibold text-slate-900"
                        editable={savingCommitmentId !== commitment.id}
                        keyboardType="number-pad"
                        onChangeText={(value) =>
                          setSavedAmounts((current) => ({
                            ...current,
                            [commitment.id]: value,
                          }))
                        }
                        value={savedAmounts[commitment.id] ?? String(commitment.plannedAmount)}
                      />
                      <Pressable
                        accessibilityRole="button"
                        disabled={savingCommitmentId === commitment.id}
                        onPress={() => void confirmCommitment(commitment.id)}
                        className="flex-1 rounded-xl bg-emerald-600 px-4 py-3"
                      >
                        <Text className="text-center font-bold text-white">
                          {savingCommitmentId === commitment.id ? 'Saving…' : 'I have saved'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            ) : (
              <Text className="text-sm text-slate-600">
                No savings commitment is planned for this month.
              </Text>
            )}
          </View>
        </>
      ) : null}
    </PageLayout>
  );
}
