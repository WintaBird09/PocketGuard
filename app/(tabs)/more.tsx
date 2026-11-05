import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAuth } from '@/src/auth/AuthProvider';
import { getDisplayLabel, getInitials } from '@/src/auth/profile';
import { listDebts } from '@/src/data/debts';
import { listOverrides } from '@/src/data/activity';
import { countInbox } from '@/src/data/inbox';
import { totalOwedToYou } from '@/src/data/loans';
import { effectiveNow, monthKeyForDate } from '@/src/domain/dates';
import { Banner } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';

type MoreItem = {
  title: string;
  detail: string;
  href:
    '/income' | '/income-transfer' | '/inbox' | '/debts' | '/loans' | '/overrides' | '/settings';
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  bg: string;
};

export default function MoreScreen() {
  const { session } = useAuth();
  const profileLabel = getDisplayLabel(session?.user);
  const { db, householdId, loading, error: dbError, tick } = useDatabase();

  const loaded = useMemo(() => {
    if (!db || !householdId) return { data: null, failure: null };
    try {
      const debts = listDebts(db, householdId);
      return {
        data: {
          waiting: countInbox(db, householdId),
          debtLeft: debts.reduce((sum, debt) => sum + debt.balance, 0),
          owedToYou: totalOwedToYou(db, householdId),
          overrides: listOverrides(
            db,
            householdId,
            monthKeyForDate(effectiveNow(), 'Africa/Douala'),
          ).length,
        },
        failure: null,
      };
    } catch (cause) {
      return { data: null, failure: cause instanceof Error ? cause.message : 'Unable to load.' };
    }
    // tick re-reads when the tab regains focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, householdId, tick]);

  const data = loaded.data;
  const items: readonly MoreItem[] = [
    {
      title: 'Income & transfers',
      detail: 'Record salary and transfers',
      href: '/income-transfer',
      icon: 'swap-horizontal',
      tint: '#059669',
      bg: '#d1fae5',
    },
    {
      title: 'Inbox',
      detail: data ? (data.waiting > 0 ? `${data.waiting} waiting` : 'Empty') : '…',
      href: '/inbox',
      icon: 'mail-unread',
      tint: '#2563eb',
      bg: '#dbeafe',
    },
    {
      title: 'Debts',
      detail: data ? `${formatXAF(data.debtLeft)} left` : '…',
      href: '/debts',
      icon: 'card',
      tint: '#dc2626',
      bg: '#fee2e2',
    },
    {
      title: 'Loans',
      detail: data ? `${formatXAF(data.owedToYou)} owed to you` : '…',
      href: '/loans',
      icon: 'people',
      tint: '#7c3aed',
      bg: '#ede9fe',
    },
    {
      title: 'Income',
      detail: 'Income streams and source tracking',
      href: '/income',
      icon: 'cash',
      tint: '#059669',
      bg: '#d1fae5',
    },
    {
      title: 'Overrides report',
      detail: data ? `${data.overrides} this month` : '…',
      href: '/overrides',
      icon: 'shield-half',
      tint: '#d97706',
      bg: '#fef3c7',
    },
    {
      title: 'Settings',
      detail: 'Alerts, security, data, sync',
      href: '/settings',
      icon: 'settings',
      tint: '#475569',
      bg: '#e2e8f0',
    },
  ];

  return (
    <PageLayout title="More" subtitle="Everything else in Pocket Guard" loading={loading}>
      <Link href="/profile" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
          className="mb-6 flex-row items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 active:bg-slate-50"
        >
          <View className="h-14 w-14 items-center justify-center rounded-full bg-emerald-600">
            <Text className="text-lg font-bold text-white">{getInitials(profileLabel)}</Text>
          </View>
          <View className="ml-4 flex-1 pr-2">
            <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
              {profileLabel}
            </Text>
            <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400" numberOfLines={1}>
              {session?.user.email ?? 'View and edit your profile'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
        </Pressable>
      </Link>
      {(dbError ?? loaded.failure) ? (
        <Banner tone="error">{dbError ?? loaded.failure ?? ''}</Banner>
      ) : null}
      <View className="gap-3">
        {items.map((item) => (
          <Link key={item.title} href={item.href} asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${item.detail}`}
              className="flex-row items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4 active:bg-slate-50"
            >
              <View
                className="h-12 w-12 items-center justify-center rounded-xl"
                style={{ backgroundColor: item.bg }}
              >
                <Ionicons name={item.icon} size={24} color={item.tint} />
              </View>
              <View className="ml-4 flex-1 pr-2">
                <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {item.title}
                </Text>
                <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400" numberOfLines={1}>
                  {item.detail}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
            </Pressable>
          </Link>
        ))}
      </View>
    </PageLayout>
  );
}
