import { Ionicons } from '@expo/vector-icons';
import { colorScheme, cssInterop } from 'nativewind';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState, useColorScheme as useSystemScheme } from 'react-native';

import { deviceKeyValueStore } from '../data/deviceKeyValueStore';
import {
  defaultThemePreference,
  parseThemePreference,
  resolveScheme,
  themePreferenceKey,
} from './themePreference';
import type { ColorSchemeName, ThemePreference } from './themePreference';

// Lets icons take their colour from text-* classes so they follow the active scheme.
cssInterop(Ionicons, { className: { target: 'style', nativeStyleToProp: { color: true } } });

type ThemeContextValue = {
  preference: ThemePreference;
  scheme: ColorSchemeName;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  preference: defaultThemePreference,
  scheme: 'light',
  setPreference: () => undefined,
});

export function useAppTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemScheme() === 'dark' ? 'dark' : 'light';
  const [preference, setPreferenceState] = useState(defaultThemePreference);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let active = true;
    void deviceKeyValueStore
      .get(themePreferenceKey)
      .then((raw) => {
        if (active) setPreferenceState(parseThemePreference(raw));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Re-evaluate the schedule every minute and whenever the app returns to the foreground.
  useEffect(() => {
    if (preference.mode !== 'schedule') return undefined;
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [preference.mode]);

  const scheme = resolveScheme(preference, now) ?? systemScheme;

  useEffect(() => {
    colorScheme.set(scheme);
  }, [scheme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    setNow(new Date());
    void deviceKeyValueStore.set(themePreferenceKey, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ preference, scheme, setPreference }),
    [preference, scheme, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
