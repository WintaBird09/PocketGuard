import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
const localAuthentication = vi.hoisted(() => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: vi.fn(),
  authenticateAsync: vi.fn(),
}));

vi.mock('expo-secure-store', () => secureStore);
vi.mock('expo-local-authentication', () => localAuthentication);
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import {
  authenticateForOverride,
  authenticateOnDevice,
  getAppLockEnabled,
  setAppLockEnabled,
} from './appLock';

describe('device app lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores the opt-in app lock locally', async () => {
    secureStore.getItemAsync.mockResolvedValue('true');
    await expect(getAppLockEnabled()).resolves.toBe(true);
    await setAppLockEnabled(true);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith('pocket-guard.app-lock-enabled', 'true');
    await setAppLockEnabled(false);
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('pocket-guard.app-lock-enabled');
  });

  it('uses device passcode fallback for app lock and spend overrides', async () => {
    localAuthentication.getEnrolledLevelAsync.mockResolvedValue(1);
    localAuthentication.authenticateAsync.mockResolvedValue({ success: true });

    await expect(authenticateOnDevice('Unlock Pocket Guard')).resolves.toEqual({ ok: true });
    await expect(authenticateForOverride()).resolves.toEqual({ ok: true });
    expect(localAuthentication.authenticateAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        promptMessage: 'Unlock Pocket Guard',
        disableDeviceFallback: false,
      }),
    );
    expect(localAuthentication.authenticateAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ promptMessage: 'Confirm to override the budget cap' }),
    );
  });

  it('fails closed when no device authentication is enrolled', async () => {
    localAuthentication.getEnrolledLevelAsync.mockResolvedValue(0);

    await expect(authenticateOnDevice('Unlock Pocket Guard')).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining('Set up'),
    });
    expect(localAuthentication.authenticateAsync).not.toHaveBeenCalled();
  });

  it('reports secure storage failures rather than enabling an unpersisted lock', async () => {
    secureStore.setItemAsync.mockRejectedValue(new Error('Secure storage unavailable'));

    await expect(setAppLockEnabled(true)).rejects.toThrow('Secure storage unavailable');
  });
});
