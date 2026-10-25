import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type AuthResult = { ok: true } | { ok: false; message: string };

// Fails closed: an override is never allowed without a successful device biometric/PIN check.
export async function authenticateForOverride(): Promise<AuthResult> {
  if (Platform.OS === 'web') {
    return { ok: false, message: 'Overrides need a phone with a fingerprint or PIN.' };
  }
  try {
    const [hasHardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (!hasHardware || !enrolled) {
      return {
        ok: false,
        message: 'Set up a fingerprint or screen lock PIN on this device to use overrides.',
      };
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm to override the budget cap',
    });
    return result.success ? { ok: true } : { ok: false, message: 'Authentication was cancelled.' };
  } catch {
    return { ok: false, message: 'Authentication is unavailable right now.' };
  }
}
