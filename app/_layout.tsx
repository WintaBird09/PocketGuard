import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/src/auth/AuthProvider';
import { AuthGate } from '@/src/auth/AuthGate';
import { loadTimeTravelDate } from '@/src/dev/timeTravel';
import { AppLockProvider } from '@/src/security/AppLockProvider';
import { SyncProvider } from '@/src/sync/SyncProvider';
import { CurrencyProvider } from '@/src/ui/CurrencyProvider';
import { ThemeProvider, useAppTheme } from '@/src/ui/ThemeProvider';
import { VoiceDraftProvider } from '@/src/voice/VoiceDraftProvider';

function ThemedStatusBar() {
  const { scheme } = useAppTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  useEffect(() => {
    if (__DEV__) void loadTimeTravelDate();
  }, []);

  return (
    <ThemeProvider>
      <ThemedStatusBar />
      <CurrencyProvider>
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
      </CurrencyProvider>
    </ThemeProvider>
  );
}
