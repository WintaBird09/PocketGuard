import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/src/auth/AuthProvider';
import { pickContact } from '@/src/contacts/pickContact';
import {
  getPersonalInfo,
  isProfileComplete,
  personalInfoToMetadata,
  validatePersonalInfo,
  type PersonalInfo,
} from '@/src/auth/personalInfo';
import {
  beginOnboarding,
  completeOnboardingWithoutPlan,
  loadSeedPlan,
  needsOnboarding,
} from '@/src/data/bootstrap';
import { addDebt, findDebtLineId, listDebts } from '@/src/data/debts';
import {
  addIncomeStream,
  incomeKinds,
  listIncomeStreams,
  type IncomeKind,
  type IncomeStream,
} from '@/src/data/income';
import { getSavingsPlanner, addSavingsGoal } from '@/src/data/savings';
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
import { inTransaction } from '@/src/data/household';
import { buildLoanInput, emptyLoanForm, type LoanFormFields } from '@/src/data/loanForm';
import { createLoan, listPersonSummaries } from '@/src/data/loans';
import { effectiveNow, localDateString, monthKeyForDate } from '@/src/domain/dates';
import type { LoanPlan } from '@/src/domain/loans';
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

const loanPlans: { key: LoanPlan; label: string }[] = [
  { key: 'single', label: 'One payment' },
  { key: 'installments', label: 'Installments' },
  { key: 'flexible', label: 'Flexible' },
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

function StepHeader({ step }: { step: 1 | 2 | 3 | 4 | 5 | 6 }) {
  const steps = ['About', 'Income', 'Savings', 'Budget', 'Debts', 'Loans'];
  return (
    <View className="mb-5 flex-row items-center">
      {steps.map((label, index) => {
        const item = index + 1;
        return (
          <View key={item} className="mr-2 flex-1">
            <View
              className={`h-1.5 rounded-full ${item <= step ? 'bg-emerald-600' : 'bg-slate-200 dark:bg-slate-700'}`}
            />
            <Text
              className={`mt-1 text-xs font-semibold ${item <= step ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}`}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { session, updateProfileMetadata } = useAuth();
  const { db, householdId, loading, error: dbError } = useDatabase();
  const profileDone = isProfileComplete(session?.user);

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(profileDone ? 2 : 1);
  const [info, setInfo] = useState<PersonalInfo>(() => getPersonalInfo(session?.user));
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [revision, setRevision] = useState(0);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [incomeText, setIncomeText] = useState<string | null>(null);
  const [newLine, setNewLine] = useState('');
  const [incomeKind, setIncomeKind] = useState<IncomeKind>('salary');
  const [incomeName, setIncomeName] = useState('');
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringAmount, setRecurringAmount] = useState('');
  const [payday, setPayday] = useState('1');
  const [savingsName, setSavingsName] = useState('');
  const [savingsTarget, setSavingsTarget] = useState('');
  const [savingsDueDate, setSavingsDueDate] = useState('');
  const [fundingSources, setFundingSources] = useState<Record<string, string>>({});
  const [seedSourceId, setSeedSourceId] = useState('');
  const [debtCreditor, setDebtCreditor] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtDeadline, setDebtDeadline] = useState('');
  const [debtRepayment, setDebtRepayment] = useState('');
  const [debtIncomeStreamId, setDebtIncomeStreamId] = useState('');
  const [loanForm, setLoanForm] = useState<LoanFormFields>(() =>
    emptyLoanForm(localDateString(effectiveNow())),
  );
  const month = monthKeyForDate(effectiveNow(), 'Africa/Douala');
  const errors = validatePersonalInfo(info);

  const incomeData = (() => {
    if (step !== 2 || !db || !householdId) {
      return { streams: [] as IncomeStream[], failure: null };
    }
    try {
      return { streams: listIncomeStreams(db, householdId), failure: null };
    } catch (cause) {
      return {
        streams: [] as IncomeStream[],
        failure: cause instanceof Error ? cause.message : 'Unable to load income streams.',
      };
    }
  })();

  const budget = useMemo(() => {
    if (step !== 4 || !db || !householdId)
      return {
        lines: [] as PlanLine[],
        income: '',
        streams: [] as IncomeStream[],
        failure: null,
      };
    try {
      ensureMiscLine(db, householdId);
      const planned = getPlannedIncome(db, householdId);
      return {
        lines: getMonthPlan(db, householdId, month).lines,
        income: planned ? String(planned) : '',
        streams: listIncomeStreams(db, householdId),
        failure: null,
      };
    } catch (cause) {
      return {
        lines: [] as PlanLine[],
        income: '',
        streams: [] as IncomeStream[],
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
  const fundingFor = (line: PlanLine) => {
    const selected = fundingSources[line.id];
    if (selected && budget.streams.some((stream) => stream.id === selected)) return selected;
    if (line.incomeStreamId && budget.streams.some((stream) => stream.id === line.incomeStreamId)) {
      return line.incomeStreamId;
    }
    return budget.streams[0]?.id ?? '';
  };

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
      if (db && householdId) beginOnboarding(db, householdId);
      setStep(2);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save your details.');
    } finally {
      setBusy(false);
    }
  };

  const addStream = () => {
    if (!db || !householdId) return;
    setError(null);
    try {
      let recurring: { amount: number; day: number; startMonth: string } | undefined;
      if (recurringEnabled) {
        const amount = parseAmount(recurringAmount);
        const day = Number(payday);
        if (!Number.isSafeInteger(amount) || amount <= 0) {
          setError(`Enter a positive whole monthly amount in ${getCurrencyCode()}.`);
          return;
        }
        if (!Number.isSafeInteger(day) || day < 1 || day > 31) {
          setError('Enter a payday from 1 to 31.');
          return;
        }
        recurring = { amount, day, startMonth: month };
      }
      addIncomeStream(db, householdId, {
        kind: incomeKind,
        name: incomeName.trim() || undefined,
        recurring,
      });
      setIncomeName('');
      setRecurringEnabled(false);
      setRecurringAmount('');
      setPayday('1');
      setRevision((current) => current + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add this income stream.');
    }
  };

  const continueFromIncome = () => {
    if (incomeData.streams.length === 0) {
      setError('Add at least one income stream before continuing.');
      return;
    }
    setError(null);
    setStep(3);
  };

  const savingsData = (() => {
    if (step !== 3 || !db || !householdId) {
      return {
        goals: [] as ReturnType<typeof getSavingsPlanner>['goals'],
        failure: null,
      };
    }
    try {
      return {
        goals: getSavingsPlanner(db, householdId, Number(month.slice(0, 4)), month).goals,
        failure: null,
      };
    } catch (cause) {
      return {
        goals: [] as ReturnType<typeof getSavingsPlanner>['goals'],
        failure: cause instanceof Error ? cause.message : 'Unable to load savings goals.',
      };
    }
  })();

  const debtData = (() => {
    if (step !== 5 || !db || !householdId) {
      return {
        debts: [] as ReturnType<typeof listDebts>,
        streams: [] as IncomeStream[],
        failure: null,
      };
    }
    try {
      return {
        debts: listDebts(db, householdId),
        streams: listIncomeStreams(db, householdId),
        failure: null,
      };
    } catch (cause) {
      return {
        debts: [] as ReturnType<typeof listDebts>,
        streams: [] as IncomeStream[],
        failure: cause instanceof Error ? cause.message : 'Unable to load your debts.',
      };
    }
  })();

  const loanData = (() => {
    if (step !== 6 || !db || !householdId) {
      return {
        loans: [] as ReturnType<typeof listPersonSummaries>[number]['loans'],
        failure: null,
      };
    }
    try {
      return {
        loans: listPersonSummaries(db, householdId).flatMap((person) => person.loans),
        failure: null,
      };
    } catch (cause) {
      return {
        loans: [] as ReturnType<typeof listPersonSummaries>[number]['loans'],
        failure: cause instanceof Error ? cause.message : 'Unable to load your loans.',
      };
    }
  })();

  const addGoal = () => {
    if (!db || !householdId) return;
    setError(null);
    try {
      addSavingsGoal(
        db,
        householdId,
        {
          name: savingsName,
          target: parseAmount(savingsTarget),
          monthlyAmount: 0,
          dueDate: savingsDueDate,
        },
        month,
      );
      setSavingsName('');
      setSavingsTarget('');
      setSavingsDueDate('');
      setRevision((current) => current + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add this savings goal.');
    }
  };

  const continueFromSavings = () => {
    if (savingsData.goals.length === 0) {
      setError('Add at least one savings goal before continuing.');
      return;
    }
    setError(null);
    setStep(4);
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
    const streamId = seedSourceId || budget.streams[0]?.id;
    if (!streamId) {
      setError('Choose an income source for the seed plan.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      loadSeedPlan(db as Parameters<typeof loadSeedPlan>[0], householdId, streamId, false);
      for (const line of getMonthPlan(db, householdId, month).lines) {
        if (!line.incomeStreamId) {
          setAllocation(db, householdId, line.id, month, line.planned, streamId);
        }
      }
      scheduleNotificationRefresh();
      setStep(5);
      setBusy(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load the plan.');
      setBusy(false);
    }
  };

  const continueFromBudget = () => {
    if (!db || !householdId) return;
    setBusy(true);
    setError(null);
    try {
      const allocations = lines.map((line) => ({
        line,
        amount: parseAmount(amountFor(line)),
        incomeStreamId: fundingFor(line),
      }));
      if (
        allocations.some(
          (allocation) => !budget.streams.some((stream) => stream.id === allocation.incomeStreamId),
        )
      ) {
        throw new Error('Choose an income source for every budget line.');
      }
      for (const allocation of allocations) {
        setAllocation(
          db,
          householdId,
          allocation.line.id,
          month,
          allocation.amount,
          allocation.incomeStreamId,
        );
      }
      if (income !== '') setPlannedIncome(db, householdId, parseAmount(income));
      scheduleNotificationRefresh();
      setStep(5);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save your budget.');
    } finally {
      setBusy(false);
    }
  };

  const addOnboardingDebt = () => {
    if (!db || !householdId) return;
    setError(null);
    const creditor = debtCreditor.trim();
    const amount = parseAmount(debtAmount);
    const repayment = debtRepayment.trim() ? parseAmount(debtRepayment) : 0;
    if (!creditor) {
      setError('Enter the creditor or person you owe.');
      return;
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setError(`Enter a positive whole amount owed in ${getCurrencyCode()}.`);
      return;
    }
    if (debtRepayment.trim() && (!Number.isSafeInteger(repayment) || repayment < 0)) {
      setError(`Enter a whole monthly repayment in ${getCurrencyCode()}, or leave it blank.`);
      return;
    }
    const streamId = debtIncomeStreamId || debtData.streams[0]?.id || '';
    if (repayment > 0 && !debtData.streams.some((stream) => stream.id === streamId)) {
      setError('Choose an income source to fund the monthly repayment.');
      return;
    }

    const lineName = `Debt repayment - ${creditor}`;
    const planLines = repayment > 0 ? getMonthPlan(db, householdId, month).lines : [];
    const linkedLineId = repayment > 0 ? findDebtLineId(db, householdId, creditor) : null;
    const existingLine =
      planLines.find((line) => line.id === linkedLineId) ??
      planLines.find((line) => line.name.toLowerCase() === lineName.toLowerCase());
    if (existingLine && existingLine.kind !== 'debt') {
      setError(`A non-debt budget line already uses the name “${lineName}”.`);
      return;
    }
    if (
      existingLine &&
      existingLine.planned > 0 &&
      existingLine.incomeStreamId &&
      existingLine.incomeStreamId !== streamId
    ) {
      setError('This creditor already has a repayment line funded by another income source.');
      return;
    }

    setBusy(true);
    try {
      inTransaction(db, () => {
        addDebt(db, householdId, {
          creditor,
          originalAmount: amount,
          deadline: debtDeadline || null,
        });
        if (repayment > 0) {
          if (existingLine) {
            setAllocation(
              db,
              householdId,
              existingLine.id,
              month,
              existingLine.planned + repayment,
              streamId,
            );
          } else {
            addBudgetLine(db, householdId, {
              name: lineName,
              kind: 'debt',
              month,
              amount: repayment,
              incomeStreamId: streamId,
            });
          }
        }
      });
      setDebtCreditor('');
      setDebtAmount('');
      setDebtDeadline('');
      setDebtRepayment('');
      setDebtIncomeStreamId('');
      setRevision((current) => current + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add this debt.');
    } finally {
      setBusy(false);
    }
  };

  const updateLoanForm = (changes: Partial<LoanFormFields>) =>
    setLoanForm((current) => ({ ...current, ...changes }));

  const addOnboardingLoan = () => {
    if (!db || !householdId) return;
    setBusy(true);
    setError(null);
    try {
      createLoan(db, householdId, buildLoanInput(loanForm));
      setLoanForm(emptyLoanForm(localDateString(effectiveNow())));
      setRevision((current) => current + 1);
      scheduleNotificationRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add this loan.');
    } finally {
      setBusy(false);
    }
  };

  const chooseLoanPerson = async () => {
    setError(null);
    const result = await pickContact();
    if (result.status === 'picked') {
      updateLoanForm({
        personName: result.person.name,
        personPhone: result.person.phone ?? '',
        contactId: result.person.contactId ?? '',
      });
    } else if (result.status === 'unavailable') {
      setError(result.message);
    }
  };

  const finishSetup = () => {
    if (!db || !householdId) return;
    setBusy(true);
    setError(null);
    try {
      completeOnboardingWithoutPlan(
        db as Parameters<typeof completeOnboardingWithoutPlan>[0],
        householdId,
      );
      scheduleNotificationRefresh();
      router.replace('/(tabs)');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to finish setup.');
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

  if (step === 2) {
    const streamNameFor = (kind: IncomeKind) => {
      switch (kind) {
        case 'salary':
          return 'Salary';
        case 'business':
          return 'Business income';
        case 'rental':
          return 'Rental income';
        case 'other':
          return 'Other income';
      }
    };

    return (
      <PageLayout
        title="Income streams"
        subtitle="Add the sources that fund your day-to-day spending"
        loading={loading}
      >
        <StepHeader step={2} />
        {(error ?? dbError ?? incomeData.failure) ? (
          <Banner tone="error">{error ?? dbError ?? incomeData.failure ?? ''}</Banner>
        ) : null}
        <View className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-slate-900">
              <Ionicons name="wallet-outline" size={21} color="#059669" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-emerald-950 dark:text-emerald-100">
                Your records stay private
              </Text>
              <Text className="mt-1 text-xs leading-4 text-emerald-900 dark:text-emerald-200">
                These sources belong to your account. Add at least one to continue; you can add more
                later.
              </Text>
            </View>
          </View>
        </View>

        <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <Text className="mb-2 text-base font-bold text-slate-900 dark:text-slate-100">
            What brings money in?
          </Text>
          <View className="mb-4 flex-row flex-wrap gap-2">
            {incomeKinds.map((kind) => {
              const active = incomeKind === kind;
              return (
                <Pressable
                  key={kind}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setIncomeKind(kind);
                    setIncomeName('');
                  }}
                  className={`min-h-11 justify-center rounded-full border px-4 ${
                    active
                      ? 'border-emerald-700 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/50'
                      : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      active
                        ? 'text-emerald-800 dark:text-emerald-300'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {kind === 'other' ? 'Other' : `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Field label="Name (optional)">
            <TextInput
              accessibilityLabel="Income stream name"
              autoCapitalize="words"
              className={inputClass}
              onChangeText={setIncomeName}
              placeholder={streamNameFor(incomeKind)}
              value={incomeName}
            />
          </Field>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: recurringEnabled }}
            onPress={() => setRecurringEnabled((current) => !current)}
            className="mb-3 min-h-12 flex-row items-center gap-3"
          >
            <View
              className={`h-6 w-6 items-center justify-center rounded-md border ${
                recurringEnabled
                  ? 'border-emerald-700 bg-emerald-700'
                  : 'border-slate-300 dark:border-slate-600'
              }`}
            >
              {recurringEnabled ? <Ionicons name="checkmark" size={16} color="white" /> : null}
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Usually receive a fixed amount each month
              </Text>
              <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Optional; you can set this up later.
              </Text>
            </View>
          </Pressable>
          {recurringEnabled ? (
            <View className="mb-4 flex-row gap-3">
              <View className="flex-1">
                <Text className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Monthly amount ({getCurrencyCode()})
                </Text>
                <TextInput
                  accessibilityLabel="Expected monthly income amount"
                  className={inputClass}
                  keyboardType="number-pad"
                  onChangeText={(value) => setRecurringAmount(value.replace(/\D/g, ''))}
                  placeholder="0"
                  value={recurringAmount}
                />
              </View>
              <View className="w-24">
                <Text className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Payday
                </Text>
                <TextInput
                  accessibilityLabel="Monthly payday"
                  className={inputClass}
                  keyboardType="number-pad"
                  maxLength={2}
                  onChangeText={(value) => setPayday(value.replace(/\D/g, ''))}
                  placeholder="1–31"
                  value={payday}
                />
              </View>
            </View>
          ) : null}
          <Button
            label="Add income stream"
            disabled={busy || loading || !db || !householdId}
            onPress={addStream}
          />
        </View>

        {incomeData.streams.length > 0 ? (
          <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <Text className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">
              Added to your account
            </Text>
            <View className="gap-2">
              {incomeData.streams.map((stream) => (
                <View
                  key={stream.id}
                  className="flex-row items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800"
                >
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
                    <Ionicons name="trending-up-outline" size={18} color="#047857" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {stream.name}
                    </Text>
                    <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {stream.recurringAmount !== null
                        ? `${formatXAF(stream.recurringAmount)} monthly · payday ${stream.recurringDay}`
                        : `${stream.kind.charAt(0).toUpperCase()}${stream.kind.slice(1)} · variable`}
                    </Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={20} color="#059669" />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Button
          label="Continue to savings"
          disabled={busy || loading || incomeData.streams.length === 0}
          onPress={continueFromIncome}
        />
        <Text className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
          You’ll be able to add or edit sources later under Income.
        </Text>
      </PageLayout>
    );
  }

  if (step === 3) {
    const now = effectiveNow();
    return (
      <PageLayout
        title="Savings goals"
        subtitle="Choose what you are saving toward. You can record contributions later."
        loading={loading}
      >
        <StepHeader step={3} />
        {(error ?? dbError ?? savingsData.failure) ? (
          <Banner tone="error">{error ?? dbError ?? savingsData.failure ?? ''}</Banner>
        ) : null}
        <View className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/40">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-slate-900">
              <Ionicons name="flag-outline" size={21} color="#0284c7" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-sky-950 dark:text-sky-100">
                Every goal starts at zero saved
              </Text>
              <Text className="mt-1 text-xs leading-4 text-sky-900 dark:text-sky-200">
                Adding a target does not record a deposit. You can log contributions as you save.
              </Text>
            </View>
          </View>
        </View>

        <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <Text className="mb-4 text-base font-bold text-slate-900 dark:text-slate-100">
            What are you saving for?
          </Text>
          <Field label="Goal name">
            <TextInput
              accessibilityLabel="Savings goal name"
              autoCapitalize="words"
              className={inputClass}
              onChangeText={setSavingsName}
              placeholder="e.g. Emergency fund"
              value={savingsName}
            />
          </Field>
          <Field label={`Target amount (${getCurrencyCode()})`}>
            <TextInput
              accessibilityLabel="Savings target amount"
              className={inputClass}
              keyboardType="number-pad"
              onChangeText={(value) => setSavingsTarget(value.replace(/\D/g, ''))}
              placeholder="e.g. 500000"
              value={savingsTarget}
            />
          </Field>
          <DatePickerField
            label="Target date"
            value={savingsDueDate}
            onChange={setSavingsDueDate}
            minimumDate={new Date(now.getFullYear(), now.getMonth(), 1)}
            maximumDate={new Date(now.getFullYear() + 10, 11, 31)}
            startOnToday
          />
          <Button
            label="Add savings goal"
            disabled={busy || loading || !db || !householdId}
            onPress={addGoal}
          />
        </View>

        {savingsData.goals.length > 0 ? (
          <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <Text className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">
              Your goals
            </Text>
            <View className="gap-2">
              {savingsData.goals.map((goal) => (
                <View
                  key={goal.id}
                  className="flex-row items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800"
                >
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/50">
                    <Ionicons name="flag" size={17} color="#0284c7" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {goal.name}
                    </Text>
                    <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {formatXAF(goal.saved)} saved of {formatXAF(goal.target)} · target{' '}
                      {goal.dueDate}
                    </Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={20} color="#059669" />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Button
          label="Continue to budget"
          disabled={busy || loading || savingsData.goals.length === 0}
          onPress={continueFromSavings}
        />
        <Text className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
          Add at least one goal to continue. You can create more later.
        </Text>
      </PageLayout>
    );
  }

  if (step === 4) {
    return (
      <PageLayout
        title="Your budget"
        subtitle={`Set how much to spend on each line in ${monthLabel(month)}`}
        loading={loading}
      >
        <StepHeader step={4} />
        {(error ?? dbError ?? budget.failure) ? (
          <Banner tone="error">{error ?? dbError ?? budget.failure ?? ''}</Banner>
        ) : null}

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
          <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
            Budget lines
          </Text>
          <Text className="mb-3 mt-1 text-sm text-slate-500 dark:text-slate-400">
            Set this month’s amount and choose the income source that will fund each line.
          </Text>
          {lines.map((line) => (
            <View key={line.id} className="mb-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <Text className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
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
              <Text className="mb-2 mt-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                Funded by (required)
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {budget.streams.map((stream) => {
                  const selected = fundingFor(line) === stream.id;
                  return (
                    <Pressable
                      key={stream.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() =>
                        setFundingSources((current) => ({ ...current, [line.id]: stream.id }))
                      }
                      className={`min-h-11 justify-center rounded-full border px-3 ${
                        selected
                          ? 'border-emerald-700 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/50'
                          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          selected
                            ? 'text-emerald-800 dark:text-emerald-300'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {stream.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
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
                (item) =>
                  !lines.some((line) => line.name.toLowerCase() === item.name.toLowerCase()),
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
          label={busy ? 'Saving…' : 'Continue to debts'}
          disabled={busy || loading || budget.streams.length === 0}
          onPress={continueFromBudget}
        />
        <View className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
            Start from a sample plan
          </Text>
          <Text className="mb-3 mt-1 text-sm text-slate-500 dark:text-slate-400">
            Adds the Sep–Dec 2026 plan without replacing your records. Choose the source assigned to
            its budget lines.
          </Text>
          <Text className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Funded by
          </Text>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {budget.streams.map((stream) => {
              const selected = (seedSourceId || budget.streams[0]?.id) === stream.id;
              return (
                <Pressable
                  key={stream.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setSeedSourceId(stream.id)}
                  className={`min-h-11 justify-center rounded-full border px-3 ${
                    selected
                      ? 'border-emerald-700 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/50'
                      : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      selected
                        ? 'text-emerald-800 dark:text-emerald-300'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {stream.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Button
            label="Load Sep–Dec 2026 plan"
            variant="outline"
            disabled={busy || loading || budget.streams.length === 0}
            onPress={useSeedPlan}
          />
        </View>
      </PageLayout>
    );
  }

  if (step === 5) {
    const now = effectiveNow();
    return (
      <PageLayout
        title="Debts"
        subtitle="Record what you owe. You can decide on a monthly repayment later."
        loading={loading}
      >
        <StepHeader step={5} />
        {(error ?? dbError ?? debtData.failure) ? (
          <Banner tone="error">{error ?? dbError ?? debtData.failure ?? ''}</Banner>
        ) : null}

        <View className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-slate-900">
              <Ionicons name="card-outline" size={21} color="#d97706" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-amber-950 dark:text-amber-100">
                Repayment plans are optional
              </Text>
              <Text className="mt-1 text-xs leading-4 text-amber-900 dark:text-amber-200">
                Enter a monthly amount now to add it to this month’s debt budget. Leave it blank or
                enter 0 to plan repayments later.
              </Text>
            </View>
          </View>
        </View>

        <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <Text className="mb-4 text-base font-bold text-slate-900 dark:text-slate-100">
            Add a debt
          </Text>
          <Field label="Creditor or person you owe">
            <TextInput
              accessibilityLabel="Debt creditor"
              autoCapitalize="words"
              className={inputClass}
              onChangeText={setDebtCreditor}
              placeholder="e.g. Bank or family member"
              value={debtCreditor}
            />
          </Field>
          <Field label={`Current amount owed (${getCurrencyCode()})`}>
            <TextInput
              accessibilityLabel="Current debt balance"
              className={inputClass}
              keyboardType="number-pad"
              onChangeText={(value) => setDebtAmount(value.replace(/\D/g, ''))}
              placeholder="e.g. 200000"
              value={debtAmount}
            />
          </Field>
          <DatePickerField
            label="Payment deadline (optional)"
            value={debtDeadline}
            onChange={setDebtDeadline}
            minimumDate={new Date(1900, 0, 1)}
            maximumDate={new Date(now.getFullYear() + 20, 11, 31)}
            startOnToday
          />
          <Field label={`Monthly repayment (${getCurrencyCode()}, optional)`}>
            <TextInput
              accessibilityLabel="Monthly debt repayment"
              className={inputClass}
              keyboardType="number-pad"
              onChangeText={(value) => setDebtRepayment(value.replace(/\D/g, ''))}
              placeholder="Leave blank or enter 0 to decide later"
              value={debtRepayment}
            />
          </Field>
          {debtRepayment.trim() ? (
            <View className="mb-4">
              <Text className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Repayment funded by (required)
              </Text>
              {debtData.streams.length > 0 ? (
                <View className="flex-row flex-wrap gap-2">
                  {debtData.streams.map((stream) => {
                    const selected = (debtIncomeStreamId || debtData.streams[0]?.id) === stream.id;
                    return (
                      <Pressable
                        key={stream.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setDebtIncomeStreamId(stream.id)}
                        className={`min-h-11 justify-center rounded-full border px-3 ${
                          selected
                            ? 'border-emerald-700 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/50'
                            : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                        }`}
                      >
                        <Text
                          className={`text-xs font-semibold ${
                            selected
                              ? 'text-emerald-800 dark:text-emerald-300'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {stream.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text className="text-sm text-red-700 dark:text-red-400">
                  Add an income source before setting a repayment.
                </Text>
              )}
            </View>
          ) : null}
          <Button
            label="Add debt"
            disabled={busy || loading || !db || !householdId}
            onPress={addOnboardingDebt}
          />
        </View>

        {debtData.debts.length > 0 ? (
          <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <Text className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">
              Debts recorded
            </Text>
            <View className="gap-2">
              {debtData.debts.map((debt) => (
                <View
                  key={debt.id}
                  className="flex-row items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800"
                >
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
                    <Ionicons name="card" size={17} color="#d97706" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {debt.creditor}
                    </Text>
                    <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {formatXAF(debt.balance)} remaining
                      {debt.deadline ? ` · due ${debt.deadline}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={20} color="#059669" />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Button label="Continue to loans" disabled={busy || loading} onPress={() => setStep(6)} />
        <Text className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
          You can add or update debts and repayment plans later from Debts and Budget.
        </Text>
      </PageLayout>
    );
  }

  if (step === 6) {
    const now = effectiveNow();
    return (
      <PageLayout
        title="Loans"
        subtitle="Record money you have lent to someone. You can add more later."
        loading={loading}
      >
        <StepHeader step={6} />
        {(error ?? dbError ?? loanData.failure) ? (
          <Banner tone="error">{error ?? dbError ?? loanData.failure ?? ''}</Banner>
        ) : null}

        <View className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-slate-900">
              <Ionicons name="hand-left-outline" size={21} color="#059669" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-emerald-950 dark:text-emerald-100">
                Only money you lent to others
              </Text>
              <Text className="mt-1 text-xs leading-4 text-emerald-900 dark:text-emerald-200">
                This is money owed to you, not an expense or a debt you owe. If you have not lent
                money, you can finish setup without adding a loan.
              </Text>
            </View>
          </View>
        </View>

        <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <Text className="mb-4 text-base font-bold text-slate-900 dark:text-slate-100">
            Add an existing loan
          </Text>
          <Button
            label="Pick borrower from contacts"
            variant="outline"
            onPress={() => void chooseLoanPerson()}
          />
          <Field label="Borrower">
            <TextInput
              accessibilityLabel="Loan borrower"
              autoCapitalize="words"
              className={inputClass}
              onChangeText={(personName) => updateLoanForm({ personName, contactId: '' })}
              placeholder="Who did you lend money to?"
              value={loanForm.personName}
            />
          </Field>
          <Field label="Phone number (optional)">
            <TextInput
              accessibilityLabel="Borrower phone number"
              className={inputClass}
              keyboardType="phone-pad"
              onChangeText={(personPhone) => updateLoanForm({ personPhone })}
              placeholder="Phone number"
              value={loanForm.personPhone}
            />
          </Field>
          <Field label={`Amount lent (${getCurrencyCode()})`}>
            <TextInput
              accessibilityLabel="Loan amount lent"
              className={inputClass}
              keyboardType="number-pad"
              onChangeText={(amount) => updateLoanForm({ amount: amount.replace(/\D/g, '') })}
              placeholder="e.g. 50000"
              value={loanForm.amount}
            />
          </Field>
          <DatePickerField
            label="Date lent"
            value={loanForm.lentOn}
            onChange={(lentOn) => updateLoanForm({ lentOn })}
            minimumDate={new Date(now.getFullYear() - 5, now.getMonth(), now.getDate())}
            maximumDate={new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())}
            startOnToday
          />

          <Text className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Repayment plan
          </Text>
          <View className="mb-3 flex-row flex-wrap gap-2">
            {loanPlans.map((plan) => (
              <Chip
                key={plan.key}
                label={plan.label}
                active={loanForm.plan === plan.key}
                onPress={() => updateLoanForm({ plan: plan.key })}
              />
            ))}
          </View>

          {loanForm.plan === 'installments' ? (
            <>
              <DatePickerField
                label="First installment due"
                value={loanForm.firstDueOn}
                onChange={(firstDueOn) => updateLoanForm({ firstDueOn })}
                minimumDate={new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())}
                maximumDate={new Date(now.getFullYear() + 10, 11, 31)}
                startOnToday
              />
              <Field label="Number of monthly installments">
                <TextInput
                  accessibilityLabel="Number of loan installments"
                  className={inputClass}
                  keyboardType="number-pad"
                  onChangeText={(installmentCount) =>
                    updateLoanForm({ installmentCount: installmentCount.replace(/\D/g, '') })
                  }
                  placeholder="4"
                  value={loanForm.installmentCount}
                />
              </Field>
            </>
          ) : (
            <DatePickerField
              label={loanForm.plan === 'single' ? 'Payment due date' : 'Expected by (optional)'}
              value={loanForm.deadline}
              onChange={(deadline) => updateLoanForm({ deadline })}
              minimumDate={new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())}
              maximumDate={new Date(now.getFullYear() + 10, 11, 31)}
              startOnToday
            />
          )}

          <Field label="Note (optional)">
            <TextInput
              accessibilityLabel="Loan note"
              className={inputClass}
              onChangeText={(note) => updateLoanForm({ note })}
              placeholder="Add a short note"
              value={loanForm.note}
            />
          </Field>
          <Button
            label={busy ? 'Saving…' : 'Add loan'}
            disabled={busy || loading || !db || !householdId}
            onPress={addOnboardingLoan}
          />
        </View>

        {loanData.loans.length > 0 ? (
          <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <Text className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">
              Loans recorded
            </Text>
            <View className="gap-2">
              {loanData.loans.map((loan) => (
                <View
                  key={loan.id}
                  className="flex-row items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800"
                >
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
                    <Ionicons name="person" size={17} color="#059669" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {loan.personName}
                    </Text>
                    <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {formatXAF(loan.amount)} ·{' '}
                      {loanPlans.find((plan) => plan.key === loan.plan)?.label ?? loan.plan} · lent{' '}
                      {loan.lentOn}
                    </Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={20} color="#059669" />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Button
          label={busy ? 'Saving…' : 'Finish setup'}
          disabled={busy || loading}
          onPress={finishSetup}
        />
        <Text className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
          You can record more loans later from Loans.
        </Text>
      </PageLayout>
    );
  }
}
