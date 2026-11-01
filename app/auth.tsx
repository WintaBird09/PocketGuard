import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '@/src/auth/AuthProvider';
import { PageLayout } from '@/src/ui/PageLayout';

export default function AuthScreen() {
  const router = useRouter();
  const {
    session,
    loading,
    error: sessionError,
    householdBootstrapStatus,
    householdBootstrapError,
    retryHouseholdBootstrap,
    signOut,
  } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signOutAndReturn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      setMessage('Signed out.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title="Account" subtitle="Your Pocket Guard account">
      {loading ? (
        <Text className="mb-4 text-sm text-slate-600">Restoring saved session…</Text>
      ) : session ? (
        <View className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <Text className="text-lg font-bold text-emerald-900">Signed in</Text>
          <Text className="mt-2 text-sm text-emerald-800">
            {session.user.email ?? 'Your account'} · session saved on this device
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={signOutAndReturn}
            className="mt-4 rounded-xl border border-emerald-300 px-4 py-3"
          >
            <Text className="text-center font-bold text-emerald-900">
              {busy ? 'Signing out…' : 'Sign out'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {sessionError ? (
        <Text className="mb-3 text-sm text-red-700">Session restore: {sessionError}</Text>
      ) : null}
      {session ? (
        <View className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
          <Text className="text-sm font-semibold text-slate-900">
            {householdBootstrapStatus === 'pending'
              ? 'Linking your local household…'
              : householdBootstrapStatus === 'ready'
                ? 'Household linked and ready for sync.'
                : householdBootstrapStatus === 'failed'
                  ? 'Sign-in succeeded, but household linking needs attention.'
                  : 'Household link pending.'}
          </Text>
          {householdBootstrapError ? (
            <Text className="mt-2 text-sm text-red-700">{householdBootstrapError}</Text>
          ) : null}
          {householdBootstrapStatus === 'failed' ? (
            <Pressable
              accessibilityRole="button"
              onPress={retryHouseholdBootstrap}
              className="mt-3 rounded-xl border border-slate-200 px-4 py-3"
            >
              <Text className="text-center font-bold text-slate-800">Retry household link</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {message ? (
        <Text className="mb-3 text-sm font-medium text-emerald-700">{message}</Text>
      ) : null}
      {error ? <Text className="mb-3 text-sm font-medium text-red-700">{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        className="rounded-xl border border-slate-200 px-4 py-3"
      >
        <Text className="text-center font-bold text-slate-800">Back to Pocket Guard</Text>
      </Pressable>
    </PageLayout>
  );
}
