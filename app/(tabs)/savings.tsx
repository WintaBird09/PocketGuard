import { Text, View } from 'react-native';

import { getSavingsSnapshot } from '@/src/data/epic3';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';

export default function SavingsScreen() {
  const savingsPlan = getSavingsSnapshot();
  const progress = (savingsPlan.saved / savingsPlan.target) * 100;

  return (
    <PageLayout title="Savings" subtitle="Goals, commitments, and progress">
      <View className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {savingsPlan.goalName}
        </Text>
        <Text className="mt-2 text-3xl font-bold text-slate-900">
          {formatXAF(savingsPlan.saved)}
        </Text>
        <Text className="mt-1 text-sm text-slate-600">
          of {formatXAF(savingsPlan.target)} target
        </Text>

        <View className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200">
          <View
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </View>

        <View className="mt-4 flex-row justify-between text-slate-600">
          <Text className="text-sm text-slate-600">Monthly commitment</Text>
          <Text className="text-sm font-semibold text-slate-900">
            {formatXAF(savingsPlan.monthlyCommitment)}
          </Text>
        </View>
        <View className="mt-2 flex-row justify-between">
          <Text className="text-sm text-slate-600">Projected gap</Text>
          <Text className="text-sm font-semibold text-amber-700">
            {formatXAF(savingsPlan.projectedGap)}
          </Text>
        </View>
      </View>
    </PageLayout>
  );
}
