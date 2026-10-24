import { Text, View } from 'react-native';

import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';

export default function CanISpendScreen() {
  return (
    <PageLayout title="Can I spend?" subtitle="Check the impact before paying">
      <View className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Check amount
        </Text>
        <Text className="text-4xl font-bold text-slate-900">30,000</Text>
        <Text className="mt-2 text-sm text-slate-500">XAF on Fuel</Text>
      </View>

      <View className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5">
        <Text className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
          Blocked
        </Text>
        <Text className="mt-2 text-lg font-bold text-red-900">
          This would exceed the remaining Fuel planned amount.
        </Text>
        <Text className="mt-2 text-sm text-red-700">
          Remaining after spend: {formatXAF(34000 - 30000)}
        </Text>
      </View>
    </PageLayout>
  );
}
