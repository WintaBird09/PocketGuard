import { Text, View } from 'react-native';

import { debts } from '@/src/data/epic3';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';

export default function DebtsScreen() {
  return (
    <PageLayout title="Debts" subtitle="Payment schedule and balances">
      <View className="gap-4">
        {debts.map((debt) => (
          <View
            key={debt.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold text-slate-900">{debt.name}</Text>
              <View className="rounded-full bg-amber-100 px-2 py-1">
                <Text className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                  {debt.status}
                </Text>
              </View>
            </View>
            <Text className="mt-3 text-2xl font-bold text-slate-900">
              {formatXAF(debt.balance)}
            </Text>
            <Text className="mt-2 text-sm text-slate-600">Due {debt.due}</Text>
          </View>
        ))}
      </View>
    </PageLayout>
  );
}
