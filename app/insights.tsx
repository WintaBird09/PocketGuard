import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { buildFinanceInsights } from '@/src/domain/financeInsights';
import { answerInsightsQuestion } from '@/src/domain/insights';
import type { InsightCustomRange, InsightPeriod, InsightsSnapshot } from '@/src/domain/insights';
import { requestInsightsAdvice, type AdviceResult } from '@/src/data/insightsAdvice';
import { effectiveNow, localDateString, monthKeyForDate } from '@/src/domain/dates';
import { getHomeDashboardSnapshot } from '@/src/data/dashboard';
import { getInsightsSnapshot } from '@/src/data/insights';
import { getFinanceFacts } from '@/src/data/homeFacts';
import { previousMonth } from '@/src/data/plan';
import { getSavingsPlanner } from '@/src/data/savings';
import { DatePickerField } from '@/src/ui/DatePickerField';
import { InsightCards } from '@/src/ui/InsightCards';
import { PageLayout } from '@/src/ui/PageLayout';
import { useDatabase } from '@/src/ui/useDatabase';
import { formatXAF } from '@/src/ui/theme';

const periodOptions: { key: InsightPeriod; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: '3 months' },
  { key: 'halfYear', label: '6 months' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' },
];

const periodLabels: Record<InsightPeriod, string> = {
  week: 'week',
  month: 'month',
  quarter: '3 months',
  halfYear: '6 months',
  year: 'year',
  custom: 'selected dates',
};

function dateLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function dateAtNoon(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

function initialCustomRange(): InsightCustomRange {
  const now = effectiveNow();
  const today = localDateString(now);
  return { start: `${monthKeyForDate(now, 'Africa/Douala')}-01`, end: today };
}

function comparison(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? 'No change' : 'No earlier activity';
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change > 0 ? '+' : ''}${change}% vs previous`;
}

function StatCard({
  label,
  amount,
  detail,
  tone,
}: {
  label: string;
  amount: number;
  detail: string;
  tone: 'income' | 'spending';
}) {
  return (
    <View className="min-h-[112px] flex-1 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <View className="flex-row items-center gap-2">
        <View
          className={`h-8 w-8 items-center justify-center rounded-full ${
            tone === 'income'
              ? 'bg-emerald-100 dark:bg-emerald-900/50'
              : 'bg-amber-100 dark:bg-amber-900/40'
          }`}
        >
          <Ionicons
            name={tone === 'income' ? 'arrow-down-outline' : 'arrow-up-outline'}
            size={17}
            color={tone === 'income' ? '#047857' : '#b45309'}
          />
        </View>
        <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</Text>
      </View>
      <Text className="mt-2 text-base font-extrabold text-slate-900 dark:text-slate-100">
        {formatXAF(amount)}
      </Text>
      <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{detail}</Text>
    </View>
  );
}

function PeriodSummary({ snapshot }: { snapshot: InsightsSnapshot }) {
  const current = snapshot.current;
  const net = current.income - current.expenses;
  const previousNet = snapshot.previous.income - snapshot.previous.expenses;
  const completedCustomRange =
    snapshot.period === 'custom' && snapshot.range.end < localDateString(effectiveNow());
  const budgetRatio =
    current.planned > 0 ? Math.round((current.expenses / current.planned) * 100) : 0;
  const overBudget = current.planned > 0 && current.expenses > current.planned;

  return (
    <>
      <View className="mb-5 overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <View className="mb-4 flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/50">
            <Ionicons name="calendar-outline" size={21} color="#047857" />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {snapshot.period === 'custom' ? 'Custom period' : 'Period overview'}
            </Text>
            <Text className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
              {dateLabel(snapshot.range.start)} – {dateLabel(snapshot.range.through)}
            </Text>
          </View>
          <View className="rounded-full bg-slate-100 px-3 py-1.5 dark:bg-slate-800">
            <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {snapshot.range.elapsedDays} {snapshot.range.elapsedDays === 1 ? 'day' : 'days'}
            </Text>
          </View>
        </View>
        <View className="flex-row gap-2">
          <StatCard
            label="Income"
            amount={current.income}
            detail={comparison(current.income, snapshot.previous.income)}
            tone="income"
          />
          <StatCard
            label="Spending"
            amount={current.expenses}
            detail={comparison(current.expenses, snapshot.previous.expenses)}
            tone="spending"
          />
        </View>
        <View className="mt-3 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/40">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                Net cash flow
              </Text>
              <Text className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                Income minus spending
              </Text>
            </View>
            <Text
              className={`text-xl font-extrabold ${
                net < 0
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-emerald-900 dark:text-emerald-200'
              }`}
            >
              {formatXAF(net)}
            </Text>
          </View>
          <Text className="mt-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            {comparison(net, previousNet)}
          </Text>
        </View>
        {current.planned > 0 ? (
          <View className="mt-4">
            <View className="mb-2 flex-row items-center justify-between gap-2">
              <Text className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Spending against plan so far
              </Text>
              <Text
                className={`text-xs font-bold ${
                  overBudget
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {budgetRatio}% used{overBudget ? ' · over plan' : ''}
              </Text>
            </View>
            <View className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              <View
                className={`h-full rounded-full ${overBudget ? 'bg-red-500' : 'bg-emerald-600'}`}
                style={{ width: `${Math.min(100, budgetRatio)}%` }}
              />
            </View>
            <Text className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {formatXAF(current.expenses)} spent of {formatXAF(current.planned)} planned to date
            </Text>
          </View>
        ) : null}
      </View>

      <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <View className="flex-row items-center gap-2">
          <Ionicons name="trending-up-outline" size={18} color="#0f766e" />
          <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
            Period projection
          </Text>
        </View>
        {snapshot.projection.expenses !== null ? (
          <>
            <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              If your current daily pace continues through this period:
            </Text>
            <View className="mt-3 flex-row gap-3">
              <View className="flex-1 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800">
                <Text className="text-xs text-slate-500 dark:text-slate-400">Projected spend</Text>
                <Text className="mt-1 text-base font-extrabold text-slate-900 dark:text-slate-100">
                  {formatXAF(snapshot.projection.expenses)}
                </Text>
              </View>
              <View className="flex-1 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800">
                <Text className="text-xs text-slate-500 dark:text-slate-400">Projected income</Text>
                <Text className="mt-1 text-base font-extrabold text-slate-900 dark:text-slate-100">
                  {formatXAF(snapshot.projection.income ?? 0)}
                </Text>
              </View>
            </View>
            {current.fullPeriodPlanned > 0 ? (
              <Text
                className={`mt-3 text-sm font-semibold ${
                  snapshot.projection.expenses > current.fullPeriodPlanned
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-emerald-800 dark:text-emerald-300'
                }`}
              >
                {snapshot.projection.expenses > current.fullPeriodPlanned
                  ? `${formatXAF(snapshot.projection.expenses - current.fullPeriodPlanned)} above the projected period budget`
                  : `${formatXAF(current.fullPeriodPlanned - snapshot.projection.expenses)} within the projected period budget`}
              </Text>
            ) : (
              <Text className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Add monthly budget allocations to compare this projection with your plan.
              </Text>
            )}
          </>
        ) : (
          <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {completedCustomRange
              ? 'This date range has ended. The totals above show recorded activity; projections are not shown for completed ranges.'
              : 'Projections appear after at least three days of recorded activity in the selected period.'}
          </Text>
        )}
        <Text className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          A pace estimate, not a guarantee. {current.transactionCount} transactions are included.
        </Text>
      </View>
    </>
  );
}

function GuidancePanel({
  question,
  setQuestion,
  period,
  result,
  error,
  loading,
  onSubmit,
}: {
  question: string;
  setQuestion: (value: string) => void;
  period: InsightPeriod;
  result: AdviceResult | null;
  error: string | null;
  loading: boolean;
  onSubmit: () => void;
}) {
  const [showExamples, setShowExamples] = useState(false);
  const [showDataUse, setShowDataUse] = useState(false);
  const examples = [
    `How did spending compare in this ${periodLabels[period]}?`,
    'Which budget line needs attention?',
    'How can I save more this period?',
  ];

  return (
    <View className="mb-5 overflow-hidden rounded-3xl border border-emerald-200 bg-white dark:border-emerald-900 dark:bg-slate-900">
      <View className="bg-emerald-50 p-4 dark:bg-emerald-950/50">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900">
            <Ionicons name="sparkles" size={20} color="#047857" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
              Ask for guidance
            </Text>
            <Text className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
              Get a useful next step for this {periodLabels[period]}
            </Text>
          </View>
          <View className="rounded-full bg-white px-2.5 py-1 dark:bg-slate-800">
            <Text className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
              AI + local
            </Text>
          </View>
        </View>
      </View>
      <View className="p-4 pt-3">
        <TextInput
          accessibilityLabel="Ask a question about your finances"
          value={question}
          onChangeText={setQuestion}
          onSubmitEditing={onSubmit}
          returnKeyType="send"
          maxLength={240}
          multiline
          placeholder={
            period === 'custom'
              ? 'Ask about these dates…'
              : `Ask about your ${periodLabels[period]}…`
          }
          placeholderTextColor="#94a3b8"
          className="min-h-14 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <View className="mt-2 flex-row flex-wrap gap-x-5 gap-y-1">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showExamples }}
            onPress={() => setShowExamples((current) => !current)}
            className="min-h-9 flex-row items-center gap-1"
          >
            <Ionicons name="bulb-outline" size={15} color="#047857" />
            <Text className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              {showExamples ? 'Hide examples' : 'Try a question'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showDataUse }}
            onPress={() => setShowDataUse((current) => !current)}
            className="min-h-9 flex-row items-center gap-1"
          >
            <Ionicons name="shield-checkmark-outline" size={15} color="#64748b" />
            <Text className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              About AI answers
            </Text>
          </Pressable>
        </View>
        {showExamples ? (
          <View className="mb-2 gap-2">
            {examples.map((example) => (
              <Pressable
                key={example}
                accessibilityRole="button"
                onPress={() => setQuestion(example)}
                className="min-h-10 justify-center rounded-xl bg-slate-50 px-3 dark:bg-slate-800"
              >
                <Text className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {example}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {showDataUse ? (
          <View className="mb-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
            <Text className="text-xs leading-4 text-slate-600 dark:text-slate-300">
              When online, your question and summarized figures, including totals, projections,
              budget-line and income-source names, are sent to Supabase and Anthropic. Raw
              transactions and notes are not sent. Offline or if cloud guidance fails, answers are
              generated on this device.
            </Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !question.trim() || loading }}
          onPress={onSubmit}
          disabled={!question.trim() || loading}
          className={`min-h-12 flex-row items-center justify-center gap-2 rounded-2xl px-4 py-3 ${
            question.trim() && !loading ? 'bg-emerald-800' : 'bg-slate-400'
          }`}
        >
          {loading ? <ActivityIndicator color="white" /> : null}
          <Text className="font-bold text-white">
            {loading ? 'Preparing guidance…' : 'Get advice'}
          </Text>
        </Pressable>
      </View>
      {result ? (
        <View className="mx-4 mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-base font-bold text-slate-900 dark:text-slate-100">
              {result.advice.title}
            </Text>
            <Text className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              {result.source === 'cloud' ? 'Cloud AI' : 'On-device'}
            </Text>
          </View>
          <Text className="mt-2 text-sm leading-5 text-slate-700 dark:text-slate-300">
            {result.advice.message}
          </Text>
          <Text className="mt-3 text-sm font-semibold leading-5 text-emerald-900 dark:text-emerald-200">
            {result.advice.nextStep}
          </Text>
          {result.fallbackReason ? (
            <Text className="mt-3 text-xs text-amber-800 dark:text-amber-300">
              Cloud guidance is unavailable right now, so this answer was generated on your device.
            </Text>
          ) : null}
          <Text className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            This guidance is based only on information recorded in Pocket Guard. It is not
            professional financial or business advice.
          </Text>
        </View>
      ) : null}
      {error ? (
        <Text
          accessibilityRole="alert"
          className="mx-4 mb-4 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export default function InsightsScreen() {
  const { db, householdId, loading, error: databaseError, tick } = useDatabase();
  const [period, setPeriod] = useState<InsightPeriod>('month');
  const [customRange, setCustomRange] = useState<InsightCustomRange>(initialCustomRange);
  const [draftRange, setDraftRange] = useState<InsightCustomRange>(initialCustomRange);
  const [showRangeEditor, setShowRangeEditor] = useState(false);
  const [question, setQuestion] = useState('');
  const [advice, setAdvice] = useState<AdviceResult | null>(null);
  const [advising, setAdvising] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);
  const [showAllInsights, setShowAllInsights] = useState(true);
  const today = localDateString(effectiveNow());
  const validDraftRange =
    draftRange.start <= draftRange.end && draftRange.start <= today && draftRange.end <= today;

  // `tick` invalidates the local snapshot and resets expanded insight details on refocus.
  const loaded = useMemo(() => {
    if (!db || !householdId)
      return { revision: tick, snapshot: null, insights: [], error: null } as const;
    try {
      const now = effectiveNow();
      const month = monthKeyForDate(now, 'Africa/Douala');
      const current = getHomeDashboardSnapshot(db, householdId, month, now);
      const previous = getHomeDashboardSnapshot(db, householdId, previousMonth(month), now);
      const savings = getSavingsPlanner(db, householdId, Number(month.slice(0, 4)), month);
      const facts = getFinanceFacts(db, householdId, month, current, previous.lines, savings, now);
      return {
        revision: tick,
        snapshot: getInsightsSnapshot(
          db,
          householdId,
          period,
          now,
          period === 'custom' ? customRange : undefined,
        ),
        insights: buildFinanceInsights(facts),
        error: null,
      } as const;
    } catch (cause) {
      return {
        revision: tick,
        snapshot: null,
        insights: [],
        error: cause instanceof Error ? cause.message : 'Unable to calculate insights.',
      } as const;
    }
  }, [db, householdId, period, customRange, tick]);

  const selectPeriod = (nextPeriod: InsightPeriod) => {
    setPeriod(nextPeriod);
    setAdvice(null);
    setAdviceError(null);
    if (nextPeriod === 'custom') {
      setDraftRange(customRange);
      setShowRangeEditor(true);
    } else {
      setShowRangeEditor(false);
    }
  };

  const applyCustomRange = () => {
    if (!validDraftRange) return;
    setCustomRange(draftRange);
    setShowRangeEditor(false);
    setAdvice(null);
    setAdviceError(null);
  };

  const askAdvice = async () => {
    const currentSnapshot = loaded.snapshot;
    if (!currentSnapshot || !question.trim() || advising) return;
    setAdvising(true);
    setAdviceError(null);
    try {
      const result = await requestInsightsAdvice(question, currentSnapshot, () =>
        answerInsightsQuestion(question, currentSnapshot),
      );
      setAdvice(result);
    } catch (cause) {
      setAdviceError(
        cause instanceof Error ? cause.message : 'Unable to generate guidance from current data.',
      );
    } finally {
      setAdvising(false);
    }
  };

  const snapshot = loaded.snapshot;

  return (
    <PageLayout
      title="Insights for you"
      subtitle="Understand your money, spot trends, and plan ahead"
      loading={loading}
      keyboardAware
    >
      {databaseError || loaded.error ? (
        <View className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
          <Text className="text-sm font-semibold text-red-800 dark:text-red-300">
            {databaseError ?? loaded.error}
          </Text>
        </View>
      ) : null}

      <View className="mb-4 overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <View className="mb-3 flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
            <Ionicons name="calendar" size={19} color="#047857" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Explore your timeline
            </Text>
            <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Compare activity across calendar periods
            </Text>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 4 }}
        >
          {periodOptions.map((option) => {
            const selected = period === option.key;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => selectPeriod(option.key)}
                className={`min-h-11 flex-row items-center justify-center gap-1.5 rounded-2xl border px-4 ${
                  selected
                    ? 'border-emerald-800 bg-emerald-800'
                    : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'
                }`}
              >
                {option.key === 'custom' ? (
                  <Ionicons
                    name="options-outline"
                    size={15}
                    color={selected ? '#ffffff' : '#64748b'}
                  />
                ) : null}
                <Text
                  className={`text-xs font-bold ${
                    selected ? 'text-white' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {period === 'custom' ? (
          <View className="mt-4 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800">
            <View className="mb-3 flex-row items-start justify-between gap-2">
              <View className="flex-1">
                <Text className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Choose a date range
                </Text>
                <Text className="mt-1 text-xs leading-4 text-slate-500 dark:text-slate-400">
                  Compare against the same number of days immediately before your range.
                </Text>
              </View>
              {!showRangeEditor ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit custom dates"
                  onPress={() => {
                    setDraftRange(customRange);
                    setShowRangeEditor(true);
                  }}
                  className="min-h-9 flex-row items-center gap-1 rounded-full bg-white px-3 dark:bg-slate-700"
                >
                  <Ionicons name="create-outline" size={15} color="#047857" />
                  <Text className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    Edit
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {showRangeEditor ? (
              <>
                <View className="flex-row gap-2">
                  <DatePickerField
                    label="From"
                    value={draftRange.start}
                    onChange={(start) => setDraftRange((current) => ({ ...current, start }))}
                    minimumDate={dateAtNoon('1900-01-01')}
                    maximumDate={dateAtNoon(today)}
                    startYear={new Date().getFullYear()}
                    startOnToday
                  />
                  <DatePickerField
                    label="To"
                    value={draftRange.end}
                    onChange={(end) => setDraftRange((current) => ({ ...current, end }))}
                    minimumDate={dateAtNoon(draftRange.start)}
                    maximumDate={dateAtNoon(today)}
                    startYear={new Date().getFullYear()}
                    startOnToday
                  />
                </View>
                {!validDraftRange ? (
                  <Text className="mb-2 text-xs font-semibold text-red-700 dark:text-red-300">
                    The end date must be on or after the start date.
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={!validDraftRange}
                  onPress={applyCustomRange}
                  className={`min-h-11 flex-row items-center justify-center gap-2 rounded-xl px-4 ${
                    validDraftRange ? 'bg-emerald-800' : 'bg-slate-400'
                  }`}
                >
                  <Ionicons name="checkmark" size={17} color="#ffffff" />
                  <Text className="text-sm font-bold text-white">Apply date range</Text>
                </Pressable>
              </>
            ) : (
              <View className="flex-row items-center gap-2 rounded-xl bg-white px-3 py-2.5 dark:bg-slate-900">
                <Ionicons name="calendar-outline" size={16} color="#047857" />
                <Text className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {dateLabel(customRange.start)} – {dateLabel(customRange.end)}
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </View>

      {snapshot ? (
        <GuidancePanel
          question={question}
          setQuestion={setQuestion}
          period={period}
          result={advice}
          error={adviceError}
          loading={advising}
          onSubmit={() => void askAdvice()}
        />
      ) : null}

      {snapshot ? (
        <>
          <PeriodSummary snapshot={snapshot} />

          <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <View className="mb-3 flex-row items-center gap-2">
              <Ionicons name="pie-chart-outline" size={18} color="#0f766e" />
              <Text className="flex-1 text-base font-bold text-slate-900 dark:text-slate-100">
                Budget lines
              </Text>
            </View>
            {snapshot.current.categories.length > 0 ? (
              <View className="gap-4">
                {snapshot.current.categories.slice(0, 6).map((category) => {
                  const ratio =
                    category.planned > 0
                      ? Math.min(100, Math.round((category.spent / category.planned) * 100))
                      : 0;
                  return (
                    <View key={category.id}>
                      <View className="mb-1 flex-row items-center justify-between gap-2">
                        <Text
                          numberOfLines={1}
                          className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-200"
                        >
                          {category.name}
                        </Text>
                        <Text
                          className={`text-xs font-semibold ${
                            category.planned > 0 && category.spent > category.planned
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {formatXAF(category.spent)} / {formatXAF(category.planned)}
                        </Text>
                      </View>
                      <View className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                        <View
                          className={`h-full rounded-full ${
                            category.planned > 0 && category.spent > category.planned
                              ? 'bg-red-600'
                              : ratio >= 80
                                ? 'bg-amber-500'
                                : 'bg-emerald-700'
                          }`}
                          style={{ width: `${ratio}%` }}
                        />
                      </View>
                      {category.planned === 0 && category.spent > 0 ? (
                        <Text className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          No budget allocation for this line in the selected period.
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text className="text-sm text-slate-600 dark:text-slate-300">
                No budget activity or allocations are recorded in this period yet.
              </Text>
            )}
            {snapshot.current.uncategorizedCount > 0 ? (
              <Text className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                {snapshot.current.uncategorizedCount} expense(s) have no budget line, so category
                insights may be incomplete.
              </Text>
            ) : null}
          </View>

          <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <View className="mb-3 flex-row items-center gap-2">
              <Ionicons name="cash-outline" size={18} color="#0f766e" />
              <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
                Income sources
              </Text>
            </View>
            {snapshot.current.incomeSources.length > 0 ? (
              <View className="gap-3">
                {snapshot.current.incomeSources.slice(0, 5).map((source) => (
                  <View key={source.name} className="flex-row items-center justify-between">
                    <Text className="flex-1 text-sm text-slate-700 dark:text-slate-300">
                      {source.name}
                    </Text>
                    <Text className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                      {formatXAF(source.received)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="text-sm text-slate-600 dark:text-slate-300">
                No income has been recorded in this period.
              </Text>
            )}
          </View>

          <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <Text className="mb-3 text-base font-bold text-slate-900 dark:text-slate-100">
              Your wider financial picture
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {[
                { label: 'Saved', value: snapshot.position.saved },
                { label: 'Goal targets', value: snapshot.position.savingsTarget },
                { label: 'Debt remaining', value: snapshot.position.debtRemaining },
                { label: 'Owed to you', value: snapshot.position.loansOutstanding },
              ].map((item) => (
                <View
                  key={item.label}
                  className="min-h-[76px] w-[48%] flex-1 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800"
                >
                  <Text className="text-xs text-slate-500 dark:text-slate-400">{item.label}</Text>
                  <Text className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                    {formatXAF(item.value)}
                  </Text>
                </View>
              ))}
            </View>
            <Text className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Savings goals and current debt/loan balances are current totals, not limited to this
              period.
            </Text>
          </View>

          {loaded.insights.length > 0 ? (
            <View className="mb-1">
              <Text className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Current month signals
              </Text>
              <InsightCards
                key={loaded.revision}
                insights={loaded.insights}
                showAll={showAllInsights}
                onShowAllChange={setShowAllInsights}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </PageLayout>
  );
}
