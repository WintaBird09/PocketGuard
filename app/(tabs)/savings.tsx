import { Text, View } from 'react-native';

import { PageLayout } from '@/src/ui/PageLayout';

export default function SavingsScreen() {
  return (
    <PageLayout title="Savings" subtitle="Goals, commitments, and progress">
      <View className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <Text className="text-base font-semibold text-slate-900">Goal progress</Text>
      </View>
    </PageLayout>
  );
}
