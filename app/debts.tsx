import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { addDebt, getDebtSchedule, listDebts, recordDebtPayment } from '@/src/data/debts';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { Banner, Button, monthLabel } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';

const statusStyle = {
  OPEN: 'border-amber-600 text-amber-700',
  PAID: 'border-emerald-600 text-emerald-700',
  OVERDUE: 'border-red-600 text-red-700',
} as const;

export default function DebtsScreen() {
  const { db, householdId, error: dbError, tick, refresh } = useDatabase();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [adding, setAdding] = useState(false);
  const [creditor, setCreditor] = useState('');
  const [original, setOriginal] = useState('');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loaded = useMemo(() => {
    if (!db || !householdId) return { data: null, failure: null };
    try {
      const debts = listDebts(db, householdId);
      return { data: { debts, schedule: getDebtSchedule(db, householdId, debts) }, failure: null };
    } catch (cause) {
      return {
        data: null,
        failure: cause instanceof Error ? cause.message : 'Unable to load debts.',
      };
    }
    // tick re-reads after writes or when the screen regains focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, householdId, tick]);

  const run = (action: () => string) => {
    setError(null);
    setMessage(null);
    try {
      setMessage(action());
      scheduleNotificationRefresh();
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this change.');
    }
  };

  const failure = dbError ?? loaded.failure;
  const data = loaded.data;
  const totalRemaining = (data?.debts ?? []).reduce((sum, debt) => sum + debt.balance, 0);

  return (
    <PageLayout
      title="Debts"
      subtitle={data ? `Total remaining ${formatXAF(totalRemaining)}` : undefined}
      action={
        <Link href="/(tabs)/more" className="rounded-2xl border border-slate-300 px-4 py-2">
          <Text className="font-bold text-slate-900">Back</Text>
        </Link>
      }
    >
      {failure ? <Banner tone="error">{failure}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="success">{message}</Banner> : null}

      {data && data.debts.length === 0 ? (
        <Text className="mb-4 text-sm text-slate-600">No debts recorded yet.</Text>
      ) : null}

      {(data?.debts ?? []).map((debt) => {
        const percent = debt.originalAmount > 0 ? (debt.paid / debt.originalAmount) * 100 : 0;
        const paying = payingId === debt.id;
        return (
          <View key={debt.id} className="mb-4 rounded-2xl border border-slate-300 bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-xl font-bold text-slate-900">{debt.creditor}</Text>
              <View className={`rounded-md border px-2 py-1 ${statusStyle[debt.status]}`}>
                <Text className={`text-xs font-bold ${statusStyle[debt.status].split(' ')[1]}`}>
                  {debt.status}
                </Text>
              </View>
            </View>
            <View className="mt-2 flex-row items-center justify-between">
              <Text className="text-sm text-slate-500">
                Original {formatXAF(debt.originalAmount)} · Paid {formatXAF(debt.paid)}
              </Text>
              <Text className="text-base font-bold text-slate-900">
                {formatXAF(debt.balance)} left
              </Text>
            </View>
            <View className="my-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <View
                className="h-full rounded-full bg-slate-900"
                style={{ width: `${Math.min(100, percent)}%` }}
              />
            </View>
            <Text className="text-sm text-slate-500">
              {debt.deadline
                ? `Deadline ${debt.deadline}${
                    debt.daysLeft !== null && debt.status !== 'PAID'
                      ? debt.daysLeft >= 0
                        ? ` · ${debt.daysLeft} days`
                        : ` · ${-debt.daysLeft} days overdue`
                      : ''
                  }`
                : 'Deadline flexible'}
            </Text>

            {debt.status !== 'PAID' ? (
              paying ? (
                <View className="mt-3">
                  <TextInput
                    accessibilityLabel={`Payment amount for ${debt.creditor}`}
                    keyboardType="number-pad"
                    placeholder="Amount in XAF"
                    value={amount}
                    onChangeText={setAmount}
                    className="mb-2 rounded-xl border border-slate-200 px-3 py-2 text-base"
                  />
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Button label="Cancel" variant="outline" onPress={() => setPayingId(null)} />
                    </View>
                    <View className="flex-1">
                      <Button
                        label="Save payment"
                        onPress={() =>
                          run(() => {
                            recordDebtPayment(db!, householdId, {
                              debtId: debt.id,
                              amount: Number(amount.replace(/[\s,]/g, '')),
                            });
                            setPayingId(null);
                            setAmount('');
                            return `Payment to ${debt.creditor} recorded.`;
                          })
                        }
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <View className="mt-3">
                  <Button
                    label="Record payment"
                    onPress={() => {
                      setPayingId(debt.id);
                      setAmount('');
                    }}
                  />
                </View>
              )
            ) : null}

            {debt.payments.length > 0 ? (
              <View className="mt-3 border-t border-slate-200 pt-2">
                <Text className="mb-1 text-xs font-semibold uppercase text-slate-500">
                  Payment history
                </Text>
                {debt.payments.map((payment) => (
                  <View key={payment.id} className="flex-row justify-between py-1">
                    <Text className="text-sm text-slate-600">
                      {new Date(payment.occurredAt).toLocaleDateString('en-GB')}
                    </Text>
                    <Text className="text-sm font-semibold text-slate-900">
                      {formatXAF(payment.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      {adding ? (
        <View className="mb-4 rounded-2xl border border-slate-300 bg-white p-4">
          <TextInput
            accessibilityLabel="Creditor"
            placeholder="Owed to"
            value={creditor}
            onChangeText={setCreditor}
            className="mb-2 rounded-xl border border-slate-200 px-3 py-2 text-base"
          />
          <TextInput
            accessibilityLabel="Original amount"
            placeholder="Original amount (XAF)"
            keyboardType="number-pad"
            value={original}
            onChangeText={setOriginal}
            className="mb-2 rounded-xl border border-slate-200 px-3 py-2 text-base"
          />
          <TextInput
            accessibilityLabel="Deadline"
            placeholder="Deadline YYYY-MM-DD (optional)"
            value={deadline}
            onChangeText={setDeadline}
            className="mb-3 rounded-xl border border-slate-200 px-3 py-2 text-base"
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button label="Cancel" variant="outline" onPress={() => setAdding(false)} />
            </View>
            <View className="flex-1">
              <Button
                label="Save debt"
                onPress={() =>
                  run(() => {
                    addDebt(db!, householdId, {
                      creditor,
                      originalAmount: Number(original.replace(/[\s,]/g, '')),
                      deadline,
                    });
                    setAdding(false);
                    setCreditor('');
                    setOriginal('');
                    setDeadline('');
                    return 'Debt added. Give it a Debt line in Budget so payments are planned.';
                  })
                }
              />
            </View>
          </View>
        </View>
      ) : (
        <View className="mb-4">
          <Button label="+ Add debt" variant="outline" onPress={() => setAdding(true)} />
        </View>
      )}

      {data && data.schedule.length > 0 ? (
        <>
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-slate-900">Planned schedule</Text>
            <Text className="text-sm text-slate-500">From your budget</Text>
          </View>
          {data.schedule.map((entry) => (
            <View
              key={`${entry.month}-${entry.creditor}`}
              className="mb-2 flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white p-3"
            >
              <Text className="text-base text-slate-900">
                {monthLabel(entry.month, 'short')} · {entry.creditor}
              </Text>
              <Text className="font-semibold text-slate-900">{formatXAF(entry.planned)}</Text>
              <Text
                className={`text-xs font-bold ${
                  entry.state === 'Paid'
                    ? 'text-emerald-700'
                    : entry.state === 'Due'
                      ? 'text-amber-700'
                      : 'text-slate-500'
                }`}
              >
                {entry.state}
              </Text>
            </View>
          ))}
        </>
      ) : null}
      <Text className="mt-3 text-center text-sm text-slate-500">
        Balances come from recorded payments. They are never typed in.
      </Text>
    </PageLayout>
  );
}
