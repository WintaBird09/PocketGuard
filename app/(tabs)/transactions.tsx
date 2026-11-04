import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  deleteTransaction,
  listActivity,
  restoreTransaction,
  updateTransaction,
  type ActivityItem,
} from '@/src/data/activity';
import { getMonthPlan } from '@/src/data/plan';
import {
  monthsInRange,
  rangeFor,
  rangeLabel,
  shiftAnchor,
  type DateRange,
  type RangeMode,
} from '@/src/domain/dateRange';
import { balancesAfterEachExpense } from '@/src/domain/lineBalance';
import { localDateString } from '@/src/domain/dates';
import { useDateOverrideRevision } from '@/src/domain/useDateOverrideRevision';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { Banner, Button, Chip } from '@/src/ui/controls';
import { DatePickerField } from '@/src/ui/DatePickerField';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';

type Filter = 'all' | 'overrides' | string;

function dayHeading(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function localDay(item: ActivityItem): string {
  const date = new Date(item.occurredAt);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export default function TransactionsScreen() {
  const router = useRouter();
  const { db, householdId, loading, error: dbError, tick, refresh } = useDatabase();
  const dateRevision = useDateOverrideRevision();
  const today = localDateString();
  const [view, setView] = useState({
    revision: dateRevision,
    mode: 'month' as RangeMode,
    anchor: today,
  });
  const fresh = view.revision === dateRevision;
  const mode = fresh ? view.mode : 'month';
  const anchor = fresh ? view.anchor : today;
  const [custom, setCustom] = useState<DateRange>(() => ({
    from: rangeFor('month', localDateString()).from,
    to: localDateString(),
  }));
  const range = mode === 'custom' ? custom : rangeFor(mode, anchor);
  const changeView = (nextMode: RangeMode, nextAnchor = anchor) =>
    setView({ revision: dateRevision, mode: nextMode, anchor: nextAnchor });
  const [filter, setFilter] = useState<Filter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [lineId, setLineId] = useState('');
  const [deleted, setDeleted] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = useMemo(() => {
    if (!db || !householdId) return { data: null, failure: null };
    try {
      const months = monthsInRange(range);
      const inRange = (item: ActivityItem) => {
        const day = localDay(item);
        return day >= range.from && day <= range.to;
      };
      const allItems = months.flatMap((month) => listActivity(db, householdId, { month }));
      const planned = new Map<string, number>();
      const lines = new Map<string, { id: string; name: string }>();
      const balances = new Map<
        string,
        ReturnType<typeof balancesAfterEachExpense> extends Map<string, infer V> ? V : never
      >();
      for (const month of months) {
        const monthLines = getMonthPlan(db, householdId, month).lines;
        for (const line of monthLines) lines.set(line.id, { id: line.id, name: line.name });
        planned.clear();
        for (const line of monthLines) planned.set(line.id, line.planned);
        const monthItems = allItems.filter(
          (item) => item.occurredAt.slice(0, 7) === month || localDay(item).slice(0, 7) === month,
        );
        for (const [id, value] of balancesAfterEachExpense(
          monthItems.filter((item) => localDay(item).slice(0, 7) === month),
          planned,
        )) {
          balances.set(id, value);
        }
      }
      const items = allItems.filter(inRange).filter((item) => {
        if (filter === 'overrides') return item.overrideReason !== null;
        return filter === 'all' || item.lineId === filter;
      });
      return { data: { items, lines: [...lines.values()], balances }, failure: null };
    } catch (cause) {
      return {
        data: null,
        failure: cause instanceof Error ? cause.message : 'Unable to load transactions.',
      };
    }
    // tick re-reads after writes or when the tab regains focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, householdId, range.from, range.to, filter, tick]);

  const balances = loaded.data?.balances;
  const totals = useMemo(() => {
    const items = loaded.data?.items ?? [];
    return {
      spent: items.filter((i) => i.direction === 'expense').reduce((n, i) => n + i.amount, 0),
      income: items.filter((i) => i.direction === 'income').reduce((n, i) => n + i.amount, 0),
      count: items.length,
    };
  }, [loaded.data]);

  const changed = () => {
    scheduleNotificationRefresh();
    refresh();
  };

  const startEdit = (item: ActivityItem) => {
    setEditingId(item.id);
    setAmount(String(item.amount));
    setNote(item.note);
    setDate(localDay(item));
    setLineId(item.lineId ?? '');
    setError(null);
  };

  const saveEdit = (item: ActivityItem) => {
    if (!db) return;
    try {
      updateTransaction(db, householdId, item.id, {
        amount: Number(amount.replace(/[\s,]/g, '')),
        note,
        occurredOn: date,
        lineId: item.direction === 'expense' ? lineId : undefined,
      });
      setEditingId(null);
      setError(null);
      changed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this change.');
    }
  };

  const remove = (item: ActivityItem) => {
    if (!db) return;
    try {
      if (deleteTransaction(db, householdId, item.id)) {
        setDeleted({ id: item.id, label: item.note || item.lineName || 'Transaction' });
      }
      setEditingId(null);
      changed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete this transaction.');
    }
  };

  const undo = () => {
    if (!db || !deleted) return;
    try {
      restoreTransaction(db, householdId, deleted.id);
      setDeleted(null);
      changed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to restore this transaction.');
    }
  };

  const failure = dbError ?? loaded.failure;
  const data = loaded.data;

  const groups = useMemo(() => {
    const result = new Map<string, ActivityItem[]>();
    for (const item of data?.items ?? []) {
      const key = localDay(item);
      result.set(key, [...(result.get(key) ?? []), item]);
    }
    return [...result.entries()];
  }, [data]);

  const modes: { key: RangeMode; label: string }[] = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'custom', label: 'Custom' },
  ];
  const step = (direction: 1 | -1) => {
    if (mode === 'custom') return;
    changeView(mode, shiftAnchor(mode, anchor, direction));
    setEditingId(null);
  };

  return (
    <PageLayout title="Transactions" loading={loading} subtitle={rangeLabel(mode, range, today)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a new transaction"
        onPress={() => router.push('/add-transaction')}
        className="mb-5 min-h-14 flex-row items-center justify-center rounded-2xl bg-emerald-600 px-5 py-4 active:bg-emerald-700"
      >
        <Ionicons name="add-circle" size={24} color="#ffffff" />
        <Text className="ml-2 text-base font-bold text-white">Add transaction</Text>
      </Pressable>

      <View className="mb-4 flex-row rounded-2xl bg-slate-200 p-1">
        {modes.map((item) => {
          const active = mode === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setEditingId(null);
                if (item.key === 'custom') {
                  setCustom(range);
                  changeView('custom');
                } else changeView(item.key, mode === 'custom' ? range.to : anchor);
              }}
              className={`min-h-10 flex-1 items-center justify-center rounded-xl ${
                active ? 'bg-white' : ''
              }`}
            >
              <Text className={`text-sm font-bold ${active ? 'text-slate-900' : 'text-slate-500'}`}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'custom' ? (
        <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <DatePickerField
            label="From"
            value={custom.from}
            onChange={(value) =>
              setCustom((c) => ({ from: value, to: value > c.to ? value : c.to }))
            }
            minimumDate={new Date(2020, 0, 1)}
            maximumDate={new Date(2100, 11, 31)}
            startOnToday
          />
          <DatePickerField
            label="To"
            value={custom.to}
            onChange={(value) =>
              setCustom((c) => ({ from: value < c.from ? value : c.from, to: value }))
            }
            minimumDate={new Date(2020, 0, 1)}
            maximumDate={new Date(2100, 11, 31)}
            startOnToday
          />
        </View>
      ) : (
        <View className="mb-4 flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white p-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous period"
            onPress={() => step(-1)}
            className="h-11 w-11 items-center justify-center rounded-full bg-slate-100"
          >
            <Ionicons name="chevron-back" size={20} color="#0f172a" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Jump to today"
            onPress={() => changeView(mode, today)}
          >
            <Text className="text-base font-bold text-slate-900">
              {rangeLabel(mode, range, today)}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next period"
            onPress={() => step(1)}
            className="h-11 w-11 items-center justify-center rounded-full bg-slate-100"
          >
            <Ionicons name="chevron-forward" size={20} color="#0f172a" />
          </Pressable>
        </View>
      )}

      <View className="mb-5 flex-row gap-3">
        <View className="flex-1 rounded-2xl bg-red-50 p-3">
          <Text className="text-xs font-semibold text-red-700">Spent</Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            className="mt-1 text-base font-extrabold text-red-800"
          >
            {formatXAF(totals.spent)}
          </Text>
        </View>
        <View className="flex-1 rounded-2xl bg-emerald-50 p-3">
          <Text className="text-xs font-semibold text-emerald-700">Income</Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            className="mt-1 text-base font-extrabold text-emerald-800"
          >
            {formatXAF(totals.income)}
          </Text>
        </View>
        <View className="flex-1 rounded-2xl bg-slate-100 p-3">
          <Text className="text-xs font-semibold text-slate-600">Entries</Text>
          <Text className="mt-1 text-base font-extrabold text-slate-900">{totals.count}</Text>
        </View>
      </View>

      <Text className="mb-3 text-lg font-bold text-slate-900">History</Text>

      {failure ? <Banner tone="error">{failure}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
        <View className="flex-row gap-2">
          <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          {(data?.lines ?? []).map((line) => (
            <Chip
              key={line.id}
              label={line.name}
              active={filter === line.id}
              onPress={() => setFilter(line.id)}
            />
          ))}
          <Chip
            label="Overrides"
            active={filter === 'overrides'}
            onPress={() => setFilter('overrides')}
          />
        </View>
      </ScrollView>

      {deleted ? (
        <View className="mb-4 flex-row items-center justify-between rounded-2xl border border-red-300 bg-red-50 p-3">
          <Text className="flex-1 font-bold text-red-800">Deleted: {deleted.label}</Text>
          <Button label="Undo" variant="outline" onPress={undo} />
        </View>
      ) : null}

      {data && groups.length === 0 ? (
        <Text className="text-sm text-slate-600">
          No transactions in this period{filter === 'all' ? '.' : ' for this filter.'}
        </Text>
      ) : null}

      {groups.map(([day, items]) => (
        <View key={day} className="mb-3">
          <Text className="mb-2 text-slate-500">{dayHeading(items[0]!.occurredAt)}</Text>
          {items.map((item) => {
            const editing = editingId === item.id;
            const isTransfer = item.direction === 'transfer';
            return (
              <View
                key={item.id}
                className={`mb-2 rounded-2xl border bg-white p-3 ${
                  item.overrideReason
                    ? 'border-red-300'
                    : isTransfer
                      ? 'border-dashed border-slate-300'
                      : 'border-slate-200'
                }`}
              >
                <Text
                  accessibilityRole="button"
                  onPress={() => (editing ? setEditingId(null) : startEdit(item))}
                  className="text-base text-slate-900"
                >
                  {item.note || item.lineName || (isTransfer ? 'Transfer' : 'Income')}
                </Text>
                <View className="mt-1 flex-row items-center justify-between">
                  <Text className="text-sm text-slate-500">
                    {isTransfer
                      ? 'Transfer · not counted as spending'
                      : `${item.lineName ?? (item.direction === 'income' ? 'Income' : 'No line')} · ${
                          item.overrideReason ? 'override' : item.source
                        }`}
                  </Text>
                  <Text
                    className={`text-base font-bold ${
                      item.direction === 'expense' ? 'text-slate-900' : 'text-emerald-700'
                    }`}
                  >
                    {item.direction === 'expense' ? '-' : ''}
                    {formatXAF(item.amount)}
                  </Text>
                </View>
                {item.incomeStreamName ? (
                  <Text className="mt-1 text-xs font-medium text-emerald-700">
                    Funded by {item.incomeStreamName}
                  </Text>
                ) : null}
                {balances?.get(item.id) ? (
                  <Text
                    className={`mt-1 text-sm font-semibold ${
                      { green: 'text-emerald-600', orange: 'text-orange-500', red: 'text-red-600' }[
                        balances!.get(item.id)!.tone
                      ]
                    }`}
                  >
                    {balances!.get(item.id)!.left >= 0
                      ? `${formatXAF(balances!.get(item.id)!.left)} left`
                      : `${formatXAF(-balances!.get(item.id)!.left)} over`}{' '}
                    on {item.lineName} · {Math.round(balances!.get(item.id)!.usedRatio * 100)}% used
                  </Text>
                ) : null}
                {item.overrideReason ? (
                  <Text className="mt-1 text-xs text-red-700">
                    Override reason: {item.overrideReason}
                  </Text>
                ) : null}

                {editing ? (
                  <View className="mt-3 border-t border-slate-200 pt-3">
                    <TextInput
                      accessibilityLabel="Edit amount"
                      keyboardType="number-pad"
                      value={amount}
                      onChangeText={setAmount}
                      className="mb-2 min-h-12 rounded-xl border border-slate-200 px-3 py-3 text-base"
                    />
                    <TextInput
                      accessibilityLabel="Edit note"
                      value={note}
                      onChangeText={setNote}
                      placeholder="Note"
                      className="mb-2 min-h-12 rounded-xl border border-slate-200 px-3 py-3 text-base"
                    />
                    <TextInput
                      accessibilityLabel="Edit date"
                      value={date}
                      onChangeText={setDate}
                      placeholder="YYYY-MM-DD"
                      className="mb-2 min-h-12 rounded-xl border border-slate-200 px-3 py-3 text-base"
                    />
                    {item.direction === 'expense' ? (
                      <View className="mb-2 flex-row flex-wrap gap-2">
                        {(data?.lines ?? []).map((line) => (
                          <Chip
                            key={line.id}
                            label={line.name}
                            active={lineId === line.id}
                            onPress={() => setLineId(line.id)}
                          />
                        ))}
                      </View>
                    ) : null}
                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <Button label="Save" onPress={() => saveEdit(item)} />
                      </View>
                      <View className="flex-1">
                        <Button label="Delete" variant="danger" onPress={() => remove(item)} />
                      </View>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
      <Text className="mt-2 text-center text-xs text-slate-500">Tap a row to edit or delete.</Text>
    </PageLayout>
  );
}
