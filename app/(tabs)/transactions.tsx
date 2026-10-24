import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { recentTransactions } from '@/src/data/epic3';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';

const filters = ['All', 'Fuel', 'Savings', 'Debt'];

export default function TransactionsScreen() {
  const [activeFilter, setActiveFilter] = useState('All');

  const visibleTransactions = useMemo(() => {
    if (activeFilter === 'All') return recentTransactions;
    return recentTransactions.filter((item) => {
      if (activeFilter === 'Fuel') return item.line.includes('Fuel');
      if (activeFilter === 'Savings') return item.line.includes('Savings');
      return item.line.includes('Debt');
    });
  }, [activeFilter]);

  return (
    <PageLayout title="Transactions" subtitle="List, filter, edit, and delete entries">
      <View className="mb-4 flex-row gap-2">
        {filters.map((filter) => {
          const isActive = filter === activeFilter;
          return (
            <Pressable
              key={filter}
              onPress={() => setActiveFilter(filter)}
              className={isActive ? 'rounded-full bg-slate-900 px-3 py-2' : 'rounded-full bg-slate-100 px-3 py-2'}
            >
              <Text className={isActive ? 'text-sm font-semibold text-white' : 'text-sm font-medium text-slate-700'}>
                {filter}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {visibleTransactions.map((item) => (
          <View
            key={item.id}
            className="border-b border-slate-100 py-3 last:border-b-0 last:pb-0 first:pt-0"
          >
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-base font-semibold text-slate-900">{item.title}</Text>
                <Text className="mt-1 text-xs text-slate-500">
                  {item.line} • {item.source}
                </Text>
              </View>
              <Text className="text-base font-bold text-slate-900">{formatXAF(item.amount)}</Text>
            </View>
            <Text className="mt-2 text-xs text-slate-500">{item.date}</Text>
          </View>
        ))}
      </View>
    </PageLayout>
  );
}
