import * as Notifications from 'expo-notifications';

import { buildAlerts, type Alert } from '../domain/alerts';
import { getHomeDashboardSnapshot } from '../data/epic3';

import { getNotificationPermission } from './permissions';
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
  cancel: Notifications.cancelScheduledNotificationAsync,
  schedule: (request: ScheduleRequest) =>
    Notifications.scheduleNotificationAsync({
      ...request,
      trigger: {
        ...request.trigger,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
      },
    }),
});

function getActiveAlerts(): Alert[] {
  const snapshot = getHomeDashboardSnapshot();
  const alerts: Alert[] = [];

  for (const line of snapshot.lines) {
    if (line.planned <= 0) continue;
    alerts.push(
      ...buildAlerts({
        lineName: line.name,
        planned: line.planned,
        spent: line.spent,
        pctUsed: (line.spent / line.planned) * 100,
        daysLeft: 12,
      }),
    );
  }

  return alerts;
}

const enqueueReschedule = createDebouncedRescheduler(reschedule, (error) =>
  console.error('[notifications] Failed to reschedule alerts.', error),
);

export function scheduleNotificationRefresh(): void {
  enqueueReschedule(getActiveAlerts());
}

export { schedulerIdentifier };
