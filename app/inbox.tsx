import { Text, View } from 'react-native';

import { inboxItems } from '@/src/data/epic3';
import { PageLayout } from '@/src/ui/PageLayout';

export default function InboxScreen() {
  return (
    <PageLayout title="Inbox" subtitle="Pending voice notes and drafts">
      <View className="gap-3">
        {inboxItems.map((item) => (
          <View
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <Text className="text-base font-semibold text-slate-900">{item.label}</Text>
            <Text className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              {item.status}
            </Text>
          </View>
        ))}
      </View>
    </PageLayout>
  );
}
