import { useMemo, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';

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
import { effectiveNow, monthKeyForDate } from '@/src/domain/dates';
import { useDateOverrideRevision } from '@/src/domain/useDateOverrideRevision';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { Banner, Button, Chip, monthLabel } from '@/src/ui/controls';
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

  const { plan, months } = view;
  const prev = previousMonth(month);

  return (
    <PageLayout
      title="Budget plan"
      loading={loading}
      subtitle={monthLabel(month)}
      action={
        <Button
          label={`Copy from ${monthLabel(prev, 'short')}`}
          variant="outline"
          onPress={() =>
            run(() => {
              const copied = copyForward(db!, householdId, prev, month);
              return copied > 0
                ? `Copied ${copied} line${copied === 1 ? '' : 's'} from ${monthLabel(prev)}.`
                : `Nothing to copy: every line in ${monthLabel(month)} already has an amount, or ${monthLabel(prev)} has no plan.`;
            })
          }
        />
      }
    >
      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="info">{message}</Banner> : null}

      <View className="mb-4 flex-row flex-wrap gap-2">
        {months.map((key) => (
          <Chip
            key={key}
            label={monthLabel(key, 'short')}
            active={key === month}
            onPress={() => setMonth(key)}
          />
        ))}
        <Chip label="+ Next" onPress={() => setMonth(view.nextAvailable)} />
      </View>

      <View className="mb-5 rounded-2xl border border-slate-300 bg-white p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-slate-500">Income (monthly)</Text>
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
            className="min-h-12 min-w-[120px] rounded-lg bg-amber-50 px-3 py-3 text-right text-base font-semibold text-slate-900"
          />
        </View>
        <View className="mt-1 flex-row justify-between">
          <Text className="text-slate-500">Planned out</Text>
          <Text className="text-base font-semibold text-slate-900">
            {formatXAF(plan.plannedOut)}
          </Text>
        </View>
        <View className="mt-2 flex-row justify-between border-t border-slate-200 pt-2">
          <Text className="font-bold text-slate-900">Flexible to save</Text>
          <Text
            className={`text-base font-bold ${plan.flexible < 0 ? 'text-red-700' : 'text-slate-900'}`}
          >
            {formatXAF(plan.flexible)}
          </Text>
        </View>
        {plan.flexible < 0 ? (
          <Text className="mt-1 text-xs text-red-700">
            Planned spending is {formatXAF(-plan.flexible)} above income.
          </Text>
        ) : null}
        <Text className="mt-2 text-xs text-slate-500">
          Total planned savings: {formatXAF(plan.plannedSavings)}
        </Text>
      </View>

      <View className="mb-2 flex-row justify-between px-1">
        <Text className="text-slate-500">Line</Text>
        <Text className="text-slate-500">Planned / hard cap</Text>
      </View>

      {plan.lines.map((line) => {
        const over = line.spent - line.planned;
        return (
          <View
            key={line.id}
            className={`mb-3 rounded-2xl border bg-white p-3 ${
              over > 0 ? 'border-red-300' : 'border-slate-200'
            } ${line.archived ? 'opacity-60' : ''}`}
          >
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1">
                <Text className="text-base font-bold text-slate-900">{line.name}</Text>
                <Text className="text-xs text-slate-500">
                  {line.kind} · spent {formatXAF(line.spent)}
                </Text>
              </View>
              <TextInput
                accessibilityLabel={`Planned amount for ${line.name}`}
                editable={!line.archived}
                keyboardType="number-pad"
                value={drafts[line.id] ?? String(line.planned)}
                onChangeText={(value) => setDrafts((current) => ({ ...current, [line.id]: value }))}
                onEndEditing={() => commitAmount(line.id)}
                className="min-h-12 min-w-[100px] rounded-lg bg-amber-50 px-3 py-3 text-right text-base font-semibold text-slate-900"
              />
              <Switch
                accessibilityLabel={`Hard cap for ${line.name}`}
                value={line.hardCap}
                disabled={line.archived}
                onValueChange={(value) => run(() => setHardCap(db!, householdId, line.id, value))}
              />
            </View>
            {over > 0 ? (
              <Text className="mt-2 text-sm font-semibold text-red-700">
                Over budget by {formatXAF(over)}
              </Text>
            ) : null}
            <View className="mt-2 items-end">
              <Text
                accessibilityRole="button"
                onPress={() =>
                  run(() => setLineArchived(db!, householdId, line.id, !line.archived))
                }
                className="text-sm font-semibold text-slate-600"
              >
                {line.archived ? 'Restore line' : 'Archive line'}
              </Text>
            </View>
          </View>
        );
      })}

      {plan.lines.length === 0 ? (
        <Text className="mb-3 text-sm text-slate-600">
          No budget lines yet. Add one below, or load the Sep–Dec plan from Settings.
        </Text>
      ) : null}

      {adding ? (
        <View className="mb-3 rounded-2xl border border-slate-300 bg-white p-4">
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

      <View className="mt-2 flex-row gap-3">
        <View className="flex-1">
          <Button label="+ Add line" variant="outline" onPress={() => setAdding(true)} />
        </View>
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
