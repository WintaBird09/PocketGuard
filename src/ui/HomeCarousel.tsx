import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import type { HomeDashboardSnapshot } from '../data/dashboard';
import type { SavingsPlanner } from '../data/savings';
import { goalPeriodView } from '../domain/goalPeriod';
import type { GoalPeriod } from '../domain/goalPeriod';
import { formatXAF } from './theme';

type Props = {
  dashboard: HomeDashboardSnapshot;
  savings: SavingsPlanner | null;
  month: string;
  owedToYou: number;
  expectedIncome: number;
};

const periods: { key: GoalPeriod; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

function Slide({ width, color, children }: { width: number; color: string; children: ReactNode }) {
  return (
    <View style={{ width }}>
      <View className={`min-h-[250px] flex-1 rounded-3xl p-5 ${color}`}>{children}</View>
    </View>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View className="flex-1 rounded-2xl bg-white/15 p-3">
      <Text className="text-[11px] font-semibold uppercase text-white/80">{label}</Text>
      <Text className={`mt-1 text-sm font-bold ${danger ? 'text-red-200' : 'text-white'}`}>
        {value}
      </Text>
    </View>
  );
}

export function HomeCarousel({ dashboard, savings, month, owedToYou, expectedIncome }: Props) {
  const router = useRouter();
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const [period, setPeriod] = useState<GoalPeriod>('month');
  const summary = dashboard.summary;

  const spentRatio = dashboard.totalPlanned > 0 ? summary.spent / dashboard.totalPlanned : 0;
  const dayRatio = summary.monthLength > 0 ? summary.daysElapsed / summary.monthLength : 0;
  const goal = savings
    ? goalPeriodView(period, {
        month,
        monthLength: summary.monthLength,
        months: savings.months,
        yearPlanned: savings.yearPlanned,
        yearSaved: savings.yearSaved,
      })
    : null;
  const netWorth = (savings?.totalSaved ?? 0) + owedToYou - summary.debtRemaining;
  const flowMax = Math.max(summary.income, summary.spent, 1);
  const pageCount = 4;

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const onEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setPage(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <View className="mb-4" onLayout={onLayout}>
      {width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onEnd}
          accessibilityLabel="Dashboard slides. Swipe left or right."
        >
          <Slide width={width} color="bg-indigo-600">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold uppercase tracking-widest text-indigo-200">
                Spent this month
              </Text>
              <Text className="text-xs font-semibold text-indigo-200">
                {summary.daysLeft} days left
              </Text>
            </View>
            <Text className="mt-1 text-3xl font-extrabold text-white">
              {formatXAF(summary.spent)}
            </Text>
            <Text className="text-sm text-indigo-200">
              of {formatXAF(dashboard.totalPlanned)} planned
            </Text>
            <View className="mt-3 h-2.5 overflow-hidden rounded-full bg-indigo-900/40">
              <View
                className={`h-full rounded-full ${spentRatio > 1 ? 'bg-red-300' : 'bg-white'}`}
                style={{ width: `${Math.min(100, Math.round(spentRatio * 100))}%` }}
              />
              <View
                className="absolute top-0 h-full w-0.5 bg-indigo-200"
                style={{ left: `${Math.min(100, Math.round(dayRatio * 100))}%` }}
              />
            </View>
            <Text className="mt-2 text-xs text-indigo-200">
              {spentRatio > dayRatio + 0.05
                ? 'Spending faster than the month is passing.'
                : 'Spending is within the pace of the month.'}
            </Text>
            <View className="mt-auto flex-row gap-3 pt-4">
              <Stat label="Income" value={formatXAF(summary.income)} />
              <Stat
                label="Cash flow"
                value={formatXAF(summary.remaining)}
                danger={summary.remaining < 0}
              />
            </View>
          </Slide>

          <Slide width={width} color="bg-emerald-700">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold uppercase tracking-widest text-emerald-100">
                Savings & goals
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open the savings screen"
                hitSlop={8}
                onPress={() => router.push('/savings')}
                className="flex-row items-center"
              >
                <Text className="text-xs font-bold text-white">Open</Text>
                <Ionicons name="chevron-forward" size={14} color="#ffffff" />
              </Pressable>
            </View>
            <View className="mt-3 flex-row self-start rounded-full bg-black/20 p-1">
              {periods.map((item) => (
                <Pressable
                  key={item.key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: period === item.key }}
                  onPress={() => setPeriod(item.key)}
                  className={`min-h-8 justify-center rounded-full px-4 ${
                    period === item.key ? 'bg-white' : ''
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      period === item.key ? 'text-emerald-800' : 'text-white'
                    }`}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {goal && savings && savings.goals.length > 0 ? (
              <>
                <Text className="mt-3 text-xs font-semibold text-emerald-100">{goal.label}</Text>
                <Text className="text-3xl font-extrabold text-white">{formatXAF(goal.saved)}</Text>
                <Text className="text-sm text-emerald-100">
                  of {formatXAF(goal.target)} planned
                </Text>
                <View className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/25">
                  <View
                    className="h-full rounded-full bg-white"
                    style={{ width: `${goal.progress}%` }}
                  />
                </View>
                <Text className="mt-2 text-xs text-emerald-100">
                  {goal.progress}% · all goals {formatXAF(savings.totalSaved)} of{' '}
                  {formatXAF(savings.totalTarget)}
                </Text>
              </>
            ) : (
              <View className="mt-4">
                <Text className="text-sm text-emerald-100">
                  No goals yet. Set a target and a monthly amount to start.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/savings-form')}
                  className="mt-3 min-h-11 items-center justify-center self-start rounded-2xl bg-white px-4 py-2.5"
                >
                  <Text className="font-bold text-emerald-800">Add a savings goal</Text>
                </Pressable>
              </View>
            )}
          </Slide>

          <Slide width={width} color="bg-slate-900">
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-300">
              Income vs spending
            </Text>
            <Text
              className={`mt-1 text-3xl font-extrabold ${summary.remaining < 0 ? 'text-red-300' : 'text-white'}`}
            >
              {formatXAF(summary.remaining)}
            </Text>
            <Text className="text-sm text-slate-300">left after spending this month</Text>
            <View className="mt-4 gap-3">
              <View>
                <View className="flex-row justify-between">
                  <Text className="text-xs font-semibold text-emerald-300">Income</Text>
                  <Text className="text-xs font-bold text-white">{formatXAF(summary.income)}</Text>
                </View>
                <View className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/10">
                  <View
                    className="h-full rounded-full bg-emerald-400"
                    style={{ width: `${Math.round((summary.income / flowMax) * 100)}%` }}
                  />
                </View>
              </View>
              <View>
                <View className="flex-row justify-between">
                  <Text className="text-xs font-semibold text-indigo-300">Spent</Text>
                  <Text className="text-xs font-bold text-white">{formatXAF(summary.spent)}</Text>
                </View>
                <View className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/10">
                  <View
                    className="h-full rounded-full bg-indigo-400"
                    style={{ width: `${Math.round((summary.spent / flowMax) * 100)}%` }}
                  />
                </View>
              </View>
            </View>
            <View className="mt-auto flex-row gap-3 pt-4">
              <Stat label="Still expected" value={formatXAF(expectedIncome)} />
              <Stat
                label="Spent of income"
                value={
                  summary.income > 0
                    ? `${Math.round((summary.spent / summary.income) * 100)}%`
                    : '—'
                }
              />
            </View>
          </Slide>

          <Slide width={width} color="bg-sky-700">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold uppercase tracking-widest text-sky-100">
                Net worth
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open debts"
                hitSlop={8}
                onPress={() => router.push('/debts')}
                className="flex-row items-center"
              >
                <Text className="text-xs font-bold text-white">Debts</Text>
                <Ionicons name="chevron-forward" size={14} color="#ffffff" />
              </Pressable>
            </View>
            <Text
              className={`mt-1 text-3xl font-extrabold ${netWorth < 0 ? 'text-red-200' : 'text-white'}`}
            >
              {formatXAF(netWorth)}
            </Text>
            <Text className="text-sm text-sky-100">savings + money owed to you − what you owe</Text>
            <View className="mt-auto gap-3 pt-4">
              <View className="flex-row gap-3">
                <Stat label="Saved" value={formatXAF(savings?.totalSaved ?? 0)} />
                <Stat label="Owed to you" value={formatXAF(owedToYou)} />
              </View>
              <View className="flex-row gap-3">
                <Stat
                  label="You owe"
                  value={formatXAF(summary.debtRemaining)}
                  danger={summary.debtRemaining > 0}
                />
              </View>
            </View>
          </Slide>
        </ScrollView>
      ) : null}
      <View className="mt-3 flex-row justify-center gap-2">
        {Array.from({ length: pageCount }, (_, index) => (
          <View
            key={index}
            className={`h-2 rounded-full ${
              index === page
                ? 'w-6 bg-slate-800 dark:bg-slate-200'
                : 'w-2 bg-slate-300 dark:bg-slate-600'
            }`}
          />
        ))}
      </View>
    </View>
  );
}
