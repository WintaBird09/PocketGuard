export const loginRoute = '/login' as const;
export const homeRoute = '/(tabs)' as const;
export const onboardingRoute = '/onboarding' as const;

export type AuthGateInput = {
  segments: readonly string[];
  signedIn: boolean;
  profileComplete: boolean;
};

// Returns the route the user must be sent to, or null when the current route is allowed.
export function resolveAuthRedirect({
  segments,
  signedIn,
  profileComplete,
}: AuthGateInput): string | null {
  const [first, second] = segments;
  const isCredentialScreen = first === 'login' || first === 'signup';
  const isAuthCallback = first === 'auth' && second === 'callback';

  if (!signedIn) return isCredentialScreen || isAuthCallback ? null : loginRoute;
  if (isCredentialScreen || isAuthCallback) return profileComplete ? homeRoute : onboardingRoute;
  // New accounts must finish personal details before reaching anything else.
  if (!profileComplete && first !== 'onboarding') return onboardingRoute;
  return null;
}
