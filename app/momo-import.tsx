import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { settings } from '@/src/data/repos';
import { Button, Banner } from '@/src/ui/controls';
import { PageLayout } from '@/src/ui/PageLayout';
import { useDatabase } from '@/src/ui/useDatabase';
import { parseMomoSmsBatch, type MomoSource } from '@/src/momo/MomoSmsParser';
import { MOMO_SENDER_ID, momoAutoImportSettingKey } from '@/src/momo/constants';
import { getMomoNativeModule } from '@/src/momo/native';
import { registerMomoPending } from '@/src/momo/store';

type PermissionPurpose = 'scan' | 'auto' | null;

export default function MomoImportScreen() {
  const router = useRouter();
  const { db, householdId, loading } = useDatabase();
  const params = useLocalSearchParams<{ sharedText?: string }>();
  const [text, setText] = useState(() =>
    typeof params.sharedText === 'string' ? params.sharedText : '',
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoImportOverride, setAutoImportOverride] = useState<boolean | null>(null);
  const autoImport =
    autoImportOverride ??
    (db && householdId
      ? settings.get(db, householdId, momoAutoImportSettingKey) === 'true'
      : false);
  const [smsReadAllowed, setSmsReadAllowed] = useState(false);
  const [permissionPurpose, setPermissionPurpose] = useState<PermissionPurpose>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS).then(setSmsReadAllowed);
  }, []);

  const processText = (content: string, source: MomoSource) => {
    setError(null);
    setMessage(null);
    const parsed = parseMomoSmsBatch(content, source);
    if (!parsed.length) {
      setMessage('No MoMo transaction found. Check the message text and try again.');
      return;
    }
    if (!db || !householdId) {
      setError('Your local database is not ready yet.');
      return;
    }
    try {
      const results = registerMomoPending(db, householdId, parsed);
      const added = results.filter((result) => !result.duplicate).length;
      const confirmed = results.filter(
        (result) => result.duplicate && result.item.state === 'confirmed',
      ).length;
      const dismissed = results.filter(
        (result) => result.duplicate && result.item.state === 'dismissed',
      ).length;
      const alreadyPending = results.filter(
        (result) => result.duplicate && result.item.state === 'pending',
      ).length;
      const status = [
        added ? `${added} ready for review` : '',
        confirmed ? `${confirmed} already added` : '',
        dismissed ? `${dismissed} previously dismissed` : '',
        alreadyPending ? `${alreadyPending} already pending` : '',
      ]
        .filter(Boolean)
        .join('. ');
      setMessage(status || 'No new MoMo transactions to review.');
      if (added || alreadyPending) router.push('/momo-review');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to prepare these messages.');
    }
  };

  const pasteClipboard = async () => {
    try {
      const clipboardText = await Clipboard.getStringAsync();
      if (!clipboardText.trim()) {
        setMessage('The clipboard has no text to paste.');
        return;
      }
      setText(clipboardText);
      setMessage('Clipboard text added. Tap Review messages to continue.');
    } catch {
      setError('Unable to read text from the clipboard.');
    }
  };

  const hasPermission = async (permission: string) =>
    Platform.OS === 'android' && PermissionsAndroid.check(permission as never);

  const requestPurposePermission = async () => {
    if (Platform.OS !== 'android') {
      setError('SMS inbox access is available only on Android. Paste and share still work here.');
      setPermissionPurpose(null);
      return;
    }
    const permission =
      permissionPurpose === 'scan'
        ? PermissionsAndroid.PERMISSIONS.READ_SMS
        : PermissionsAndroid.PERMISSIONS.RECEIVE_SMS;
    setBusy(true);
    setError(null);
    try {
      const result = await PermissionsAndroid.request(permission);
      setPermissionPurpose(null);
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        if (permissionPurpose === 'scan') setSmsReadAllowed(false);
        setError('SMS permission was not granted. Paste and share remain available.');
        return;
      }
      if (permissionPurpose === 'scan') {
        setSmsReadAllowed(true);
        await scanInbox();
      } else await enableAutoImport();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to request SMS permission.');
    } finally {
      setBusy(false);
    }
  };

  const scanInbox = async () => {
    const native = getMomoNativeModule();
    if (!native) {
      setError(
        'Inbox scanning is unavailable in this build. Rebuild the Android app to add the MoMo SMS module.',
      );
      return;
    }
    setBusy(true);
    try {
      const messages = await native.queryInbox(MOMO_SENDER_ID, 200);
      const eligible = messages.filter(
        (sms) => sms.address.toLowerCase() === MOMO_SENDER_ID.toLowerCase(),
      );
      const parsed = eligible.flatMap((sms) => parseMomoSmsBatch(sms.body, 'MOMO_INBOX'));
      if (!parsed.length) {
        setMessage('No MoMo transaction found in the inbox.');
        return;
      }
      if (!db || !householdId) return;
      const results = registerMomoPending(db, householdId, parsed);
      const added = results.filter((result) => !result.duplicate).length;
      setMessage(
        added
          ? `${added} inbox message${added === 1 ? '' : 's'} ready for review.`
          : 'Inbox transactions are already added or pending.',
      );
      if (added) router.push('/momo-review');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to scan MoMo messages.');
    } finally {
      setBusy(false);
    }
  };

  const enableAutoImport = async () => {
    const native = getMomoNativeModule();
    if (!native || !db) {
      setError('Automatic SMS import is unavailable in this build.');
      return;
    }
    await native.setAutoImportEnabled(true);
    settings.set(db, householdId, momoAutoImportSettingKey, true);
    setAutoImportOverride(true);
    setMessage('Automatic MoMo import is enabled on this device.');
  };

  const toggleAutoImport = async (enabled: boolean) => {
    setError(null);
    if (!enabled) {
      const native = getMomoNativeModule();
      await native?.setAutoImportEnabled(false);
      if (db) settings.set(db, householdId, momoAutoImportSettingKey, false);
      setAutoImportOverride(false);
      setMessage('Automatic MoMo import is off.');
      return;
    }
    const granted = await hasPermission(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
    if (!granted) setPermissionPurpose('auto');
    else void enableAutoImport();
  };

  return (
    <PageLayout
      title="From Mobile Money"
      subtitle="Review each item before it is saved"
      loading={loading}
    >
      <View className="mb-4 flex-row items-start rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <Ionicons name="shield-checkmark-outline" size={21} color="#059669" />
        <Text className="ml-2 flex-1 text-sm text-slate-600 dark:text-slate-300">
          SMS is processed on this device. Only messages from “{MOMO_SENDER_ID}” are considered for
          inbox scan and automatic import.
        </Text>
      </View>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="info">{message}</Banner> : null}

      <Text className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-200">Paste SMS</Text>
      <TextInput
        accessibilityLabel="Paste Mobile Money SMS messages"
        value={text}
        onChangeText={setText}
        multiline
        textAlignVertical="top"
        placeholder="Paste one or more MoMo messages"
        className="min-h-36 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-base text-slate-900 dark:text-slate-100"
      />
      <View className="mt-3 flex-row gap-3">
        <View className="flex-1">
          <Button
            label="Paste from clipboard"
            variant="outline"
            onPress={() => void pasteClipboard()}
          />
        </View>
        <View className="flex-1">
          <Button
            label={
              params.sharedText && text === params.sharedText
                ? 'Review shared message'
                : 'Review messages'
            }
            onPress={() =>
              processText(
                text,
                params.sharedText && text === params.sharedText ? 'MOMO_SHARE' : 'MOMO_PASTE',
              )
            }
            disabled={!text.trim()}
          />
        </View>
      </View>

      <View className="mt-5 flex-row items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <Ionicons name="share-social-outline" size={21} color="#059669" />
        <View className="ml-3 flex-1">
          <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
            Share to Pocket Guard
          </Text>
          <Text className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Choose Pocket Guard from Android’s Share menu when viewing a message.
          </Text>
        </View>
      </View>

      <View className="mt-5 border-t border-slate-200 dark:border-slate-700 pt-4">
        <View className="flex-row items-center justify-between">
          <View className="mr-3 flex-1">
            <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
              Scan inbox
            </Text>
            <Text className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Reads only messages from {MOMO_SENDER_ID}.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !smsReadAllowed || busy }}
            disabled={!smsReadAllowed || busy}
            onPress={() => void scanInbox()}
            className={`min-h-11 justify-center rounded-xl px-4 ${smsReadAllowed && !busy ? 'bg-slate-900' : 'bg-slate-300 dark:bg-slate-700'}`}
          >
            <Text className="font-bold text-white">{busy ? 'Working…' : 'Scan'}</Text>
          </Pressable>
        </View>
        {!smsReadAllowed && Platform.OS === 'android' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setPermissionPurpose('scan')}
            className="mt-3 min-h-11 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 px-3"
          >
            <Text className="font-semibold text-slate-700 dark:text-slate-200">
              Enable inbox scan
            </Text>
          </Pressable>
        ) : null}
        {Platform.OS !== 'android' ? (
          <Text className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Inbox scan is Android-only.
          </Text>
        ) : null}
      </View>

      <View className="mt-4 flex-row items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-4">
        <View className="mr-3 flex-1">
          <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
            Auto-import MoMo
          </Text>
          <Text className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Detect new messages from this sender.
          </Text>
        </View>
        <Switch
          value={autoImport}
          onValueChange={(enabled) => void toggleAutoImport(enabled)}
          disabled={Platform.OS !== 'android' || busy}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/momo-review')}
        className="mt-5 min-h-12 flex-row items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4"
      >
        <Ionicons name="time-outline" size={18} color="#334155" />
        <Text className="ml-2 font-semibold text-slate-800 dark:text-slate-200">
          Pending MoMo transactions
        </Text>
      </Pressable>

      {permissionPurpose ? (
        <View className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950">
          <Text className="text-base font-bold text-emerald-900 dark:text-emerald-200">
            SMS access
          </Text>
          <Text className="mt-2 text-sm text-emerald-900 dark:text-emerald-200">
            Pocket Guard will {permissionPurpose === 'scan' ? 'scan existing' : 'watch for new'} SMS
            from “{MOMO_SENDER_ID}” only. Other messages are ignored, and SMS content stays on this
            device.
          </Text>
          <View className="mt-3">
            <Button
              label="Continue to Android permission"
              onPress={() => void requestPurposePermission()}
              disabled={busy}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setPermissionPurpose(null)}
            className="mt-2 min-h-11 items-center justify-center"
          >
            <Text className="font-semibold text-emerald-900 dark:text-emerald-200">Not now</Text>
          </Pressable>
        </View>
      ) : null}
    </PageLayout>
  );
}
