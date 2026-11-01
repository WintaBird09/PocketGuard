import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { getLendingCap, setLendingCap } from '@/src/data/lendingCap';
import { Banner, Button } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';
import { formatXAF } from '@/src/ui/theme';
import { useDatabase } from '@/src/ui/useDatabase';

export default function LendingCapScreen() {
  const router = useRouter();
  const { db, householdId, loading, error: dbError } = useDatabase();
  const [input, setInput] = useState('');
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cap = useMemo(
    () => (db && householdId ? getLendingCap(db, householdId) : null),
    // version re-reads after the cap is saved
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, householdId, version],
  );

  const save = (value: number | null) => {
    if (!db || !householdId) return;
    setError(null);
    try {
      setLendingCap(db, householdId, value);
      setInput('');
      setVersion((current) => current + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the cap.');
    }
  };

  const failure = dbError ?? error;

  return (
    <PageLayout
      loading={loading}
      title="Lending cap"
      subtitle="Limit how much you lend out in a month."
    >
      {failure ? <Banner tone="error">{failure}</Banner> : null}
      <View className="rounded-2xl border border-slate-200 bg-white p-4">
        <Text className="text-base font-bold text-slate-900">Monthly lending cap</Text>
        <Text className="mt-1 text-sm text-slate-600">
          {cap === null
            ? 'Off. Turn it on to stop new loans above a monthly total.'
            : `On: ${formatXAF(cap)} per month. Loans above it are blocked.`}
        </Text>
        <TextInput
          accessibilityLabel="Lending cap"
          placeholder="Cap in XAF"
          keyboardType="number-pad"
          value={input}
          onChangeText={setInput}
          className="mt-3 min-h-12 rounded-xl border border-slate-200 px-3 py-3 text-base"
        />
        <View className="mt-3 flex-row gap-3">
          <View className="flex-1">
            <Button
              label="Set cap"
              onPress={() => {
                const value = Number(input.replace(/[\s,]/g, ''));
                if (!Number.isInteger(value) || value <= 0) {
                  setError('Enter the cap as a whole number of XAF.');
                  return;
                }
                save(value);
              }}
            />
          </View>
          {cap !== null ? (
            <View className="flex-1">
              <Button label="Turn off" variant="outline" onPress={() => save(null)} />
            </View>
          ) : null}
        </View>
        <View className="mt-3">
          <Button label="Back to loans" variant="outline" onPress={() => router.back()} />
        </View>
      </View>
    </PageLayout>
  );
}
