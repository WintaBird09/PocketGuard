import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export type NotificationPermissionState = 'granted' | 'denied' | 'undetermined';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function configureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Promise.all([
    Notifications.setNotificationChannelAsync('daily', {
      name: 'Daily summaries',
      importance: Notifications.AndroidImportance.DEFAULT,
    }),
    Notifications.setNotificationChannelAsync('alerts', {
      name: 'Budget alerts',
      importance: Notifications.AndroidImportance.HIGH,
    }),
    Notifications.setNotificationChannelAsync('reminders', {
      name: 'Savings and debt reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    }),
  ]);
}

export async function getNotificationPermission(): Promise<NotificationPermissionState> {
  await configureNotificationChannels();

  return (await Notifications.getPermissionsAsync()).status;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  await configureNotificationChannels();

  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  return permission.status;
}

export async function getExactAlarmPermission(): Promise<boolean> {
  return (await Notifications.getExactAlarmPermissionsAsync()).granted;
}

export async function requestExactAlarmPermission(): Promise<boolean> {
  return (await Notifications.requestExactAlarmPermissionsAsync()).granted;
}

export async function scheduleTestNotification(): Promise<string> {
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission is not granted.');
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Pocket Guard notifications are ready',
      body: 'Your test notification was delivered successfully.',
      ...(Platform.OS === 'android' ? { channelId: 'alerts' } : {}),
    },
    trigger: null,
  });
}
