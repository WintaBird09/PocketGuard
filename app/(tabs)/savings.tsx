import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import {
  confirmSavingsCommitment,
  deleteSavingsGoal,
  getSavingsPlanner,
  type GoalPlan,
} from '@/src/data/savings';
import { nextMonth, previousMonth } from '@/src/data/plan';
import { effectiveNow, monthKeyForDate } from '@/src/domain/dates';
import { useDateOverrideRevision } from '@/src/domain/useDateOverrideRevision';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { Banner, monthLabel } from '@/src/ui/controls';
import { assignLineIcons } from '@/src/ui/lineIcons';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';

type SavingsView = 'monthly' | 'annual';

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;

function ProgressBar({ value }: { value: number }) {
  return (
    <View className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      <View className="h-full rounded-full bg-emerald-500" style={{ width: `${value}%` }} />
    </View>
  );
}

function monthsLeft(goal: GoalPlan, currentMonth: string): number {
  return goal.commitments.filter((c) => !c.savedAt && c.month >= currentMonth).length;
}

export default function SavingsScreen() {
  const router = useRouter();
  useDateOverrideRevision();
  const currentMonth = monthKeyForDate(effectiveNow(), 'Africa/Douala');
  const { db, householdId, loading, error: dbError, tick, refresh } = useDatabase();
  const [view, setView] = useState<SavingsView>('monthly');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const month = selectedMonth ?? currentMonth;
  const activeYear = year ?? Number(currentMonth.slice(0, 4));

  const loaded = useMemo(() => {
    if (!db || !householdId) return { planner: null, failure: null };
    try {
      return {
        planner: getSavingsPlanner(db, householdId, activeYear, currentMonth),
        failure: null,
      };
    } catch (cause) {
      return {
        planner: null,
        failure: cause instanceof Error ? cause.message : 'Unable to load savings.',
      };
    }
    // tick re-reads after writes or when the tab regains focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, householdId, activeYear, currentMonth, tick]);
  const planner = loaded.planner;

  const monthItems = useMemo(
    () =>
      (planner?.goals ?? []).flatMap((goal) =>
        goal.commitments.filter((c) => c.month === month).map((c) => ({ goal, commitment: c })),
      ),
    [planner, month],
  );
  const monthPlanned = monthItems.reduce((n, i) => n + i.commitment.plannedAmount, 0);
  const monthSaved = monthItems.reduce(
    (n, i) => n + (i.commitment.savedAt ? (i.commitment.savedAmount ?? 0) : 0),
    0,
  );

  const confirm = (commitmentId: string, planned: number) => {
    if (!db || !householdId) return;
    setError(null);
    try {
      const amount = Number(amounts[commitmentId] ?? planned);
      confirmSavingsCommitment(db, householdId, commitmentId, amount);
      scheduleNotificationRefresh();
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to confirm the saving.');
    }
  };

  const removeGoal = (goal: GoalPlan) => {
    Alert.alert(
      `Delete "${goal.name}"?`,
      'This removes the goal and its planned monthly commitments. Budget allocations already set stay as they are.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (!db || !householdId) return;
            try {
              deleteSavingsGoal(db, householdId, goal.id);
              scheduleNotificationRefresh();
              refresh();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Unable to delete the goal.');
            }
          },
        },
      ],
    );
  };

  const goalIcons = useMemo(
    () =>
      assignLineIcons(
        (planner?.goals ?? []).map((goal) => ({ id: goal.id, name: goal.name, kind: 'savings' })),
      ),
    [planner],
  );

  const failure = dbError ?? loaded.failure ?? error;
  const maxBar = Math.max(1, ...(planner?.months.map((m) => Math.max(m.planned, m.saved)) ?? [1]));

  return (
    <PageLayout
      title="Savings"
      subtitle="Your goals, month by month and year by year"
      loading={loading}
    >
      {failure ? <Banner tone="error">{failure}</Banner> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a new savings goal"
        onPress={() => router.push('/savings-form')}
        className="mb-4 min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3"
      >
        <Ionicons name="add-circle" size={22} color="#fff" />
        <Text className="text-base font-bold text-white">Add new savings</Text>
      </Pressable>

      {planner ? (
        <>
          <View className="rounded-3xl bg-emerald-700 p-5">
            <Text className="text-xs font-semibold uppercase tracking-widest text-emerald-100">
              Saved across all goals
            </Text>
            <Text className="mt-1 text-3xl font-extrabold text-white">
              {formatXAF(planner.totalSaved)}
            </Text>
            <Text className="mt-1 text-sm text-emerald-100">
              of {formatXAF(planner.totalTarget)} · {pct(planner.totalSaved, planner.totalTarget)}%
            </Text>
            <View className="mt-3 h-2.5 overflow-hidden rounded-full bg-emerald-900/40">
              <View
                className="h-full rounded-full bg-white"
                style={{ width: `${pct(planner.totalSaved, planner.totalTarget)}%` }}
              />
            </View>
            <View className="mt-4 flex-row gap-3">
              <View className="flex-1 rounded-2xl bg-white/15 p-3">
                <Text className="text-xs text-emerald-100">This month</Text>
                <Text className="mt-1 text-base font-bold text-white">
                  {formatXAF(planner.goals.reduce((n, g) => n + g.thisMonthPlanned, 0))}
                </Text>
              </View>
              <View className="flex-1 rounded-2xl bg-white/15 p-3">
                <Text className="text-xs text-emerald-100">{planner.year} plan</Text>
                <Text className="mt-1 text-base font-bold text-white">
                  {formatXAF(planner.yearPlanned)}
                </Text>
              </View>
            </View>
          </View>

          <View className="mt-5 flex-row rounded-2xl bg-slate-200 dark:bg-slate-700 p-1">
            {(['monthly', 'annual'] as const).map((key) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: view === key }}
                onPress={() => setView(key)}
                className={`min-h-10 flex-1 items-center justify-center rounded-xl ${
                  view === key ? 'bg-white dark:bg-slate-900' : ''
                }`}
              >
                <Text
                  className={`text-sm font-bold ${view === key ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {key === 'monthly' ? 'Monthly' : 'Annual'}
                </Text>
              </Pressable>
            ))}
          </View>

          {view === 'monthly' ? (
            <View className="mt-4">
              <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  onPress={() => setSelectedMonth(previousMonth(month))}
                  className="h-11 w-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    className="text-slate-900 dark:text-slate-100"
                  />
                </Pressable>
                <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {monthLabel(month)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  onPress={() => setSelectedMonth(nextMonth(month))}
                  className="h-11 w-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
                >
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    className="text-slate-900 dark:text-slate-100"
                  />
                </Pressable>
              </View>

              <View className="mb-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                <View className="flex-row justify-between">
                  <Text className="text-sm text-slate-600 dark:text-slate-300">
                    Saved this month
                  </Text>
                  <Text className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {formatXAF(monthSaved)} / {formatXAF(monthPlanned)}
                  </Text>
                </View>
                <View className="mt-2">
                  <ProgressBar value={pct(monthSaved, monthPlanned)} />
                </View>
              </View>

              {monthItems.length === 0 ? (
                <Text className="text-sm text-slate-600 dark:text-slate-300">
                  No savings are planned for {monthLabel(month)}.
                </Text>
              ) : (
                monthItems.map(({ goal, commitment }) => (
                  <View
                    key={commitment.id}
                    className="mb-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="flex-1 text-base font-bold text-slate-900 dark:text-slate-100">
                        {goal.name}
                      </Text>
                      <Text className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        {formatXAF(commitment.plannedAmount)}
                      </Text>
                    </View>
                    {commitment.savedAt ? (
                      <Text className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                        ✓ Saved {formatXAF(commitment.savedAmount ?? 0)}
                      </Text>
                    ) : (
                      <View className="mt-3 flex-row items-center gap-3">
                        <TextInput
                          accessibilityLabel={`Saved amount for ${goal.name}`}
                          keyboardType="number-pad"
                          value={amounts[commitment.id] ?? String(commitment.plannedAmount)}
                          onChangeText={(value) =>
                            setAmounts((current) => ({ ...current, [commitment.id]: value }))
                          }
                          className="min-h-12 min-w-28 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-3 text-base font-semibold text-slate-900 dark:text-slate-100"
                        />
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => confirm(commitment.id, commitment.plannedAmount)}
                          className="min-h-12 flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 py-3"
                        >
                          <Text className="font-bold text-white">I have saved</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          ) : (
            <View className="mt-4">
              <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous year"
                  onPress={() => setYear(activeYear - 1)}
                  className="h-11 w-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    className="text-slate-900 dark:text-slate-100"
                  />
                </Pressable>
                <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {activeYear}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next year"
                  onPress={() => setYear(activeYear + 1)}
                  className="h-11 w-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
                >
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    className="text-slate-900 dark:text-slate-100"
                  />
                </Pressable>
              </View>

              <View className="mb-3 flex-row gap-3">
                <View className="flex-1 rounded-2xl bg-slate-100 dark:bg-slate-800 p-3">
                  <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Planned
                  </Text>
                  <Text className="mt-1 text-base font-extrabold text-slate-900 dark:text-slate-100">
                    {formatXAF(planner.yearPlanned)}
                  </Text>
                </View>
                <View className="flex-1 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 p-3">
                  <Text className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Saved
                  </Text>
                  <Text className="mt-1 text-base font-extrabold text-emerald-800 dark:text-emerald-300">
                    {formatXAF(planner.yearSaved)}
                  </Text>
                </View>
              </View>

              <View className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                <View className="h-36 flex-row items-end justify-between gap-1">
                  {planner.months.map((item) => (
                    <View key={item.month} className="flex-1 items-center justify-end">
                      <View
                        className="w-full justify-end overflow-hidden rounded-t-md bg-slate-200 dark:bg-slate-700"
                        style={{ height: Math.max(4, (item.planned / maxBar) * 120) }}
                      >
                        <View
                          className="w-full bg-emerald-500"
                          style={{ height: `${pct(item.saved, item.planned)}%` }}
                        />
                      </View>
                    </View>
                  ))}
                </View>
                <View className="mt-1 flex-row justify-between gap-1">
                  {planner.months.map((item) => (
                    <Text
                      key={item.month}
                      className="flex-1 text-center text-[10px] text-slate-500 dark:text-slate-400"
                    >
                      {monthLabel(item.month, 'short').slice(0, 3)}
                    </Text>
                  ))}
                </View>
                <Text className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Grey is planned, green is already saved.
                </Text>
              </View>

              <View className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                {planner.months.map((item, index) => (
                  <Pressable
                    key={item.month}
                    accessibilityRole="button"
                    onPress={() => {
                      setSelectedMonth(item.month);
                      setView('monthly');
                    }}
                    className={`flex-row items-center justify-between px-4 py-3 ${
                      index > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''
                    }`}
                  >
                    <Text
                      className={`text-sm ${item.month === currentMonth ? 'font-bold text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}
                    >
                      {monthLabel(item.month)}
                    </Text>
                    <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatXAF(item.saved)} / {formatXAF(item.planned)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View className="mb-3 mt-6 flex-row items-end justify-between">
            <Text className="text-lg font-bold text-slate-900 dark:text-slate-100">Your goals</Text>
            <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {planner.goals.length} {planner.goals.length === 1 ? 'goal' : 'goals'}
            </Text>
          </View>
          {planner.goals.length === 0 ? (
            <View className="items-center rounded-3xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-6">
              <Ionicons name="flag-outline" size={32} color="#059669" />
              <Text className="mt-2 text-base font-bold text-slate-900 dark:text-slate-100">
                No goals yet
              </Text>
              <Text className="mt-1 text-center text-sm text-slate-600 dark:text-slate-300">
                Tap “Add new savings” to set a target, a date and a monthly amount.
              </Text>
            </View>
          ) : (
            planner.goals.map((goal) => {
              const icon = goalIcons.get(goal.id);
              const progress = pct(goal.saved, goal.target);
              const done = goal.saved >= goal.target;
              const behind = goal.overdueMonths.length > 0;
              const status = done
                ? {
                    label: 'Goal reached',
                    pill: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300',
                    bar: 'bg-emerald-500',
                  }
                : behind
                  ? {
                      label: 'Behind',
                      pill: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300',
                      bar: 'bg-red-500',
                    }
                  : {
                      label: 'On track',
                      pill: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300',
                      bar: 'bg-emerald-500',
                    };
              const next = goal.commitments.find((c) => !c.savedAt && c.month >= currentMonth);
              const yearOfGoal = goal.commitments
                .filter((c) => c.month.startsWith(String(activeYear)))
                .reduce((n, c) => n + c.plannedAmount, 0);
              const remaining = Math.max(0, goal.target - goal.saved);
              return (
                <View
                  key={goal.id}
                  className="mb-4 overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <View className={`h-1.5 ${status.bar}`} />
                  <View className="p-4">
                    <View className="flex-row items-center gap-3">
                      <View
                        className="h-12 w-12 items-center justify-center rounded-2xl"
                        style={{ backgroundColor: icon?.bg ?? '#d1fae5' }}
                      >
                        <Ionicons
                          name={icon?.icon ?? 'flag'}
                          size={24}
                          color={icon?.tint ?? '#047857'}
                        />
                      </View>
                      <View className="flex-1">
                        <Text
                          numberOfLines={1}
                          className="text-base font-bold text-slate-900 dark:text-slate-100"
                        >
                          {goal.name}
                        </Text>
                        <Text className="text-xs text-slate-500 dark:text-slate-400">
                          By {goal.dueDate}
                        </Text>
                      </View>
                      <View className={`rounded-full px-2.5 py-1 ${status.pill.split(' ')[0]}`}>
                        <Text className={`text-xs font-bold ${status.pill.split(' ')[1]}`}>
                          {status.label}
                        </Text>
                      </View>
                    </View>

                    <View className="mt-4 flex-row items-end justify-between">
                      <Text className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                        {formatXAF(goal.saved)}
                      </Text>
                      <Text className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                        {progress}% of {formatXAF(goal.target)}
                      </Text>
                    </View>
                    <View className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <View
                        className={`h-full rounded-full ${status.bar}`}
                        style={{ width: `${progress}%` }}
                      />
                    </View>
                    <Text className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {done ? 'Fully funded 🎉' : `${formatXAF(remaining)} still to save`}
                    </Text>

                    <View className="mt-4 flex-row gap-2">
                      <View className="flex-1 rounded-2xl bg-slate-50 dark:bg-slate-800 p-3">
                        <Text className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          PER MONTH
                        </Text>
                        <Text className="mt-0.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                          {formatXAF(goal.monthlyAmount)}
                        </Text>
                      </View>
                      <View className="flex-1 rounded-2xl bg-slate-50 dark:bg-slate-800 p-3">
                        <Text className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          IN {activeYear}
                        </Text>
                        <Text className="mt-0.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                          {formatXAF(yearOfGoal)}
                        </Text>
                      </View>
                      <View className="flex-1 rounded-2xl bg-slate-50 dark:bg-slate-800 p-3">
                        <Text className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          MONTHS LEFT
                        </Text>
                        <Text className="mt-0.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                          {monthsLeft(goal, currentMonth)}
                        </Text>
                      </View>
                    </View>

                    {next ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setSelectedMonth(next.month);
                          setView('monthly');
                        }}
                        className="mt-3 flex-row items-center justify-between rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 px-3 py-2.5"
                      >
                        <Text className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                          Next: {formatXAF(next.plannedAmount)} in {monthLabel(next.month, 'short')}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color="#047857" />
                      </Pressable>
                    ) : null}
                    {behind ? (
                      <Text className="mt-2 text-xs font-semibold text-red-700 dark:text-red-400">
                        Not yet confirmed:{' '}
                        {goal.overdueMonths.map((m) => monthLabel(m, 'short')).join(', ')}
                      </Text>
                    ) : null}

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${goal.name}`}
                      onPress={() => removeGoal(goal)}
                      className="mt-3 flex-row items-center gap-1 self-start"
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={16} color="#b91c1c" />
                      <Text className="text-xs font-semibold text-red-700 dark:text-red-400">
                        Delete goal
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </>
      ) : null}
    </PageLayout>
  );
}
