export const loginRoute = '/login' as const;
export const onboardingRoute = '/onboarding' as const;
export const homeRoute = '/(tabs)' as const;

export type AuthGateInput = {
  segments: readonly string[];
  signedIn: boolean;
  onboardingPending: boolean;
};

// Returns the route the user must be sent to, or null when the current route is allowed.
export function resolveAuthRedirect({
  segments,
  signedIn,
  onboardingPending,
}: AuthGateInput): string | null {
  const [first, second] = segments;
  const isCredentialScreen = first === 'login' || first === 'signup';
  const isAuthCallback = first === 'auth' && second === 'callback';

  if (signedIn) return isCredentialScreen || isAuthCallback ? homeRoute : null;

  if (isCredentialScreen || isAuthCallback || first === onboardingRoute.slice(1)) return null;
  return onboardingPending ? onboardingRoute : loginRoute;
}
