import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import type { ComponentProps } from 'react';

import type { ActivityItem } from '../data/activity';
import type { HomeDashboardSnapshot } from '../data/dashboard';
import type { IncomeMonth } from '../data/income';
import { formatXAF } from './theme';

type HomeAction = {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  emphasized?: boolean;
};

function SectionHeading({
  title,
  action,
  onPress,
}: {
  title: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View className="mb-3 flex-row items-center justify-between">
      <Text className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        hitSlop={8}
        className="min-h-10 justify-center"
      >
        <Text className="text-sm font-bold text-emerald-800 dark:text-emerald-300">{action}</Text>
      </Pressable>
    </View>
  );
}

export function HomeQuickActions({ actions }: { actions: HomeAction[] }) {
  return (
    <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <Text className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Quick actions
      </Text>
      <View className="flex-row justify-between">
        {actions.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            className="min-w-[64px] items-center"
          >
            <View
              className={`h-14 w-14 items-center justify-center rounded-full border ${
                action.emphasized
                  ? 'border-emerald-800 bg-emerald-800'
                  : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'
              }`}
            >
              <Ionicons
                name={action.icon}
                size={22}
                color={action.emphasized ? '#ffffff' : '#0f766e'}
              />
            </View>
            <Text className="mt-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function HomeBudgetPreview({
  dashboard,
  onOpen,
}: {
  dashboard: HomeDashboardSnapshot;
  onOpen: () => void;
}) {
  const lines = dashboard.lines.filter((line) => line.kind !== 'savings').slice(0, 3);
  const progress =
    dashboard.totalPlanned > 0
      ? Math.min(100, Math.round((dashboard.summary.spent / dashboard.totalPlanned) * 100))
      : 0;

  return (
    <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <SectionHeading title="Budget" action="See all" onPress={onOpen} />
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {formatXAF(dashboard.summary.spent)} of {formatXAF(dashboard.totalPlanned)}
        </Text>
        <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {progress}% used
        </Text>
      </View>
      <View className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <View
          className={`h-full rounded-full ${
            progress >= 100 ? 'bg-red-700' : progress >= 80 ? 'bg-amber-500' : 'bg-emerald-800'
          }`}
          style={{ width: `${progress}%` }}
        />
      </View>
      <View className="gap-3">
        {lines.map((line) => {
          const ratio = line.planned > 0 ? Math.min(100, (line.spent / line.planned) * 100) : 0;
          const overBudget = line.remaining < 0;
          return (
            <View key={line.id}>
              <View className="mb-1 flex-row items-center justify-between gap-2">
                <Text
                  numberOfLines={1}
                  className="flex-1 text-sm text-slate-800 dark:text-slate-200"
                >
                  {line.name}
                </Text>
                <Text
                  className={`text-xs font-semibold ${
                    overBudget
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {formatXAF(line.spent)} / {formatXAF(line.planned)}
                </Text>
              </View>
              <View className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <View
                  className={`h-full rounded-full ${
                    overBudget ? 'bg-red-700' : ratio >= 80 ? 'bg-amber-500' : 'bg-slate-500'
                  }`}
                  style={{ width: `${ratio}%` }}
                />
              </View>
            </View>
          );
        })}
        {lines.length === 0 ? (
          <Text className="text-sm text-slate-500 dark:text-slate-400">
            Add a budget line to start tracking spending.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function HomeIncomePreview({ income, onOpen }: { income: IncomeMonth; onOpen: () => void }) {
  const streams = income.streams.slice(0, 2);

  return (
    <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <SectionHeading title="Income streams" action="See all" onPress={onOpen} />
      {streams.length > 0 ? (
        <View className="flex-row gap-3">
          {streams.map((stream) => {
            const received = income.streamTotals.get(stream.id) ?? 0;
            const plan = income.plannedIncome.find((item) => item.stream.id === stream.id);
            return (
              <View
                key={stream.id}
                className="min-h-[94px] flex-1 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
              >
                <Text numberOfLines={1} className="text-xs text-slate-600 dark:text-slate-300">
                  {stream.name}
                </Text>
                <Text className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">
                  {formatXAF(received)}
                </Text>
                <Text numberOfLines={1} className="text-xs text-slate-500 dark:text-slate-400">
                  {plan
                    ? `${plan.confirmed ? 'Received' : 'of'} ${formatXAF(plan.amount)} expected`
                    : 'Received this month'}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={onOpen}
          className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
        >
          <Text className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Add an income source to track what you receive.
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function HomeRecentPreview({
  activity,
  onOpen,
}: {
  activity: ActivityItem[];
  onOpen: () => void;
}) {
  return (
    <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <SectionHeading title="Recent" action="See all" onPress={onOpen} />
      {activity.length > 0 ? (
        <View>
          {activity.slice(0, 3).map((item) => {
            const income = item.direction === 'income';
            const title =
              item.note.trim() ||
              item.lineName ||
              item.incomeStreamName ||
              (item.direction === 'transfer' ? 'Transfer' : 'Transaction');
            const detail =
              item.direction === 'expense'
                ? [item.lineName, item.incomeStreamName ? `from ${item.incomeStreamName}` : null]
                    .filter(Boolean)
                    .join(' · ')
                : item.direction === 'income'
                  ? (item.incomeStreamName ?? 'Income')
                  : 'Transfer';
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={onOpen}
                className="min-h-[62px] flex-row items-center justify-between border-b border-slate-200 py-2.5 dark:border-slate-800"
              >
                <View className="mr-3 flex-1">
                  <Text
                    numberOfLines={1}
                    className="text-sm font-semibold text-slate-900 dark:text-slate-100"
                  >
                    {title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="mt-0.5 text-xs text-slate-500 dark:text-slate-400"
                  >
                    {detail || 'Expense'}
                  </Text>
                </View>
                <Text
                  className={`text-sm font-bold ${
                    income
                      ? 'text-emerald-800 dark:text-emerald-300'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {income ? '+' : item.direction === 'transfer' ? '' : '−'}
                  {formatXAF(item.amount)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text className="py-2 text-sm text-slate-500 dark:text-slate-400">
          Your confirmed transactions will appear here.
        </Text>
      )}
    </View>
  );
}
