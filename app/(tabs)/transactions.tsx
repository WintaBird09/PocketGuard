import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import {
  deleteTransaction,
  listActivity,
  restoreTransaction,
  updateTransaction,
  type ActivityItem,
} from '@/src/data/activity';
import { getMonthPlan, nextMonth, previousMonth } from '@/src/data/plan';
import { monthKeyForDate } from '@/src/domain/dates';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { Banner, Button, Chip, monthLabel } from '@/src/ui/controls';
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
  const { db, householdId, error: dbError, tick, refresh } = useDatabase();
  const [month, setMonth] = useState(() => monthKeyForDate(new Date(), 'Africa/Douala'));
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
      return {
        data: {
          items: listActivity(db, householdId, {
            month,
            lineId: filter !== 'all' && filter !== 'overrides' ? filter : null,
            overridesOnly: filter === 'overrides',
          }),
          lines: getMonthPlan(db, householdId, month).lines,
        },
        failure: null,
      };
    } catch (cause) {
      return {
        data: null,
        failure: cause instanceof Error ? cause.message : 'Unable to load transactions.',
      };
    }
    // tick re-reads after writes or when the tab regains focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, householdId, month, filter, tick]);

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

  return (
    <PageLayout
      title="Activity"
      subtitle={monthLabel(month)}
      action={
        <View className="flex-row gap-2">
          <Chip
            label="‹"
            onPress={() => {
              setMonth(previousMonth(month));
              setEditingId(null);
            }}
          />
          <Chip
            label="›"
            onPress={() => {
              setMonth(nextMonth(month));
              setEditingId(null);
            }}
          />
        </View>
      }
    >
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
          No transactions in {monthLabel(month)}
          {filter === 'all' ? '.' : ' for this filter.'}
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
                      className="mb-2 rounded-xl border border-slate-200 px-3 py-2 text-base"
                    />
                    <TextInput
                      accessibilityLabel="Edit note"
                      value={note}
                      onChangeText={setNote}
                      placeholder="Note"
                      className="mb-2 rounded-xl border border-slate-200 px-3 py-2 text-base"
                    />
                    <TextInput
                      accessibilityLabel="Edit date"
                      value={date}
                      onChangeText={setDate}
                      placeholder="YYYY-MM-DD"
                      className="mb-2 rounded-xl border border-slate-200 px-3 py-2 text-base"
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
