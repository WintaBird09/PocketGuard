import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';

import {
  getNotificationPermission,
  requestNotificationPermission,
  scheduleTestNotification,
  type NotificationPermissionState,
} from '@/src/notifications/permissions';
import { scheduleNotificationRefresh } from '@/src/notifications/schedule';
import { PageLayout } from '@/src/ui/PageLayout';

export default function SettingsScreen() {
  const [permission, setPermission] = useState<NotificationPermissionState | 'checking'>(
    'checking',
  );
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [openingSettings, setOpeningSettings] = useState(false);

  useEffect(() => {
    let active = true;

    const loadPermission = async () => {
      try {
        const current = await getNotificationPermission();
        if (active) setPermission(current);
      } catch (cause) {
        if (active) {
          setNotificationError(
            cause instanceof Error ? cause.message : 'Unable to check notification permissions.',
          );
        }
      }
    };

    void loadPermission();
    return () => {
      active = false;
    };
  }, []);

  const enableNotifications = async () => {
    setNotificationError(null);
    try {
      const status = await requestNotificationPermission();
      setPermission(status);
      setNotificationMessage(
        status === 'granted'
          ? 'Notifications are enabled.'
          : 'Permission was not granted. Enable notifications in app settings to continue.',
      );
      if (status === 'granted') scheduleNotificationRefresh();
    } catch (cause) {
      setNotificationError(
        cause instanceof Error ? cause.message : 'Unable to request notification permission.',
      );
    }
  };

  const sendTestNotification = async () => {
    setNotificationError(null);
    setNotificationMessage(null);
    try {
      await scheduleTestNotification();
      setPermission('granted');
      setNotificationMessage('Test notification scheduled. Check your notification tray.');
    } catch (cause) {
      setNotificationError(
        cause instanceof Error ? cause.message : 'Unable to schedule a test notification.',
      );
    }
  };

  const openDeviceSettings = async () => {
    setOpeningSettings(true);
    setNotificationError(null);
    try {
      await Linking.openSettings();
    } catch (cause) {
      setNotificationError(
        cause instanceof Error ? cause.message : 'Unable to open device settings.',
      );
    } finally {
      setOpeningSettings(false);
    }
  };

  return (
    <PageLayout title="Settings" subtitle="Preferences and app controls">
      <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <Text className="text-lg font-bold text-slate-900">Notifications</Text>
        <Text className="mt-2 text-sm text-slate-600">
          Permission: {permission === 'checking' ? 'Checking…' : permission}
        </Text>
        {permission !== 'granted' ? (
          <Pressable
            accessibilityRole="button"
            onPress={enableNotifications}
            className="mt-4 rounded-xl bg-emerald-600 px-4 py-3"
          >
            <Text className="text-center font-bold text-white">Enable notifications</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={sendTestNotification}
          className="mt-3 rounded-xl border border-slate-200 px-4 py-3"
        >
          <Text className="text-center font-bold text-slate-900">Send test notification</Text>
        </Pressable>
        {notificationMessage ? (
          <Text className="mt-3 text-sm font-medium text-emerald-700">{notificationMessage}</Text>
        ) : null}
        {notificationError ? (
          <Text className="mt-3 text-sm font-medium text-red-700">{notificationError}</Text>
        ) : null}
      </View>

      <View className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <Text className="text-lg font-bold text-amber-900">Keep reminders reliable</Text>
        <Text className="mt-2 text-sm text-amber-800">
          {Platform.OS === 'android'
            ? 'Some Android devices pause reminders to save battery. In app settings, allow background activity or set battery usage to Unrestricted if those options are available.'
            : 'Keep notifications enabled so scheduled reminders can reach you.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={openingSettings}
          onPress={openDeviceSettings}
          className="mt-4 rounded-xl border border-amber-300 px-4 py-3"
        >
          <Text className="text-center font-bold text-amber-900">
            {openingSettings ? 'Opening settings…' : 'Open app settings'}
          </Text>
        </Pressable>
      </View>

      <View className="gap-3">
        {[
          { label: 'Daily summary time', value: '8:00 pm' },
          { label: 'Hard caps', value: 'Enabled' },
          { label: 'Voice confidence', value: 'High' },
          { label: 'Offline mode', value: 'Ready' },
        ].map((item) => (
          <View
            key={item.label}
            className="flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <Text className="text-base font-medium text-slate-800">{item.label}</Text>
            <Text className="text-sm font-semibold text-slate-600">{item.value}</Text>
          </View>
        ))}
      </View>
    </PageLayout>
  );
}
