import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { PanResponder, Pressable, Text, TextInput, View } from 'react-native';

import {
  addIncomeStream,
  confirmRecurringIncome,
  getIncomeMonth,
  incomeKinds,
  updateRecurringIncomePlan,
  type IncomeKind,
} from '@/src/data/income';
import { updateTransaction } from '@/src/data/activity';
import { nextMonth, previousMonth } from '@/src/data/plan';
import { transactions } from '@/src/data/repos';
import { dayOfMonth, effectiveNow, monthKeyForDate } from '@/src/domain/dates';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { Banner, Button, monthLabel } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';

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
  const [fixedAmount, setFixedAmount] = useState('');
  const [payday, setPayday] = useState('1');
  const [addingSource, setAddingSource] = useState(false);
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
  const monthStreams = loaded.data?.monthStreams ?? [];
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

  const addSource = () => {
    if (!db || !householdId) return;
    setError(null);
    setMessage(null);
    try {
      const sourceAmount = Number(fixedAmount.replace(/[\s,]/g, ''));
      const hasAmount = fixedAmount.trim() !== '';
      if (!fixedIncome && hasAmount && (!Number.isSafeInteger(sourceAmount) || sourceAmount <= 0)) {
        setError('Enter a positive whole amount in XAF.');
        return;
      }
      const recurring = fixedIncome
        ? { amount: sourceAmount, day: Number(payday), startMonth: currentMonth }
        : undefined;
      const stream = addIncomeStream(db, householdId, { kind, name: streamName, recurring });
      let recorded = false;
      if (!fixedIncome && hasAmount) {
        const now = effectiveNow();
        transactions.add(db, householdId, {
          occurred_at: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).toISOString(),
          amount: sourceAmount,
          direction: 'income',
          income_stream_id: stream.id,
          source: 'manual',
        });
        scheduleNotificationRefresh();
        recorded = true;
      }
      setSelectedStreamId(stream.id);
      setStreamName(sourceNames[kind]);
      setFixedIncome(false);
      setFixedAmount('');
      setPayday('1');
      setAddingSource(false);
      setMessage(
        recurring
          ? `${stream.name} added as planned monthly income. Confirm it when received.`
          : recorded
            ? `${stream.name} added and ${formatXAF(sourceAmount)} recorded.`
            : `${stream.name} added. You can now link budgets and expenses to it.`,
      );
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add this income source.');
    }
  };

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

  const recordIncome = () => {
    if (!db || !householdId) return;
    const parsedAmount = Number(amount.replace(/[\s,]/g, ''));
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a positive whole amount in XAF.');
      return;
    }
    if (!streams.some((stream) => stream.id === activeStreamId)) {
      setError('Choose an income source first. Add one above if you have not yet.');
      return;
    }

    setError(null);
    setMessage(null);
    try {
      const now = effectiveNow();
      const occurredAt = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        12,
      ).toISOString();
      transactions.add(db, householdId, {
        occurred_at: occurredAt,
        amount: parsedAmount,
        direction: 'income',
        income_stream_id: activeStreamId,
        note: note.trim() || null,
        source: 'manual',
      });
      scheduleNotificationRefresh();
      setAmount('');
      setNote('');
      setMessage('Income recorded.');
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record this income.');
    }
  };

  const failure = dbError ?? loaded.failure ?? error;

  return (
    <PageLayout
      title="Income"
      subtitle="Track income streams and where your budget comes from"
      loading={loading}
      action={
        <Link
          href="/(tabs)/more"
          className="min-h-12 justify-center rounded-2xl border border-slate-300 px-4 py-3"
        >
          <Text className="font-bold text-slate-900">Back</Text>
        </Link>
      }
    >
      {failure ? <Banner tone="error">{failure}</Banner> : null}
      {message ? <Banner tone="success">{message}</Banner> : null}

      <View
        {...panResponder.panHandlers}
        className="mb-5 overflow-hidden rounded-3xl bg-slate-900 p-5"
      >
        <View className="mb-4 flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show previous month"
            onPress={() => setMonth((value) => previousMonth(value))}
            className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
          >
            <Ionicons name="chevron-back" size={22} color="#ffffff" />
          </Pressable>
          <View className="items-center">
            <Text className="text-sm font-bold text-white">{monthLabel(month)}</Text>
            <Text className="mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-300">
              Swipe to change month
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show next month"
            onPress={() => setMonth((value) => nextMonth(value))}
            className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
          >
            <Ionicons name="chevron-forward" size={22} color="#ffffff" />
          </Pressable>
        </View>
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
            <Text className="text-lg font-bold text-slate-900">Income this month</Text>
            <Text className="mt-0.5 text-xs text-slate-400">
              Sources and plans for {monthLabel(month, 'short')}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={addingSource ? 'Cancel adding income source' : 'Add income source'}
            onPress={() => setAddingSource((value) => !value)}
            className="min-h-11 flex-row items-center gap-1 rounded-full bg-emerald-100 px-4 py-2"
          >
            <Ionicons name={addingSource ? 'close' : 'add'} size={18} color="#047857" />
            <Text className="text-sm font-bold text-emerald-800">
              {addingSource ? 'Close' : 'Add'}
            </Text>
          </Pressable>
        </View>

        {addingSource ? (
          <View className="mb-3 rounded-2xl border border-emerald-200 bg-white p-4">
            <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              Source type
            </Text>
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
                      active ? 'bg-emerald-100' : 'bg-slate-100'
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        active ? 'text-emerald-800' : 'text-slate-700'
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
              className="min-h-12 rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900"
            />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: fixedIncome }}
              onPress={() => setFixedIncome((value) => !value)}
              className="mt-4 min-h-12 flex-row items-center gap-3 rounded-xl bg-slate-50 px-3 py-2"
            >
              <View
                className={`h-5 w-5 items-center justify-center rounded border ${
                  fixedIncome ? 'border-emerald-700 bg-emerald-700' : 'border-slate-400 bg-white'
                }`}
              >
                {fixedIncome ? <Ionicons name="checkmark" size={14} color="#ffffff" /> : null}
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-slate-800">
                  Fixed income every month
                </Text>
                <Text className="mt-0.5 text-xs text-slate-500">
                  Add it as planned income until you confirm receipt.
                </Text>
              </View>
            </Pressable>
            <View className="mt-3 flex-row gap-3">
              <View className="flex-1">
                <Text className="mb-1 text-xs font-semibold text-slate-600">
                  {fixedIncome ? 'Monthly amount (XAF)' : 'Amount received (XAF, optional)'}
                </Text>
                <TextInput
                  accessibilityLabel={
                    fixedIncome ? 'Fixed monthly income amount in XAF' : 'Income amount in XAF'
                  }
                  value={fixedAmount}
                  onChangeText={setFixedAmount}
                  keyboardType="number-pad"
                  placeholder="Amount"
                  className="min-h-12 rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900"
                />
              </View>
              {fixedIncome ? (
                <View className="w-24">
                  <Text className="mb-1 text-xs font-semibold text-slate-600">Payday</Text>
                  <TextInput
                    accessibilityLabel="Monthly payday"
                    value={payday}
                    onChangeText={setPayday}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="1-31"
                    className="min-h-12 rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900"
                  />
                </View>
              ) : null}
            </View>
            {fixedIncome ? (
              <Text className="mt-2 text-xs text-slate-500">
                If a month is shorter, payday uses that month&apos;s last day.
              </Text>
            ) : null}
            <View className="mt-3">
              <Button label="Save source" onPress={addSource} />
            </View>
          </View>
        ) : null}

        {monthStreams.length === 0 ? (
          <View className="items-center rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6">
            <Ionicons name="wallet-outline" size={24} color="#047857" />
            <Text className="mt-3 text-sm font-semibold text-slate-700">
              No income recorded or planned for this month
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            {monthStreams.map((stream) => {
              const plan = plannedIncome.find((item) => item.stream.id === stream.id);
              return (
                <View key={stream.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${stream.name} for recording income`}
                    accessibilityState={{ selected: activeStreamId === stream.id }}
                    onPress={() => setSelectedStreamId(stream.id)}
                    className="min-h-11 flex-row items-center"
                  >
                    <View className="h-11 w-11 items-center justify-center rounded-xl bg-emerald-50">
                      <Ionicons name={kindIcons[stream.kind]} size={21} color="#047857" />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text numberOfLines={1} className="text-sm font-bold text-slate-900">
                        {stream.name}
                      </Text>
                      <Text className="mt-0.5 text-xs text-slate-500">
                        {kindLabels[stream.kind]}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-sm font-bold text-slate-900">
                        {formatXAF(streamTotals.get(stream.id) ?? 0)}
                      </Text>
                      <Text className="mt-0.5 text-[10px] font-semibold uppercase text-slate-500">
                        Received
                      </Text>
                    </View>
                  </Pressable>
                  {plan ? (
                    <View className="mt-3 rounded-xl bg-amber-50 p-3">
                      <View className="flex-1">
                        <Text className="text-xs font-semibold text-amber-900">
                          {plan.confirmed ? 'Monthly income confirmed' : 'Planned monthly income'}
                        </Text>
                        <Text className="mt-1 text-sm font-bold text-amber-900">
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
                              className="min-h-11 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900"
                            />
                            <TextInput
                              accessibilityLabel="Edit monthly payday"
                              value={planDay}
                              onChangeText={setPlanDay}
                              keyboardType="number-pad"
                              maxLength={2}
                              placeholder="Day"
                              className="min-h-11 w-20 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900"
                            />
                          </View>
                          <View className="mt-2 flex-row gap-2">
                            <View className="flex-1">
                              <Button label="Save plan" onPress={() => savePlanEdit(stream.id)} />
                            </View>
                            <View className="flex-1">
                              <Button
                                label="Cancel"
                                variant="outline"
                                onPress={() => setEditingPlanId(null)}
                              />
                            </View>
                          </View>
                          <Text className="mt-2 text-[11px] text-amber-800">
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
                            <View className="min-h-10 flex-row items-center gap-1 rounded-xl bg-emerald-100 px-3 py-2">
                              <Ionicons name="checkmark-circle" size={16} color="#047857" />
                              <Text className="text-xs font-bold text-emerald-800">Received</Text>
                            </View>
                          )}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Edit fixed income plan for ${stream.name}`}
                            onPress={() => startPlanEdit(stream.id)}
                            className="min-h-10 flex-row items-center gap-1 rounded-xl border border-amber-300 bg-white px-3 py-2"
                          >
                            <Ionicons name="pencil" size={14} color="#92400e" />
                            <Text className="text-xs font-bold text-amber-900">Edit plan</Text>
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

      {month === currentMonth ? (
        <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-4">
          <View className="mb-4 flex-row items-center">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
              <Ionicons name="add" size={24} color="#047857" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-lg font-bold text-slate-900">Record income</Text>
              <Text className="mt-0.5 text-sm text-slate-500">
                {activeStream ? `From ${activeStream.name}` : 'Select or add a source first'}
              </Text>
            </View>
          </View>
          {activeStream ? (
            <>
              <View className="mb-4 flex-row flex-wrap gap-2">
                {streams.map((stream) => {
                  const active = activeStreamId === stream.id;
                  return (
                    <Pressable
                      key={stream.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setSelectedStreamId(stream.id)}
                      className={`min-h-10 justify-center rounded-full px-3 py-2 ${
                        active ? 'bg-emerald-100' : 'bg-slate-100'
                      }`}
                    >
                      <Text
                        numberOfLines={1}
                        className={`max-w-40 text-xs font-semibold ${
                          active ? 'text-emerald-800' : 'text-slate-700'
                        }`}
                      >
                        {stream.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Amount in XAF
              </Text>
              <TextInput
                accessibilityLabel="Income amount in XAF"
                value={amount}
                onChangeText={setAmount}
                keyboardType="number-pad"
                placeholder="0"
                className="min-h-[68px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-3xl font-extrabold text-slate-900"
              />
              <TextInput
                accessibilityLabel="Income note"
                value={note}
                onChangeText={setNote}
                placeholder="Add a note (optional)"
                className="mt-3 min-h-12 rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900"
              />
              <Pressable
                accessibilityRole="button"
                disabled={!amount.trim()}
                onPress={recordIncome}
                className={`mt-4 min-h-12 flex-row items-center justify-center gap-2 rounded-2xl px-4 py-3 ${
                  amount.trim() ? 'bg-emerald-700' : 'bg-slate-300'
                }`}
              >
                <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                <Text className="text-base font-bold text-white">Save income</Text>
              </Pressable>
            </>
          ) : (
            <Text className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              Add an income source above before recording income.
            </Text>
          )}
        </View>
      ) : (
        <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
          <Text className="text-sm font-semibold text-slate-800">
            Manual income entries can be added in the current month.
          </Text>
          <Text className="mt-1 text-xs text-slate-500">
            You can still review this month&apos;s income and confirm scheduled income above.
          </Text>
        </View>
      )}

      <View className="mb-3 flex-row items-end justify-between">
        <View>
          <Text className="text-lg font-bold text-slate-900">Recent income</Text>
          <Text className="mt-0.5 text-sm text-slate-500">
            Latest entries for {monthLabel(month, 'short')}
          </Text>
        </View>
        <Text className="text-xs font-semibold text-slate-500">{entries.length} shown</Text>
      </View>
      {entries.length === 0 ? (
        <View className="items-center rounded-2xl border border-dashed border-slate-300 bg-white p-5">
          <Ionicons name="receipt-outline" size={26} color="#94a3b8" />
          <Text className="mt-2 text-sm font-semibold text-slate-700">No entries yet</Text>
          <Text className="mt-1 text-center text-xs text-slate-500">
            Recorded income will appear here.
          </Text>
        </View>
      ) : (
        <View className="gap-2">
          {entries.map((entry) => {
            const editing = editingEntryId === entry.id;
            return (
              <View key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <View className="flex-row items-center">
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                    <Ionicons
                      name={entry.kind ? kindIcons[entry.kind] : 'cash-outline'}
                      size={20}
                      color="#047857"
                    />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-bold text-slate-900">{entry.streamName}</Text>
                    <Text className="mt-1 text-xs text-slate-500">
                      {new Date(entry.occurredAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'Africa/Douala',
                      })}
                      {entry.note ? ` · ${entry.note}` : ''}
                    </Text>
                  </View>
                  <Text className="ml-2 text-sm font-bold text-emerald-700">
                    +{formatXAF(entry.amount)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit received income from ${entry.streamName}`}
                    onPress={() => (editing ? setEditingEntryId(null) : startEntryEdit(entry))}
                    className="ml-2 h-10 w-10 items-center justify-center rounded-full bg-slate-100"
                  >
                    <Ionicons name={editing ? 'close' : 'pencil'} size={17} color="#334155" />
                  </Pressable>
                </View>
                {editing ? (
                  <View className="mt-3 border-t border-slate-200 pt-3">
                    <Text className="mb-1 text-xs font-semibold text-slate-600">
                      Correct the received amount, date, or note
                    </Text>
                    <TextInput
                      accessibilityLabel="Edit received income amount"
                      value={entryAmount}
                      onChangeText={setEntryAmount}
                      keyboardType="number-pad"
                      placeholder="Amount in XAF"
                      className="mt-2 min-h-12 rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900"
                    />
                    <TextInput
                      accessibilityLabel="Edit received income date"
                      value={entryDate}
                      onChangeText={setEntryDate}
                      placeholder="YYYY-MM-DD"
                      className="mt-2 min-h-12 rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900"
                    />
                    <TextInput
                      accessibilityLabel="Edit received income note"
                      value={entryNote}
                      onChangeText={setEntryNote}
                      placeholder="Note (optional)"
                      className="mt-2 min-h-12 rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-900"
                    />
                    <View className="mt-3 flex-row gap-2">
                      <View className="flex-1">
                        <Button label="Save correction" onPress={() => saveEntryEdit(entry.id)} />
                      </View>
                      <View className="flex-1">
                        <Button
                          label="Cancel"
                          variant="outline"
                          onPress={() => setEditingEntryId(null)}
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
    </PageLayout>
  );
}
