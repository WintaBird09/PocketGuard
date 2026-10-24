import { Text, View } from 'react-native';

import { PageLayout } from '@/src/ui/PageLayout';

export default function SettingsScreen() {
  return (
    <PageLayout title="Settings" subtitle="Preferences and app controls">
      <View className="gap-3">
        {[
          { label: 'Daily summary time', value: '8:00 pm' },
          { label: 'Hard caps', value: 'Enabled' },
          { label: 'Voice confidence', value: 'High' },
          { label: 'Offline mode', value: 'Ready' },
        ].map((item) => (
          <View
            key={item.label}
            className="flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <Text className="text-base font-medium text-slate-800">{item.label}</Text>
            <Text className="text-sm font-semibold text-slate-600">{item.value}</Text>
          </View>
        ))}
      </View>
    </PageLayout>
  );
}
