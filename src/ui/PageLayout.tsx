import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SyncIndicator } from '@/src/sync/SyncIndicator';

type PageLayoutProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  loading?: boolean;
};

export function PageLayout({
  title,
  subtitle,
  children,
  action,
  compact = false,
  loading = false,
}: PageLayoutProps) {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const padding = compact ? 16 : 20;
  // The tab bar already reserves the bottom inset, so only stack screens add it.
  const underTabs = segments[0] === '(tabs)';

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: padding + Math.max(insets.left, insets.right),
          paddingTop: padding + insets.top,
          paddingBottom: padding + (underTabs ? 0 : insets.bottom),
        }}
      >
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
        {loading ? (
          <Text accessibilityRole="progressbar" className="mb-3 text-sm text-slate-600">
            Loading your data…
          </Text>
        ) : null}
        {children}
      </ScrollView>
    </View>
  );
}
