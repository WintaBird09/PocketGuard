import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

import { listPendingMomoImports } from '@/src/momo/store';
import { momoDelayNotice } from '@/src/domain/momoDelayNotice';
import { localDateString } from '@/src/domain/dates';
import { useDatabase } from '@/src/ui/useDatabase';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';

export default function MomoReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ transactionId?: string }>();
  const { db, householdId, loading } = useDatabase();
  const pending = useMemo(
    () => (db && householdId ? listPendingMomoImports(db, householdId) : []),
    [db, householdId],
  );
  const notificationItem = useMemo(
    () => pending.find((item) => item.transactionId === params.transactionId),
    [pending, params.transactionId],
  );
  const routedTransactionId = useRef<string | null>(null);

  const openReview = (item: (typeof pending)[number]) =>
    router.push({
      pathname: '/add-transaction',
      params: {
        momoImportId: item.id,
        momoSource: item.source,
        momoTransactionId: item.transactionId ?? '',
        momoAction: item.item.action ?? '',
        momoAmount: item.item.amount === null ? '' : String(item.item.amount),
        momoCounterparty: item.item.counterpartyName ?? '',
        momoPhone: item.item.counterpartyPhone ?? '',
        momoDateTime: item.item.dateTime ?? '',
        momoFee: String(item.item.fee),
        momoBalance: item.item.balanceAfter === null ? '' : String(item.item.balanceAfter),
        momoUserMessage: item.item.userMessage ?? '',
        momoRecognized: String(item.item.recognized),
      },
    });

  useEffect(() => {
    if (
      !notificationItem ||
      !params.transactionId ||
      routedTransactionId.current === params.transactionId
    ) {
      return;
    }
    routedTransactionId.current = params.transactionId;
    router.replace({
      pathname: '/add-transaction',
      params: {
        momoImportId: notificationItem.id,
        momoSource: notificationItem.source,
        momoTransactionId: notificationItem.transactionId ?? '',
        momoAction: notificationItem.item.action ?? '',
        momoAmount:
          notificationItem.item.amount === null ? '' : String(notificationItem.item.amount),
        momoCounterparty: notificationItem.item.counterpartyName ?? '',
        momoPhone: notificationItem.item.counterpartyPhone ?? '',
        momoDateTime: notificationItem.item.dateTime ?? '',
        momoFee: String(notificationItem.item.fee),
        momoBalance:
          notificationItem.item.balanceAfter === null
            ? ''
            : String(notificationItem.item.balanceAfter),
        momoUserMessage: notificationItem.item.userMessage ?? '',
        momoRecognized: String(notificationItem.item.recognized),
      },
    });
  }, [notificationItem, params.transactionId, router]);

  return (
    <PageLayout
      title="Pending MoMo transactions"
      subtitle="Choose an item to review and confirm"
      loading={loading}
    >
      {pending.length ? (
        pending.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => openReview(item)}
            className="mb-3 min-h-20 flex-row items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3"
          >
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/30">
              <Ionicons
                name={item.item.recognized ? 'receipt-outline' : 'help-circle-outline'}
                size={20}
                color="#059669"
              />
            </View>
            <View className="ml-3 flex-1">
              <Text
                numberOfLines={1}
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                {item.item.counterpartyName ?? 'Unrecognized MoMo message'}
              </Text>
              <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {item.item.amount === null ? 'Amount not recognized' : formatXAF(item.item.amount)}
                {item.item.dateTime ? ` · ${item.item.dateTime}` : ''}
              </Text>
              {momoDelayNotice(item.item.dateTime?.slice(0, 10) ?? null, localDateString()) ? (
                <Text className="mt-1 text-xs font-bold text-amber-700 dark:text-amber-300">
                  Not added on the day it was effected
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color="#64748b" />
          </Pressable>
        ))
      ) : (
        <View className="items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
          <Ionicons name="checkmark-circle-outline" size={34} color="#64748b" />
          <Text className="mt-2 text-base font-semibold text-slate-800 dark:text-slate-200">
            No pending MoMo transactions
          </Text>
        </View>
      )}
    </PageLayout>
  );
}
