import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Text, TextInput, View } from 'react-native';

import { canSendReminder, whatsappReminderUrl } from '@/src/data/loanReminder';
import { loanBadgeStyle, loanDueText, loanStatusLabel } from '@/src/data/loanView';
import {
  deleteLoan,
  deleteLoanRepayment,
  getLoan,
  listPersonSummaries,
  recordLoanRepayment,
  reinstateLoan,
  writeOffLoan,
} from '@/src/data/loans';
import { localDateString } from '@/src/domain/dates';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { Banner, Button } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';

// Destructive actions need a second tap; Alert.alert is not available on web.
type Confirming = 'writeoff' | 'delete' | `payment:${string}` | null;

export default function LoanDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { db, householdId, error: dbError, tick, refresh } = useDatabase();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loaded = useMemo(() => {
    if (!db || !householdId || !id) return { loan: null, person: null };
    const loan = getLoan(db, householdId, id);
    if (!loan) return { loan: null, person: null };
    const person = listPersonSummaries(db, householdId).find((group) =>
      group.loans.some((item) => item.id === loan.id),
    );
    return { loan, person: person ?? null };
    // tick re-reads when the screen regains focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, householdId, id, tick]);
  const { loan, person } = loaded;

  const run = (action: () => void, done: string) => {
    setError(null);
    setMessage(null);
    try {
      action();
      setConfirming(null);
      setMessage(done);
      scheduleNotificationRefresh();
      refresh();
    } catch (cause) {
      setConfirming(null);
      setError(cause instanceof Error ? cause.message : 'Something went wrong.');
    }
  };

  const recordRepayment = () => {
    if (!db || !loan) return;
    const text = amount.replace(/[\s,]/g, '');
    if (!/^\d+$/.test(text) || Number(text) <= 0) {
      setError('Enter the repayment as a whole number of XAF.');
      return;
    }
    run(() => {
      recordLoanRepayment(db, householdId, { loanId: loan.id, amount: Number(text), note });
      setAmount('');
      setNote('');
    }, 'Repayment recorded.');
  };

  const sendReminder = async () => {
    if (!loan) return;
    setError(null);
    try {
      await Linking.openURL(whatsappReminderUrl(loan));
    } catch {
      setError('WhatsApp could not be opened on this device.');
    }
  };

  const failure = dbError ?? error;
  // Repayments cover installments in order.
  const installmentRows = (loan?.installments ?? []).map((item, index, all) => {
    const before = all.slice(0, index).reduce((sum, earlier) => sum + earlier.amount, 0);
    return { ...item, done: (loan?.paid ?? 0) >= before + item.amount };
  });

  return (
    <PageLayout title={loan?.personName ?? 'Loan'} subtitle="Loan details">
      {failure ? <Banner tone="error">{failure}</Banner> : null}
      {message ? <Banner tone="success">{message}</Banner> : null}
      {db && !loan ? <Banner tone="error">This loan was not found.</Banner> : null}

      {loan ? (
        <>
          <View className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <View className="flex-row items-center justify-between">
              <Text className="text-3xl font-bold text-slate-900">{formatXAF(loan.balance)}</Text>
              <Text
                className={`rounded-full border px-2 py-0.5 text-xs font-bold ${loanBadgeStyle[loan.status]}`}
              >
                {loanStatusLabel[loan.status]}
              </Text>
            </View>
            <Text className="mt-1 text-sm text-slate-600">
              left of {formatXAF(loan.amount)} lent on {loan.lentOn}
            </Text>
            <View className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <View
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${loan.percentPaid}%` }}
              />
            </View>
            <Text className="mt-2 text-sm text-slate-600">
              {formatXAF(loan.paid)} repaid · {loanDueText(loan)}
            </Text>
            {loan.personPhone ? (
              <Text className="mt-1 text-sm text-slate-600">{loan.personPhone}</Text>
            ) : null}
            {loan.note ? <Text className="mt-1 text-sm text-slate-600">{loan.note}</Text> : null}
          </View>

          <View className="mt-3 gap-2">
            {canSendReminder(loan) ? (
              <Button label="Send reminder on WhatsApp" onPress={() => void sendReminder()} />
            ) : null}
            <Button
              label="Edit loan"
              variant="outline"
              onPress={() => router.push({ pathname: '/loan-form', params: { id: loan.id } })}
            />
          </View>

          {loan.balance > 0 && loan.status !== 'WRITTEN_OFF' ? (
            <View className="mt-4 rounded-2xl border border-slate-300 bg-white p-4">
              <Text className="mb-2 text-base font-bold text-slate-900">Record a repayment</Text>
              <TextInput
                accessibilityLabel="Repayment amount"
                placeholder={`Up to ${formatXAF(loan.balance)}`}
                keyboardType="number-pad"
                value={amount}
                onChangeText={setAmount}
                className="mb-2 rounded-xl border border-slate-200 px-3 py-2 text-base"
              />
              <TextInput
                accessibilityLabel="Repayment note"
                placeholder="Note (optional)"
                value={note}
                onChangeText={setNote}
                className="mb-2 rounded-xl border border-slate-200 px-3 py-2 text-base"
              />
              <Button label="Save repayment" onPress={recordRepayment} />
            </View>
          ) : null}

          {installmentRows.length > 0 ? (
            <View className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <Text className="mb-2 text-base font-bold text-slate-900">Installments</Text>
              {installmentRows.map((item, index) => {
                const done = item.done;
                const late = !done && item.dueOn < localDateString();
                return (
                  <View
                    key={`${item.dueOn}-${index}`}
                    className="flex-row items-center justify-between py-1"
                  >
                    <Text className="text-sm text-slate-700">
                      {index + 1}. {item.dueOn}
                    </Text>
                    <Text
                      className={`text-sm font-semibold ${
                        done ? 'text-emerald-700' : late ? 'text-red-700' : 'text-slate-700'
                      }`}
                    >
                      {formatXAF(item.amount)} · {done ? 'Paid' : late ? 'Late' : 'Upcoming'}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <Text className="mb-2 text-base font-bold text-slate-900">Repayment history</Text>
            {loan.payments.length === 0 ? (
              <Text className="text-sm text-slate-600">No repayments yet.</Text>
            ) : null}
            {loan.payments.map((payment) => (
              <View key={payment.id} className="border-t border-slate-100 py-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-slate-700">
                    {localDateString(new Date(payment.paidAt))}
                    {payment.note ? ` · ${payment.note}` : ''}
                  </Text>
                  <Text className="text-sm font-semibold text-slate-900">
                    {formatXAF(payment.amount)}
                  </Text>
                </View>
                <View className="mt-1 items-end">
                  <Text
                    accessibilityRole="button"
                    className="text-xs font-semibold text-red-700"
                    onPress={() => {
                      if (confirming === `payment:${payment.id}` && db) {
                        run(
                          () => deleteLoanRepayment(db, householdId, payment.id),
                          'Repayment removed.',
                        );
                      } else {
                        setConfirming(`payment:${payment.id}`);
                      }
                    }}
                  >
                    {confirming === `payment:${payment.id}`
                      ? 'Tap again to remove'
                      : 'Remove mistaken repayment'}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {person && person.loanCount > 1 ? (
            <View className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <Text className="text-base font-bold text-slate-900">
                All loans to {person.personName}
              </Text>
              <Text className="mt-1 text-sm text-slate-600">
                {person.loanCount} loans · {formatXAF(person.totalLent)} lent ·{' '}
                {formatXAF(person.totalRepaid)} repaid · {formatXAF(person.outstanding)} outstanding
                {person.writtenOff > 0 ? ` · ${formatXAF(person.writtenOff)} written off` : ''}
              </Text>
            </View>
          ) : null}

          <View className="mt-4 gap-2">
            {loan.status === 'WRITTEN_OFF' ? (
              <Button
                label="Reinstate loan"
                variant="outline"
                onPress={() =>
                  db && run(() => reinstateLoan(db, householdId, loan.id), 'Loan reinstated.')
                }
              />
            ) : loan.balance > 0 ? (
              <Button
                label={
                  confirming === 'writeoff'
                    ? 'Tap again to forgive the rest'
                    : 'Write off / forgive'
                }
                variant="outline"
                onPress={() => {
                  if (confirming === 'writeoff' && db) {
                    run(() => writeOffLoan(db, householdId, loan.id), 'Loan written off.');
                  } else {
                    setConfirming('writeoff');
                  }
                }}
              />
            ) : null}
            <Button
              label={confirming === 'delete' ? 'Tap again to delete this loan' : 'Delete loan'}
              variant="danger"
              onPress={() => {
                if (confirming === 'delete' && db) {
                  try {
                    deleteLoan(db, householdId, loan.id);
                    scheduleNotificationRefresh();
                    router.back();
                  } catch (cause) {
                    setConfirming(null);
                    setError(cause instanceof Error ? cause.message : 'Unable to delete.');
                  }
                } else {
                  setConfirming('delete');
                }
              }}
            />
          </View>
        </>
      ) : null}
    </PageLayout>
  );
}
