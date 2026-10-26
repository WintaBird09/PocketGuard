import { AppState, Text, View } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { Banner, Button } from '@/src/ui/controls';

import { authenticateOnDevice, getAppLockEnabled, setAppLockEnabled } from './appLock';

type AppLockContextValue = {
  enabled: boolean;
  loading: boolean;
  error: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
};

const AppLockContext = createContext<AppLockContextValue>({
  enabled: false,
  loading: true,
  error: null,
  enable: async () => {},
  disable: async () => {},
});

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unlock = useCallback(async () => {
    setError(null);
    const result = await authenticateOnDevice('Unlock Pocket Guard');
    if (result.ok) {
      setLocked(false);
      return;
    }
    setLocked(true);
    setError(result.message);
  }, []);

  useEffect(() => {
    let active = true;
    void getAppLockEnabled()
      .then((isEnabled) => {
        if (!active) return;
        setEnabled(isEnabled);
        setLocked(isEnabled);
        if (isEnabled) void unlock();
        else setLocked(false);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load app lock.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [unlock]);

  useEffect(() => {
    if (!enabled) return;
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        setLocked(true);
      } else if (previousState !== 'active') {
        void unlock();
      }
      previousState = nextState;
    });
    return () => subscription.remove();
  }, [enabled, unlock]);

  const enable = useCallback(async () => {
    setError(null);
    const result = await authenticateOnDevice('Enable Pocket Guard app lock');
    if (!result.ok) {
      setError(result.message);
      throw new Error(result.message);
    }
    await setAppLockEnabled(true);
    setEnabled(true);
    setLocked(false);
  }, []);

  const disable = useCallback(async () => {
    setError(null);
    await setAppLockEnabled(false);
    setEnabled(false);
    setLocked(false);
  }, []);

  const value = useMemo(
    () => ({ enabled, loading, error, enable, disable }),
    [disable, enable, enabled, error, loading],
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 p-6">
        <Text className="text-base text-slate-700">Checking app lock…</Text>
      </View>
    );
  }
  if (error && !enabled) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 p-6">
        <Text className="text-xl font-bold text-slate-900">App security unavailable</Text>
        <Banner tone="error">{error}</Banner>
      </View>
    );
  }
  if (locked) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 p-6">
        <Text className="mb-2 text-2xl font-bold text-slate-900">Pocket Guard is locked</Text>
        <Text className="mb-5 text-center text-base text-slate-600">
          Unlock with your device biometrics or passcode to continue.
        </Text>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <View className="w-full">
          <Button label="Unlock" onPress={() => void unlock()} />
        </View>
      </View>
    );
  }

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock(): AppLockContextValue {
  return useContext(AppLockContext);
}
