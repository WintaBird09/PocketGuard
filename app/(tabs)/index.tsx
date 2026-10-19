import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { PageLayout } from '@/src/ui/PageLayout';

export default function HomeScreen() {
  return (
    <PageLayout
      title="Home"
      subtitle="Month overview and quick actions"
      action={
        <View className="flex-row items-center gap-3">
          <Link
            href="/add-transaction"
            className="h-14 min-w-[110px] items-center justify-center rounded-2xl bg-emerald-600 px-4 shadow-card"
          >
            <Text className="text-base font-bold text-white">+ Add</Text>
          </Link>
          <Link
            href="/voice"
            className="h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-card"
          >
            <Text className="text-2xl">🎤</Text>
          </Link>
        </View>
      }
    >
      <View className="mb-5 flex-row gap-3">
        <View className="flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <Text className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">Income</Text>
          <Text className="text-xl font-bold text-slate-900">520,000 XAF</Text>
        </View>
        <View className="flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <Text className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">Spent</Text>
          <Text className="text-xl font-bold text-slate-900">310,000 XAF</Text>
        </View>
      </View>

      <View className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <Text className="mb-2 text-lg font-bold text-slate-900">Budget status</Text>
        <Text className="text-sm text-slate-600">This is the dashboard placeholder.</Text>
      </View>
    </PageLayout>
  );
}
