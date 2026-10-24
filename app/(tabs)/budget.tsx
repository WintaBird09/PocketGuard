import { Text, View } from 'react-native';

import { budgetLines, getBudgetOverview } from '@/src/data/epic3';
import { formatXAF } from '@/src/ui/theme';
import { BudgetRow, SectionCard } from '@/src/ui/epic3';
import { PageLayout } from '@/src/ui/PageLayout';

export default function BudgetScreen() {
  const overview = getBudgetOverview();

  return (
    <PageLayout title="Budget" subtitle="Monthly allocations and plan editing">
      <SectionCard title="September 2026 plan">
        {budgetLines.map((item) => (
          <BudgetRow
            key={item.id}
            name={item.name}
            planned={item.planned}
            spent={item.spent}
            remaining={item.remaining}
            status={item.status}
          />
        ))}
      </SectionCard>

      <View className="mt-5 flex-row gap-3">
        <View className="flex-1 rounded-2xl bg-emerald-50 p-4">
          <Text className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Unallocated
          </Text>
          <Text className="mt-2 text-xl font-bold text-emerald-900">
            {formatXAF(overview.unallocated)}
          </Text>
        </View>
        <View className="flex-1 rounded-2xl bg-slate-100 p-4">
          <Text className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Flexible
          </Text>
          <Text className="mt-2 text-xl font-bold text-slate-900">
            {formatXAF(overview.flexible)}
          </Text>
        </View>
      </View>
    </PageLayout>
  );
}
