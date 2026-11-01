import { describe, expect, it } from 'vitest';

import { resolveAuthRedirect } from './guard';

const out = { signedIn: false, onboardingPending: false };

describe('resolveAuthRedirect', () => {
  it('sends signed-out users to login from every protected route', () => {
    for (const segments of [
      [],
      ['(tabs)'],
      ['(tabs)', 'budget'],
      ['settings'],
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

  it('shows onboarding first for signed-out users who have not completed it', () => {
    expect(
      resolveAuthRedirect({ segments: ['(tabs)'], signedIn: false, onboardingPending: true }),
    ).toBe('/onboarding');
    expect(
      resolveAuthRedirect({ segments: ['onboarding'], signedIn: false, onboardingPending: true }),
    ).toBeNull();
  });

  it('sends signed-out users to login after onboarding completes', () => {
    expect(resolveAuthRedirect({ ...out, segments: ['(tabs)'] })).toBe('/login');
  });

  it('allows signed-in users everywhere except the login screens', () => {
    const signedIn = { signedIn: true, onboardingPending: false };
    expect(resolveAuthRedirect({ ...signedIn, segments: ['(tabs)'] })).toBeNull();
    expect(resolveAuthRedirect({ ...signedIn, segments: ['auth'] })).toBeNull();
    expect(resolveAuthRedirect({ ...signedIn, segments: ['login'] })).toBe('/(tabs)');
    expect(resolveAuthRedirect({ ...signedIn, segments: ['signup'] })).toBe('/(tabs)');
    expect(resolveAuthRedirect({ ...signedIn, segments: ['auth', 'callback'] })).toBe('/(tabs)');
  });
});
