import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';

import { AuthProvider } from '@/src/auth/AuthProvider';
import { AuthGate } from '@/src/auth/AuthGate';
import { loadTimeTravelDate } from '@/src/dev/timeTravel';
import { AppLockProvider } from '@/src/security/AppLockProvider';
import { SyncProvider } from '@/src/sync/SyncProvider';
import { VoiceDraftProvider } from '@/src/voice/VoiceDraftProvider';

export default function RootLayout() {
  useEffect(() => {
    if (__DEV__) void loadTimeTravelDate();
  }, []);

  return (
    <AuthProvider>
      <AppLockProvider>
        <AuthGate>
          <SyncProvider>
            <VoiceDraftProvider>
              <Stack screenOptions={{ headerShown: false }} />
            </VoiceDraftProvider>
          </SyncProvider>
        </AuthGate>
      </AppLockProvider>
    </AuthProvider>
  );
}
