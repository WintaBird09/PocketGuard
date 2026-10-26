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
import { checkLendingCap, getLendingCap, setLendingCap } from '@/src/data/lendingCap';
import { createLoan, getLoan, updateLoan } from '@/src/data/loans';
import { localDateString } from '@/src/domain/dates';
import type { LoanPlan } from '@/src/domain/loans';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { Banner, Button, Chip } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';

const plans: { key: LoanPlan; label: string }[] = [
  { key: 'single', label: 'One payment' },
  { key: 'installments', label: 'Installments' },
  { key: 'flexible', label: 'Flexible' },
];

const inputClass = 'mb-2 min-h-12 rounded-xl border border-slate-200 px-3 py-3 text-base';

function Label({ children }: { children: string }) {
  return <Text className="mb-1 mt-2 text-xs font-semibold text-slate-500">{children}</Text>;
}

export default function LoanFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { db, householdId, loading, error: dbError } = useDatabase();
  const [edits, setEdits] = useState<LoanFormFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [capInput, setCapInput] = useState('');
  const [capVersion, setCapVersion] = useState(0);

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
    // capVersion re-reads after the cap is changed on this screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, householdId, capVersion],
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

  const saveCap = (value: number | null) => {
    if (!db || !householdId) return;
    setError(null);
    try {
      setLendingCap(db, householdId, value);
      setCapInput('');
      setCapVersion((version) => version + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the cap.');
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
        <View className="rounded-2xl border border-slate-300 bg-white p-4">
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

          <Label>Amount (XAF)</Label>
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
              className={`mb-2 text-sm ${capPreview.status === 'BLOCKED' ? 'text-red-700' : 'text-slate-600'}`}
            >
              {capPreview.status === 'BLOCKED'
                ? capPreview.reason
                : `Monthly lending cap ${formatXAF(cap)} · ${formatXAF(capPreview.remaining ?? 0)} left`}
            </Text>
          ) : null}

          <Label>Date lent (YYYY-MM-DD)</Label>
          <TextInput
            accessibilityLabel="Date lent"
            value={form.lentOn}
            onChangeText={(value) => set('lentOn', value)}
            className={inputClass}
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
              <Label>First installment due (YYYY-MM-DD)</Label>
              <TextInput
                accessibilityLabel="First installment date"
                value={form.firstDueOn}
                onChangeText={(value) => set('firstDueOn', value)}
                placeholder="YYYY-MM-DD"
                className={inputClass}
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
              <Label>
                {form.plan === 'single' ? 'Due date (YYYY-MM-DD)' : 'Expected by (optional)'}
              </Label>
              <TextInput
                accessibilityLabel="Deadline"
                value={form.deadline}
                onChangeText={(value) => set('deadline', value)}
                placeholder="YYYY-MM-DD"
                className={inputClass}
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

      <View className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <Text className="text-base font-bold text-slate-900">Monthly lending cap</Text>
        <Text className="mt-1 text-sm text-slate-600">
          {cap === null
            ? 'Off. Turn it on to stop new loans above a monthly total.'
            : `On: ${formatXAF(cap)} per month. Loans above it are blocked.`}
        </Text>
        <TextInput
          accessibilityLabel="Lending cap"
          placeholder="Cap in XAF"
          keyboardType="number-pad"
          value={capInput}
          onChangeText={setCapInput}
          className={`mt-2 ${inputClass}`}
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button
              label="Set cap"
              onPress={() => {
                const value = Number(capInput.replace(/[\s,]/g, ''));
                if (!Number.isInteger(value) || value <= 0) {
                  setError('Enter the cap as a whole number of XAF.');
                  return;
                }
                saveCap(value);
              }}
            />
          </View>
          {cap !== null ? (
            <View className="flex-1">
              <Button label="Turn off" variant="outline" onPress={() => saveCap(null)} />
            </View>
          ) : null}
        </View>
      </View>
    </PageLayout>
  );
}
