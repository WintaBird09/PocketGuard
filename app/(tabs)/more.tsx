import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { moreItems } from '@/src/data/epic3';
import { PageLayout } from '@/src/ui/PageLayout';

export default function MoreScreen() {
  return (
    <PageLayout title="More" subtitle="Debts, Inbox, Settings, and utilities">
      <View className="gap-3">
        {moreItems.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <Text className="mb-1 text-lg font-bold text-slate-900">{item.title}</Text>
            <Text className="text-sm text-slate-600">{item.subtitle}</Text>
          </Link>
        ))}
      </View>
    </PageLayout>
  );
}
