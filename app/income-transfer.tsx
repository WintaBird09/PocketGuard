import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { loadPlanSep2026 } from '@/src/data/seed';
import { openAppDatabase, runMigrations, type DatabaseLike } from '@/src/data/db';
import { transactions, type TransactionDirection } from '@/src/data/repos';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';

type RecordedEntry = {
  id: string;
  amount: number;
  direction: 'income' | 'transfer';
  note: string;
  occurredAt: string;
};

const entryTypes: { direction: TransactionDirection; label: string; noteLabel: string }[] = [
  { direction: 'income', label: 'Income', noteLabel: 'Source (for example, salary)' },
  {
    direction: 'transfer',
    label: 'Transfer',
    noteLabel: 'Transfer details (for example, bank to MoMo)',
  },
];

function getRecordedEntries(database: DatabaseLike): RecordedEntry[] {
  const month = new Date().toISOString().slice(0, 7);
  return transactions
    .listByMonth(database, loadPlanSep2026().household.id, month)
    .flatMap((row) => {
      if (row.direction !== 'income' && row.direction !== 'transfer') return [];
      return [
        {
          id: String(row.id),
          amount: Number(row.amount),
          direction: row.direction,
          note: String(row.note ?? ''),
          occurredAt: String(row.occurred_at),
        },
      ];
    });
}

export default function IncomeTransferScreen() {
  const [database, setDatabase] = useState<DatabaseLike | null>(null);
  const [direction, setDirection] = useState<TransactionDirection>('income');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [entries, setEntries] = useState<RecordedEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      try {
        const openedDatabase = await openAppDatabase();
        runMigrations(openedDatabase);
        const recordedEntries = getRecordedEntries(openedDatabase);
        if (!active) return;
        setDatabase(openedDatabase);
        setEntries(recordedEntries);
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Unable to open the local database.');
        }
      }
    };

    void initialize();
    return () => {
      active = false;
    };
  }, []);

  const saveEntry = () => {
    const parsedAmount = Number(amount);
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a positive whole amount in XAF.');
      return;
    }
    if (!database) {
      setError('The local database is not ready yet.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      transactions.add(database, loadPlanSep2026().household.id, {
        occurred_at: new Date().toISOString(),
        amount: parsedAmount,
        direction,
        note: note.trim() || null,
        source: 'manual',
      });
      scheduleNotificationRefresh();
      setEntries(getRecordedEntries(database));
      setAmount('');
      setNote('');
      setMessage(`${direction === 'income' ? 'Income' : 'Transfer'} recorded.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this transaction.');
    } finally {
      setSaving(false);
    }
  };

  const selectedEntryType = entryTypes.find((item) => item.direction === direction);

  return (
    <PageLayout
      title="Income & transfers"
      subtitle="Record income without counting transfers as spending"
    >
      <View className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Entry type
        </Text>
        <View className="flex-row gap-2">
          {entryTypes.map((item) => {
            const isActive = direction === item.direction;
            return (
              <Pressable
                key={item.direction}
                onPress={() => setDirection(item.direction)}
                className={`rounded-full px-4 py-2 ${isActive ? 'bg-emerald-100' : 'bg-slate-100'}`}
              >
                <Text
                  className={`font-semibold ${isActive ? 'text-emerald-700' : 'text-slate-700'}`}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="mb-2 mt-5 text-sm font-medium text-slate-700">Amount (XAF)</Text>
        <TextInput
          accessibilityLabel="Amount in XAF"
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
          placeholder="Enter a whole amount"
          className="rounded-xl border border-slate-200 px-4 py-3 text-lg text-slate-900"
        />

        <Text className="mb-2 mt-4 text-sm font-medium text-slate-700">
          {selectedEntryType?.noteLabel}
        </Text>
        <TextInput
          accessibilityLabel={selectedEntryType?.noteLabel}
          value={note}
          onChangeText={setNote}
          placeholder="Optional"
          className="rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900"
        />

        <Text className="mt-3 text-xs text-slate-500">
          Transfers are recorded separately and do not add to a budget line&apos;s spending.
        </Text>
        {error ? <Text className="mt-3 text-sm font-medium text-red-700">{error}</Text> : null}
        {message ? (
          <Text className="mt-3 text-sm font-medium text-emerald-700">{message}</Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={!database || saving}
          onPress={saveEntry}
          className={`mt-5 rounded-2xl px-4 py-3 ${!database || saving ? 'bg-slate-300' : 'bg-emerald-600'}`}
        >
          <Text className="text-center text-base font-bold text-white">
            {saving ? 'Saving…' : 'Save entry'}
          </Text>
        </Pressable>
      </View>

      <View className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="mb-3 text-lg font-bold text-slate-900">This month</Text>
        {entries.length > 0 ? (
          entries.map((entry) => (
            <View
              key={entry.id}
              className="flex-row items-center justify-between border-b border-slate-100 py-3"
            >
              <View className="mr-3 flex-1">
                <Text className="font-semibold capitalize text-slate-900">{entry.direction}</Text>
                <Text className="mt-1 text-xs text-slate-500">
                  {entry.note || new Date(entry.occurredAt).toLocaleDateString()}
                </Text>
              </View>
              <Text className="font-bold text-slate-900">{formatXAF(entry.amount)}</Text>
            </View>
          ))
        ) : (
          <Text className="text-sm text-slate-500">
            No income or transfers recorded this month.
          </Text>
        )}
      </View>
    </PageLayout>
  );
}
