import { useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';

import { effectiveNow } from '../domain/dates';

import type { FundingSource } from '../data/funding';
import { projectSourceBalance } from '../data/funding';
import type { LineKind } from '../data/plan';
import { Button, Chip, monthLabel } from './controls';
import { DatePickerField } from './DatePickerField';
import { formatXAF } from './theme';
import { getCurrencyCode } from '../domain/currency';

export type BudgetLineDraft = {
  name: string;
  kind: LineKind;
  amount: number;
  incomeStreamId: string | null;
  /** Present when the line is a savings goal with a target date. */
  goal?: { target: number; dueDate: string };
};

const kinds: { value: LineKind; label: string }[] = [
  { value: 'running', label: 'Running costs' },
  { value: 'fixed', label: 'Fixed bills' },
  { value: 'debt', label: 'Debt' },
  { value: 'savings', label: 'Savings' },
  { value: 'misc', label: 'Miscellaneous' },
];

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {label}
        {required ? <Text className="text-red-600 dark:text-red-400"> *</Text> : null}
      </Text>
      {children}
      {error ? (
        <Text className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">{error}</Text>
      ) : hint ? (
        <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</Text>
      ) : null}
    </View>
  );
}

const inputClass =
  'min-h-12 rounded-xl border px-3 py-3 text-base text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900';

export function BudgetLineForm({
  month,
  sources,
  onSubmit,
  onCancel,
}: {
  month: string;
  /** Income sources available this month, with their current balance. */
  sources: FundingSource[];
  onSubmit: (draft: BudgetLineDraft) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<LineKind>('running');
  const [amountText, setAmountText] = useState('');
  const [streamId, setStreamId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [savingsType, setSavingsType] = useState<'month' | 'goal'>('month');
  const [targetText, setTargetText] = useState('');
  const [dueDate, setDueDate] = useState('');

  const isGoal = kind === 'savings' && savingsType === 'goal';
  const target = Number(targetText.replace(/[\s,]/g, ''));
  const monthsToGo = (() => {
    if (!dueDate) return 0;
    const [sy, sm] = month.split('-').map(Number);
    const [dy, dm] = dueDate.split('-').map(Number);
    return Math.max(0, (dy - sy) * 12 + (dm - sm) + 1);
  })();
  const targetValid = Number.isSafeInteger(target) && target > 0;
  const suggested = isGoal && targetValid && monthsToGo > 0 ? Math.ceil(target / monthsToGo) : 0;

  const choices = sources.filter((source) => source.streamId !== null);
  const selected = choices.find((source) => source.streamId === streamId) ?? null;
  const cleaned = amountText.replace(/[\s,]/g, '');
  const amount = cleaned === '' ? (isGoal ? suggested : 0) : Number(cleaned);
  const amountValid = Number.isSafeInteger(amount) && amount >= 0;
  const goalError =
    submitted && isGoal
      ? !targetValid
        ? 'Enter a target amount.'
        : !dueDate
          ? 'Choose a target date.'
          : null
      : null;
  const nameError = submitted && name.trim() === '' ? 'Enter a name for the budget line.' : null;
  const amountError = !amountValid ? 'Enter a whole amount, 0 or more.' : null;
  const projection = amountValid
    ? projectSourceBalance(choices, null, { planned: amount, incomeStreamId: streamId })
    : null;
  const over = projection !== null && projection.left < 0;

  return (
    <View className="mb-5 rounded-3xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-4">
      <Text className="text-lg font-bold text-slate-900 dark:text-slate-100">New budget line</Text>
      <Text className="mb-4 mt-1 text-xs text-slate-500 dark:text-slate-400">
        Planned for {monthLabel(month)}. Fields marked * are required.
      </Text>

      <Field label="Line name" required error={nameError}>
        <TextInput
          accessibilityLabel="New line name"
          placeholder="e.g. Groceries"
          placeholderTextColor="#94a3b8"
          value={name}
          onChangeText={setName}
          className={`${inputClass} ${nameError ? 'border-red-400' : 'border-slate-200 dark:border-slate-700'}`}
        />
      </Field>

      <Field label="Category" hint="Running and miscellaneous lines default to a hard cap.">
        <View className="flex-row flex-wrap gap-2">
          {kinds.map((item) => (
            <Chip
              key={item.value}
              label={item.label}
              active={item.value === kind}
              onPress={() => setKind(item.value)}
            />
          ))}
        </View>
      </Field>

      {kind === 'savings' ? (
        <Field label="Savings type">
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Chip
                label="This month only"
                active={savingsType === 'month'}
                onPress={() => setSavingsType('month')}
              />
            </View>
            <View className="flex-1">
              <Chip
                label="Goal with target"
                active={savingsType === 'goal'}
                onPress={() => setSavingsType('goal')}
              />
            </View>
          </View>
        </Field>
      ) : null}

      {isGoal ? (
        <>
          <Field
            label={`Target amount (${getCurrencyCode()})`}
            required
            error={goalError && !targetValid ? goalError : null}
          >
            <TextInput
              accessibilityLabel="Target amount"
              placeholder="500000"
              placeholderTextColor="#94a3b8"
              keyboardType="number-pad"
              value={targetText}
              onChangeText={setTargetText}
              className={`${inputClass} border-slate-200 dark:border-slate-700`}
            />
          </Field>
          <DatePickerField
            label="Target date"
            value={dueDate}
            onChange={setDueDate}
            error={goalError && targetValid ? goalError : null}
            minimumDate={new Date(effectiveNow().getFullYear(), effectiveNow().getMonth(), 1)}
            maximumDate={new Date(effectiveNow().getFullYear() + 10, 11, 31)}
            startOnToday
          />
        </>
      ) : null}

      <Field
        label={
          isGoal ? `Monthly saving (${getCurrencyCode()})` : `Planned amount (${getCurrencyCode()})`
        }
        error={amountError}
        hint={
          isGoal && monthsToGo > 0 && amount > 0
            ? `${formatXAF(amount)} a month for ${monthsToGo} month${monthsToGo === 1 ? '' : 's'}${
                amount * monthsToGo < target ? ' · will fall short of the target' : ''
              }. Leave blank to use the suggested amount.`
            : isGoal
              ? 'Calculated from the target and date; you can override it.'
              : undefined
        }
      >
        <TextInput
          accessibilityLabel="Planned amount"
          placeholder={isGoal && suggested ? String(suggested) : '0'}
          placeholderTextColor="#94a3b8"
          keyboardType="number-pad"
          value={amountText}
          onChangeText={setAmountText}
          className={`${inputClass} ${amountError ? 'border-red-400' : 'border-slate-200 dark:border-slate-700'}`}
        />
      </Field>

      <Field
        label="Funded by (income source)"
        hint={
          isGoal
            ? `Applies to ${monthLabel(month)}; choose the source for later months on the Budget screen.`
            : 'Sources with income or budgets in this month.'
        }
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose income source"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((current) => !current)}
          className="min-h-12 flex-row items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3"
        >
          <Text
            className={`text-base ${selected ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            {selected ? selected.name : 'No income source'}
          </Text>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            className="text-slate-500 dark:text-slate-400"
          />
        </Pressable>
        {open ? (
          <View className="mt-1 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            {[null, ...choices].map((source) => {
              const active = (source?.streamId ?? null) === streamId;
              return (
                <Pressable
                  key={source?.streamId ?? 'none'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setStreamId(source?.streamId ?? null);
                    setOpen(false);
                  }}
                  className={`min-h-12 flex-row items-center justify-between px-3 py-3 ${
                    active ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-white dark:bg-slate-900'
                  }`}
                >
                  <Text className="font-semibold text-slate-900 dark:text-slate-100">
                    {source ? source.name : 'No income source'}
                  </Text>
                  {source ? (
                    <Text
                      className={`text-xs font-semibold ${source.left < 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}
                    >
                      {formatXAF(source.left)} left
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Field>

      {selected && projection ? (
        <View
          accessibilityLiveRegion="polite"
          className={`mb-4 rounded-2xl border p-3 ${
            over
              ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/30'
              : 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/30'
          }`}
        >
          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {selected.name} balance
          </Text>
          <View className="mt-2 flex-row justify-between">
            <Text className="text-sm text-slate-700 dark:text-slate-200">Available income</Text>
            <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {formatXAF(selected.available)}
            </Text>
          </View>
          <View className="mt-1 flex-row justify-between">
            <Text className="text-sm text-slate-700 dark:text-slate-200">Already budgeted</Text>
            <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              − {formatXAF(selected.budgeted)}
            </Text>
          </View>
          <View className="mt-1 flex-row justify-between">
            <Text className="text-sm text-slate-700 dark:text-slate-200">This line</Text>
            <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              − {formatXAF(amountValid ? amount : 0)}
            </Text>
          </View>
          <View className="mt-2 flex-row justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
            <Text className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {over ? 'Over by' : 'Balance left'}
            </Text>
            <Text
              className={`text-base font-extrabold ${over ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}
            >
              {formatXAF(Math.abs(projection.left))}
            </Text>
          </View>
        </View>
      ) : null}

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button label="Cancel" variant="outline" onPress={onCancel} />
        </View>
        <View className="flex-1">
          <Button
            label="Save line"
            disabled={!amountValid || (isGoal && amount <= 0)}
            onPress={() => {
              setSubmitted(true);
              if (name.trim() === '' || !amountValid) return;
              if (isGoal) {
                if (!targetValid || !dueDate) return;
                onSubmit({
                  name,
                  kind,
                  amount,
                  incomeStreamId: streamId,
                  goal: { target, dueDate },
                });
                return;
              }
              onSubmit({ name, kind, amount, incomeStreamId: streamId });
            }}
          />
        </View>
      </View>
    </View>
  );
}
