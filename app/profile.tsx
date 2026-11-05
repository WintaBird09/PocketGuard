import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, Share, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/src/auth/AuthProvider';
import { getAvatarUri, removeAvatar, saveAvatar } from '@/src/auth/avatar';
import { appName, buildInviteMessage } from '@/src/auth/invite';
import {
  getPersonalInfo,
  maxProfessionLength,
  personalInfoToMetadata,
  validatePersonalInfo,
  type PersonalInfo,
} from '@/src/auth/personalInfo';
import {
  getDisplayLabel,
  getDisplayName,
  getInitials,
  maxDisplayNameLength,
  validateEmail,
  validateNewPassword,
} from '@/src/auth/profile';
import { Banner, Button } from '@/src/ui/controls';
import { DatePickerField } from '@/src/ui/DatePickerField';
import { PageLayout } from '@/src/ui/PageLayout';

const inputClass =
  'mt-3 min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-base text-slate-900 dark:text-slate-100';

type Notice = { tone: 'success' | 'error'; text: string } | null;

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export default function ProfileScreen() {
  const router = useRouter();
  const {
    session,
    updateProfileMetadata,
    updatePassword,
    requestEmailChange,
    refreshUser,
    signOut,
  } = useAuth();
  const user = session?.user;
  const savedInfo = getPersonalInfo(user);

  const [avatar, setAvatar] = useState<{ uri: string | null; version: number }>(() => ({
    uri: getAvatarUri(user?.id),
    version: 0,
  }));
  const [avatarNotice, setAvatarNotice] = useState<Notice>(null);

  const [info, setInfo] = useState<PersonalInfo>(savedInfo);
  const [email, setEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailNotice, setEmailNotice] = useState<Notice>(null);

  const [infoBusy, setInfoBusy] = useState(false);
  const [infoNotice, setInfoNotice] = useState<Notice>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);

  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const infoErrors = validatePersonalInfo(info);
  const infoChanged = (Object.keys(info) as (keyof PersonalInfo)[]).some(
    (key) => info[key].trim() !== savedInfo[key].trim(),
  );
  const emailError = email.length === 0 ? null : validateEmail(email, user?.email);
  const pendingEmail = user?.new_email ?? null;
  const passwordError =
    password.length === 0 && confirm.length === 0 ? null : validateNewPassword(password, confirm);

  const setField = (key: keyof PersonalInfo, value: string) => {
    setInfo((current) => ({ ...current, [key]: value }));
    setInfoNotice(null);
  };

  const saveInfo = async () => {
    setInfoBusy(true);
    setInfoNotice(null);
    try {
      await updateProfileMetadata(personalInfoToMetadata(info));
      setInfoNotice({ tone: 'success', text: 'Profile updated.' });
    } catch (cause) {
      setInfoNotice({ tone: 'error', text: errorText(cause, 'Unable to update your profile.') });
    } finally {
      setInfoBusy(false);
    }
  };

  const choosePhoto = async () => {
    if (!user) return;
    setAvatarNotice(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (result.canceled || !result.assets[0]) return;
      const uri = saveAvatar(user.id, result.assets[0].uri);
      setAvatar((current) => ({ uri, version: current.version + 1 }));
    } catch (cause) {
      setAvatarNotice({ tone: 'error', text: errorText(cause, 'Unable to use that photo.') });
    }
  };

  const deletePhoto = () => {
    if (!user) return;
    removeAvatar(user.id);
    setAvatar((current) => ({ uri: null, version: current.version + 1 }));
  };

  const changeEmail = async () => {
    setEmailBusy(true);
    setEmailNotice(null);
    try {
      await requestEmailChange(email);
      setEmail('');
      setEmailNotice({
        tone: 'success',
        text: 'Check your inbox. Open the confirmation link to finish changing your email. If your old address also receives a link, confirm that one too.',
      });
    } catch (cause) {
      setEmailNotice({ tone: 'error', text: errorText(cause, 'Unable to change your email.') });
    } finally {
      setEmailBusy(false);
    }
  };

  const checkEmail = async () => {
    setEmailNotice(null);
    try {
      await refreshUser();
      setEmailNotice({ tone: 'success', text: 'Account refreshed.' });
    } catch (cause) {
      setEmailNotice({ tone: 'error', text: errorText(cause, 'Unable to refresh your account.') });
    }
  };

  const invite = async () => {
    try {
      await Share.share({
        title: `Join me on ${appName}`,
        message: buildInviteMessage(getDisplayName(user)),
      });
    } catch (cause) {
      Alert.alert('Unable to share', errorText(cause, 'Sharing is not available right now.'));
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
      <View className="mb-5 items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile picture"
          onPress={() => void choosePhoto()}
        >
          {avatar.uri ? (
            <Image
              source={{ uri: `${avatar.uri}?v=${avatar.version}` }}
              className="h-24 w-24 rounded-full"
            />
          ) : (
            <View className="h-24 w-24 items-center justify-center rounded-full bg-emerald-600">
              <Text className="text-4xl font-bold text-white">{getInitials(label)}</Text>
            </View>
          )}
          <View className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-900 dark:bg-slate-800">
            <Ionicons name="camera" size={15} color="#ffffff" />
          </View>
        </Pressable>
        <Text className="mt-3 text-xl font-bold text-slate-900 dark:text-slate-100">{label}</Text>
        {user?.email ? (
          <Text className="mt-1 text-sm text-slate-600 dark:text-slate-300">{user.email}</Text>
        ) : null}
        {savedInfo.profession ? (
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {savedInfo.profession}
          </Text>
        ) : null}
        <View className="mt-4 flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={() => void choosePhoto()}
            className="min-h-11 flex-row items-center rounded-full bg-slate-900 dark:bg-slate-800 px-4"
          >
            <Ionicons name="image" size={16} color="#ffffff" />
            <Text className="ml-2 text-sm font-bold text-white">
              {avatar.uri ? 'Change photo' : 'Add photo'}
            </Text>
          </Pressable>
          {avatar.uri ? (
            <Pressable
              accessibilityRole="button"
              onPress={deletePhoto}
              className="min-h-11 flex-row items-center rounded-full border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/30 px-4"
            >
              <Ionicons name="trash" size={16} color="#b91c1c" />
              <Text className="ml-2 text-sm font-bold text-red-700 dark:text-red-400">Remove</Text>
            </Pressable>
          ) : null}
        </View>
        {avatarNotice ? (
          <View className="mt-3 w-full">
            <Banner tone={avatarNotice.tone}>{avatarNotice.text}</Banner>
          </View>
        ) : null}
        <Text className="mt-3 text-center text-xs text-slate-400">
          Your photo is stored on this device only.
        </Text>
      </View>

      <View className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <Text className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Personal details
        </Text>
        <TextInput
          accessibilityLabel="Display name"
          autoCapitalize="words"
          className={inputClass}
          maxLength={maxDisplayNameLength}
          onChangeText={(value) => setField('name', value)}
          placeholder="Full name"
          value={info.name}
        />
        {infoErrors.name && info.name !== savedInfo.name ? (
          <Text className="mt-1 text-sm text-red-700 dark:text-red-400">{infoErrors.name}</Text>
        ) : null}
        <TextInput
          accessibilityLabel="Phone number"
          keyboardType="phone-pad"
          className={inputClass}
          onChangeText={(value) => setField('phone', value)}
          placeholder="Phone number"
          value={info.phone}
        />
        {infoErrors.phone && info.phone !== savedInfo.phone ? (
          <Text className="mt-1 text-sm text-red-700 dark:text-red-400">{infoErrors.phone}</Text>
        ) : null}
        <View className="mt-3">
          <DatePickerField
            label="Date of birth"
            value={info.birthDate}
            onChange={(value) => setField('birthDate', value)}
            error={info.birthDate !== savedInfo.birthDate ? infoErrors.birthDate : null}
          />
        </View>
        <TextInput
          accessibilityLabel="Profession"
          className={`${inputClass} mb-4`}
          maxLength={maxProfessionLength}
          onChangeText={(value) => setField('profession', value)}
          placeholder="Profession"
          value={info.profession}
        />
        {infoNotice ? <Banner tone={infoNotice.tone}>{infoNotice.text}</Banner> : null}
        <Button
          label={infoBusy ? 'Saving…' : 'Save changes'}
          disabled={infoBusy || !infoChanged || Object.keys(infoErrors).length > 0}
          onPress={() => void saveInfo()}
        />
      </View>

      <View className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <Text className="text-lg font-bold text-slate-900 dark:text-slate-100">Email</Text>
        <Text className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Signed in as {user?.email ?? '—'}
        </Text>
        {pendingEmail ? (
          <View className="mt-3">
            <Banner tone="info">
              Waiting for you to confirm {pendingEmail}. Open the link we emailed you.
            </Banner>
            <Button
              label="I confirmed it, refresh"
              variant="outline"
              onPress={() => void checkEmail()}
            />
          </View>
        ) : null}
        <TextInput
          accessibilityLabel="New email address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          className={`${inputClass} mb-4`}
          onChangeText={(value) => {
            setEmail(value);
            setEmailNotice(null);
          }}
          placeholder="New email address"
          value={email}
        />
        {emailError ? <Banner tone="info">{emailError}</Banner> : null}
        {emailNotice ? <Banner tone={emailNotice.tone}>{emailNotice.text}</Banner> : null}
        <Button
          label={emailBusy ? 'Sending…' : 'Send confirmation link'}
          variant="outline"
          disabled={emailBusy || email.length === 0 || emailError !== null}
          onPress={() => void changeEmail()}
        />
      </View>

      <View className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <Text className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Change password
        </Text>
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

      <View className="mb-5 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 p-5">
        <View className="flex-row items-center">
          <Ionicons name="people" size={22} color="#047857" />
          <Text className="ml-2 text-lg font-bold text-slate-900 dark:text-slate-100">
            Invite friends & family
          </Text>
        </View>
        <Text className="mb-4 mt-1 text-sm text-slate-600 dark:text-slate-300">
          Share {appName} by message, WhatsApp, email or any app. Everyone gets their own private
          account.
        </Text>
        <Button label="Share invitation" onPress={() => void invite()} />
      </View>

      <View className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <Text className="text-lg font-bold text-slate-900 dark:text-slate-100">Account</Text>
        <Text className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Member since{' '}
          {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-GB') : '—'}
        </Text>
      </View>

      <View className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <Text className="text-lg font-bold text-slate-900 dark:text-slate-100">Sign out</Text>
        <Text className="mb-4 mt-1 text-sm text-slate-600 dark:text-slate-300">
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
