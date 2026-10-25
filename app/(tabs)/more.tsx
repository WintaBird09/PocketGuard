import { Link } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { listDebts } from '@/src/data/debts';
import { listOverrides } from '@/src/data/activity';
import { countInbox } from '@/src/data/inbox';
import { totalOwedToYou } from '@/src/data/loans';
import { monthKeyForDate } from '@/src/domain/dates';
import { Banner } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';

export default function MoreScreen() {
  const { db, householdId, error: dbError, tick } = useDatabase();

  const loaded = useMemo(() => {
    if (!db || !householdId) return { data: null, failure: null };
    try {
      const debts = listDebts(db, householdId);
      return {
        data: {
          waiting: countInbox(db, householdId),
          debtLeft: debts.reduce((sum, debt) => sum + debt.balance, 0),
          owedToYou: totalOwedToYou(db, householdId),
          overrides: listOverrides(db, householdId, monthKeyForDate(new Date(), 'Africa/Douala'))
            .length,
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
  const items = [
    {
      title: 'Income & transfers',
      detail: 'Record salary and transfers',
      href: '/income-transfer',
    },
    {
      title: 'Inbox',
      detail: data ? (data.waiting > 0 ? `${data.waiting} waiting` : 'Empty') : '…',
      href: '/inbox',
    },
    { title: 'Debts', detail: data ? `${formatXAF(data.debtLeft)} left` : '…', href: '/debts' },
    {
      title: 'Loans',
      detail: data ? `${formatXAF(data.owedToYou)} owed to you` : '…',
      href: '/loans',
    },
    {
      title: 'Overrides report',
      detail: data ? `${data.overrides} this month` : '…',
      href: '/overrides',
    },
    { title: 'Settings', detail: 'Alerts, security, data, sync', href: '/settings' },
  ] as const;

  return (
    <PageLayout title="More" subtitle="Everything else in Pocket Guard">
      {(dbError ?? loaded.failure) ? (
        <Banner tone="error">{dbError ?? loaded.failure ?? ''}</Banner>
      ) : null}
      <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {items.map((item, index) => (
          <Link
            key={item.title}
            href={item.href}
            className={`px-4 py-4 ${index > 0 ? 'border-t border-slate-200' : ''}`}
          >
            <View className="w-full flex-row items-center justify-between">
              <Text className="text-base font-bold text-slate-900">{item.title}</Text>
              <Text className="text-sm text-slate-500">{item.detail}</Text>
            </View>
          </Link>
        ))}
      </View>
    </PageLayout>
  );
}
