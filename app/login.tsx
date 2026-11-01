import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { Link } from 'expo-router';

import { useAuth } from '@/src/auth/AuthProvider';
import { authConfigurationError } from '@/src/auth/client';
import { Banner, Button } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';

const inputClass =
  'mt-3 min-h-12 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900';

export default function LoginScreen() {
  const { signInWithPassword, sendMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const trimmedEmail = email.trim();
  const disabled = busy || authConfigurationError !== null;

  return (
    <PageLayout title="Sign in" subtitle="Sign in to open Pocket Guard">
      {authConfigurationError ? <Banner tone="error">{authConfigurationError}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="success">{message}</Banner> : null}

      <TextInput
        accessibilityLabel="Email address"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        className={inputClass}
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="you@example.com"
        value={email}
      />
      <TextInput
        accessibilityLabel="Password"
        autoCapitalize="none"
        autoComplete="current-password"
        autoCorrect={false}
        className={`${inputClass} mb-4`}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        value={password}
      />

      <Button
        label={busy ? 'Please wait…' : 'Sign in'}
        disabled={disabled || trimmedEmail.length === 0 || password.length === 0}
        onPress={() =>
          void run(() => signInWithPassword(trimmedEmail, password), 'Unable to sign in.')
        }
      />
      <Text className="my-3 text-center text-sm text-slate-500">or</Text>
      <Button
        label="Email me a sign-in link"
        variant="outline"
        disabled={disabled || trimmedEmail.length === 0}
        onPress={() =>
          void run(async () => {
            await sendMagicLink(trimmedEmail);
            setMessage('Check your email for a sign-in link and open it on this device.');
          }, 'Unable to send a sign-in link.')
        }
      />

      <Text className="mt-6 text-center text-sm text-slate-600">
        New to Pocket Guard?{' '}
        <Link href="/signup" className="font-bold text-slate-900">
          Create an account
        </Link>
      </Text>
    </PageLayout>
  );
}
