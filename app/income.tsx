import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { PanResponder, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  addIncomeStream,
  confirmRecurringIncome,
  deleteIncomeStream,
  removeRecurringIncomePlan,
  updateIncomeStream,
  getIncomeMonth,
  incomeKinds,
  updateRecurringIncomePlan,
  type IncomeKind,
} from '@/src/data/income';
import { deleteTransaction, updateTransaction } from '@/src/data/activity';
import { nextMonth, previousMonth } from '@/src/data/plan';
import { transactions } from '@/src/data/repos';
import { dayOfMonth, effectiveNow, monthKeyForDate } from '@/src/domain/dates';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { Banner, monthLabel } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';
import { getCurrencyCode } from '@/src/domain/currency';
import { confirmMomoImport } from '@/src/momo/store';

const kindLabels: Record<IncomeKind, string> = {
  salary: 'Salary',
  business: 'Business',
  rental: 'Rental',
  other: 'Other',
};

const sourceNames: Record<IncomeKind, string> = {
  salary: 'Income from Salary',
  business: 'Income from Business',
  rental: 'Income from Rental',
  other: 'Other income',
};

const kindIcons: Record<IncomeKind, keyof typeof Ionicons.glyphMap> = {
  salary: 'briefcase',
  business: 'storefront',
  rental: 'home',
  other: 'cash',
};

const MONTH_CHIP_STEP = 72;

function monthRange(from: string, to: string): string[] {
  const months = [from];
  while (months[months.length - 1] < to) months.push(nextMonth(months[months.length - 1]));
  return months;
}

function SaveButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 active:bg-emerald-800"
    >
      <Ionicons name="checkmark" size={18} color="#ffffff" />
      <Text className="text-base font-bold text-white">{label}</Text>
    </Pressable>
  );
}

function CancelButton({ onPress, label = 'Cancel' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-11 flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 active:bg-slate-200"
    >
      <Ionicons name="close" size={16} className="text-slate-600 dark:text-slate-300" />
      <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</Text>
    </Pressable>
  );
}

function DeleteButton({
  onPress,
  confirming,
  label = 'Delete',
}: {
  onPress: () => void;
  confirming: boolean;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`min-h-11 flex-1 flex-row items-center justify-center gap-1 rounded-xl border px-3 py-2 ${
        confirming
          ? 'border-red-600 bg-red-600'
          : 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/30 active:bg-red-100'
      }`}
    >
      <Ionicons
        name={confirming ? 'alert-circle' : 'trash-outline'}
        size={16}
        color={confirming ? '#ffffff' : '#b91c1c'}
      />
      <Text
        className={`text-sm font-semibold ${confirming ? 'text-white' : 'text-red-700 dark:text-red-400'}`}
      >
        {confirming ? 'Tap again to delete' : label}
      </Text>
    </Pressable>
  );
}

export default function IncomeScreen() {
  const { db, householdId, loading, error: dbError, tick, refresh } = useDatabase();
  const currentMonth = monthKeyForDate(effectiveNow(), 'Africa/Douala');
  const [month, setMonth] = useState(currentMonth);
  const [kind, setKind] = useState<IncomeKind>('salary');
  const [streamName, setStreamName] = useState(sourceNames.salary);
  const [selectedStreamId, setSelectedStreamId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [fixedIncome, setFixedIncome] = useState(false);
  const [payday, setPayday] = useState('1');
  const [creatingSource, setCreatingSource] = useState(false);
  const monthStrip = useRef<ComponentRef<typeof ScrollView>>(null);
  const [stripWidth, setStripWidth] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordDate, setRecordDate] = useState('');
  const [pendingMomoImportId, setPendingMomoImportId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [sourceEditName, setSourceEditName] = useState('');
  const [sourceEditKind, setSourceEditKind] = useState<IncomeKind>('other');
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planAmount, setPlanAmount] = useState('');
  const [planDay, setPlanDay] = useState('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryAmount, setEntryAmount] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [entryNote, setEntryNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loaded = useMemo(() => {
    if (!db || !householdId) return { data: null, failure: null };
    try {
      return { data: getIncomeMonth(db, householdId, month), failure: null };
    } catch (cause) {
      return {
        data: null,
        failure: cause instanceof Error ? cause.message : 'Unable to load income.',
      };
    }
    // Tick refreshes this list after writes and when returning to the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, householdId, month, tick]);

  const streams = loaded.data?.streams ?? [];
  const entries = loaded.data?.entries ?? [];
  const streamTotals = loaded.data?.streamTotals ?? new Map<string, number>();
  const plannedIncome = loaded.data?.plannedIncome ?? [];
  const monthTotal = loaded.data?.monthTotal ?? 0;
  const entryCount = loaded.data?.entryCount ?? 0;
  const activeStreamId = streams.some((stream) => stream.id === selectedStreamId)
    ? selectedStreamId
    : (streams[0]?.id ?? '');
  const activeStream = streams.find((stream) => stream.id === activeStreamId);
  const pendingTotal = plannedIncome.reduce(
    (total, plan) => total + (plan.confirmed ? 0 : plan.amount),
    0,
  );
  const canConfirmPlan = (day: number) =>
    month < currentMonth ||
    (month === currentMonth && dayOfMonth(effectiveNow(), 'Africa/Douala') >= day);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 36 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -36) setMonth((value) => previousMonth(value));
          if (gesture.dx > 36) setMonth((value) => nextMonth(value));
        },
      }),
    [],
  );

  const confirmPlan = (streamId: string) => {
    if (!db || !householdId) return;
    setError(null);
    setMessage(null);
    try {
      confirmRecurringIncome(db, householdId, streamId, month);
      scheduleNotificationRefresh();
      setMessage('Monthly income confirmed and added to received income.');
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to confirm this income.');
    }
  };

  const startPlanEdit = (streamId: string) => {
    const stream = streams.find((item) => item.id === streamId);
    if (!stream || stream.recurringAmount === null || stream.recurringDay === null) return;
    setEditingPlanId(stream.id);
    setPlanAmount(String(stream.recurringAmount));
    setPlanDay(String(stream.recurringDay));
    setError(null);
    setMessage(null);
  };

  const savePlanEdit = (streamId: string) => {
    if (!db || !householdId) return;
    try {
      updateRecurringIncomePlan(db, householdId, streamId, {
        amount: Number(planAmount.replace(/[\s,]/g, '')),
        day: Number(planDay),
      });
      setEditingPlanId(null);
      setMessage('Fixed monthly income updated. Confirmed income entries are unchanged.');
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update this income plan.');
    }
  };

  const startEntryEdit = (entry: (typeof entries)[number]) => {
    const date = new Date(entry.occurredAt);
    setEditingEntryId(entry.id);
    setConfirmDeleteId(null);
    setEntryAmount(String(entry.amount));
    setEntryDate(
      [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-'),
    );
    setEntryNote(entry.note);
    setError(null);
    setMessage(null);
  };

  const saveEntryEdit = (entryId: string) => {
    if (!db || !householdId) return;
    try {
      updateTransaction(db, householdId, entryId, {
        amount: Number(entryAmount.replace(/[\s,]/g, '')),
        note: entryNote,
        occurredOn: entryDate,
      });
      setEditingEntryId(null);
      setMessage('Received income corrected.');
      scheduleNotificationRefresh();
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to correct this income.');
    }
  };

  const openRecording = () => {
    const today = effectiveNow();
    const todayKey = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    setRecordDate(month === currentMonth ? todayKey : `${month}-01`);
    setError(null);
    setMessage(null);
    setCreatingSource(false);
    setRecording((value) => !value);
  };

  const params = useLocalSearchParams<{
    add?: string;
    amount?: string;
    note?: string;
    date?: string;
    momoImportId?: string;
  }>();
  const router = useRouter();
  useEffect(() => {
    if (params.add !== '1') return;
    router.setParams({ add: undefined });
    // Opening the form in response to a navigation param is an external event.
    if (!recording) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      openRecording();
      setAmount(params.amount ?? '');
      setNote(params.note ?? '');
      setPendingMomoImportId(params.momoImportId || null);
      if (params.momoImportId) setFixedIncome(false);
      const date = params.date;
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        setMonth(date.slice(0, 7));
        setRecordDate(date);
      }
    }
    // openRecording only reads state that is current when the param arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.add]);

  const removeEntry = (entryId: string) => {
    if (!db || !householdId) return;
    if (confirmDeleteId !== entryId) {
      setConfirmDeleteId(entryId);
      return;
    }
    try {
      deleteTransaction(db, householdId, entryId);
      setConfirmDeleteId(null);
      setEditingEntryId(null);
      setMessage('Income entry deleted.');
      scheduleNotificationRefresh();
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete this income.');
    }
  };

  const startSourceEdit = (stream: { id: string; name: string; kind: IncomeKind }) => {
    setEditingSourceId(editingSourceId === stream.id ? null : stream.id);
    setSourceEditName(stream.name);
    setSourceEditKind(stream.kind);
    setConfirmDeleteId(null);
    setError(null);
    setMessage(null);
  };

  const saveSourceEdit = (streamId: string) => {
    if (!db || !householdId) return;
    try {
      updateIncomeStream(db, householdId, streamId, { name: sourceEditName, kind: sourceEditKind });
      setEditingSourceId(null);
      setMessage('Income source updated.');
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update this source.');
    }
  };

  const stopFixedPlan = (streamId: string) => {
    if (!db || !householdId) return;
    try {
      removeRecurringIncomePlan(db, householdId, streamId);
      setEditingSourceId(null);
      setEditingPlanId(null);
      setMessage('Fixed monthly income removed. Received entries are kept.');
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove the fixed plan.');
    }
  };

  const removeSource = (streamId: string) => {
    if (!db || !householdId) return;
    if (confirmDeleteId !== streamId) {
      setConfirmDeleteId(streamId);
      return;
    }
    try {
      deleteIncomeStream(db, householdId, streamId);
      setConfirmDeleteId(null);
      setEditingSourceId(null);
      setMessage('Income source deleted.');
      refresh();
    } catch (cause) {
      setConfirmDeleteId(null);
      setError(cause instanceof Error ? cause.message : 'Unable to delete this source.');
    }
  };

  const recordIncome = () => {
    if (!db || !householdId) return;
    const parsedAmount = Number(amount.replace(/[\s,]/g, ''));
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setError(`Enter a positive whole amount in ${getCurrencyCode()}.`);
      return;
    }
    const creating = creatingSource || streams.length === 0;
    if (!creating && !streams.some((stream) => stream.id === activeStreamId)) {
      setError('Choose an income source first.');
      return;
    }

    const day = new Date(`${recordDate}T12:00:00`);
    if (!(creating && fixedIncome)) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(recordDate) ||
        Number.isNaN(day.getTime()) ||
        day.toISOString().slice(0, 10) !== recordDate
      ) {
        setError('Enter a valid date as YYYY-MM-DD.');
        return;
      }
      if (recordDate.slice(0, 7) !== month) {
        setError(`Choose a date in ${monthLabel(month, 'long')}, or swipe to that month.`);
        return;
      }
    }

    setError(null);
    setMessage(null);
    try {
      let streamId = activeStreamId;
      let sourceName = activeStream?.name ?? 'Income';
      if (creating) {
        const stream = addIncomeStream(db, householdId, {
          kind,
          name: streamName,
          recurring: fixedIncome
            ? { amount: parsedAmount, day: Number(payday), startMonth: month }
            : undefined,
        });
        streamId = stream.id;
        sourceName = stream.name;
        setSelectedStreamId(stream.id);
      }
      if (creating && fixedIncome) {
        setMessage(`${sourceName} added as planned monthly income. Confirm it when received.`);
      } else {
        if (pendingMomoImportId) {
          confirmMomoImport(db, householdId, pendingMomoImportId, {
            amount: parsedAmount,
            direction: 'income',
            note: note.trim() || sourceName,
            occurredAt: day.toISOString(),
            incomeStreamId: streamId,
          });
        } else {
          transactions.add(db, householdId, {
            occurred_at: day.toISOString(),
            amount: parsedAmount,
            direction: 'income',
            income_stream_id: streamId,
            note: note.trim() || null,
            source: 'MANUAL',
          });
        }
        scheduleNotificationRefresh();
        setMessage(`${formatXAF(parsedAmount)} recorded from ${sourceName}.`);
      }
      setAmount('');
      setNote('');
      setFixedIncome(false);
      setPayday('1');
      setCreatingSource(false);
      setStreamName(sourceNames[kind]);
      setRecording(false);
      refresh();
      if (pendingMomoImportId) router.replace('/momo-review');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record this income.');
    }
  };

  const stripMonths = useMemo(() => {
    const first = previousMonth(
      Array.from({ length: 22 }).reduce<string>((value) => previousMonth(value), currentMonth),
    );
    const last = Array.from({ length: 12 }).reduce<string>(
      (value) => nextMonth(value),
      currentMonth,
    );
    return monthRange(month < first ? month : first, month > last ? month : last);
  }, [currentMonth, month]);

  useEffect(() => {
    const index = stripMonths.indexOf(month);
    if (index < 0 || stripWidth === 0) return;
    monthStrip.current?.scrollTo({
      x: Math.max(0, index * MONTH_CHIP_STEP - (stripWidth - MONTH_CHIP_STEP) / 2),
      animated: true,
    });
  }, [month, stripMonths, stripWidth]);

  const creating = creatingSource || streams.length === 0;
  const failure = dbError ?? loaded.failure ?? error;

  return (
    <PageLayout
      title="Income"
      subtitle="Track income streams and where your budget comes from"
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
      {message ? <Banner tone="success">{message}</Banner> : null}

      <View {...panResponder.panHandlers}>
        <View className="mb-5 overflow-hidden rounded-3xl bg-slate-900 dark:bg-slate-800 p-5">
          <Text className="text-center text-sm font-bold text-white">{monthLabel(month)}</Text>
          <Text className="mb-3 mt-1 text-center text-[10px] font-medium uppercase tracking-wider text-slate-300">
            Swipe left or right to change month
          </Text>
          <ScrollView
            ref={monthStrip}
            horizontal
            showsHorizontalScrollIndicator={false}
            onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)}
            className="mb-4 -mx-1"
          >
            {stripMonths.map((value) => {
              const active = value === month;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${monthLabel(value)}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => setMonth(value)}
                  style={{ width: MONTH_CHIP_STEP - 8, marginHorizontal: 4 }}
                  className={`items-center rounded-2xl py-2 ${
                    active ? 'bg-emerald-500' : 'bg-white/10'
                  }`}
                >
                  <Text className={`text-sm font-bold ${active ? 'text-white' : 'text-slate-200'}`}>
                    {monthLabel(value, 'short')}
                  </Text>
                  <Text className={`text-[10px] ${active ? 'text-emerald-50' : 'text-slate-400'}`}>
                    {value.slice(0, 4)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-sm font-medium text-slate-300">Income received</Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                className="mt-1 text-3xl font-extrabold text-white"
              >
                {formatXAF(monthTotal)}
              </Text>
            </View>
            <View className="ml-3 h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500">
              <Ionicons name="trending-up" size={28} color="#ffffff" />
            </View>
          </View>
          <View className="mt-5 flex-row gap-3">
            <View className="flex-1 rounded-2xl bg-white/10 p-3">
              <Text className="text-xs font-medium text-slate-300">Entries</Text>
              <Text className="mt-1 text-lg font-bold text-white">{entryCount}</Text>
            </View>
            <View className="flex-1 rounded-2xl bg-white/10 p-3">
              <Text className="text-xs font-medium text-slate-300">Planned</Text>
              <Text className="mt-1 text-lg font-bold text-white">{formatXAF(pendingTotal)}</Text>
            </View>
          </View>
          {month !== currentMonth ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setMonth(currentMonth)}
              className="mt-3 self-center rounded-full bg-white/10 px-4 py-2"
            >
              <Text className="text-xs font-bold text-white">Back to this month</Text>
            </Pressable>
          ) : null}
        </View>

        <View className="mb-5">
          <View className="mb-3 flex-row items-center justify-between">
            <View>
              <Text className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Income this month
              </Text>
              <Text className="mt-0.5 text-xs text-slate-400">
                Sources and plans for {monthLabel(month, 'short')}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={recording ? 'Close add income form' : 'Add income'}
              onPress={openRecording}
              className="min-h-11 flex-row items-center gap-1 rounded-full bg-emerald-700 px-4 py-2"
            >
              <Ionicons name={recording ? 'close' : 'add'} size={18} color="#ffffff" />
              <Text className="text-sm font-bold text-white">
                {recording ? 'Close' : 'Add income'}
              </Text>
            </Pressable>
          </View>

          {recording ? (
            <View className="mb-3 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 p-4">
              <View className="mb-4 flex-row items-center">
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40">
                  <Ionicons name="add" size={24} color="#047857" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Add income
                  </Text>
                  <Text className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                    {creating
                      ? 'Create a new income source'
                      : activeStream
                        ? `From ${activeStream.name}`
                        : 'Choose a source'}
                  </Text>
                </View>
              </View>
              <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Source
              </Text>
              <View className="mb-4 flex-row flex-wrap gap-2">
                {streams.map((stream) => {
                  const active = !creating && activeStreamId === stream.id;
                  return (
                    <Pressable
                      key={stream.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        setSelectedStreamId(stream.id);
                        setCreatingSource(false);
                      }}
                      className={`min-h-10 justify-center rounded-full px-3 py-2 ${
                        active
                          ? 'bg-emerald-100 dark:bg-emerald-900/40'
                          : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      <Text
                        numberOfLines={1}
                        className={`max-w-40 text-xs font-semibold ${
                          active
                            ? 'text-emerald-800 dark:text-emerald-300'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {stream.name}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: creating }}
                  onPress={() => setCreatingSource(true)}
                  className={`min-h-10 flex-row items-center gap-1 rounded-full border border-dashed px-3 py-2 ${
                    creating
                      ? 'border-emerald-700 bg-emerald-100 dark:bg-emerald-900/40'
                      : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                  }`}
                >
                  <Ionicons name="add" size={14} color={creating ? '#047857' : '#475569'} />
                  <Text
                    className={`text-xs font-semibold ${
                      creating
                        ? 'text-emerald-800 dark:text-emerald-300'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    New source
                  </Text>
                </Pressable>
              </View>

              {creating ? (
                <View className="mb-4 rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
                  <View className="mb-3 flex-row flex-wrap gap-2">
                    {incomeKinds.map((value) => {
                      const active = kind === value;
                      return (
                        <Pressable
                          key={value}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => {
                            setKind(value);
                            setStreamName(sourceNames[value]);
                          }}
                          className={`min-h-10 justify-center rounded-full px-3 py-2 ${
                            active
                              ? 'bg-emerald-100 dark:bg-emerald-900/40'
                              : 'bg-white dark:bg-slate-900'
                          }`}
                        >
                          <Text
                            className={`text-sm font-semibold ${
                              active
                                ? 'text-emerald-800 dark:text-emerald-300'
                                : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {kindLabels[value]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <TextInput
                    accessibilityLabel="Income source name"
                    value={streamName}
                    onChangeText={setStreamName}
                    placeholder="For example, Income from Salary"
                    className="min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-base text-slate-900 dark:text-slate-100"
                  />
                  {!pendingMomoImportId ? (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: fixedIncome }}
                      onPress={() => setFixedIncome((value) => !value)}
                      className="mt-3 min-h-12 flex-row items-center gap-3 rounded-xl bg-white dark:bg-slate-900 px-3 py-2"
                    >
                      <View
                        className={`h-5 w-5 items-center justify-center rounded border ${
                          fixedIncome
                            ? 'border-emerald-700 bg-emerald-700'
                            : 'border-slate-400 bg-white dark:bg-slate-900'
                        }`}
                      >
                        {fixedIncome ? (
                          <Ionicons name="checkmark" size={14} color="#ffffff" />
                        ) : null}
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          Fixed income every month (optional)
                        </Text>
                        <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          Planned each month until you confirm receipt.
                        </Text>
                      </View>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {creating && fixedIncome
                  ? `Monthly amount in ${getCurrencyCode()}`
                  : `Amount in ${getCurrencyCode()}`}
              </Text>
              <TextInput
                accessibilityLabel={`Income amount in ${getCurrencyCode()}`}
                value={amount}
                onChangeText={setAmount}
                keyboardType="number-pad"
                placeholder="0"
                className="min-h-[68px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-3xl font-extrabold text-slate-900 dark:text-slate-100"
              />
              {creating && fixedIncome ? (
                <View className="mt-3">
                  <Text className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Payday (day of month, 1-31)
                  </Text>
                  <TextInput
                    accessibilityLabel="Monthly payday"
                    value={payday}
                    onChangeText={setPayday}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="1"
                    className="min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-base text-slate-900 dark:text-slate-100"
                  />
                  <Text className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Starts in {monthLabel(month)}. A shorter month uses its last day.
                  </Text>
                </View>
              ) : (
                <>
                  <TextInput
                    accessibilityLabel="Income date"
                    value={recordDate}
                    onChangeText={setRecordDate}
                    placeholder="YYYY-MM-DD"
                    className="mt-3 min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-base text-slate-900 dark:text-slate-100"
                  />
                  <TextInput
                    accessibilityLabel="Income note"
                    value={note}
                    onChangeText={setNote}
                    placeholder="Add a note (optional)"
                    className="mt-3 min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-base text-slate-900 dark:text-slate-100"
                  />
                </>
              )}
              <View className="mt-4 gap-2">
                <Pressable
                  accessibilityRole="button"
                  disabled={!amount.trim()}
                  onPress={recordIncome}
                  className={`min-h-12 flex-row items-center justify-center gap-2 rounded-2xl px-4 py-3 ${
                    amount.trim() ? 'bg-emerald-700 active:bg-emerald-800' : 'bg-slate-300'
                  }`}
                >
                  <Ionicons name="checkmark" size={18} color="#ffffff" />
                  <Text className="text-base font-bold text-white">
                    {creating && fixedIncome ? 'Save fixed income' : 'Save income'}
                  </Text>
                </Pressable>
                <View className="flex-row">
                  <CancelButton
                    onPress={() => {
                      setRecording(false);
                      setCreatingSource(false);
                      setAmount('');
                      setNote('');
                    }}
                  />
                </View>
              </View>
            </View>
          ) : null}

          {streams.length === 0 ? (
            <View className="items-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-5 py-6">
              <Ionicons name="wallet-outline" size={24} color="#047857" />
              <Text className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                No income sources yet
              </Text>
              <Text className="mt-1 text-center text-xs text-slate-500 dark:text-slate-400">
                Tap Add income to create your first source and record money received.
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {streams.map((stream) => {
                const plan = plannedIncome.find((item) => item.stream.id === stream.id);
                return (
                  <View
                    key={stream.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${stream.name} for recording income`}
                      accessibilityState={{ selected: activeStreamId === stream.id }}
                      onPress={() => setSelectedStreamId(stream.id)}
                      className="min-h-11 flex-row items-center"
                    >
                      <View className="h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/30">
                        <Ionicons name={kindIcons[stream.kind]} size={21} color="#047857" />
                      </View>
                      <View className="ml-3 flex-1">
                        <Text
                          numberOfLines={1}
                          className="text-sm font-bold text-slate-900 dark:text-slate-100"
                        >
                          {stream.name}
                        </Text>
                        <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {kindLabels[stream.kind]}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {formatXAF(streamTotals.get(stream.id) ?? 0)}
                        </Text>
                        <Text className="mt-0.5 text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                          Received
                        </Text>
                      </View>
                    </Pressable>
                    <View className="mt-2 flex-row justify-end">
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Edit income source ${stream.name}`}
                        onPress={() => startSourceEdit(stream)}
                        className="min-h-9 flex-row items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1"
                      >
                        <Ionicons
                          name={editingSourceId === stream.id ? 'close' : 'create-outline'}
                          size={14}
                          className="text-slate-700 dark:text-slate-200"
                        />
                        <Text className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {editingSourceId === stream.id ? 'Close' : 'Edit source'}
                        </Text>
                      </Pressable>
                    </View>
                    {editingSourceId === stream.id ? (
                      <View className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                        <View className="mb-2 flex-row flex-wrap gap-2">
                          {incomeKinds.map((value) => (
                            <Pressable
                              key={value}
                              accessibilityRole="button"
                              accessibilityState={{ selected: sourceEditKind === value }}
                              onPress={() => setSourceEditKind(value)}
                              className={`min-h-9 justify-center rounded-full px-3 py-1 ${
                                sourceEditKind === value
                                  ? 'bg-emerald-100 dark:bg-emerald-900/40'
                                  : 'bg-slate-100 dark:bg-slate-800'
                              }`}
                            >
                              <Text className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                {kindLabels[value]}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                        <TextInput
                          accessibilityLabel="Edit income source name"
                          value={sourceEditName}
                          onChangeText={setSourceEditName}
                          className="min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-3 text-base text-slate-900 dark:text-slate-100"
                        />
                        <View className="mt-4 gap-2">
                          <SaveButton
                            label="Save changes"
                            onPress={() => saveSourceEdit(stream.id)}
                          />
                          {plan ? (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => stopFixedPlan(stream.id)}
                              className="min-h-11 flex-row items-center justify-center gap-1 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-3 py-2 active:bg-amber-100"
                            >
                              <Ionicons name="pause-circle-outline" size={16} color="#92400e" />
                              <Text className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                                Stop fixed monthly income
                              </Text>
                            </Pressable>
                          ) : null}
                          <View className="flex-row gap-2">
                            <CancelButton onPress={() => setEditingSourceId(null)} />
                            <DeleteButton
                              confirming={confirmDeleteId === stream.id}
                              label="Delete source"
                              onPress={() => removeSource(stream.id)}
                            />
                          </View>
                        </View>
                        <Text className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                          A source can be deleted only when no income, expense, or budget uses it.
                        </Text>
                      </View>
                    ) : null}
                    {plan ? (
                      <View className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 p-3">
                        <View className="flex-1">
                          <Text className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                            {plan.confirmed ? 'Monthly income confirmed' : 'Planned monthly income'}
                          </Text>
                          <Text className="mt-1 text-sm font-bold text-amber-900 dark:text-amber-200">
                            {formatXAF(plan.amount)} · expected day {plan.day}
                          </Text>
                        </View>
                        {editingPlanId === stream.id ? (
                          <View className="mt-3">
                            <View className="flex-row gap-2">
                              <TextInput
                                accessibilityLabel="Edit fixed monthly income amount"
                                value={planAmount}
                                onChangeText={setPlanAmount}
                                keyboardType="number-pad"
                                placeholder="Monthly amount"
                                className="min-h-11 flex-1 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                              />
                              <TextInput
                                accessibilityLabel="Edit monthly payday"
                                value={planDay}
                                onChangeText={setPlanDay}
                                keyboardType="number-pad"
                                maxLength={2}
                                placeholder="Day"
                                className="min-h-11 w-20 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                              />
                            </View>
                            <View className="mt-3 gap-2">
                              <SaveButton
                                label="Save plan"
                                onPress={() => savePlanEdit(stream.id)}
                              />
                              <View className="flex-row">
                                <CancelButton onPress={() => setEditingPlanId(null)} />
                              </View>
                            </View>
                            <Text className="mt-2 text-[11px] text-amber-800 dark:text-amber-300">
                              Updates planned amounts; received entries stay unchanged.
                            </Text>
                          </View>
                        ) : (
                          <View className="mt-3 flex-row flex-wrap gap-2">
                            {!plan.confirmed ? (
                              <Pressable
                                accessibilityRole="button"
                                disabled={!canConfirmPlan(plan.day)}
                                onPress={() => confirmPlan(stream.id)}
                                className={`min-h-10 justify-center rounded-xl px-3 py-2 ${
                                  canConfirmPlan(plan.day) ? 'bg-emerald-700' : 'bg-slate-300'
                                }`}
                              >
                                <Text className="text-xs font-bold text-white">
                                  {canConfirmPlan(plan.day) ? 'Confirm received' : 'Not due yet'}
                                </Text>
                              </Pressable>
                            ) : (
                              <View className="min-h-10 flex-row items-center gap-1 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 px-3 py-2">
                                <Ionicons name="checkmark-circle" size={16} color="#047857" />
                                <Text className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                                  Received
                                </Text>
                              </View>
                            )}
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Edit fixed income plan for ${stream.name}`}
                              onPress={() => startPlanEdit(stream.id)}
                              className="min-h-10 flex-row items-center gap-1 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 px-3 py-2"
                            >
                              <Ionicons name="pencil" size={14} color="#92400e" />
                              <Text className="text-xs font-bold text-amber-900 dark:text-amber-200">
                                Edit plan
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View className="mb-3 flex-row items-end justify-between">
          <View>
            <Text className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Recent income
            </Text>
            <Text className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Latest entries for {monthLabel(month, 'short')}
            </Text>
          </View>
          <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {entries.length} shown
          </Text>
        </View>
        {entries.length === 0 ? (
          <View className="items-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-5">
            <Ionicons name="receipt-outline" size={26} color="#94a3b8" />
            <Text className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              No entries yet
            </Text>
            <Text className="mt-1 text-center text-xs text-slate-500 dark:text-slate-400">
              Recorded income will appear here.
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            {entries.map((entry) => {
              const editing = editingEntryId === entry.id;
              return (
                <View
                  key={entry.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
                >
                  <View className="flex-row items-center">
                    <View className="h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/30">
                      <Ionicons
                        name={entry.kind ? kindIcons[entry.kind] : 'cash-outline'}
                        size={20}
                        color="#047857"
                      />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {entry.streamName}
                      </Text>
                      <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {new Date(entry.occurredAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          timeZone: 'Africa/Douala',
                        })}
                        {entry.note ? ` · ${entry.note}` : ''}
                      </Text>
                    </View>
                    <Text className="ml-2 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      +{formatXAF(entry.amount)}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit received income from ${entry.streamName}`}
                      onPress={() => (editing ? setEditingEntryId(null) : startEntryEdit(entry))}
                      className="ml-2 h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
                    >
                      <Ionicons
                        name={editing ? 'close' : 'pencil'}
                        size={17}
                        className="text-slate-700 dark:text-slate-200"
                      />
                    </Pressable>
                  </View>
                  {editing ? (
                    <View className="mt-3 border-t border-slate-200 dark:border-slate-700 pt-3">
                      <Text className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Correct the received amount, date, or note
                      </Text>
                      <TextInput
                        accessibilityLabel="Edit received income amount"
                        value={entryAmount}
                        onChangeText={setEntryAmount}
                        keyboardType="number-pad"
                        placeholder={`Amount in ${getCurrencyCode()}`}
                        className="mt-2 min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-3 text-base text-slate-900 dark:text-slate-100"
                      />
                      <TextInput
                        accessibilityLabel="Edit received income date"
                        value={entryDate}
                        onChangeText={setEntryDate}
                        placeholder="YYYY-MM-DD"
                        className="mt-2 min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-3 text-base text-slate-900 dark:text-slate-100"
                      />
                      <TextInput
                        accessibilityLabel="Edit received income note"
                        value={entryNote}
                        onChangeText={setEntryNote}
                        placeholder="Note (optional)"
                        className="mt-2 min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-3 text-base text-slate-900 dark:text-slate-100"
                      />
                      <View className="mt-4 gap-2">
                        <SaveButton
                          label="Save correction"
                          onPress={() => saveEntryEdit(entry.id)}
                        />
                        <View className="flex-row gap-2">
                          <CancelButton onPress={() => setEditingEntryId(null)} />
                          <DeleteButton
                            confirming={confirmDeleteId === entry.id}
                            onPress={() => removeEntry(entry.id)}
                          />
                        </View>
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </PageLayout>
  );
}
