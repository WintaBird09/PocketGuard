import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '@/src/auth/AuthProvider';
import {
  getDisplayLabel,
  getDisplayName,
  getInitials,
  maxDisplayNameLength,
  validateDisplayName,
  validateNewPassword,
} from '@/src/auth/profile';
import { Banner, Button } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';

const inputClass =
  'mt-3 min-h-12 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900';

type Notice = { tone: 'success' | 'error'; text: string } | null;

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { session, updateDisplayName, updatePassword, signOut } = useAuth();
  const user = session?.user;
  const savedName = getDisplayName(user);

  const [name, setName] = useState(savedName);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameNotice, setNameNotice] = useState<Notice>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);

  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const nameError = name.trim() === savedName ? null : validateDisplayName(name);
  const passwordError =
    password.length === 0 && confirm.length === 0 ? null : validateNewPassword(password, confirm);

  const saveName = async () => {
    setNameBusy(true);
    setNameNotice(null);
    try {
      await updateDisplayName(name);
      setName(name.trim());
      setNameNotice({ tone: 'success', text: 'Profile updated.' });
    } catch (cause) {
      setNameNotice({ tone: 'error', text: errorText(cause, 'Unable to update your profile.') });
    } finally {
      setNameBusy(false);
    }
  };

  const savePassword = async () => {
    setPasswordBusy(true);
    setPasswordNotice(null);
    try {
      await updatePassword(password);
      setPassword('');
      setConfirm('');
      setPasswordNotice({ tone: 'success', text: 'Password changed.' });
    } catch (cause) {
      setPasswordNotice({
        tone: 'error',
        text: errorText(cause, 'Unable to change your password.'),
      });
    } finally {
      setPasswordBusy(false);
    }
  };

  const doSignOut = async () => {
    setSignOutBusy(true);
    setSignOutError(null);
    try {
      await signOut();
    } catch (cause) {
      setSignOutError(errorText(cause, 'Unable to sign out.'));
      setSignOutBusy(false);
    }
  };

  const label = getDisplayLabel(user);

  return (
    <PageLayout title="Profile" subtitle="Your account on Pocket Guard">
      <View className="mb-5 items-center rounded-2xl border border-slate-200 bg-white p-6">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-emerald-600">
          <Text className="text-3xl font-bold text-white">{getInitials(label)}</Text>
        </View>
        <Text className="mt-3 text-xl font-bold text-slate-900">{label}</Text>
        {user?.email ? <Text className="mt-1 text-sm text-slate-600">{user.email}</Text> : null}
      </View>

      <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-5">
        <Text className="text-lg font-bold text-slate-900">Display name</Text>
        <TextInput
          accessibilityLabel="Display name"
          autoCapitalize="words"
          className={`${inputClass} mb-4`}
          maxLength={maxDisplayNameLength}
          onChangeText={(value) => {
            setName(value);
            setNameNotice(null);
          }}
          placeholder="How should we call you?"
          value={name}
        />
        {nameError ? <Banner tone="info">{nameError}</Banner> : null}
        {nameNotice ? <Banner tone={nameNotice.tone}>{nameNotice.text}</Banner> : null}
        <Button
          label={nameBusy ? 'Saving…' : 'Save changes'}
          disabled={nameBusy || name.trim() === savedName || nameError !== null}
          onPress={() => void saveName()}
        />
      </View>

      <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-5">
        <Text className="text-lg font-bold text-slate-900">Change password</Text>
        <TextInput
          accessibilityLabel="New password"
          autoCapitalize="none"
          autoComplete="new-password"
          autoCorrect={false}
          className={inputClass}
          onChangeText={(value) => {
            setPassword(value);
            setPasswordNotice(null);
          }}
          placeholder="New password"
          secureTextEntry
          value={password}
        />
        <TextInput
          accessibilityLabel="Confirm new password"
          autoCapitalize="none"
          autoComplete="new-password"
          autoCorrect={false}
          className={`${inputClass} mb-4`}
          onChangeText={(value) => {
            setConfirm(value);
            setPasswordNotice(null);
          }}
          placeholder="Confirm new password"
          secureTextEntry
          value={confirm}
        />
        {passwordError ? <Banner tone="info">{passwordError}</Banner> : null}
        {passwordNotice ? <Banner tone={passwordNotice.tone}>{passwordNotice.text}</Banner> : null}
        <Button
          label={passwordBusy ? 'Updating…' : 'Update password'}
          variant="outline"
          disabled={passwordBusy || password.length === 0 || passwordError !== null}
          onPress={() => void savePassword()}
        />
      </View>

      <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-5">
        <Text className="text-lg font-bold text-slate-900">Sign out</Text>
        <Text className="mb-4 mt-1 text-sm text-slate-600">
          You’ll need to sign in again to open Pocket Guard. Your budget stays safely on this
          device.
        </Text>
        {signOutError ? <Banner tone="error">{signOutError}</Banner> : null}
        {confirmSignOut ? (
          <View className="gap-3">
            <Button
              label={signOutBusy ? 'Signing out…' : 'Yes, sign out'}
              variant="danger"
              disabled={signOutBusy}
              onPress={() => void doSignOut()}
            />
            <Button
              label="Cancel"
              variant="outline"
              disabled={signOutBusy}
              onPress={() => setConfirmSignOut(false)}
            />
          </View>
        ) : (
          <Button label="Sign out" variant="danger" onPress={() => setConfirmSignOut(true)} />
        )}
      </View>

      <Button label="Back" variant="outline" onPress={() => router.back()} />
    </PageLayout>
  );
}
