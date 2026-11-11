import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { PermissionsAndroid, Platform, Pressable, Switch, Text, View } from 'react-native';

import { getMomoNativeModule } from '@/src/momo/native';
import { MOMO_SENDER_ID } from '@/src/momo/constants';
import { useDatabase } from '@/src/ui/useDatabase';
import { Banner } from '@/src/ui/controls';

import { requestNotificationPermission } from './permissions';
import { scheduleNotificationRefresh } from './schedule';
import {
  defaultSmartNotificationPreferences,
  getSmartNotificationPreferences,
  saveSmartNotificationPreferences,
  type SmartNotificationPreferences,
} from './smartPreferences';

type ToggleKey = 'momoAlerts' | 'morningEnabled' | 'eveningEnabled';
type TimeKey = 'morningTime' | 'eveningTime';

const toggleLabels: Record<ToggleKey, { title: string; detail: string }> = {
  momoAlerts: {
    title: 'MoMo transaction alerts',
    detail: 'Get an alert when a Mobile Money transaction arrives.',
  },
  morningEnabled: {
    title: 'Morning greeting',
    detail: 'Start the day with a greeting and a finance tip.',
  },
  eveningEnabled: {
    title: 'Evening reminder',
    detail: 'Get a reminder to record today’s transactions.',
  },
};

function timeAsDate(value: string): Date {
  const [hour, minute] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

function timeFromDate(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function SmartNotificationSettings() {
  const { db, householdId, loading, refresh } = useDatabase();
  const [permissionTarget, setPermissionTarget] = useState<ToggleKey | null>(null);
  const [timePicker, setTimePicker] = useState<TimeKey | null>(null);
  const [timeDraft, setTimeDraft] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const preferences =
    db && householdId
      ? getSmartNotificationPreferences(db, householdId)
      : defaultSmartNotificationPreferences;

  const persist = async (next: SmartNotificationPreferences) => {
    if (!db || !householdId) throw new Error('Your notification settings are not ready yet.');
    saveSmartNotificationPreferences(db, householdId, next);
    scheduleNotificationRefresh();
    refresh();
    setMessage('Notification settings saved.');
  };

  const toggle = async (key: ToggleKey, enabled: boolean) => {
    setError(null);
    setMessage(null);
    if (enabled) {
      if (key === 'momoAlerts' && Platform.OS !== 'android') {
        setError('Mobile Money SMS alerts are available on Android only.');
        return;
      }
      setPermissionTarget(key);
      return;
    }

    try {
      if (key === 'momoAlerts') {
        await getMomoNativeModule()?.setTransactionAlertsEnabled(false);
      }
      await persist({ ...preferences, [key]: false });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to turn off this notification.');
    }
  };

  const continueEnable = async () => {
    if (!permissionTarget) return;
    setError(null);
    try {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') {
        setError('Notification permission was not granted. This alert remains off.');
        setPermissionTarget(null);
        return;
      }

      if (permissionTarget === 'momoAlerts') {
        const smsPermission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
        );
        if (smsPermission !== PermissionsAndroid.RESULTS.GRANTED) {
          setError('SMS permission was not granted. Mobile Money alerts remain off.');
          setPermissionTarget(null);
          return;
        }
        const native = getMomoNativeModule();
        if (!native) throw new Error('Rebuild Pocket Guard to enable Mobile Money alerts.');
        await native.setTransactionAlertsEnabled(true);
      }

      await persist({ ...preferences, [permissionTarget]: true });
      setPermissionTarget(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to enable this notification.');
    }
  };

  const updateTime = async (key: TimeKey, date: Date) => {
    const time = timeFromDate(date);
    try {
      await persist({ ...preferences, [key]: time });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the notification time.');
    }
  };

  const openTimePicker = (key: TimeKey) => {
    if (Platform.OS === 'web') {
      setError('Notification times can be changed in the Android or iOS app.');
      return;
    }
    const value = timeAsDate(preferences[key]);
    setError(null);
    setMessage(null);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'time',
        is24Hour: true,
        onValueChange: (_event, date) => {
          if (date) void updateTime(key, date);
        },
      });
      return;
    }
    setTimeDraft(value);
    setTimePicker(key);
  };

  return (
    <View className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
      <Text className="text-base font-bold text-slate-900 dark:text-slate-100">
        Smart notifications
      </Text>
      <Text className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Reminders use your device’s local time. Scheduled alerts are restored after a reboot.
      </Text>

      {(['momoAlerts', 'morningEnabled', 'eveningEnabled'] as const).map((key) => {
        const item = toggleLabels[key];
        const enabled = preferences[key];
        return (
          <View
            key={key}
            className="mt-4 flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3"
          >
            <View className="mr-3 flex-1">
              <Text className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {item.title}
              </Text>
              <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.detail}</Text>
            </View>
            <Switch
              accessibilityLabel={item.title}
              value={enabled}
              onValueChange={(next) => void toggle(key, next)}
              disabled={loading || !db || (key === 'momoAlerts' && Platform.OS !== 'android')}
            />
          </View>
        );
      })}

      <View className="mt-4 flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Morning greeting time
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose morning greeting time, ${preferences.morningTime}`}
          onPress={() => openTimePicker('morningTime')}
          disabled={loading || !db || Platform.OS === 'web'}
          className="min-h-11 flex-row items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2"
        >
          <Ionicons name="time-outline" size={17} color="#047857" />
          <Text className="font-bold text-slate-800 dark:text-slate-100">
            {preferences.morningTime}
          </Text>
        </Pressable>
      </View>
      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Evening reminder time
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose evening reminder time, ${preferences.eveningTime}`}
          onPress={() => openTimePicker('eveningTime')}
          disabled={loading || !db || Platform.OS === 'web'}
          className="min-h-11 flex-row items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2"
        >
          <Ionicons name="time-outline" size={17} color="#047857" />
          <Text className="font-bold text-slate-800 dark:text-slate-100">
            {preferences.eveningTime}
          </Text>
        </Pressable>
      </View>

      {Platform.OS === 'ios' && timePicker ? (
        <View className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
          <DateTimePicker
            value={timeDraft ?? timeAsDate(preferences[timePicker])}
            mode="time"
            display="spinner"
            onValueChange={(_event, date) => {
              if (date) setTimeDraft(date);
            }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (timeDraft) void updateTime(timePicker, timeDraft);
              setTimeDraft(null);
              setTimePicker(null);
            }}
            className="mt-2 min-h-10 items-center justify-center"
          >
            <Text className="font-semibold text-emerald-800 dark:text-emerald-200">Done</Text>
          </Pressable>
        </View>
      ) : null}

      {permissionTarget ? (
        <View className="mt-4 rounded-xl bg-emerald-50 dark:bg-emerald-950 p-3">
          <Text className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
            Allow {toggleLabels[permissionTarget].title.toLowerCase()}?
          </Text>
          <Text className="mt-1 text-sm text-emerald-900 dark:text-emerald-200">
            Pocket Guard uses notifications for this reminder. Mobile Money alerts also require SMS
            access and only process messages from “{MOMO_SENDER_ID}” on this device.
          </Text>
          <View className="mt-3 flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              onPress={() => setPermissionTarget(null)}
              className="min-h-11 flex-1 items-center justify-center rounded-xl border border-emerald-700 px-3"
            >
              <Text className="font-semibold text-emerald-900 dark:text-emerald-200">Not now</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void continueEnable()}
              className="min-h-11 flex-1 items-center justify-center rounded-xl bg-emerald-700 px-3"
            >
              <Text className="font-bold text-white">Continue</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {error ? <Banner tone="error">{error}</Banner> : null}
      {message ? <Banner tone="success">{message}</Banner> : null}
    </View>
  );
}
