import { Text, View } from 'react-native';

import { PageLayout } from '@/src/ui/PageLayout';

export default function BudgetScreen() {
  return (
    <PageLayout title="Budget" subtitle="Monthly allocations and plan editing">
      <View className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <Text className="text-base font-semibold text-slate-900">Monthly plan</Text>
      </View>
    </PageLayout>
  );
}
