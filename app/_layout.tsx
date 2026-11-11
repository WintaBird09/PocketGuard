import '../global.css';

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/src/auth/AuthProvider';
import { AuthGate } from '@/src/auth/AuthGate';
import { loadTimeTravelDate } from '@/src/dev/timeTravel';
import { AppLockProvider } from '@/src/security/AppLockProvider';
import { SyncProvider } from '@/src/sync/SyncProvider';
import { CurrencyProvider } from '@/src/ui/CurrencyProvider';
import { ThemeProvider, useAppTheme } from '@/src/ui/ThemeProvider';
import { VoiceDraftProvider } from '@/src/voice/VoiceDraftProvider';
import { getMomoNativeModule } from '@/src/momo/native';
import { processPendingAutoMomoSms } from '@/src/momo/autoImport';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';

function MomoIntentHandler() {
  const router = useRouter();

  useEffect(() => {
    const native = getMomoNativeModule();
    let active = true;
    const openSharedText = (text: string) => {
      if (active && text.trim()) {
        router.push(`/momo-import?sharedText=${encodeURIComponent(text)}`);
      }
    };
    const processPending = () => {
      void processPendingAutoMomoSms()
        .then((result) => {
          if (!active || result.count === 0) return;
          const transactionId = result.transactionIds[0];
          router.push(
            transactionId
              ? `/momo-review?transactionId=${encodeURIComponent(transactionId)}`
              : '/momo-review',
          );
        })
        .catch(() => {});
    };
    const sharedSubscription = native?.addListener('onSharedText', ({ text }) =>
      openSharedText(text),
    );
    const pendingSubscription = native?.addListener('onPendingSmsAvailable', processPending);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      scheduleNotificationRefresh();
      processPending();
    });
    if (native) {
      void native.getSharedText().then((text) => {
        if (text) openSharedText(text);
      });
    }
    scheduleNotificationRefresh();
    processPending();
    return () => {
      active = false;
      sharedSubscription?.remove();
      pendingSubscription?.remove();
      appStateSubscription.remove();
    };
  }, [router]);

  return null;
}

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
                  <MomoIntentHandler />
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
