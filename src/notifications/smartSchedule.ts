import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { hasActiveDatabase } from '../data/activeDatabase';
import { openAppDatabase } from '../data/db';
import { getActiveHouseholdId } from '../data/household';

import { getNotificationPermission } from './permissions';
import { createDebouncedRescheduler } from './scheduler';
import { rescheduleSmartNotifications, type SmartScheduleRequest } from './smartScheduler';
import {
  getSmartNotificationPreferences,
  type SmartNotificationPreferences,
} from './smartPreferences';

type LoadedState = {
  db: Awaited<ReturnType<typeof openAppDatabase>>;
  householdId: string;
  preferences: SmartNotificationPreferences;
};

const enqueueReschedule = createDebouncedRescheduler<LoadedState>(
  async () => {
    if (!hasActiveDatabase()) return [];
    const db = await openAppDatabase();
    const householdId = getActiveHouseholdId(db);
    return [{ db, householdId, preferences: getSmartNotificationPreferences(db, householdId) }];
  },
  async ([state]) => {
    if (!state || Platform.OS === 'web') return [];
    return rescheduleSmartNotifications(
      {
        getPermission: getNotificationPermission,
        getScheduled: async () =>
          (await Notifications.getAllScheduledNotificationsAsync()).map((request) => ({
            identifier: request.identifier,
            data: request.content.data,
          })),
        getExactAlarmPermission: async () =>
          Platform.OS === 'android'
            ? (await Notifications.getExactAlarmPermissionsAsync()).granted
            : false,
        cancel: Notifications.cancelScheduledNotificationAsync,
        schedule: (request: SmartScheduleRequest) => {
          const trigger =
            request.trigger.type === 'date'
              ? {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: request.trigger.date,
                  channelId: request.trigger.channelId,
                  ...(Platform.OS === 'android'
                    ? { delivery: request.trigger.delivery ?? 'bestEffort' }
                    : {}),
                }
              : {
                  type: Notifications.SchedulableTriggerInputTypes.DAILY,
                  hour: request.trigger.hour,
                  minute: request.trigger.minute,
                  channelId: request.trigger.channelId,
                  ...(Platform.OS === 'android'
                    ? { delivery: request.trigger.delivery ?? 'bestEffort' }
                    : {}),
                };
          return Notifications.scheduleNotificationAsync({
            identifier: request.identifier,
            content: { ...request.content, sound: 'default' },
            trigger,
          });
        },
      },
      state.preferences,
    );
  },
  (error) => console.error('[notifications] Failed to reschedule smart reminders.', error),
);

export function scheduleSmartNotificationRefresh(): void {
  if (Platform.OS === 'web' || !hasActiveDatabase()) return;
  enqueueReschedule();
}
