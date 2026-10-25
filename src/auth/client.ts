import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const webStorage = {
  getItem: async (key: string) => {
    if (typeof localStorage === 'undefined') {
      throw new Error('Browser storage is unavailable.');
    }
    return localStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (typeof localStorage === 'undefined') {
      throw new Error('Browser storage is unavailable.');
    }
    localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof localStorage === 'undefined') {
      throw new Error('Browser storage is unavailable.');
    }
    localStorage.removeItem(key);
  },
};

const secureSessionStorage =
  Platform.OS === 'web'
    ? webStorage
    : {
        getItem: SecureStore.getItemAsync,
        setItem: SecureStore.setItemAsync,
        removeItem: SecureStore.deleteItemAsync,
      };

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: 'pkce',
          persistSession: true,
          storage: secureSessionStorage,
        },
      })
    : null;

export const authConfigurationError =
  supabase === null
    ? 'Authentication is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart the app.'
    : null;
