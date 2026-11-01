import { describe, expect, it } from 'vitest';

import { resolveAuthRedirect } from './guard';

const out = { signedIn: false, profileComplete: false };

describe('resolveAuthRedirect', () => {
  it('sends signed-out users to login from every protected route, including onboarding', () => {
    for (const segments of [
      [],
      ['(tabs)'],
      ['(tabs)', 'budget'],
      ['settings'],
      ['onboarding'],
      ['auth'],
      ['voice'],
    ]) {
      expect(resolveAuthRedirect({ ...out, segments })).toBe('/login');
    }
  });

  it('lets signed-out users reach login, signup and the sign-in callback', () => {
    for (const segments of [['login'], ['signup'], ['auth', 'callback']]) {
      expect(resolveAuthRedirect({ ...out, segments })).toBeNull();
    }
  });

  it('allows signed-in users everywhere except the login screens', () => {
    const signedIn = { signedIn: true, profileComplete: true };
    expect(resolveAuthRedirect({ ...signedIn, segments: ['(tabs)'] })).toBeNull();
    expect(resolveAuthRedirect({ ...signedIn, segments: ['onboarding'] })).toBeNull();
    expect(resolveAuthRedirect({ ...signedIn, segments: ['login'] })).toBe('/(tabs)');
    expect(resolveAuthRedirect({ ...signedIn, segments: ['signup'] })).toBe('/(tabs)');
    expect(resolveAuthRedirect({ ...signedIn, segments: ['auth', 'callback'] })).toBe('/(tabs)');
  });

  it('sends signed-in users with an incomplete profile to onboarding', () => {
    const newUser = { signedIn: true, profileComplete: false };
    expect(resolveAuthRedirect({ ...newUser, segments: ['(tabs)'] })).toBe('/onboarding');
    expect(resolveAuthRedirect({ ...newUser, segments: ['settings'] })).toBe('/onboarding');
    expect(resolveAuthRedirect({ ...newUser, segments: ['login'] })).toBe('/onboarding');
    expect(resolveAuthRedirect({ ...newUser, segments: ['onboarding'] })).toBeNull();
  });
});
