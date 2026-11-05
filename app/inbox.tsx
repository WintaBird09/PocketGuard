import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';

import { classifyInboxItem, discardInboxItem, listInbox } from '@/src/data/inbox';
import { getMonthPlan } from '@/src/data/plan';
import { effectiveNow, localDateString, monthKeyForDate } from '@/src/domain/dates';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { listPendingVoiceSavingsCommitments } from '@/src/voice/commitments';
import { VoiceConfirmCard } from '@/src/voice/VoiceConfirmCard';
import { useVoiceDraftStatus } from '@/src/voice/VoiceDraftProvider';
import { useDatabase } from '@/src/ui/useDatabase';
import { Banner, Button } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { getCurrencyCode } from '@/src/domain/currency';

type Filter = 'all' | 'voice' | 'unassigned';

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'slate' | 'emerald' | 'amber';
}) {
  const color =
    tone === 'emerald' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-300' : 'text-white';
  return (
    <View className="flex-1 rounded-2xl bg-white/10 p-3">
      <Text className="text-[11px] font-semibold uppercase text-slate-400">{label}</Text>
      <Text className={`mt-1 text-2xl font-extrabold ${color}`}>{value}</Text>
    </View>
  );
}

export default function InboxScreen() {
  const { db, householdId, loading, error: dbError, tick, refresh } = useDatabase();
  const voiceDraftStatus = useVoiceDraftStatus();
  const [openId, setOpenId] = useState<string | null>(null);
  const [lineId, setLineId] = useState('');
  const [amount, setAmount] = useState('');
  const [warnId, setWarnId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [discardId, setDiscardId] = useState<string | null>(null);

  const loaded = useMemo(() => {
    if (!db || !householdId) return { data: null, failure: null };
    try {
      return {
        data: {
          items: listInbox(db, householdId),
          lines: getMonthPlan(db, householdId, monthKeyForDate(effectiveNow(), 'Africa/Douala'))
            .lines,
          commitments: listPendingVoiceSavingsCommitments(
            db,
            householdId,
            monthKeyForDate(effectiveNow(), 'Africa/Douala'),
          ),
        },
        failure: null,
      };
    } catch (cause) {
      return {
        data: null,
        failure: cause instanceof Error ? cause.message : 'Unable to load the inbox.',
      };
    }
    // tick re-reads after writes or when the screen regains focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, householdId, tick, voiceDraftStatus.revision]);

  const failure = dbError ?? loaded.failure;
  const data = loaded.data;

  const classify = (id: string) => {
    if (!db) return;
    setError(null);
    setMessage(null);
    try {
      const result = classifyInboxItem(
        db,
        householdId,
        id,
        { lineId, amount: Number(amount.replace(/[\s,]/g, '')), occurredOn: localDateString() },
        warnId === id,
      );
      if (!result.saved) {
        if (result.reason === 'confirmation-required') {
          setWarnId(id);
          setMessage(`${result.review.result.reason} Press Save again to confirm.`);
        } else {
          setMessage(
            `Blocked: ${result.review.result.reason} Use Add transaction to override with a reason.`,
          );
        }
        return;
      }
      setOpenId(null);
      setWarnId(null);
      setMessage('Entry classified and saved.');
      scheduleNotificationRefresh();
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to classify this entry.');
    }
  };

  const items = data?.items ?? [];
  const voiceCount = items.filter((item) => item.voiceSuggestion).length;
  const draftCount = items.filter((item) => item.kind === 'draft').length;
  const unassignedCount = items.filter((item) => item.kind === 'unassigned').length;
  const visible = items.filter((item) =>
    filter === 'voice'
      ? Boolean(item.voiceSuggestion)
      : filter === 'unassigned'
        ? item.kind === 'unassigned'
        : true,
  );
  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: items.length },
    { key: 'voice', label: 'Voice notes', count: voiceCount },
    { key: 'unassigned', label: 'No budget line', count: unassignedCount },
  ];

  const startClassify = (id: string, amountValue: number | null) => {
    setOpenId(id);
    setAmount(amountValue ? String(amountValue) : '');
    setLineId('');
    setWarnId(null);
  };

  return (
    <PageLayout
      title="Inbox"
      subtitle="Drafts and entries waiting for a budget line"
      loading={loading}
    >
      {failure ? <Banner tone="error">{failure}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="info">{message}</Banner> : null}
      {voiceDraftStatus.error ? (
        <Banner tone="error">
          Automatic voice parsing failed: {voiceDraftStatus.error}. Drafts remain available below.
        </Banner>
      ) : null}
      {voiceDraftStatus.processing ? (
        <Banner tone="info">Parsing queued voice notes…</Banner>
      ) : null}

      <View className="mb-5 rounded-3xl bg-slate-900 p-4 dark:bg-slate-800">
        <Text className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Waiting for you
        </Text>
        <Text className="mt-1 text-3xl font-extrabold text-white">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </Text>
        <View className="mt-4 flex-row gap-3">
          <StatTile label="Voice ready" value={voiceCount} tone="emerald" />
          <StatTile label="Drafts" value={draftCount} tone="slate" />
          <StatTile label="No line" value={unassignedCount} tone="amber" />
        </View>
      </View>

      {items.length > 0 ? (
        <View className="mb-4 flex-row flex-wrap gap-2">
          {filters.map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(item.key)}
                className={`min-h-10 flex-row items-center gap-2 rounded-full border px-4 py-2 ${
                  active
                    ? 'border-slate-900 bg-slate-900 dark:bg-slate-700'
                    : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${active ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}
                >
                  {item.label}
                </Text>
                <View
                  className={`min-w-5 items-center rounded-full px-1.5 ${active ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'}`}
                >
                  <Text
                    className={`text-xs font-bold ${active ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}
                  >
                    {item.count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {data && items.length === 0 ? (
        <View className="items-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-10 dark:border-slate-600 dark:bg-slate-900">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
            <Ionicons
              name="checkmark-done"
              size={32}
              className="text-emerald-700 dark:text-emerald-400"
            />
          </View>
          <Text className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">
            You&apos;re all caught up
          </Text>
          <Text className="mt-1 text-center text-sm text-slate-600 dark:text-slate-300">
            Nothing is waiting. Voice drafts saved while offline will appear here.
          </Text>
        </View>
      ) : null}

      {data && items.length > 0 && visible.length === 0 ? (
        <Text className="text-center text-sm text-slate-600 dark:text-slate-300">
          No items match this filter.
        </Text>
      ) : null}

      {visible.map((item) =>
        item.voiceSuggestion &&
        db &&
        !(item.voiceSuggestion.intent === 'unknown' && openId === item.id) ? (
          <View key={item.id}>
            <VoiceConfirmCard
              item={item.voiceSuggestion}
              lines={data?.lines ?? []}
              commitments={data?.commitments ?? []}
              db={db}
              householdId={householdId}
              rawText={item.text}
              draftId={item.id}
              onDone={refresh}
            />
            {item.voiceSuggestion.intent === 'unknown' ? (
              <View className="-mt-3 mb-4">
                <Button
                  label="Classify manually"
                  onPress={() => startClassify(item.id, item.amount)}
                />
              </View>
            ) : null}
          </View>
        ) : (
          <View
            key={item.id}
            className="mb-3 overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
          >
            <View className={`h-1 ${item.kind === 'draft' ? 'bg-indigo-400' : 'bg-amber-400'}`} />
            <View className="p-4">
              <View className="flex-row items-start gap-3">
                <View
                  className={`h-11 w-11 items-center justify-center rounded-2xl ${
                    item.kind === 'draft'
                      ? 'bg-indigo-100 dark:bg-indigo-900/40'
                      : 'bg-amber-100 dark:bg-amber-900/40'
                  }`}
                >
                  <Ionicons
                    name={item.kind === 'draft' ? 'mic-outline' : 'help-circle-outline'}
                    size={22}
                    className={
                      item.kind === 'draft'
                        ? 'text-indigo-700 dark:text-indigo-300'
                        : 'text-amber-700 dark:text-amber-400'
                    }
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {item.text}
                  </Text>
                  <View className="mt-2 flex-row flex-wrap items-center gap-2">
                    <View
                      className={`rounded-full px-2.5 py-0.5 ${
                        item.kind === 'draft'
                          ? 'bg-indigo-100 dark:bg-indigo-900/40'
                          : 'bg-amber-100 dark:bg-amber-900/40'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          item.kind === 'draft'
                            ? 'text-indigo-700 dark:text-indigo-300'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {item.kind === 'draft' ? 'Pending draft' : 'No budget line'}
                      </Text>
                    </View>
                    <Text className="text-xs text-slate-500 dark:text-slate-400">
                      {item.occurredAt.slice(0, 10)}
                    </Text>
                  </View>
                </View>
                {item.amount ? (
                  <Text className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    {formatXAF(item.amount)}
                  </Text>
                ) : null}
              </View>

              {openId === item.id ? (
                <View className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <Text className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Amount ({getCurrencyCode()})
                  </Text>
                  <TextInput
                    accessibilityLabel="Amount"
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                    value={amount}
                    onChangeText={(value) => {
                      setAmount(value);
                      setWarnId(null);
                    }}
                    className="mb-4 min-h-12 rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <Text className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Budget line
                  </Text>
                  <View className="mb-4 gap-2">
                    {(data?.lines ?? [])
                      .filter((line) => !line.archived)
                      .map((line) => {
                        const active = lineId === line.id;
                        const left = line.planned - line.spent;
                        return (
                          <Pressable
                            key={line.id}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: active }}
                            onPress={() => {
                              setLineId(line.id);
                              setWarnId(null);
                            }}
                            className={`min-h-12 flex-row items-center justify-between rounded-xl border px-3 py-2.5 ${
                              active
                                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30'
                                : 'border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            <View className="flex-1 flex-row items-center gap-2">
                              <Ionicons
                                name={active ? 'radio-button-on' : 'radio-button-off'}
                                size={18}
                                className={
                                  active ? 'text-emerald-600' : 'text-slate-400 dark:text-slate-500'
                                }
                              />
                              <Text
                                numberOfLines={1}
                                className="flex-1 font-semibold text-slate-900 dark:text-slate-100"
                              >
                                {line.name}
                              </Text>
                            </View>
                            <Text
                              className={`text-xs font-semibold ${
                                left < 0
                                  ? 'text-red-700 dark:text-red-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {left < 0 ? 'Over ' : 'Left '}
                              {formatXAF(Math.abs(left))}
                            </Text>
                          </Pressable>
                        );
                      })}
                  </View>
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Button label="Cancel" variant="outline" onPress={() => setOpenId(null)} />
                    </View>
                    <View className="flex-1">
                      <Button
                        label={warnId === item.id ? 'Save anyway' : 'Save'}
                        disabled={!lineId}
                        onPress={() => classify(item.id)}
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <View className="mt-4 flex-row gap-2">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => startClassify(item.id, item.amount)}
                    className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2"
                  >
                    <Ionicons name="pricetag-outline" size={16} color="#ffffff" />
                    <Text className="font-bold text-white">Classify</Text>
                  </Pressable>
                  {item.kind === 'draft' ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => voiceDraftStatus.retry()}
                      className="min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800"
                    >
                      <Ionicons
                        name="refresh"
                        size={16}
                        className="text-slate-700 dark:text-slate-200"
                      />
                      <Text className="font-bold text-slate-700 dark:text-slate-200">Retry</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={discardId === item.id ? 'Confirm discard' : 'Discard'}
                    onPress={() => {
                      if (discardId !== item.id) {
                        setDiscardId(item.id);
                        return;
                      }
                      if (db) {
                        discardInboxItem(db, householdId, item.id);
                        setDiscardId(null);
                        refresh();
                      }
                    }}
                    className={`min-h-11 flex-row items-center justify-center gap-1.5 rounded-xl px-3 py-2 ${
                      discardId === item.id ? 'flex-1 bg-red-600' : 'bg-red-50 dark:bg-red-900/30'
                    }`}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={16}
                      className={
                        discardId === item.id ? 'text-white' : 'text-red-700 dark:text-red-400'
                      }
                    />
                    <Text
                      className={`font-bold ${discardId === item.id ? 'text-white' : 'text-red-700 dark:text-red-400'}`}
                    >
                      {discardId === item.id ? 'Tap again to discard' : 'Discard'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        ),
      )}
    </PageLayout>
  );
}
