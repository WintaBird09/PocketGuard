import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const appLockEnabledKey = 'pocket-guard.app-lock-enabled';

export type AuthResult = { ok: true } | { ok: false; message: string };

export async function isDeviceAuthenticationAvailable(): Promise<boolean> {
  return (
    Platform.OS !== 'web' &&
    (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE
  );
}

export async function authenticateOnDevice(promptMessage: string): Promise<AuthResult> {
  if (Platform.OS === 'web') {
    return { ok: false, message: 'Device authentication is available in the mobile app only.' };
  }
  try {
    if (!(await isDeviceAuthenticationAvailable())) {
      return {
        ok: false,
        message: 'Set up a fingerprint, face unlock, or device PIN to use this feature.',
      };
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      disableDeviceFallback: false,
      fallbackLabel: 'Use device passcode',
    });
    return result.success ? { ok: true } : { ok: false, message: 'Authentication was cancelled.' };
  } catch {
    return { ok: false, message: 'Device authentication is unavailable right now.' };
  }
}

export async function getAppLockEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return (await SecureStore.getItemAsync(appLockEnabledKey)) === 'true';
}

export async function setAppLockEnabled(enabled: boolean): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('App lock is available in the mobile app only.');
  }
  if (enabled) {
    await SecureStore.setItemAsync(appLockEnabledKey, 'true');
  } else {
    await SecureStore.deleteItemAsync(appLockEnabledKey);
  }
}

export async function authenticateForOverride(): Promise<AuthResult> {
  return authenticateOnDevice('Confirm to override the budget cap');
}
