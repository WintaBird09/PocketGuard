import type { Alert } from '../domain/alerts';

export const schedulerIdentifier = 'pocket-guard-scheduler';

export type ScheduledRequest = {
  identifier: string;
  data: Record<string, unknown> | undefined;
};

export type ScheduleRequest = {
  content: {
    title: string;
    body: string;
    data: Record<string, unknown>;
  };
  trigger: {
    type: 'date';
    date: Date;
    channelId: string;
  };
};

export type SchedulerAdapter = {
  getPermission: () => Promise<string>;
  getScheduled: () => Promise<ScheduledRequest[]>;
  cancel: (identifier: string) => Promise<void>;
  schedule: (request: ScheduleRequest) => Promise<string>;
};

export function getNextNotificationTime(now: Date, hour = 20): Date {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function createNotificationScheduler(adapter: SchedulerAdapter) {
  return async (alerts: readonly Alert[], now = new Date()): Promise<string[]> => {
    const scheduled = await adapter.getScheduled();
    const ownedRequests = scheduled.filter(
      (request) => request.data?.schedulerIdentifier === schedulerIdentifier,
    );
    await Promise.all(ownedRequests.map((request) => adapter.cancel(request.identifier)));

    if ((await adapter.getPermission()) !== 'granted') {
      return [];
    }

    const triggerDate = getNextNotificationTime(now);
    const identifiers: string[] = [];

    try {
      for (const alert of alerts) {
        const channelId =
          alert.kind === 'daily_summary'
            ? 'daily'
            : alert.kind === 'savings_due' || alert.kind === 'debt_due'
              ? 'reminders'
              : 'alerts';
        const identifier = await adapter.schedule({
          content: {
            title: alert.title,
            body: alert.body,
            data: {
              schedulerIdentifier,
              alertId: alert.id,
            },
          },
          trigger: {
            type: 'date',
            date: triggerDate,
            channelId,
          },
        });
        identifiers.push(identifier);
      }
    } catch (error) {
      await Promise.all(identifiers.map((identifier) => adapter.cancel(identifier)));
      throw error;
    }

    return identifiers;
  };
}

export function createDebouncedRescheduler(
  reschedule: (alerts: readonly Alert[]) => Promise<string[]>,
  onError: (error: unknown) => void,
  delayMs = 500,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latestAlerts: readonly Alert[] = [];

  return (alerts: readonly Alert[]) => {
    latestAlerts = alerts;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void reschedule(latestAlerts).catch(onError);
    }, delayMs);
  };
}
