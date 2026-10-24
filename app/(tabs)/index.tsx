import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { getHomeDashboardSnapshot } from '@/src/data/epic3';
import { BudgetRow, MetricCard, SectionCard } from '@/src/ui/epic3';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';

export default function HomeScreen() {
  const dashboard = getHomeDashboardSnapshot();
  const budgetLines = dashboard.lines;
  const summary = dashboard.summary;

  return (
    <PageLayout
      title="Home"
      subtitle={summary.label}
      action={
        <View className="flex-row items-center gap-3">
          <Link
            href="/add-transaction"
            className="h-14 min-w-[110px] items-center justify-center rounded-2xl bg-emerald-600 px-4 shadow-sm"
          >
            <Text className="text-base font-bold text-white">+ Add</Text>
          </Link>
          <Link
            href="/voice"
            className="h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <Text className="text-2xl">🎤</Text>
          </Link>
        </View>
      }
    >
      <View className="mb-5 flex-row gap-3">
        <MetricCard
          label="Income"
          value={formatXAF(summary.income)}
          helper="salary and transfers"
        />
        <MetricCard
          label="Spent"
          value={formatXAF(summary.spent)}
          helper="this month"
          tone="warning"
        />
      </View>

      <View className="mb-5 flex-row gap-3">
        <MetricCard
          label="Remaining"
          value={formatXAF(summary.remaining)}
          helper="after planned spend"
          tone="success"
        />
        <MetricCard
          label="Debt"
          value={formatXAF(summary.debtRemaining)}
          helper="active balances"
          tone="danger"
        />
      </View>

      <SectionCard title="Budget status">
        <View className="mb-4 rounded-2xl bg-emerald-50 p-3">
          <Text className="text-sm font-semibold text-emerald-800">Status: On track</Text>
          <Text className="mt-1 text-sm text-emerald-700">
            You are within the planned monthly envelope for 3 of 4 active lines.
          </Text>
        </View>

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
        <Link href="/can-i-spend" className="flex-1 rounded-2xl bg-slate-900 px-4 py-3">
          <Text className="text-center text-base font-bold text-white">Can I spend?</Text>
        </Link>
        <Link
          href="/voice"
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
        >
          <Text className="text-center text-base font-bold text-slate-900">Voice entry</Text>
        </Link>
      </View>
    </PageLayout>
  );
}
