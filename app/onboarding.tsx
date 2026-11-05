import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Text, TextInput, View } from 'react-native';

import { useAuth } from '@/src/auth/AuthProvider';
import {
  getPersonalInfo,
  isProfileComplete,
  personalInfoToMetadata,
  validatePersonalInfo,
  type PersonalInfo,
} from '@/src/auth/personalInfo';
import { completeOnboardingWithoutPlan, loadSeedPlan, needsOnboarding } from '@/src/data/bootstrap';
import {
  addBudgetLine,
  ensureMiscLine,
  getMonthPlan,
  getPlannedIncome,
  setAllocation,
  setPlannedIncome,
  type LineKind,
  type PlanLine,
} from '@/src/data/plan';
import { effectiveNow, monthKeyForDate } from '@/src/domain/dates';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { Banner, Button, Chip, monthLabel } from '@/src/ui/controls';
import { DatePickerField } from '@/src/ui/DatePickerField';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';
import { getCurrencyCode } from '@/src/domain/currency';

const inputClass =
  'min-h-12 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3 text-base text-slate-900 dark:text-slate-100';

const suggestions: { name: string; kind: LineKind }[] = [
  { name: 'Food', kind: 'running' },
  { name: 'Transport', kind: 'running' },
  { name: 'Rent', kind: 'fixed' },
  { name: 'Airtime & data', kind: 'running' },
  { name: 'Health', kind: 'running' },
  { name: 'Savings', kind: 'savings' },
];

function parseAmount(text: string): number {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <View className="mb-4">
      <Text className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</Text>
      {children}
      {error ? <Text className="mt-1 text-sm text-red-700 dark:text-red-400">{error}</Text> : null}
    </View>
  );
}

function StepHeader({ step }: { step: 1 | 2 }) {
  return (
    <View className="mb-5 flex-row items-center">
      {[1, 2].map((item) => (
        <View key={item} className="mr-2 flex-1">
          <View
            className={`h-1.5 rounded-full ${item <= step ? 'bg-emerald-600' : 'bg-slate-200 dark:bg-slate-700'}`}
          />
          <Text
            className={`mt-1 text-xs font-semibold ${item <= step ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}`}
          >
            {item === 1 ? 'About you' : 'Your budget'}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { session, updateProfileMetadata } = useAuth();
  const { db, householdId, loading, error: dbError } = useDatabase();
  const profileDone = isProfileComplete(session?.user);

  const [step, setStep] = useState<1 | 2>(profileDone ? 2 : 1);
  const [info, setInfo] = useState<PersonalInfo>(() => getPersonalInfo(session?.user));
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [revision, setRevision] = useState(0);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [incomeText, setIncomeText] = useState<string | null>(null);
  const [newLine, setNewLine] = useState('');
  const month = monthKeyForDate(effectiveNow(), 'Africa/Douala');
  const errors = validatePersonalInfo(info);

  const budget = useMemo(() => {
    if (step !== 2 || !db || !householdId)
      return { lines: [] as PlanLine[], income: '', failure: null };
    try {
      ensureMiscLine(db, householdId);
      const planned = getPlannedIncome(db, householdId);
      return {
        lines: getMonthPlan(db, householdId, month).lines,
        income: planned ? String(planned) : '',
        failure: null,
      };
    } catch (cause) {
      return {
        lines: [] as PlanLine[],
        income: '',
        failure: cause instanceof Error ? cause.message : 'Unable to load your budget lines.',
      };
    }
    // revision re-reads after a line is added
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, householdId, month, step, revision]);
  const lines = budget.lines;
  const income = incomeText ?? budget.income;
  const amountFor = (line: PlanLine) =>
    amounts[line.id] ?? (line.planned > 0 ? String(line.planned) : '');

  const saveProfile = async () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      await updateProfileMetadata(personalInfoToMetadata(info));
      // An account that already holds a plan has nothing left to set up.
      if (db && householdId && !needsOnboarding(db, householdId)) {
        router.replace('/(tabs)');
        return;
      }
      setStep(2);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save your details.');
    } finally {
      setBusy(false);
    }
  };

  const addLine = (name: string, kind: LineKind = 'running') => {
    if (!db || !householdId) return;
    setError(null);
    try {
      addBudgetLine(db, householdId, { name, kind });
      setNewLine('');
      setRevision((current) => current + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add the budget line.');
    }
  };

  const useSeedPlan = () => {
    if (!db || !householdId) return;
    setBusy(true);
    setError(null);
    try {
      loadSeedPlan(db as Parameters<typeof loadSeedPlan>[0], householdId);
      scheduleNotificationRefresh();
      router.replace('/(tabs)');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the plan.');
      setBusy(false);
    }
  };

  const finish = () => {
    if (!db || !householdId) return;
    setBusy(true);
    setError(null);
    try {
      for (const line of lines) {
        const text = amountFor(line);
        if (text !== '') setAllocation(db, householdId, line.id, month, parseAmount(text));
      }
      if (income !== '') setPlannedIncome(db, householdId, parseAmount(income));
      completeOnboardingWithoutPlan(
        db as Parameters<typeof completeOnboardingWithoutPlan>[0],
        householdId,
      );
      scheduleNotificationRefresh();
      router.replace('/(tabs)');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save your budget.');
      setBusy(false);
    }
  };

  const total = lines.reduce((sum, line) => sum + parseAmount(amountFor(line)), 0);
  const shown = (key: keyof PersonalInfo) => (submitted ? (errors[key] ?? null) : null);

  if (step === 1) {
    return (
      <PageLayout title="Welcome" subtitle="Tell us a little about yourself" loading={loading}>
        <StepHeader step={1} />
        {(error ?? dbError) ? <Banner tone="error">{error ?? dbError ?? ''}</Banner> : null}
        <View className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <Field label="Full name" error={shown('name')}>
            <TextInput
              accessibilityLabel="Full name"
              autoCapitalize="words"
              autoComplete="name"
              className={inputClass}
              onChangeText={(name) => setInfo((current) => ({ ...current, name }))}
              placeholder="e.g. Ada Nkabeh"
              value={info.name}
            />
          </Field>
          <Field label="Phone number" error={shown('phone')}>
            <TextInput
              accessibilityLabel="Phone number"
              autoComplete="tel"
              className={inputClass}
              keyboardType="phone-pad"
              onChangeText={(phone) => setInfo((current) => ({ ...current, phone }))}
              placeholder="e.g. +237 6 70 12 34 56"
              value={info.phone}
            />
          </Field>
          <DatePickerField
            label="Date of birth"
            value={info.birthDate}
            onChange={(birthDate) => setInfo((current) => ({ ...current, birthDate }))}
            error={shown('birthDate')}
          />
          <Field label="Profession" error={shown('profession')}>
            <TextInput
              accessibilityLabel="Profession"
              autoCapitalize="words"
              className={inputClass}
              onChangeText={(profession) => setInfo((current) => ({ ...current, profession }))}
              placeholder="e.g. Teacher, Engineer, Student"
              value={info.profession}
            />
          </Field>
          <Button
            label={busy ? 'Saving…' : 'Continue'}
            disabled={busy || loading}
            onPress={() => void saveProfile()}
          />
        </View>
        <Text className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          Your details are saved to your account only.
        </Text>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Your budget"
      subtitle={`Set how much to spend on each line in ${monthLabel(month)}`}
      loading={loading}
    >
      <StepHeader step={2} />
      {(error ?? dbError) ? <Banner tone="error">{error ?? dbError ?? ''}</Banner> : null}

      <View className="mb-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
          Expected income ({getCurrencyCode()})
        </Text>
        <Text className="mb-2 mt-1 text-sm text-slate-500 dark:text-slate-400">
          Optional. What you expect to earn.
        </Text>
        <TextInput
          accessibilityLabel="Expected income"
          className={inputClass}
          keyboardType="number-pad"
          onChangeText={(value) => setIncomeText(value.replace(/\D/g, ''))}
          placeholder="0"
          value={income}
        />
      </View>

      <View className="mb-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <Text className="text-base font-bold text-slate-900 dark:text-slate-100">Budget lines</Text>
        <Text className="mb-3 mt-1 text-sm text-slate-500 dark:text-slate-400">
          Enter the amount you plan to spend this month on each line.
        </Text>
        {lines.map((line) => (
          <View key={line.id} className="mb-3">
            <Text className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              {line.name}
            </Text>
            <TextInput
              accessibilityLabel={`${line.name} budget`}
              className={inputClass}
              keyboardType="number-pad"
              onChangeText={(value) =>
                setAmounts((current) => ({ ...current, [line.id]: value.replace(/\D/g, '') }))
              }
              placeholder="0"
              value={amountFor(line)}
            />
          </View>
        ))}
        <View className="mt-1 flex-row items-center justify-between rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-3">
          <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Total planned
          </Text>
          <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
            {formatXAF(total)}
          </Text>
        </View>
      </View>

      <View className="mb-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
          Add a budget line
        </Text>
        <View className="my-3 flex-row flex-wrap gap-2">
          {suggestions
            .filter(
              (item) => !lines.some((line) => line.name.toLowerCase() === item.name.toLowerCase()),
            )
            .map((item) => (
              <Chip
                key={item.name}
                label={`+ ${item.name}`}
                onPress={() => addLine(item.name, item.kind)}
              />
            ))}
        </View>
        <View className="flex-row items-center gap-2">
          <TextInput
            accessibilityLabel="New budget line name"
            autoCapitalize="words"
            className={`${inputClass} flex-1`}
            onChangeText={setNewLine}
            placeholder="Custom line, e.g. School fees"
            value={newLine}
          />
          <Ionicons
            accessibilityRole="button"
            accessibilityLabel="Add budget line"
            name="add-circle"
            size={44}
            color={newLine.trim() ? '#059669' : '#cbd5e1'}
            onPress={() => newLine.trim() && addLine(newLine)}
          />
        </View>
      </View>

      <Button
        label={busy ? 'Saving…' : 'Finish setup'}
        disabled={busy || loading}
        onPress={finish}
      />
      <View className="mt-3">
        <Button
          label="Use my Sep–Dec 2026 plan instead"
          variant="outline"
          disabled={busy || loading}
          onPress={useSeedPlan}
        />
      </View>
    </PageLayout>
  );
}
