import { getDailyQuote } from './quotes';
import {
  smartNotificationSchedulerIdentifier,
  type SmartNotificationPreferences,
} from './smartPreferences';

export type SmartNotificationType = 'morning' | 'evening';

export type SmartScheduleRequest = {
  identifier: string;
  content: {
    title: string;
    body: string;
    data: Record<string, unknown>;
  };
  trigger:
    | {
        type: 'date';
        date: Date;
        channelId: string;
        delivery?: 'bestEffort' | 'alarmClock';
      }
    | {
        type: 'daily';
        hour: number;
        minute: number;
        channelId: string;
        delivery?: 'bestEffort' | 'alarmClock';
      };
};

export type SmartScheduledRequest = {
  identifier: string;
  data: Record<string, unknown> | undefined;
};

export type SmartSchedulerAdapter = {
  getPermission: () => Promise<string>;
  getScheduled: () => Promise<SmartScheduledRequest[]>;
  getExactAlarmPermission?: () => Promise<boolean | undefined>;
  cancel: (identifier: string) => Promise<void>;
  schedule: (request: SmartScheduleRequest) => Promise<string>;
};

export function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function parseTime(value: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error('Choose a valid time in 24-hour HH:mm format.');
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function scheduleDates(now: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, day) => {
    const date = new Date(now);
    date.setDate(now.getDate() + day);
    date.setHours(0, 0, 0, 0);
    return date;
  });
}

function atTime(date: Date, time: string): Date {
  const { hour, minute } = parseTime(time);
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

export function buildSmartScheduleRequests(
  preferences: SmartNotificationPreferences,
  now: Date,
  days = 30,
): SmartScheduleRequest[] {
  if (!Number.isSafeInteger(days) || days < 1 || days > 31) {
    throw new Error('Smart notifications must be scheduled for between 1 and 31 days.');
  }
  const requests: SmartScheduleRequest[] = [];

  for (const date of scheduleDates(now, days)) {
    const dateKey = localDateKey(date);
    if (preferences.morningEnabled) {
      const trigger = atTime(date, preferences.morningTime);
      if (trigger > now) {
        const quote = getDailyQuote(dateKey);
        requests.push({
          identifier: `${smartNotificationSchedulerIdentifier}:morning:${dateKey}`,
          content: {
            title: 'Good morning!',
            body: `Spend wisely today. ${quote.text}`,
            data: {
              schedulerIdentifier: smartNotificationSchedulerIdentifier,
              smartNotificationType: 'morning',
              dateKey,
              quoteId: quote.id,
            },
          },
          trigger: { type: 'date', date: trigger, channelId: 'morning-greeting' },
        });
      }
    }
  }
  if (preferences.eveningEnabled) {
    const { hour, minute } = parseTime(preferences.eveningTime);
    requests.push({
      identifier: `${smartNotificationSchedulerIdentifier}:evening`,
      content: {
        title: 'Evening transaction reminder',
        body: 'Record today’s transactions. If you’ve already logged everything, nice work.',
        data: {
          schedulerIdentifier: smartNotificationSchedulerIdentifier,
          smartNotificationType: 'evening',
        },
      },
      trigger: { type: 'daily', hour, minute, channelId: 'evening-reminder' },
    });
  }
  return requests;
}

export async function rescheduleSmartNotifications(
  adapter: SmartSchedulerAdapter,
  preferences: SmartNotificationPreferences,
  now = new Date(),
): Promise<string[]> {
  const scheduled = await adapter.getScheduled();
  const managed = scheduled.filter(
    (request) => request.data?.schedulerIdentifier === smartNotificationSchedulerIdentifier,
  );
  await Promise.all(managed.map((request) => adapter.cancel(request.identifier)));
  if ((await adapter.getPermission()) !== 'granted') return [];

  const requests = buildSmartScheduleRequests(preferences, now);
  const exactAlarmGranted = await adapter.getExactAlarmPermission?.();
  const planned = requests.map((request) => ({
    ...request,
    trigger: {
      ...request.trigger,
      ...(exactAlarmGranted === undefined
        ? {}
        : { delivery: exactAlarmGranted ? ('alarmClock' as const) : ('bestEffort' as const) }),
    },
  }));

  const identifiers: string[] = [];
  try {
    for (const request of planned) identifiers.push(await adapter.schedule(request));
  } catch (error) {
    await Promise.all(identifiers.map((identifier) => adapter.cancel(identifier)));
    throw error;
  }
  return identifiers;
}
