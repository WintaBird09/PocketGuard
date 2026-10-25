import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { Banner } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';

export default function VoiceScreen() {
  return (
    <PageLayout title="Voice entry" subtitle="Capture expense or savings intent">
      <Banner tone="info">
        Voice capture and parsing arrive in Epic 7. Nothing is recorded from this screen yet.
      </Banner>
      <View className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="text-lg font-bold text-slate-900">What you will be able to say</Text>
        <Text className="mt-2 text-sm text-slate-600">“Spent 20,000 on fuel in Douala”</Text>
        <Text className="mt-1 text-sm text-slate-600">“Can I spend 30,000 on fuel?”</Text>
        <Text className="mt-1 text-sm text-slate-600">“I saved 92,000 to the kids account”</Text>
        <Text className="mt-3 text-sm text-slate-500">
          Every voice entry will show a confirm card before saving, and offline recordings will wait
          in your Inbox.
        </Text>
      </View>
      <Link
        href="/add-transaction"
        className="mt-5 rounded-2xl bg-emerald-600 px-4 py-3 text-center"
      >
        <Text className="text-center text-base font-bold text-white">Add manually instead</Text>
      </Link>
    </PageLayout>
  );
}
