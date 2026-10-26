import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { getLocalDateOverride, setLocalDateOverride } from '../domain/dates';

const timeTravelStorageKey = 'pocket-guard.dev-effective-date';

export async function loadTimeTravelDate(): Promise<string | null> {
  if (!__DEV__) {
    setLocalDateOverride(null);
    return null;
  }
  if (Platform.OS === 'web') return getLocalDateOverride();

  const saved = await SecureStore.getItemAsync(timeTravelStorageKey);
  setLocalDateOverride(saved);
  return saved;
}

export async function saveTimeTravelDate(value: string | null): Promise<void> {
  if (!__DEV__) throw new Error('Time travel is only available in development builds.');
  const previous = getLocalDateOverride();
  setLocalDateOverride(value);
  try {
    if (Platform.OS !== 'web') {
      if (value === null) await SecureStore.deleteItemAsync(timeTravelStorageKey);
      else await SecureStore.setItemAsync(timeTravelStorageKey, value);
    }
  } catch (cause) {
    setLocalDateOverride(previous);
    throw cause;
  }
}
