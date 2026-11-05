import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Animated, PanResponder, Pressable, Text, TextInput, View } from 'react-native';

import {
  addDebt,
  deleteDebt,
  getDebtSchedule,
  listDebts,
  recordDebtPayment,
  removePlannedPayment,
  reschedulePlannedPayment,
} from '@/src/data/debts';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { Banner, Button, monthLabel } from '@/src/ui/controls';
import { DatePickerField } from '@/src/ui/DatePickerField';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';
import { getCurrencyCode } from '@/src/domain/currency';

const statusLook = {
  OPEN: {
    bar: 'bg-amber-500',
    pill: 'bg-amber-100 dark:bg-amber-900/40',
    tint: '#b45309',
    icon: 'time',
    label: 'Open',
  },
  PAID: {
    bar: 'bg-emerald-500',
    pill: 'bg-emerald-100 dark:bg-emerald-900/40',
    tint: '#047857',
    icon: 'checkmark-circle',
    label: 'Paid',
  },
  OVERDUE: {
    bar: 'bg-red-500',
    pill: 'bg-red-100 dark:bg-red-900/40',
    tint: '#b91c1c',
    icon: 'alert-circle',
    label: 'Overdue',
  },
} as const;

const avatarColors = ['#059669', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0891b2', '#ca8a04'];

function Avatar({ name, size }: { name: string; size: number }) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: avatarColors[hash % avatarColors.length],
      }}
    >
      <Text className="font-bold text-white" style={{ fontSize: size * 0.38 }}>
        {letters || '?'}
      </Text>
    </View>
  );
}

const deleteWidth = 96;

// Swipe left to reveal a Delete action behind the card.
function createSwipe() {
  const x = new Animated.Value(0);
  const state = { open: false };
  const settle = (to: number) => {
    state.open = to !== 0;
    Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0 }).start();
  };
  const responder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => {
      const start = state.open ? -deleteWidth : 0;
      x.setValue(Math.max(-deleteWidth * 1.3, Math.min(0, start + g.dx)));
    },
    onPanResponderRelease: (_, g) => {
      const start = state.open ? -deleteWidth : 0;
      settle(start + g.dx < -deleteWidth / 2 ? -deleteWidth : 0);
    },
    onPanResponderTerminate: () => settle(state.open ? -deleteWidth : 0),
  });
  return { x, settle, responder };
}

function SwipeToDelete({ children, onDelete }: { children: ReactNode; onDelete: () => void }) {
  const [{ x, settle, responder }] = useState(createSwipe);

  return (
    <View className="mb-3 overflow-hidden rounded-2xl">
      <View
        className="absolute inset-y-0 right-0 justify-center bg-red-600"
        style={{ width: deleteWidth }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete debt"
          onPress={() => {
            settle(0);
            onDelete();
          }}
          className="h-full items-center justify-center"
        >
          <Ionicons name="trash" size={24} color="#ffffff" />
          <Text className="mt-1 text-xs font-bold text-white">Delete</Text>
        </Pressable>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

function HeroStat({
  icon,
  label,
  value,
  warn = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <View className="flex-1 rounded-2xl bg-white/15 p-3">
      <Ionicons name={icon} size={18} color={warn ? '#fecaca' : '#fde68a'} />
      <Text className="mt-1 text-[11px] text-amber-100">{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit className="text-sm font-bold text-white">
        {value}
      </Text>
    </View>
  );
}

export default function DebtsScreen() {
  const { db, householdId, loading, error: dbError, tick, refresh } = useDatabase();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [adding, setAdding] = useState(false);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [creditor, setCreditor] = useState('');
  const [original, setOriginal] = useState('');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const deadlineRange = useMemo(() => {
    const min = new Date();
    min.setFullYear(min.getFullYear() - 1);
    const max = new Date();
    max.setFullYear(max.getFullYear() + 10);
    return { min, max };
  }, []);

  const loaded = useMemo(() => {
    if (!db || !householdId) return { data: null, failure: null };
    try {
      const debts = listDebts(db, householdId);
      return { data: { debts, schedule: getDebtSchedule(db, householdId, debts) }, failure: null };
    } catch (cause) {
      return {
        data: null,
        failure: cause instanceof Error ? cause.message : 'Unable to load debts.',
      };
    }
    // tick re-reads after writes or when the screen regains focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, householdId, tick]);

  const run = (action: () => string) => {
    setError(null);
    setMessage(null);
    try {
      setMessage(action());
      scheduleNotificationRefresh();
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this change.');
    }
  };

  const failure = dbError ?? loaded.failure;
  const data = loaded.data;
  const debts = data?.debts ?? [];
  const totalRemaining = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const totalOriginal = debts.reduce((sum, debt) => sum + debt.originalAmount, 0);
  const totalPaid = debts.reduce((sum, debt) => sum + debt.paid, 0);
  const overallPercent =
    totalOriginal > 0 ? Math.min(100, Math.round((totalPaid / totalOriginal) * 100)) : 0;
  const overdueCount = debts.filter((debt) => debt.status === 'OVERDUE').length;

  return (
    <PageLayout
      title="Debts"
      subtitle="What you owe and how it is going down"
      loading={loading}
      action={
        <Link
          href="/(tabs)/more"
          className="min-h-12 justify-center rounded-2xl border border-slate-300 dark:border-slate-600 px-4 py-3"
        >
          <Text className="font-bold text-slate-900 dark:text-slate-100">Back</Text>
        </Link>
      }
    >
      {failure ? <Banner tone="error">{failure}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="success">{message}</Banner> : null}

      <View className="rounded-3xl bg-amber-600 p-5">
        <Text className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100">
          You owe
        </Text>
        <Text className="mt-1 text-4xl font-extrabold text-white">{formatXAF(totalRemaining)}</Text>
        <View className="mt-4 h-2.5 overflow-hidden rounded-full bg-black/20">
          <View className="h-full rounded-full bg-white" style={{ width: `${overallPercent}%` }} />
        </View>
        <Text className="mt-1 text-xs text-amber-100">{overallPercent}% of debt paid off</Text>
        <View className="mt-4 flex-row gap-3">
          <HeroStat icon="wallet" label="Original" value={formatXAF(totalOriginal)} />
          <HeroStat icon="checkmark-circle" label="Paid" value={formatXAF(totalPaid)} />
          <HeroStat
            icon="alert-circle"
            label="Overdue"
            value={String(overdueCount)}
            warn={overdueCount > 0}
          />
        </View>
      </View>

      {adding ? (
        <View className="mb-4 mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <TextInput
            accessibilityLabel="Creditor"
            placeholder="Owed to"
            value={creditor}
            onChangeText={setCreditor}
            className="mb-2 min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-3 text-base"
          />
          <TextInput
            accessibilityLabel="Original amount"
            placeholder={`Original amount (${getCurrencyCode()})`}
            keyboardType="number-pad"
            value={original}
            onChangeText={setOriginal}
            className="mb-2 min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-3 text-base"
          />
          <DatePickerField
            label="Deadline (optional)"
            value={deadline}
            onChange={setDeadline}
            minimumDate={deadlineRange.min}
            maximumDate={deadlineRange.max}
            startOnToday
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button label="Cancel" variant="outline" onPress={() => setAdding(false)} />
            </View>
            <View className="flex-1">
              <Button
                label="Save debt"
                onPress={() =>
                  run(() => {
                    addDebt(db!, householdId, {
                      creditor,
                      originalAmount: Number(original.replace(/[\s,]/g, '')),
                      deadline,
                    });
                    setAdding(false);
                    setCreditor('');
                    setOriginal('');
                    setDeadline('');
                    return 'Debt added. Give it a Debt line in Budget so payments are planned.';
                  })
                }
              />
            </View>
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add debt"
          onPress={() => setAdding(true)}
          className="mb-4 mt-4 min-h-14 flex-row items-center justify-center rounded-2xl bg-slate-900 dark:bg-slate-800 px-3"
        >
          <Ionicons name="add-circle" size={22} color="#ffffff" />
          <Text className="ml-2 text-base font-bold text-white">Add debt</Text>
        </Pressable>
      )}

      <Text className="mb-3 mt-2 text-base font-bold text-slate-900 dark:text-slate-100">
        Your debts
      </Text>

      {data && debts.length === 0 ? (
        <View className="mb-4 items-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-8">
          <Ionicons name="happy" size={44} color="#94a3b8" />
          <Text className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            No debts recorded yet.
          </Text>
        </View>
      ) : null}

      {debts.map((debt) => {
        const percent = debt.originalAmount > 0 ? (debt.paid / debt.originalAmount) * 100 : 0;
        const paying = payingId === debt.id;
        const look = statusLook[debt.status];
        return (
          <SwipeToDelete
            key={debt.id}
            onDelete={() =>
              Alert.alert(
                `Delete debt to ${debt.creditor}?`,
                'Payments already recorded stay in your transactions.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () =>
                      run(() => {
                        deleteDebt(db!, householdId, debt.id);
                        return `Debt to ${debt.creditor} deleted.`;
                      }),
                  },
                ],
              )
            }
          >
            <View className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <View className={`h-1.5 ${look.bar}`} />
              <View className="p-4">
                <View className="flex-row items-center">
                  <Avatar name={debt.creditor} size={44} />
                  <View className="ml-3 flex-1">
                    <Text
                      numberOfLines={1}
                      className="text-base font-bold text-slate-900 dark:text-slate-100"
                    >
                      {debt.creditor}
                    </Text>
                    <Text className="text-xs text-slate-500 dark:text-slate-400">
                      Original {formatXAF(debt.originalAmount)}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                      {formatXAF(debt.balance)}
                    </Text>
                    <Text className="text-xs text-slate-500 dark:text-slate-400">left</Text>
                  </View>
                </View>
                <View className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <View
                    className={`h-full rounded-full ${look.bar}`}
                    style={{ width: `${Math.min(100, percent)}%` }}
                  />
                </View>
                <View className="mt-3 flex-row items-center justify-between">
                  <View className={`flex-row items-center rounded-full px-2.5 py-1 ${look.pill}`}>
                    <Ionicons name={look.icon} size={13} color={look.tint} />
                    <Text className="ml-1 text-xs font-bold" style={{ color: look.tint }}>
                      {look.label}
                    </Text>
                  </View>
                  <Text className="text-xs text-slate-500 dark:text-slate-400">
                    {formatXAF(debt.paid)} paid · {Math.round(percent)}%
                  </Text>
                </View>
                <Text
                  className={`mt-2 text-sm font-semibold ${
                    debt.status === 'OVERDUE'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {debt.deadline
                    ? `Deadline ${debt.deadline}${
                        debt.daysLeft !== null && debt.status !== 'PAID'
                          ? debt.daysLeft >= 0
                            ? ` · ${debt.daysLeft} days`
                            : ` · ${-debt.daysLeft} days overdue`
                          : ''
                      }`
                    : 'Deadline flexible'}
                </Text>

                {debt.status !== 'PAID' ? (
                  paying ? (
                    <View className="mt-3">
                      <TextInput
                        accessibilityLabel={`Payment amount for ${debt.creditor}`}
                        keyboardType="number-pad"
                        placeholder={`Amount in ${getCurrencyCode()}`}
                        value={amount}
                        onChangeText={setAmount}
                        className="mb-2 min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-3 text-base"
                      />
                      <View className="flex-row gap-3">
                        <View className="flex-1">
                          <Button
                            label="Cancel"
                            variant="outline"
                            onPress={() => setPayingId(null)}
                          />
                        </View>
                        <View className="flex-1">
                          <Button
                            label="Save payment"
                            onPress={() =>
                              run(() => {
                                recordDebtPayment(db!, householdId, {
                                  debtId: debt.id,
                                  amount: Number(amount.replace(/[\s,]/g, '')),
                                });
                                setPayingId(null);
                                setAmount('');
                                return `Payment to ${debt.creditor} recorded.`;
                              })
                            }
                          />
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View className="mt-3">
                      <Button
                        label="Record payment"
                        onPress={() => {
                          setPayingId(debt.id);
                          setAmount('');
                        }}
                      />
                    </View>
                  )
                ) : null}

                {debt.payments.length > 0 ? (
                  <View className="mt-3 border-t border-slate-200 dark:border-slate-700 pt-2">
                    <Text className="mb-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                      Payment history
                    </Text>
                    {debt.payments.map((payment) => (
                      <View key={payment.id} className="flex-row justify-between py-1">
                        <Text className="text-sm text-slate-600 dark:text-slate-300">
                          {new Date(payment.occurredAt).toLocaleDateString('en-GB')}
                        </Text>
                        <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {formatXAF(payment.amount)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          </SwipeToDelete>
        );
      })}

      {data && data.schedule.length > 0 ? (
        <>
          <View className="mb-3 mt-4 flex-row items-center justify-between">
            <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
              Planned schedule
            </Text>
            <Text className="text-xs text-slate-500 dark:text-slate-400">Tap a row to edit</Text>
          </View>
          {data.schedule.map((entry, index) => {
            const tint =
              entry.state === 'Paid' ? '#047857' : entry.state === 'Due' ? '#b45309' : '#64748b';
            const entryKey = `${entry.month}-${entry.lineId}`;
            const expanded = openEntry === entryKey;
            return (
              <View
                key={`${entryKey}-${index}`}
                className="mb-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Manage planned payment, ${entry.creditor}, ${entry.month}`}
                  onPress={() => setOpenEntry(expanded ? null : entryKey)}
                  className="flex-row items-center"
                >
                  <View className="h-11 w-11 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                    <Text className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {monthLabel(entry.month, 'short').split(' ')[0]}
                    </Text>
                  </View>
                  <View className="ml-3 flex-1">
                    <Text
                      numberOfLines={1}
                      className="text-sm font-semibold text-slate-900 dark:text-slate-100"
                    >
                      {entry.creditor}
                    </Text>
                    <Text className="text-xs text-slate-500 dark:text-slate-400">
                      {monthLabel(entry.month)} · {formatXAF(entry.planned)}
                    </Text>
                  </View>
                  <View
                    className="flex-row items-center rounded-full px-2.5 py-1"
                    style={{ backgroundColor: `${tint}1f` }}
                  >
                    <Ionicons
                      name={
                        entry.state === 'Paid'
                          ? 'checkmark-circle'
                          : entry.state === 'Due'
                            ? 'alert-circle'
                            : 'time'
                      }
                      size={13}
                      color={tint}
                    />
                    <Text className="ml-1 text-xs font-bold" style={{ color: tint }}>
                      {entry.state}
                    </Text>
                  </View>
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color="#94a3b8"
                    style={{ marginLeft: 8 }}
                  />
                </Pressable>
                {expanded ? (
                  <View className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <DatePickerField
                      label="Reschedule to (pick any day in the new month)"
                      value=""
                      onChange={(value) =>
                        run(() => {
                          reschedulePlannedPayment(
                            db!,
                            householdId,
                            entry.lineId,
                            entry.month,
                            value.slice(0, 7),
                          );
                          setOpenEntry(null);
                          return `Payment moved to ${monthLabel(value.slice(0, 7))}.`;
                        })
                      }
                      minimumDate={deadlineRange.min}
                      maximumDate={deadlineRange.max}
                      startOnToday
                    />
                    <Button
                      label="Remove this planned payment"
                      variant="outline"
                      onPress={() =>
                        Alert.alert(
                          `Remove ${monthLabel(entry.month)} payment?`,
                          `${formatXAF(entry.planned)} planned for ${entry.creditor} will be removed from the schedule. Recorded payments are not affected.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Remove',
                              style: 'destructive',
                              onPress: () =>
                                run(() => {
                                  removePlannedPayment(db!, householdId, entry.lineId, entry.month);
                                  setOpenEntry(null);
                                  return 'Planned payment removed.';
                                }),
                            },
                          ],
                        )
                      }
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </>
      ) : null}
      <Text className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
        Balances come from recorded payments. They are never typed in.
      </Text>
    </PageLayout>
  );
}
