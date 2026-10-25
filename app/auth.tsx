import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '@/src/auth/AuthProvider';
import { authConfigurationError } from '@/src/auth/client';
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
    sendMagicLink,
    signOut,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestMagicLink = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await sendMagicLink(email.trim());
      setMessage(
        'Check your email for a sign-in link. Open it on this device to complete sign-in.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send a sign-in link.');
    } finally {
      setBusy(false);
    }
  };

  const signOutAndContinueOffline = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      setMessage('Signed out. Your local household remains available offline.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title="Account" subtitle="Optional cloud sign-in; local budgeting works offline">
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
            onPress={signOutAndContinueOffline}
            className="mt-4 rounded-xl border border-emerald-300 px-4 py-3"
          >
            <Text className="text-center font-bold text-emerald-900">
              {busy ? 'Signing out…' : 'Sign out'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Text className="text-lg font-bold text-slate-900">Sign in with email</Text>
          <Text className="mt-2 text-sm text-slate-600">
            We’ll send a one-time sign-in link. You can keep using Pocket Guard without signing in.
          </Text>
          <TextInput
            accessibilityLabel="Email address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            className="mt-4 rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-900"
            keyboardType="email-address"
            onChangeText={(value) => {
              setEmail(value);
              setError(null);
              setMessage(null);
            }}
            placeholder="you@example.com"
            value={email}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy || email.trim().length === 0 || authConfigurationError !== null}
            onPress={requestMagicLink}
            className="mt-4 rounded-xl bg-emerald-600 px-4 py-3"
          >
            <Text className="text-center font-bold text-white">
              {busy ? 'Sending link…' : 'Email me a sign-in link'}
            </Text>
          </Pressable>
          {authConfigurationError ? (
            <Text className="mt-3 text-sm text-amber-800">{authConfigurationError}</Text>
          ) : null}
        </View>
      )}

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
