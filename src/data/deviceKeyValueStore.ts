import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { KeyValueStore } from './activeDatabase';

const webStore: KeyValueStore = {
  get: async (key) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
  set: async (key, value) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
};

export const deviceKeyValueStore: KeyValueStore =
  Platform.OS === 'web'
    ? webStore
    : {
        get: (key) => SecureStore.getItemAsync(key),
        set: (key, value) => SecureStore.setItemAsync(key, value),
      };
