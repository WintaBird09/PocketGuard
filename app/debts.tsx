import { Text, View } from 'react-native';

import { getDebtsSnapshot } from '@/src/data/epic3';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';

export default function DebtsScreen() {
  const debts = getDebtsSnapshot();

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
              <View
                className={`rounded-full px-2 py-1 ${
                  debt.status === 'OVERDUE'
                    ? 'bg-red-100'
                    : debt.status === 'PAID'
                      ? 'bg-emerald-100'
                      : 'bg-amber-100'
                }`}
              >
                <Text
                  className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
                    debt.status === 'OVERDUE'
                      ? 'text-red-700'
                      : debt.status === 'PAID'
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                  }`}
                >
                  {debt.status}
                </Text>
              </View>
            </View>
            <Text className="mt-3 text-2xl font-bold text-slate-900">
              {formatXAF(debt.balance)}
            </Text>
            <Text className="mt-2 text-sm text-slate-600">Due {debt.due}</Text>
            <Text className="mt-1 text-sm text-slate-600">
              Scheduled this month: {formatXAF(debt.scheduledThisMonth)}
            </Text>
            <View className="mt-4 border-t border-slate-100 pt-3">
              <Text className="mb-2 text-sm font-semibold text-slate-900">Payment history</Text>
              {debt.payments.length > 0 ? (
                debt.payments.map((payment) => (
                  <View key={payment.id} className="flex-row justify-between py-1">
                    <Text className="text-sm text-slate-600">
                      {payment.title} · {payment.date}
                    </Text>
                    <Text className="text-sm font-semibold text-slate-900">
                      {formatXAF(payment.amount)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text className="text-sm text-slate-500">No payments recorded yet.</Text>
              )}
            </View>
          </View>
        ))}
      </View>
    </PageLayout>
  );
}
