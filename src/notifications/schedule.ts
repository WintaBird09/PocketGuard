import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { openAppDatabase } from '../data/db';

import { getNotificationPermission } from './permissions';
import {
  getPersistedBudgetAlerts,
  getPersistedPaceAlerts,
  getPersistedSavingsAndDebtReminders,
  markPersistedThresholdAlertsScheduled,
} from './persisted-alerts';
import { getPersistedDailySummaries, getPersistedDailySummaryTime } from './daily-summary';
import {
  createDebouncedRescheduler,
  createNotificationScheduler,
  schedulerIdentifier,
  type ScheduleRequest,
} from './scheduler';

const reschedule = createNotificationScheduler({
  getPermission: getNotificationPermission,
  getScheduled: async () =>
    (await Notifications.getAllScheduledNotificationsAsync()).map((request) => ({
      identifier: request.identifier,
      data: request.content.data,
    })),
  getExactAlarmPermission: async () =>
    Platform.OS === 'android'
      ? (await Notifications.getExactAlarmPermissionsAsync()).granted
      : undefined,
  getDailySummaryTime: async () => getPersistedDailySummaryTime(await openAppDatabase()),
  onScheduled: async (alerts) =>
    markPersistedThresholdAlertsScheduled(await openAppDatabase(), alerts),
  cancel: Notifications.cancelScheduledNotificationAsync,
  schedule: (request: ScheduleRequest) => {
    const trigger =
      request.trigger === null
        ? null
        : {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: request.trigger.date,
            channelId: request.trigger.channelId,
            ...(request.trigger.delivery ? { delivery: request.trigger.delivery } : {}),
          };
    return Notifications.scheduleNotificationAsync({
      identifier: request.identifier,
      content: request.content,
      trigger,
    });
  },
});

const enqueueReschedule = createDebouncedRescheduler(
  async () => {
    const db = await openAppDatabase();
    return [
      ...getPersistedBudgetAlerts(db),
      ...getPersistedPaceAlerts(db),
      ...getPersistedSavingsAndDebtReminders(db),
      ...getPersistedDailySummaries(db),
    ];
  },
  reschedule,
  (error) => console.error('[notifications] Failed to reschedule alerts.', error),
);

export function scheduleNotificationRefresh(): void {
  if (Platform.OS === 'web') return;
  enqueueReschedule();
}

export { schedulerIdentifier };
