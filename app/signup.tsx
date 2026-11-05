import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { Link } from 'expo-router';

import { useAuth } from '@/src/auth/AuthProvider';
import { authConfigurationError } from '@/src/auth/client';
import { Banner, Button } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';

const minPasswordLength = 8;
const inputClass =
  'mt-3 min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-base text-slate-900 dark:text-slate-100';

export default function SignUpScreen() {
  const { signUpWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedEmail = email.trim();
  const validationError =
    password.length > 0 && password.length < minPasswordLength
      ? `Use at least ${minPasswordLength} characters.`
      : confirm.length > 0 && confirm !== password
        ? 'Passwords do not match.'
        : null;

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const needsConfirmation = await signUpWithPassword(trimmedEmail, password);
      if (needsConfirmation) {
        setMessage('Account created. Open the confirmation link we emailed you, then sign in.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create your account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title="Create account" subtitle="One account keeps your budget backed up">
      {authConfigurationError ? <Banner tone="error">{authConfigurationError}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {validationError ? <Banner tone="info">{validationError}</Banner> : null}
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
        autoComplete="new-password"
        autoCorrect={false}
        className={inputClass}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        value={password}
      />
      <TextInput
        accessibilityLabel="Confirm password"
        autoCapitalize="none"
        autoComplete="new-password"
        autoCorrect={false}
        className={`${inputClass} mb-4`}
        onChangeText={setConfirm}
        placeholder="Confirm password"
        secureTextEntry
        value={confirm}
      />

      <Button
        label={busy ? 'Creating account…' : 'Create account'}
        disabled={
          busy ||
          authConfigurationError !== null ||
          trimmedEmail.length === 0 ||
          password.length < minPasswordLength ||
          confirm !== password
        }
        onPress={() => void submit()}
      />

      <Text className="mt-6 text-center text-sm text-slate-600 dark:text-slate-300">
        Already have an account?{' '}
        <Link href="/login" className="font-bold text-slate-900 dark:text-slate-100">
          Sign in
        </Link>
      </Text>
    </PageLayout>
  );
}
