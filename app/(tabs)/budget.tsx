import { useMemo, useState } from 'react';
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
import { listIncomeStreams } from '@/src/data/income';
import { effectiveNow, monthKeyForDate } from '@/src/domain/dates';
import { toneForUsedRatio } from '@/src/domain/lineBalance';
import { useDateOverrideRevision } from '@/src/domain/useDateOverrideRevision';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { Banner, Button, Chip, monthLabel } from '@/src/ui/controls';
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
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<LineKind>('running');
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

  const commitAmount = (lineId: string) => {
    const text = drafts[lineId];
    if (text === undefined || !db) return;
    const cleaned = text.replace(/[\s,]/g, '');
    run(() => {
      setAllocation(db, householdId, lineId, month, Number(cleaned));
    });
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
        <Text className="text-sm text-slate-600">Loading your plan…</Text>
      </PageLayout>
    );
  }

  const { plan, months, incomeStreams } = view;
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
          className="min-h-11 flex-row items-center gap-1 rounded-full bg-slate-900 px-4 py-2.5"
        >
          <Ionicons name={adding ? 'close' : 'add'} size={18} color="#fff" />
          <Text className="text-sm font-bold text-white">{adding ? 'Close' : 'Add line'}</Text>
        </Pressable>
      }
    >
      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="info">{message}</Banner> : null}

      {adding ? (
        <View className="mb-5 rounded-3xl border border-slate-300 bg-white p-4">
          <TextInput
            accessibilityLabel="New line name"
            placeholder="Line name"
            value={newName}
            onChangeText={setNewName}
            className="min-h-12 rounded-xl border border-slate-200 px-3 py-3 text-base"
          />
          <View className="mt-3 flex-row flex-wrap gap-2">
            {kinds.map((kind) => (
              <Chip
                key={kind}
                label={kind}
                active={kind === newKind}
                onPress={() => setNewKind(kind)}
              />
            ))}
          </View>
          <Text className="mt-2 text-xs text-slate-500">
            Running and misc lines default to a hard cap; you can change it afterwards.
          </Text>
          <View className="mt-3 flex-row gap-3">
            <View className="flex-1">
              <Button label="Cancel" variant="outline" onPress={() => setAdding(false)} />
            </View>
            <View className="flex-1">
              <Button
                label="Save line"
                onPress={() =>
                  run(() => {
                    addBudgetLine(db!, householdId, { name: newName, kind: newKind });
                    setNewName('');
                    setAdding(false);
                    return 'Line added. Set its planned amount above.';
                  })
                }
              />
            </View>
          </View>
        </View>
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
                active ? 'border-slate-900 bg-slate-900' : 'border-slate-200 bg-white'
              }`}
            >
              <Text
                className={`text-[10px] font-semibold ${active ? 'text-slate-400' : 'text-slate-400'}`}
              >
                {key.slice(0, 4)}
              </Text>
              <Text
                className={`text-base font-extrabold ${active ? 'text-white' : 'text-slate-900'}`}
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
          className="min-w-[68px] items-center justify-center rounded-2xl border border-dashed border-slate-300 px-3 py-2"
        >
          <Ionicons name="add" size={20} color="#64748b" />
          <Text className="text-[11px] font-semibold text-slate-500">Next</Text>
        </Pressable>
      </ScrollView>

      <View className="mb-5 rounded-3xl bg-slate-900 p-5">
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
        className="mb-5 min-h-12 flex-row items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3"
      >
        <Ionicons name="copy-outline" size={18} color="#0f172a" />
        <Text className="text-base font-bold text-slate-900">
          Copy from {monthLabel(prev, 'short')}
        </Text>
      </Pressable>

      <Text className="mb-3 text-lg font-bold text-slate-900">Categories</Text>
      {groups.map((group) => {
        const groupPlanned = group.lines.reduce((n, line) => n + line.planned, 0);
        const groupSpent = group.lines.reduce((n, line) => n + line.spent, 0);
        const groupRatio = groupPlanned > 0 ? Math.min(1, groupSpent / groupPlanned) : 0;
        const style = kindStyle[group.kind];
        const open = !collapsed.includes(group.kind);
        return (
          <View
            key={group.kind}
            className="mb-4 overflow-hidden rounded-3xl border border-slate-200 bg-white"
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
                  <Text className="text-base font-bold text-slate-900">
                    {kindLabel[group.kind]}
                  </Text>
                  <Text className="text-xs text-slate-500">
                    {group.lines.length} {group.lines.length === 1 ? 'line' : 'lines'} · spent{' '}
                    {formatXAF(groupSpent)}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-extrabold text-slate-900">
                    {formatXAF(groupPlanned)}
                  </Text>
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#94a3b8" />
                </View>
              </View>
              <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <View
                  className="h-full rounded-full"
                  style={{ width: `${Math.round(groupRatio * 100)}%`, backgroundColor: style.tint }}
                />
              </View>
            </Pressable>
            {open ? (
              <View className="border-t border-slate-100 px-3 pb-1 pt-3">
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
                      className={`mb-3 rounded-2xl border bg-slate-50 p-3 ${
                        over > 0 ? 'border-red-300' : 'border-slate-100'
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
                          <Text numberOfLines={1} className="text-base font-bold text-slate-900">
                            {line.name}
                          </Text>
                          <Text className="text-xs text-slate-500">
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
                          className="min-h-11 min-w-[96px] rounded-xl bg-amber-50 px-3 py-2 text-right text-base font-bold text-slate-900"
                        />
                      </View>
                      <View className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                        <View
                          className={`h-full rounded-full ${barColor}`}
                          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                        />
                      </View>
                      <View className="mt-2 flex-row items-center justify-between">
                        <Text
                          className={`flex-1 text-xs font-semibold ${over > 0 ? 'text-red-700' : 'text-slate-500'}`}
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
                            line.hardCap ? 'bg-red-100' : 'bg-slate-200'
                          }`}
                        >
                          <Ionicons
                            name={line.hardCap ? 'lock-closed' : 'lock-open-outline'}
                            size={13}
                            color={line.hardCap ? '#b91c1c' : '#475569'}
                          />
                          <Text
                            className={`text-xs font-bold ${line.hardCap ? 'text-red-700' : 'text-slate-600'}`}
                          >
                            {line.hardCap ? 'Hard cap' : 'Flexible'}
                          </Text>
                        </Pressable>
                      </View>
                      <View className="mt-3">
                        <Text className="mb-2 text-xs font-semibold text-slate-600">
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
                                    run(() =>
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
                                    active ? 'bg-emerald-100' : 'bg-white'
                                  }`}
                                >
                                  <Text
                                    className={`text-xs font-semibold ${
                                      active ? 'text-emerald-800' : 'text-slate-600'
                                    }`}
                                  >
                                    {stream.name}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : (
                          <Text className="text-xs text-slate-500">
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
                        <Text className="text-xs font-semibold text-slate-500">
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
        <Text className="mb-3 text-sm text-slate-600">
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
