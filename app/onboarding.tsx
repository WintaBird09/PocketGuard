import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { completeOnboardingWithoutPlan, loadSeedPlan } from '@/src/data/bootstrap';
import { openAppDatabase } from '@/src/data/db';
import { getActiveHouseholdId } from '@/src/data/household';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { Banner, Button } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';

export default function OnboardingScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (loadPlan: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const db = await openAppDatabase();
      const householdId = getActiveHouseholdId(db);
      const database = db as Parameters<typeof loadSeedPlan>[0];
      if (loadPlan) loadSeedPlan(database, householdId);
      else completeOnboardingWithoutPlan(database, householdId);
      scheduleNotificationRefresh();
      router.replace('/(tabs)');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to finish setup.');
      setBusy(false);
    }
  };

  return (
    <PageLayout title="Welcome" subtitle="Your household is ready. Choose how to start.">
      {error ? <Banner tone="error">{error}</Banner> : null}
      <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-5">
        <Text className="text-lg font-bold text-slate-900">Load my Sep–Dec 2026 plan</Text>
        <Text className="mt-1 mb-4 text-sm text-slate-600">
          Adds the budget lines, monthly amounts, debts and the 2,000,000 XAF savings goal from your
          workbook. Everything stays editable afterwards.
        </Text>
        <Button
          label="Load my Sep–Dec 2026 plan"
          disabled={busy}
          onPress={() => void finish(true)}
        />
      </View>
      <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-5">
        <Text className="text-lg font-bold text-slate-900">Start empty</Text>
        <Text className="mt-1 mb-4 text-sm text-slate-600">
          Begin with a Miscellaneous line and build your own plan in the Budget tab.
        </Text>
        <Button
          label="Start empty"
          variant="outline"
          disabled={busy}
          onPress={() => void finish(false)}
        />
      </View>
      <Text className="text-center text-sm text-slate-500">
        Want your data backed up?{' '}
        <Link href="/auth" className="font-bold text-slate-900">
          Sign in to sync
        </Link>{' '}
        — optional, the app works offline without it.
      </Text>
    </PageLayout>
  );
}
