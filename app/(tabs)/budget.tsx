import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  addBudgetLine,
  copyForward,
  getMonthPlan,
  listPlanMonths,
  nextMonth,
  previousMonth,
  setAllocation,
  setHardCap,
  setLineArchived,
  setPlannedIncome,
  type LineKind,
} from '@/src/data/plan';
import { buildFundingBreakdown, planAutoAssign, projectSourceBalance } from '@/src/data/funding';
import { addSavingsGoal } from '@/src/data/savings';
import { getIncomeMonth, listIncomeStreams } from '@/src/data/income';
import { effectiveNow, monthKeyForDate } from '@/src/domain/dates';
import { toneForUsedRatio } from '@/src/domain/lineBalance';
import { useDateOverrideRevision } from '@/src/domain/useDateOverrideRevision';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { BudgetLineForm } from '@/src/ui/BudgetLineForm';
import { Banner, Button, monthLabel } from '@/src/ui/controls';
import { assignLineIcons } from '@/src/ui/lineIcons';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';

const kinds: LineKind[] = ['running', 'fixed', 'debt', 'savings', 'misc'];

export default function BudgetScreen() {
  const { db, householdId, loading, error: dbError, tick, refresh } = useDatabase();
  const dateRevision = useDateOverrideRevision();
  const currentMonth = monthKeyForDate(effectiveNow(), 'Africa/Douala');
  const [monthSelection, setMonthSelection] = useState({
    revision: dateRevision,
    month: currentMonth,
  });
  const month = monthSelection.revision === dateRevision ? monthSelection.month : currentMonth;
  const setMonth = (value: string) => setMonthSelection({ revision: dateRevision, month: value });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [incomeDraft, setIncomeDraft] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const params = useLocalSearchParams<{ add?: string }>();
  const router = useRouter();
  useEffect(() => {
    if (params.add !== '1') return;
    router.setParams({ add: undefined });
    // Opening the form in response to a navigation param is an external event.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdding(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.add]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [pendingOver, setPendingOver] = useState<{ message: string; apply: () => void } | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = useMemo(() => {
    if (!db || !householdId) return { data: null, failure: null };
    try {
      const months = listPlanMonths(db, householdId, currentMonth);
      const last = months[months.length - 1];
      return {
        data: {
          months: months.includes(month) ? months : [...months, month].sort(),
          nextAvailable: nextMonth(last ?? month),
          plan: getMonthPlan(db, householdId, month, showArchived),
          incomeStreams: listIncomeStreams(db, householdId),
          incomeMonth: getIncomeMonth(db, householdId, month),
        },
        failure: null,
      };
    } catch (cause) {
      return {
        data: null,
        failure: cause instanceof Error ? cause.message : 'Unable to load the plan.',
      };
    }
    // tick re-reads after writes or when the tab regains focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, householdId, month, showArchived, tick, currentMonth]);

  const run = (action: () => string | void) => {
    if (!db) return;
    setError(null);
    setMessage(null);
    try {
      const result = action();
      if (result) setMessage(result);
      scheduleNotificationRefresh();
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this change.');
      refresh();
    }
  };

  const fundingNow = loaded.data
    ? buildFundingBreakdown(loaded.data.plan.lines, loaded.data.incomeMonth)
    : [];

  // Saves right away unless it would push an income source below zero; then asks first.
  const guardOverAllocation = (
    current: { planned: number; incomeStreamId: string | null } | null,
    next: { planned: number; incomeStreamId: string | null },
    apply: () => string | void,
  ) => {
    setPendingOver(null);
    const projection = projectSourceBalance(fundingNow, current, next);
    if (projection && projection.left < 0) {
      setPendingOver({
        message: `This takes ${projection.source.name} ${formatXAF(-projection.left)} over its income for ${monthLabel(month)}. Save anyway?`,
        apply: () => {
          setPendingOver(null);
          run(apply);
        },
      });
      return;
    }
    run(apply);
  };

  const commitAmount = (lineId: string) => {
    const text = drafts[lineId];
    if (text === undefined || !db) return;
    const cleaned = text.replace(/[\s,]/g, '');
    const line = loaded.data?.plan.lines.find((item) => item.id === lineId);
    const amount = Number(cleaned);
    const save = () => {
      setAllocation(db, householdId, lineId, month, amount);
    };
    if (line && Number.isSafeInteger(amount) && amount >= 0) {
      guardOverAllocation(line, { planned: amount, incomeStreamId: line.incomeStreamId }, save);
    } else {
      run(save);
    }
    setDrafts((current) => {
      const rest = { ...current };
      delete rest[lineId];
      return rest;
    });
  };

  const failure = dbError ?? loaded.failure;
  if (failure) {
    return (
      <PageLayout title="Budget plan" loading={loading}>
        <Banner tone="error">{failure}</Banner>
      </PageLayout>
    );
  }
  const view = loaded.data;
  if (!view) {
    return (
      <PageLayout title="Budget plan" loading={loading}>
        <Text className="text-sm text-slate-600 dark:text-slate-300">Loading your plan…</Text>
      </PageLayout>
    );
  }

  const { plan, months, incomeStreams } = view;
  const funding = fundingNow;
  const unlinkedCount = plan.lines.filter(
    (line) => !line.archived && !line.incomeStreamId && line.planned > 0,
  ).length;
  const sourceNames = new Map(incomeStreams.map((stream) => [stream.id, stream.name]));
  const prev = previousMonth(month);
  const icons = assignLineIcons(plan.lines);
  const activeLines = plan.lines.filter((line) => !line.archived);
  const totalSpent = activeLines.reduce((n, line) => n + line.spent, 0);
  const usedPct =
    plan.plannedOut > 0 ? Math.min(100, Math.round((totalSpent / plan.plannedOut) * 100)) : 0;
  const allocatedPct =
    plan.income > 0 ? Math.min(100, Math.round((plan.plannedOut / plan.income) * 100)) : 0;
  const kindLabel: Record<string, string> = {
    running: 'Running costs',
    fixed: 'Fixed bills',
    debt: 'Debt',
    savings: 'Savings',
    misc: 'Miscellaneous',
  };
  const kindStyle: Record<
    string,
    { icon: keyof typeof Ionicons.glyphMap; tint: string; bg: string }
  > = {
    running: { icon: 'cart', tint: '#b45309', bg: '#fef3c7' },
    fixed: { icon: 'home', tint: '#1d4ed8', bg: '#dbeafe' },
    debt: { icon: 'card', tint: '#b91c1c', bg: '#fee2e2' },
    savings: { icon: 'wallet', tint: '#047857', bg: '#d1fae5' },
    misc: { icon: 'apps', tint: '#6d28d9', bg: '#ede9fe' },
  };
  const groups = kinds
    .map((kind) => ({ kind, lines: plan.lines.filter((line) => line.kind === kind) }))
    .filter((group) => group.lines.length > 0);

  return (
    <PageLayout
      title="Budget plan"
      loading={loading}
      subtitle={monthLabel(month)}
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a new budget line"
          onPress={() => setAdding((current) => !current)}
          className="min-h-11 flex-row items-center gap-1 rounded-full bg-slate-900 dark:bg-slate-800 px-4 py-2.5"
        >
          <Ionicons name={adding ? 'close' : 'add'} size={18} color="#fff" />
          <Text className="text-sm font-bold text-white">{adding ? 'Close' : 'Add line'}</Text>
        </Pressable>
      }
    >
      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="info">{message}</Banner> : null}

      {pendingOver ? (
        <View className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/30">
          <Text className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {pendingOver.message}
          </Text>
          <View className="mt-3 flex-row gap-3">
            <View className="flex-1">
              <Button label="Cancel" variant="outline" onPress={() => setPendingOver(null)} />
            </View>
            <View className="flex-1">
              <Button label="Save anyway" onPress={pendingOver.apply} />
            </View>
          </View>
        </View>
      ) : null}

      {adding ? (
        <BudgetLineForm
          month={month}
          sources={funding}
          onCancel={() => setAdding(false)}
          onSubmit={(draft) =>
            guardOverAllocation(
              null,
              { planned: draft.amount, incomeStreamId: draft.incomeStreamId },
              () => {
                if (draft.goal) {
                  addSavingsGoal(
                    db!,
                    householdId,
                    {
                      name: draft.name,
                      target: draft.goal.target,
                      monthlyAmount: draft.amount,
                      dueDate: draft.goal.dueDate,
                    },
                    month,
                    draft.incomeStreamId,
                  );
                  setAdding(false);
                  return `Savings goal created from ${monthLabel(month)}. It also appears on the Savings screen.`;
                }
                addBudgetLine(db!, householdId, {
                  name: draft.name,
                  kind: draft.kind,
                  month,
                  amount: draft.amount,
                  incomeStreamId: draft.incomeStreamId,
                });
                setAdding(false);
                return `Line added to ${monthLabel(month)}.`;
              },
            )
          }
        />
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-1 mb-4"
        contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}
      >
        {months.map((key) => {
          const active = key === month;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setMonth(key)}
              className={`min-w-[68px] items-center rounded-2xl border px-3 py-2 ${
                active
                  ? 'border-slate-900 bg-slate-900 dark:bg-slate-800'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
              }`}
            >
              <Text
                className={`text-[10px] font-semibold ${active ? 'text-slate-400' : 'text-slate-400'}`}
              >
                {key.slice(0, 4)}
              </Text>
              <Text
                className={`text-base font-extrabold ${active ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}
              >
                {monthLabel(key, 'short').slice(0, 3)}
              </Text>
              {key === currentMonth ? (
                <View
                  className={`mt-1 h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-emerald-500'}`}
                />
              ) : (
                <View className="mt-1 h-1.5 w-1.5" />
              )}
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add next month"
          onPress={() => setMonth(view.nextAvailable)}
          className="min-w-[68px] items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 px-3 py-2"
        >
          <Ionicons name="add" size={20} color="#64748b" />
          <Text className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Next</Text>
        </Pressable>
      </ScrollView>

      <View className="mb-5 rounded-3xl bg-slate-900 dark:bg-slate-800 p-5">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Monthly income
            </Text>
            <TextInput
              accessibilityLabel="Planned monthly income"
              keyboardType="number-pad"
              value={incomeDraft ?? String(plan.income)}
              onChangeText={setIncomeDraft}
              onEndEditing={() => {
                if (incomeDraft === null) return;
                const value = Number(incomeDraft.replace(/[\s,]/g, ''));
                setIncomeDraft(null);
                run(() => setPlannedIncome(db!, householdId, value));
              }}
              className="mt-1 min-h-12 rounded-xl bg-white/10 px-3 py-2 text-2xl font-extrabold text-white"
            />
          </View>
        </View>

        <View className="mt-4 h-3 overflow-hidden rounded-full bg-white/15">
          <View
            className={`h-full rounded-full ${plan.flexible < 0 ? 'bg-red-400' : 'bg-emerald-400'}`}
            style={{ width: `${allocatedPct}%` }}
          />
        </View>
        <Text className="mt-2 text-xs text-slate-400">
          {allocatedPct}% of income is planned out
        </Text>

        <View className="mt-4 flex-row gap-3">
          <View className="flex-1 rounded-2xl bg-white/10 p-3">
            <Text className="text-[11px] font-semibold text-slate-400">PLANNED OUT</Text>
            <Text className="mt-1 text-sm font-bold text-white">{formatXAF(plan.plannedOut)}</Text>
          </View>
          <View className="flex-1 rounded-2xl bg-white/10 p-3">
            <Text className="text-[11px] font-semibold text-slate-400">
              {plan.flexible < 0 ? 'OVER INCOME' : 'FLEXIBLE'}
            </Text>
            <Text
              className={`mt-1 text-sm font-bold ${plan.flexible < 0 ? 'text-red-300' : 'text-emerald-300'}`}
            >
              {formatXAF(Math.abs(plan.flexible))}
            </Text>
          </View>
          <View className="flex-1 rounded-2xl bg-white/10 p-3">
            <Text className="text-[11px] font-semibold text-slate-400">SPENT</Text>
            <Text className="mt-1 text-sm font-bold text-white">
              {formatXAF(totalSpent)} · {usedPct}%
            </Text>
          </View>
        </View>
        {plan.flexible < 0 ? (
          <Text className="mt-3 text-xs text-red-300">
            Planned spending is {formatXAF(-plan.flexible)} above income.
          </Text>
        ) : null}
        <Text className="mt-3 text-xs text-slate-400">
          Total planned savings: {formatXAF(plan.plannedSavings)}
        </Text>
      </View>

      {funding.length > 0 ? (
        <View className="mb-5 rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <Text className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Funded by income
          </Text>
          <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Each budget line is deducted from its income source. Pick the source inside a line.
          </Text>
          {unlinkedCount > 0 &&
          funding.some((source) => source.streamId && source.available > 0) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                run(() => {
                  const { assignments, unfunded } = planAutoAssign(plan.lines, funding);
                  const byId = new Map(plan.lines.map((line) => [line.id, line]));
                  for (const item of assignments) {
                    const line = byId.get(item.lineId)!;
                    setAllocation(db!, householdId, line.id, month, line.planned, item.streamId);
                  }
                  const skipped = unfunded.length
                    ? ` ${unfunded.length} line${unfunded.length === 1 ? '' : 's'} did not fit any source (${unfunded.map((line) => line.name).join(', ')}).`
                    : '';
                  return `Assigned ${assignments.length} line${assignments.length === 1 ? '' : 's'} to income sources.${skipped}`;
                })
              }
              className="mt-3 min-h-11 flex-row items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5"
            >
              <Ionicons name="shuffle" size={16} color="#ffffff" />
              <Text className="text-sm font-bold text-white">
                Auto-assign {unlinkedCount} unlinked {unlinkedCount === 1 ? 'line' : 'lines'}
              </Text>
            </Pressable>
          ) : null}
          {funding.map((source) => {
            const ratio =
              source.available > 0
                ? Math.min(1, source.budgeted / source.available)
                : source.budgeted > 0
                  ? 1
                  : 0;
            const over = source.left < 0;
            return (
              <View
                key={source.streamId ?? 'unassigned'}
                className="mt-3 rounded-2xl bg-slate-50 dark:bg-slate-800 p-3"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 text-base font-bold text-slate-900 dark:text-slate-100">
                    {source.name}
                  </Text>
                  <Text
                    className={`text-sm font-extrabold ${over ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}
                  >
                    {over ? 'Over by ' : 'Left '}
                    {formatXAF(Math.abs(source.left))}
                  </Text>
                </View>
                <View className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <View
                    className={`h-full rounded-full ${over ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </View>
                <Text className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  Income {formatXAF(source.available)}
                  {source.expected > 0
                    ? ` (incl. ${formatXAF(source.expected)} not yet received)`
                    : ''}
                  {' · '}Budgeted {formatXAF(source.budgeted)} · Spent {formatXAF(source.spent)}
                </Text>
                <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {source.lineCount} {source.lineCount === 1 ? 'budget line' : 'budget lines'}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() =>
          run(() => {
            const copied = copyForward(db!, householdId, prev, month);
            return copied > 0
              ? `Copied ${copied} line${copied === 1 ? '' : 's'} from ${monthLabel(prev)}.`
              : `Nothing to copy: every line in ${monthLabel(month)} already has an amount, or ${monthLabel(prev)} has no plan.`;
          })
        }
        className="mb-5 min-h-12 flex-row items-center justify-center gap-2 rounded-2xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3"
      >
        <Ionicons name="copy-outline" size={18} className="text-slate-900 dark:text-slate-100" />
        <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
          Copy from {monthLabel(prev, 'short')}
        </Text>
      </Pressable>

      <Text className="mb-3 text-lg font-bold text-slate-900 dark:text-slate-100">Categories</Text>
      {groups.map((group) => {
        const groupPlanned = group.lines.reduce((n, line) => n + line.planned, 0);
        const groupSpent = group.lines.reduce((n, line) => n + line.spent, 0);
        const groupRatio = groupPlanned > 0 ? Math.min(1, groupSpent / groupPlanned) : 0;
        const style = kindStyle[group.kind];
        const open = !collapsed.includes(group.kind);
        return (
          <View
            key={group.kind}
            className="mb-4 overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              onPress={() =>
                setCollapsed((current) =>
                  current.includes(group.kind)
                    ? current.filter((item) => item !== group.kind)
                    : [...current, group.kind],
                )
              }
              className="p-4"
            >
              <View className="flex-row items-center gap-3">
                <View
                  className="h-11 w-11 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: style.bg }}
                >
                  <Ionicons name={style.icon} size={22} color={style.tint} />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {kindLabel[group.kind]}
                  </Text>
                  <Text className="text-xs text-slate-500 dark:text-slate-400">
                    {group.lines.length} {group.lines.length === 1 ? 'line' : 'lines'} · spent{' '}
                    {formatXAF(groupSpent)}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    {formatXAF(groupPlanned)}
                  </Text>
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#94a3b8" />
                </View>
              </View>
              <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <View
                  className="h-full rounded-full"
                  style={{ width: `${Math.round(groupRatio * 100)}%`, backgroundColor: style.tint }}
                />
              </View>
            </Pressable>
            {open ? (
              <View className="border-t border-slate-100 dark:border-slate-800 px-3 pb-1 pt-3">
                {group.lines.map((line) => {
                  const over = line.spent - line.planned;
                  const ratio =
                    line.planned > 0 ? line.spent / line.planned : line.spent > 0 ? 1 : 0;
                  const tone = toneForUsedRatio(ratio);
                  const barColor =
                    over > 0 || tone === 'red'
                      ? 'bg-red-500'
                      : tone === 'orange'
                        ? 'bg-orange-400'
                        : 'bg-emerald-500';
                  const icon = icons.get(line.id);
                  return (
                    <View
                      key={line.id}
                      className={`mb-3 rounded-2xl border bg-slate-50 dark:bg-slate-800 p-3 ${
                        over > 0
                          ? 'border-red-300 dark:border-red-800'
                          : 'border-slate-100 dark:border-slate-800'
                      } ${line.archived ? 'opacity-60' : ''}`}
                    >
                      <View className="flex-row items-center gap-3">
                        <View
                          className="h-10 w-10 items-center justify-center rounded-xl"
                          style={{ backgroundColor: icon?.bg ?? '#f1f5f9' }}
                        >
                          <Ionicons
                            name={icon?.icon ?? 'ellipse'}
                            size={20}
                            color={icon?.tint ?? '#334155'}
                          />
                        </View>
                        <View className="flex-1">
                          <Text
                            numberOfLines={1}
                            className="text-base font-bold text-slate-900 dark:text-slate-100"
                          >
                            {line.name}
                          </Text>
                          <Text className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            {line.incomeStreamId && sourceNames.has(line.incomeStreamId)
                              ? `Funded by ${sourceNames.get(line.incomeStreamId)}`
                              : 'No income source'}
                          </Text>
                          <Text className="text-xs text-slate-500 dark:text-slate-400">
                            Spent {formatXAF(line.spent)}
                          </Text>
                        </View>
                        <TextInput
                          accessibilityLabel={`Planned amount for ${line.name}`}
                          editable={!line.archived}
                          keyboardType="number-pad"
                          value={drafts[line.id] ?? String(line.planned)}
                          onChangeText={(value) =>
                            setDrafts((current) => ({ ...current, [line.id]: value }))
                          }
                          onEndEditing={() => commitAmount(line.id)}
                          className="min-h-11 min-w-[96px] rounded-xl bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-right text-base font-bold text-slate-900 dark:text-slate-100"
                        />
                      </View>
                      <View className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <View
                          className={`h-full rounded-full ${barColor}`}
                          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                        />
                      </View>
                      <View className="mt-2 flex-row items-center justify-between">
                        <Text
                          className={`flex-1 text-xs font-semibold ${over > 0 ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}
                        >
                          {over > 0
                            ? `Over budget by ${formatXAF(over)}`
                            : `${formatXAF(line.planned - line.spent)} left`}
                        </Text>
                        <Pressable
                          accessibilityRole="switch"
                          accessibilityLabel={`Hard cap for ${line.name}`}
                          accessibilityState={{ checked: line.hardCap, disabled: line.archived }}
                          disabled={line.archived}
                          onPress={() =>
                            run(() => setHardCap(db!, householdId, line.id, !line.hardCap))
                          }
                          className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${
                            line.hardCap
                              ? 'bg-red-100 dark:bg-red-900/40'
                              : 'bg-slate-200 dark:bg-slate-700'
                          }`}
                        >
                          <Ionicons
                            name={line.hardCap ? 'lock-closed' : 'lock-open-outline'}
                            size={13}
                            color={line.hardCap ? '#b91c1c' : '#475569'}
                          />
                          <Text
                            className={`text-xs font-bold ${line.hardCap ? 'text-red-700 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}
                          >
                            {line.hardCap ? 'Hard cap' : 'Flexible'}
                          </Text>
                        </Pressable>
                      </View>
                      <View className="mt-3">
                        <Text className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Budget funded by
                        </Text>
                        {incomeStreams.length > 0 ? (
                          <View className="flex-row flex-wrap gap-2">
                            {[{ id: null, name: 'Unassigned' }, ...incomeStreams].map((stream) => {
                              const active = line.incomeStreamId === stream.id;
                              return (
                                <Pressable
                                  key={stream.id ?? 'unassigned'}
                                  accessibilityRole="button"
                                  accessibilityLabel={`${line.name} funded by ${stream.name}`}
                                  accessibilityState={{ selected: active, disabled: line.archived }}
                                  disabled={line.archived}
                                  onPress={() =>
                                    guardOverAllocation(
                                      line,
                                      { planned: line.planned, incomeStreamId: stream.id },
                                      () =>
                                        setAllocation(
                                          db!,
                                          householdId,
                                          line.id,
                                          month,
                                          line.planned,
                                          stream.id,
                                        ),
                                    )
                                  }
                                  className={`min-h-10 justify-center rounded-full px-3 py-2 ${
                                    active
                                      ? 'bg-emerald-100 dark:bg-emerald-900/40'
                                      : 'bg-white dark:bg-slate-900'
                                  }`}
                                >
                                  <Text
                                    className={`text-xs font-semibold ${
                                      active
                                        ? 'text-emerald-800 dark:text-emerald-300'
                                        : 'text-slate-600 dark:text-slate-300'
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
                            Add an income source from More → Income to link this budget.
                          </Text>
                        )}
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          run(() => setLineArchived(db!, householdId, line.id, !line.archived))
                        }
                        className="mt-2 self-start"
                        hitSlop={8}
                      >
                        <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {line.archived ? 'Restore line' : 'Archive line'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}

      {plan.lines.length === 0 ? (
        <Text className="mb-3 text-sm text-slate-600 dark:text-slate-300">
          No budget lines yet. Add one below, or load the Sep–Dec plan from Settings.
        </Text>
      ) : null}

      <View className="mt-2 flex-row gap-3">
        <View className="flex-1">
          <Button
            label={showArchived ? 'Hide archived' : 'Show archived'}
            variant="outline"
            onPress={() => setShowArchived((current) => !current)}
          />
        </View>
      </View>
    </PageLayout>
  );
}
