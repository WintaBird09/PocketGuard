import { Text, View } from 'react-native';

import { PageLayout } from '@/src/ui/PageLayout';

const moreItems = [
  { title: 'Debts', subtitle: 'Payment tracking and balances' },
  { title: 'Inbox', subtitle: 'Voice notes and draft entries' },
  { title: 'Settings', subtitle: 'Preferences and profile controls' },
];

export default function MoreScreen() {
  return (
    <PageLayout title="More" subtitle="Debts, Inbox, Settings, and utilities">
      <View className="gap-3">
        {moreItems.map((item) => (
          <View
            key={item.title}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card"
          >
            <Text className="mb-1 text-lg font-bold text-slate-900">{item.title}</Text>
            <Text className="text-sm text-slate-600">{item.subtitle}</Text>
          </View>
        ))}
      </View>
    </PageLayout>
  );
}
