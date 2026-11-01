import { useEffect, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useRootNavigationState, useRouter, useSegments } from 'expo-router';

import { needsOnboarding } from '@/src/data/bootstrap';
import { openAppDatabase } from '@/src/data/db';
import { getActiveHouseholdId } from '@/src/data/household';

import { useAuth } from './AuthProvider';
import { resolveAuthRedirect } from './guard';

async function isOnboardingPending(): Promise<boolean> {
  try {
    const db = await openAppDatabase();
    return needsOnboarding(db, getActiveHouseholdId(db));
  } catch {
    return false;
  }
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const signedIn = session !== null;
  const segmentKey = segments.join('/');

  useEffect(() => {
    if (loading || !navigationReady) return;
    let active = true;

    void (async () => {
      const onboardingPending = signedIn ? false : await isOnboardingPending();
      if (!active) return;
      const target = resolveAuthRedirect({
        segments: segmentKey ? segmentKey.split('/') : [],
        signedIn,
        onboardingPending,
      });
      if (target) router.replace(target as Parameters<typeof router.replace>[0]);
    })();

    return () => {
      active = false;
    };
  }, [loading, navigationReady, router, segmentKey, signedIn]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <Text className="text-base font-medium text-slate-600">Checking your sign-in…</Text>
      </View>
    );
  }

  return <>{children}</>;
}
