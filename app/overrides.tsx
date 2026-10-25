import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { listOverrides } from '@/src/data/activity';
import { Banner } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';

export default function OverridesScreen() {
  const { db, householdId, error: dbError, tick } = useDatabase();
  const loaded = useMemo(() => {
    if (!db || !householdId) return { data: null, failure: null };
    try {
      return { data: listOverrides(db, householdId), failure: null };
    } catch (cause) {
      return { data: null, failure: cause instanceof Error ? cause.message : 'Unable to load.' };
    }
    // tick re-reads when the screen regains focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, householdId, tick]);
  const failure = dbError ?? loaded.failure;

  return (
    <PageLayout title="Overrides" subtitle="Hard-cap overspends you approved, with your reason">
      {failure ? <Banner tone="error">{failure}</Banner> : null}
      {loaded.data && loaded.data.length === 0 ? (
        <Text className="text-sm text-slate-600">No overrides recorded.</Text>
      ) : null}
      {(loaded.data ?? []).map((item) => (
        <View key={item.id} className="mb-3 rounded-2xl border border-red-300 bg-white p-4">
          <View className="flex-row justify-between">
            <Text className="text-base font-bold text-slate-900">{item.lineName ?? 'No line'}</Text>
            <Text className="text-base font-bold text-slate-900">-{formatXAF(item.amount)}</Text>
          </View>
          <Text className="mt-1 text-sm text-slate-500">
            {new Date(item.occurredAt).toLocaleDateString('en-GB')}
            {item.note ? ` · ${item.note}` : ''}
          </Text>
          <Text className="mt-2 text-sm text-red-700">Reason: {item.overrideReason}</Text>
        </View>
      ))}
    </PageLayout>
  );
}
