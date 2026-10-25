import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { classifyInboxItem, discardInboxItem, listInbox } from '@/src/data/inbox';
import { getMonthPlan } from '@/src/data/plan';
import { monthKeyForDate } from '@/src/domain/dates';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { Banner, Button, Chip } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';

function today(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

export default function InboxScreen() {
  const { db, householdId, error: dbError, tick, refresh } = useDatabase();
  const [openId, setOpenId] = useState<string | null>(null);
  const [lineId, setLineId] = useState('');
  const [amount, setAmount] = useState('');
  const [warnId, setWarnId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loaded = useMemo(() => {
    if (!db || !householdId) return { data: null, failure: null };
    try {
      return {
        data: {
          items: listInbox(db, householdId),
          lines: getMonthPlan(db, householdId, monthKeyForDate(new Date(), 'Africa/Douala')).lines,
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
  }, [db, householdId, tick]);

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
        { lineId, amount: Number(amount.replace(/[\s,]/g, '')), occurredOn: today() },
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

  return (
    <PageLayout title="Inbox" subtitle="Drafts and entries waiting for a budget line">
      {failure ? <Banner tone="error">{failure}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="info">{message}</Banner> : null}

      {data && data.items.length === 0 ? (
        <Text className="text-sm text-slate-600">
          Nothing is waiting. Voice drafts saved while offline will appear here.
        </Text>
      ) : null}

      {(data?.items ?? []).map((item) => (
        <View key={item.id} className="mb-3 rounded-2xl border border-slate-200 bg-white p-4">
          <Text className="text-base font-semibold text-slate-900">{item.text}</Text>
          <Text className="mt-1 text-sm text-slate-500">
            {item.kind === 'draft' ? 'Pending draft' : 'No budget line'}
            {item.amount ? ` · ${formatXAF(item.amount)}` : ''}
          </Text>
          {openId === item.id ? (
            <View className="mt-3">
              <TextInput
                accessibilityLabel="Amount"
                keyboardType="number-pad"
                value={amount}
                onChangeText={(value) => {
                  setAmount(value);
                  setWarnId(null);
                }}
                className="mb-2 rounded-xl border border-slate-200 px-3 py-2 text-base"
              />
              <View className="mb-3 flex-row flex-wrap gap-2">
                {(data?.lines ?? []).map((line) => (
                  <Chip
                    key={line.id}
                    label={line.name}
                    active={lineId === line.id}
                    onPress={() => {
                      setLineId(line.id);
                      setWarnId(null);
                    }}
                  />
                ))}
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button label="Cancel" variant="outline" onPress={() => setOpenId(null)} />
                </View>
                <View className="flex-1">
                  <Button label="Save" disabled={!lineId} onPress={() => classify(item.id)} />
                </View>
              </View>
            </View>
          ) : (
            <View className="mt-3 flex-row gap-3">
              <View className="flex-1">
                <Button
                  label="Classify"
                  onPress={() => {
                    setOpenId(item.id);
                    setAmount(item.amount ? String(item.amount) : '');
                    setLineId('');
                    setWarnId(null);
                  }}
                />
              </View>
              <View className="flex-1">
                <Button
                  label="Discard"
                  variant="outline"
                  onPress={() => {
                    if (db) {
                      discardInboxItem(db, householdId, item.id);
                      refresh();
                    }
                  }}
                />
              </View>
            </View>
          )}
        </View>
      ))}
    </PageLayout>
  );
}
