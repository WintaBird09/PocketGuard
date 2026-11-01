import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { addSavingsGoal } from '@/src/data/savings';
import { effectiveNow, monthKeyForDate } from '@/src/domain/dates';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { Banner, Button } from '@/src/ui/controls';
import { DatePickerField } from '@/src/ui/DatePickerField';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';

function monthsBetween(startMonth: string, dueDate: string): number {
  if (!dueDate) return 0;
  const [sy, sm] = startMonth.split('-').map(Number);
  const [dy, dm] = dueDate.split('-').map(Number);
  return Math.max(0, (dy - sy) * 12 + (dm - sm) + 1);
}

export default function SavingsFormScreen() {
  const router = useRouter();
  const { db, householdId, loading, error: dbError } = useDatabase();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [monthly, setMonthly] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const startMonth = monthKeyForDate(effectiveNow(), 'Africa/Douala');
  const months = monthsBetween(startMonth, dueDate);
  const targetValue = Number(target);
  const suggested =
    months > 0 && Number.isSafeInteger(targetValue) && targetValue > 0
      ? Math.ceil(targetValue / months)
      : 0;
  const monthlyValue = monthly === '' ? suggested : Number(monthly);

  const save = () => {
    if (!db || !householdId) return;
    setError(null);
    try {
      addSavingsGoal(
        db,
        householdId,
        { name, target: targetValue, monthlyAmount: monthlyValue, dueDate },
        startMonth,
      );
      scheduleNotificationRefresh();
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the goal.');
    }
  };

  const failure = dbError ?? error;
  const input = 'min-h-12 rounded-xl border border-slate-200 bg-white px-3 py-3 text-base';

  return (
    <PageLayout
      loading={loading}
      title="New savings goal"
      subtitle="Set a target, a date and a monthly commitment."
    >
      {failure ? <Banner tone="error">{failure}</Banner> : null}
      <View className="gap-4 rounded-2xl border border-slate-200 bg-white p-4">
        <View>
          <Text className="mb-1 text-sm font-semibold text-slate-700">
            What are you saving for?
          </Text>
          <TextInput
            accessibilityLabel="Goal name"
            placeholder="e.g. Emergency fund"
            value={name}
            onChangeText={setName}
            className={input}
          />
        </View>
        <View>
          <Text className="mb-1 text-sm font-semibold text-slate-700">Target amount (XAF)</Text>
          <TextInput
            accessibilityLabel="Target amount"
            keyboardType="number-pad"
            placeholder="500000"
            value={target}
            onChangeText={setTarget}
            className={input}
          />
        </View>
        <DatePickerField
          label="Target date"
          value={dueDate}
          onChange={setDueDate}
          minimumDate={new Date(effectiveNow().getFullYear(), effectiveNow().getMonth(), 1)}
          maximumDate={new Date(effectiveNow().getFullYear() + 10, 11, 31)}
          startOnToday
        />
        <View>
          <Text className="mb-1 text-sm font-semibold text-slate-700">
            Monthly commitment (XAF)
          </Text>
          <TextInput
            accessibilityLabel="Monthly commitment"
            keyboardType="number-pad"
            placeholder={suggested ? String(suggested) : 'Set a target and date first'}
            value={monthly}
            onChangeText={setMonthly}
            className={input}
          />
          {months > 0 && monthlyValue > 0 ? (
            <Text className="mt-2 text-sm text-slate-600">
              {formatXAF(monthlyValue)} a month for {months} month{months === 1 ? '' : 's'} ·{' '}
              {formatXAF(monthlyValue * 12)} a year
              {monthlyValue * months < targetValue ? ' · this will fall short of the target' : ''}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="mt-5 gap-3">
        <Button label="Save goal" onPress={save} disabled={!db} />
        <Button label="Cancel" variant="outline" onPress={() => router.back()} />
      </View>
      <Text className="mt-4 text-xs text-slate-500">
        A savings line is added to your budget for each month.
      </Text>
    </PageLayout>
  );
}
