import { Fragment, useEffect, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRootNavigationState, useRouter, useSegments } from 'expo-router';

import { scheduleNotificationRefresh } from '@/src/notifications/schedule';

import { useAuth } from './AuthProvider';
import { resolveAuthRedirect } from './guard';

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading, localDatabaseStatus, localDatabaseError, retryLocalDatabase } =
    useAuth();
  const router = useRouter();
  const segments = useSegments();
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const signedIn = session !== null;
  const userId = session?.user.id ?? null;
  const segmentKey = segments.join('/');

  useEffect(() => {
    if (loading || !navigationReady) return;
    const target = resolveAuthRedirect({
      segments: segmentKey ? segmentKey.split('/') : [],
      signedIn,
    });
    if (target) router.replace(target as Parameters<typeof router.replace>[0]);
  }, [loading, navigationReady, router, segmentKey, signedIn]);

  useEffect(() => {
    if (localDatabaseStatus === 'ready') scheduleNotificationRefresh();
  }, [localDatabaseStatus]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <Text className="text-base font-medium text-slate-600">Checking your sign-in…</Text>
      </View>
    );
  }

  if (signedIn && localDatabaseStatus === 'failed') {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 p-6">
        <Text className="text-center text-lg font-bold text-slate-900">
          Pocket Guard could not open your data
        </Text>
        <Text className="mt-2 text-center text-sm text-red-700">{localDatabaseError}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={retryLocalDatabase}
          className="mt-5 rounded-xl bg-emerald-600 px-5 py-3"
        >
          <Text className="font-bold text-white">Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (signedIn && localDatabaseStatus !== 'ready') {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <Text className="text-base font-medium text-slate-600">Preparing your household…</Text>
      </View>
    );
  }

  // Keyed by account so no screen or provider state survives a switch of user.
  return <Fragment key={userId ?? 'signed-out'}>{children}</Fragment>;
}
