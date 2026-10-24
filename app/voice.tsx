import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { PageLayout } from '@/src/ui/PageLayout';

export default function VoiceScreen() {
  return (
    <PageLayout title="Voice entry" subtitle="Capture expense or savings intent">
      <View className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
        <Text className="text-2xl">🎙️</Text>
        <Text className="mt-3 text-lg font-bold text-emerald-900">Listening…</Text>
        <Text className="mt-1 text-sm text-emerald-700">“Spent 20,000 on fuel”</Text>
      </View>

      <View className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Transcript
        </Text>
        <Text className="text-base text-slate-800">Spent 20,000 on fuel in Douala.</Text>
      </View>

      <View className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Confirm card
        </Text>
        <Text className="text-lg font-semibold text-slate-900">Fuel • 20,000 XAF • Today</Text>
        <Text className="mt-2 text-sm text-slate-600">Note: Douala fuel refill</Text>
      </View>

      <View className="mt-5 flex-row gap-3">
        <Link
          href="/add-transaction"
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3"
        >
          <Text className="text-center text-base font-bold text-slate-900">Discard</Text>
        </Link>
        <Link href="/" className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3">
          <Text className="text-center text-base font-bold text-white">Save</Text>
        </Link>
      </View>
    </PageLayout>
  );
}
