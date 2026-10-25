import '../global.css';

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { AuthProvider } from '@/src/auth/AuthProvider';
import { initializeLocalApp } from '@/src/data/bootstrap';
import { openAppDatabase } from '@/src/data/db';
import { SyncProvider } from '@/src/sync/SyncProvider';
import { VoiceDraftProvider } from '@/src/voice/VoiceDraftProvider';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';

export default function RootLayout() {
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      setReady(false);
      setError(null);
      try {
        const database = await openAppDatabase();
        initializeLocalApp(database, { loadPlan: false });
        if (!active) return;
        setReady(true);
        scheduleNotificationRefresh();
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : 'Unable to initialize the local app.');
      }
    };

    void initialize();
    return () => {
      active = false;
    };
  }, [attempt]);

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 p-6">
        <Text className="text-center text-lg font-bold text-slate-900">
          Pocket Guard could not start
        </Text>
        <Text className="mt-2 text-center text-sm text-red-700">{error}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setAttempt((current) => current + 1)}
          className="mt-5 rounded-xl bg-emerald-600 px-5 py-3"
        >
          <Text className="font-bold text-white">Try again</Text>
        </Pressable>
      </View>
    );
  }

  return ready ? (
    <AuthProvider>
      <SyncProvider>
        <VoiceDraftProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </VoiceDraftProvider>
      </SyncProvider>
    </AuthProvider>
  ) : (
    <View className="flex-1 items-center justify-center bg-slate-50">
      <Text className="text-base font-medium text-slate-600">Preparing your household…</Text>
    </View>
  );
}
