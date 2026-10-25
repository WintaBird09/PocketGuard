import type { Alert } from '../domain/alerts';

export const schedulerIdentifier = 'pocket-guard-scheduler';

export type ScheduledRequest = {
  identifier: string;
  data: Record<string, unknown> | undefined;
};

export type ScheduleRequest = {
  identifier: string;
  content: {
    title: string;
    body: string;
    data: Record<string, unknown>;
  };
  trigger: {
    type: 'date';
    date: Date;
    channelId: string;
    delivery?: 'bestEffort' | 'alarmClock';
  } | null;
};

export type SchedulerAdapter = {
  getPermission: () => Promise<string>;
  getScheduled: () => Promise<ScheduledRequest[]>;
  getDailySummaryTime?: () => Promise<string>;
  getExactAlarmPermission?: () => Promise<boolean | undefined>;
  onScheduled?: (alerts: readonly Alert[]) => Promise<void>;
  cancel: (identifier: string) => Promise<void>;
  schedule: (request: ScheduleRequest) => Promise<string>;
};

export function getNextNotificationTime(now: Date, hour = 20, minute = 0): Date {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export function parseDailySummaryTime(value: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error('Daily summary time must be in 24-hour HH:mm format.');
  return { hour: Number(match[1]), minute: Number(match[2]) };
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

    const exactAlarmGranted = await adapter.getExactAlarmPermission?.();
    const delivery =
      exactAlarmGranted === undefined ? undefined : exactAlarmGranted ? 'alarmClock' : 'bestEffort';
    const dailySummaryTime = alerts.some((alert) => alert.kind === 'daily_summary')
      ? parseDailySummaryTime((await adapter.getDailySummaryTime?.()) ?? '20:00')
      : null;
    const identifiers: string[] = [];

    try {
      for (const alert of alerts) {
        const channelId =
          alert.kind === 'daily_summary'
            ? 'daily'
            : alert.kind === 'savings_due' || alert.kind === 'debt_due' || alert.kind === 'loan_due'
              ? 'reminders'
              : 'alerts';
        const alertTriggerDate =
          alert.scheduledAt ??
          (alert.kind === 'daily_summary' && dailySummaryTime
            ? getNextNotificationTime(now, dailySummaryTime.hour, dailySummaryTime.minute)
            : getNextNotificationTime(now));
        const identifier = await adapter.schedule({
          identifier: alert.id,
          content: {
            title: alert.title,
            body: alert.body,
            data: {
              schedulerIdentifier,
              alertId: alert.id,
            },
          },
          trigger:
            alert.immediate || alert.kind === 'threshold'
              ? null
              : {
                  type: 'date',
                  date: alertTriggerDate,
                  channelId,
                  ...(delivery ? { delivery } : {}),
                },
        });
        identifiers.push(identifier);
      }
      await adapter.onScheduled?.(alerts);
    } catch (error) {
      await Promise.all(identifiers.map((identifier) => adapter.cancel(identifier)));
      throw error;
    }

    return identifiers;
  };
}

export function createDebouncedRescheduler(
  loadAlerts: () => Promise<readonly Alert[]>,
  reschedule: (alerts: readonly Alert[]) => Promise<string[]>,
  onError: (error: unknown) => void,
  delayMs = 500,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  let running = false;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void run();
    }, delayMs);
  };

  const run = async () => {
    if (running || !dirty) return;

    running = true;
    dirty = false;
    try {
      const alerts = await loadAlerts();
      if (!dirty) await reschedule(alerts);
    } catch (error) {
      onError(error);
    } finally {
      running = false;
      if (dirty && !timer) schedule();
    }
  };

  return () => {
    dirty = true;
    schedule();
  };
}
