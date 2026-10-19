import { Text, View } from 'react-native';

import { PageLayout } from '@/src/ui/PageLayout';

export default function TransactionsScreen() {
  return (
    <PageLayout title="Transactions" subtitle="List, filter, edit, and delete entries">
      <View className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <Text className="text-base font-semibold text-slate-900">Recent activity</Text>
      </View>
    </PageLayout>
  );
}
