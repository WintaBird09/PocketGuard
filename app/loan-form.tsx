import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { pickContact } from '@/src/contacts/pickContact';
import {
  buildLoanInput,
  emptyLoanForm,
  loanToForm,
  type LoanFormFields,
} from '@/src/data/loanForm';
import { checkLendingCap, getLendingCap } from '@/src/data/lendingCap';
import { createLoan, getLoan, updateLoan } from '@/src/data/loans';
import { localDateString } from '@/src/domain/dates';
import type { LoanPlan } from '@/src/domain/loans';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { Banner, Button, Chip } from '@/src/ui/controls';
import { DatePickerField } from '@/src/ui/DatePickerField';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';
import { getCurrencyCode } from '@/src/domain/currency';

const plans: { key: LoanPlan; label: string }[] = [
  { key: 'single', label: 'One payment' },
  { key: 'installments', label: 'Installments' },
  { key: 'flexible', label: 'Flexible' },
];

const inputClass =
  'mb-2 min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-3 text-base';

function yearsFromNow(years: number): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() + years);
  return date;
}

function Label({ children }: { children: string }) {
  return (
    <Text className="mb-1 mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
      {children}
    </Text>
  );
}

export default function LoanFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { db, householdId, loading, error: dbError } = useDatabase();
  const [edits, setEdits] = useState<LoanFormFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const existing = useMemo(() => {
    if (!id || !db || !householdId) return { fields: null, failure: null };
    const loan = getLoan(db, householdId, id);
    return loan
      ? { fields: loanToForm(loan), failure: null }
      : { fields: null, failure: 'Loan was not found.' };
  }, [db, householdId, id]);

  const form = edits ?? existing.fields ?? emptyLoanForm(localDateString());
  const loaded = !id || existing.fields !== null;

  const update = (change: Partial<LoanFormFields>) => setEdits({ ...form, ...change });
  const set = <K extends keyof LoanFormFields>(key: K, value: LoanFormFields[K]) =>
    update({ [key]: value } as Partial<LoanFormFields>);

  const cap = useMemo(
    () => (db && householdId ? getLendingCap(db, householdId) : null),

    [db, householdId],
  );

  const capPreview = useMemo(() => {
    if (!db || !householdId || cap === null) return null;
    const amount = Number(form.amount.replace(/[\s,]/g, ''));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.lentOn)) return null;
    return checkLendingCap(db, householdId, {
      amount: Number.isInteger(amount) ? amount : 0,
      lentOn: form.lentOn,
      excludeLoanId: id ?? null,
    });
  }, [db, householdId, cap, form.amount, form.lentOn, id]);

  const choosePerson = async () => {
    setError(null);
    const result = await pickContact();
    if (result.status === 'picked') {
      update({
        personName: result.person.name,
        personPhone: result.person.phone ?? '',
        contactId: result.person.contactId ?? '',
      });
      setNotice(null);
    } else if (result.status === 'unavailable') {
      setNotice(result.message);
    }
  };

  const save = () => {
    if (!db || !householdId) return;
    setError(null);
    try {
      const input = buildLoanInput(form);
      if (id) updateLoan(db, householdId, id, input);
      else createLoan(db, householdId, input);
      scheduleNotificationRefresh();
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the loan.');
    }
  };

  const failure = dbError ?? existing.failure ?? error;

  return (
    <PageLayout
      loading={loading}
      title={id ? 'Edit loan' : 'Add loan'}
      subtitle="Money you lent. It is not counted as spending."
    >
      {failure ? <Banner tone="error">{failure}</Banner> : null}
      {notice ? <Banner tone="info">{notice}</Banner> : null}

      {loaded ? (
        <View className="rounded-2xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-4">
          <Label>Person</Label>
          <Button
            label={form.personName ? 'Pick a different contact' : 'Pick from contacts'}
            variant="outline"
            onPress={() => void choosePerson()}
          />
          <TextInput
            accessibilityLabel="Person name"
            placeholder="Name"
            value={form.personName}
            onChangeText={(value) => update({ personName: value, contactId: '' })}
            className={`mt-2 ${inputClass}`}
          />
          <TextInput
            accessibilityLabel="Person phone"
            placeholder="Phone (optional)"
            keyboardType="phone-pad"
            value={form.personPhone}
            onChangeText={(value) => set('personPhone', value)}
            className={inputClass}
          />

          <Label>{`Amount (${getCurrencyCode()})`}</Label>
          <TextInput
            accessibilityLabel="Amount"
            placeholder="e.g. 20000"
            keyboardType="number-pad"
            value={form.amount}
            onChangeText={(value) => set('amount', value)}
            className={inputClass}
          />
          {capPreview && cap !== null ? (
            <Text
              className={`mb-2 text-sm ${capPreview.status === 'BLOCKED' ? 'text-red-700 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}
            >
              {capPreview.status === 'BLOCKED'
                ? capPreview.reason
                : `Monthly lending cap ${formatXAF(cap)} · ${formatXAF(capPreview.remaining ?? 0)} left`}
            </Text>
          ) : null}

          <DatePickerField
            label="Date lent"
            value={form.lentOn}
            onChange={(value) => set('lentOn', value)}
            minimumDate={yearsFromNow(-5)}
            maximumDate={yearsFromNow(1)}
            startOnToday
          />

          <Label>Payment plan</Label>
          <View className="mb-2 flex-row flex-wrap gap-2">
            {plans.map((item) => (
              <Chip
                key={item.key}
                label={item.label}
                active={form.plan === item.key}
                onPress={() => set('plan', item.key)}
              />
            ))}
          </View>

          {form.plan === 'installments' ? (
            <>
              <DatePickerField
                label="First installment due"
                value={form.firstDueOn}
                onChange={(value) => set('firstDueOn', value)}
                minimumDate={yearsFromNow(-1)}
                maximumDate={yearsFromNow(10)}
                startOnToday
              />
              <Label>Number of monthly installments</Label>
              <TextInput
                accessibilityLabel="Installments"
                keyboardType="number-pad"
                value={form.installmentCount}
                onChangeText={(value) => set('installmentCount', value)}
                className={inputClass}
              />
            </>
          ) : (
            <>
              <DatePickerField
                label={form.plan === 'single' ? 'Due date' : 'Expected by (optional)'}
                value={form.deadline}
                onChange={(value) => set('deadline', value)}
                minimumDate={yearsFromNow(-1)}
                maximumDate={yearsFromNow(10)}
                startOnToday
              />
            </>
          )}

          <Label>Note (optional)</Label>
          <TextInput
            accessibilityLabel="Note"
            value={form.note}
            onChangeText={(value) => set('note', value)}
            className={inputClass}
          />

          <View className="mt-3 gap-2">
            <Button label={id ? 'Save changes' : 'Save loan'} onPress={save} />
            <Button label="Cancel" variant="outline" onPress={() => router.back()} />
          </View>
        </View>
      ) : null}
    </PageLayout>
  );
}
