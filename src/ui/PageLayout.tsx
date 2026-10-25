import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { SyncIndicator } from '@/src/sync/SyncIndicator';

type PageLayoutProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  compact?: boolean;
};

export function PageLayout({
  title,
  subtitle,
  children,
  action,
  compact = false,
}: PageLayoutProps) {
  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: compact ? 16 : 20 }}>
        <View className="mb-6 flex-row items-start justify-between">
          <View className="flex-1">
            <Text className="text-3xl font-bold text-slate-900">{title}</Text>
            {subtitle ? <Text className="mt-1 text-base text-slate-600">{subtitle}</Text> : null}
          </View>
          {action ? <View className="ml-3">{action}</View> : null}
        </View>
        <View className="mb-4">
          <SyncIndicator />
        </View>
        {children}
      </ScrollView>
    </View>
  );
}
