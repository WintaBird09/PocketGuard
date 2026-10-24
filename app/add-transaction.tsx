import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { getAddTransactionReview } from '@/src/data/epic3';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';

const quickLineChips = [
  { id: 'line-fuel', label: 'Fuel' },
  { id: 'line-mom-meeting', label: 'Mom Meeting' },
  { id: 'line-kids-savings', label: 'Savings' },
  { id: 'line-debt-mom', label: 'Debt – Mom' },
  { id: 'line-debt-petra', label: 'Debt – Petra' },
];

export default function AddTransactionScreen() {
  const [selectedLineId, setSelectedLineId] = useState('line-fuel');
  const [amount, setAmount] = useState(20000);

  const review = useMemo(() => getAddTransactionReview(selectedLineId, amount), [selectedLineId, amount]);
  const statusColor =
    review.result.status === 'BLOCKED'
      ? 'text-red-700'
      : review.result.status === 'WARN'
        ? 'text-amber-700'
        : 'text-emerald-700';

  return (
    <PageLayout title="Add transaction" subtitle="Fast capture before paying">
      <View className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Amount
        </Text>
        <Text className="text-4xl font-bold text-slate-900">{formatXAF(amount)}</Text>
        <Text className="mt-2 text-sm text-slate-500">
          {review.hardCap ? 'Hard cap line' : 'Flexible line'}
        </Text>
      </View>

      <View className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Budget line
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {quickLineChips.map((line) => {
            const isActive = line.id === selectedLineId;
            return (
              <Pressable
                key={line.id}
                onPress={() => setSelectedLineId(line.id)}
                className={`rounded-full px-3 py-2 ${isActive ? 'bg-emerald-100' : 'bg-slate-100'}`}
              >
                <Text className={`text-sm font-medium ${isActive ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {line.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Spend check
        </Text>
        <Text className={`text-lg font-semibold ${statusColor}`}>
          {review.result.status}: {review.result.reason}
        </Text>
        <Text className="mt-1 text-sm text-slate-600">
          Remaining after this entry: {formatXAF(review.result.remainingAfter)}
        </Text>
      </View>

      <View className="mt-5 flex-row gap-3">
        <Link
          href="/can-i-spend"
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
        >
          <Text className="text-center text-base font-bold text-slate-900">Can I spend?</Text>
        </Link>
        <Link
          href={review.result.status === 'BLOCKED' ? '/add-transaction' : '/voice'}
          className={`flex-1 rounded-2xl px-4 py-3 ${review.result.status === 'BLOCKED' ? 'bg-red-100' : 'bg-emerald-600'}`}
        >
          <Text
            className={`text-center text-base font-bold ${review.result.status === 'BLOCKED' ? 'text-red-700' : 'text-white'}`}
          >
            {review.result.status === 'BLOCKED' ? 'Blocked' : 'Save'}
          </Text>
        </Link>
      </View>
    </PageLayout>
  );
}
