import { describe, expect, it, vi } from 'vitest';

import type { Alert } from '../domain/alerts';

import {
  createDebouncedRescheduler,
  createNotificationScheduler,
  getNextNotificationTime,
  parseDailySummaryTime,
  schedulerIdentifier,
  type ScheduleRequest,
  type SchedulerAdapter,
  type ScheduledRequest,
} from './scheduler';

const alerts: Alert[] = [
  { id: 'fuel-80', title: 'Fuel at 80%', body: 'Fuel alert', kind: 'threshold' },
  { id: 'debt-due', title: 'Debt payment due', body: 'Due alert', kind: 'debt_due' },
];

function makeAdapter(
  initialRequests: ScheduledRequest[] = [],
  permission = 'granted',
): SchedulerAdapter & {
  requests: ScheduledRequest[];
  scheduledInputs: Parameters<SchedulerAdapter['schedule']>[0][];
} {
  const adapter = {
    requests: [...initialRequests],
    scheduledInputs: [] as ScheduleRequest[],
    getPermission: vi.fn(async () => permission),
    getScheduled: vi.fn(async () => adapter.requests),
    cancel: vi.fn(async (identifier: string) => {
      adapter.requests = adapter.requests.filter((request) => request.identifier !== identifier);
    }),
    schedule: vi.fn(async (request: ScheduleRequest) => {
      adapter.scheduledInputs.push(request);
      const identifier = `scheduled-${adapter.scheduledInputs.length}`;
      adapter.requests.push({
        identifier,
        data: request.content.data as Record<string, unknown>,
      });
      return identifier;
    }),
  };
  return adapter;
}

describe('notification scheduler', () => {
  it('chooses the next local 8pm and rolls over when 8pm has passed', () => {
    expect(getNextNotificationTime(new Date(2026, 9, 24, 19, 59))).toEqual(
      new Date(2026, 9, 24, 20, 0),
    );
    expect(getNextNotificationTime(new Date(2026, 9, 24, 20, 0))).toEqual(
      new Date(2026, 9, 25, 20, 0),
    );
  });

  it('validates 24-hour summary times', () => {
    expect(parseDailySummaryTime('07:05')).toEqual({ hour: 7, minute: 5 });
    expect(parseDailySummaryTime('20:00')).toEqual({ hour: 20, minute: 0 });
    expect(() => parseDailySummaryTime('24:00')).toThrow(
      'Daily summary time must be in 24-hour HH:mm format.',
    );
  });

  it('replaces only app-managed schedules and assigns alert channels', async () => {
    const adapter = makeAdapter([
      { identifier: 'old-app', data: { schedulerIdentifier } },
      { identifier: 'other-app', data: { schedulerIdentifier: 'other-app' } },
    ]);
    const schedule = createNotificationScheduler(adapter);

    const identifiers = await schedule(alerts, new Date(2026, 9, 24, 10, 0));

    expect(adapter.cancel).toHaveBeenCalledTimes(1);
    expect(adapter.cancel).toHaveBeenCalledWith('old-app');
    expect(identifiers).toEqual(['scheduled-1', 'scheduled-2']);
    expect(adapter.scheduledInputs[0].trigger).toBeNull();
    expect(adapter.scheduledInputs[1].trigger).toMatchObject({
      channelId: 'reminders',
      type: 'date',
      date: new Date(2026, 9, 24, 20, 0),
    });
    expect(adapter.requests.some((request) => request.identifier === 'other-app')).toBe(true);
  });

  it('uses explicit dates for pace and reminder alerts', async () => {
    const adapter = makeAdapter();
    const scheduledAt = new Date(2026, 9, 25, 8, 0);
    const scheduledAlerts: Alert[] = [
      {
        id: 'pace:2026-10:fuel',
        title: 'Fuel spending pace is ahead',
        body: 'Fuel is 85% used, 6 days left.',
        kind: 'pace',
        scheduledAt,
      },
      {
        id: 'savings-reminder:commitment:7',
        title: 'Savings commitment',
        body: 'Due in 7 days.',
        kind: 'savings_due',
        scheduledAt,
      },
    ];

    await createNotificationScheduler(adapter)(scheduledAlerts, new Date(2026, 9, 24, 10, 0));

    expect(adapter.scheduledInputs.map((request) => request.trigger)).toEqual([
      { type: 'date', date: scheduledAt, channelId: 'alerts' },
      { type: 'date', date: scheduledAt, channelId: 'reminders' },
    ]);
  });

  it('repeats active pace alerts daily at 08:00', async () => {
    const adapter = makeAdapter();
    adapter.getExactAlarmPermission = vi.fn(async () => false);
    const paceAlert: Alert = {
      id: 'pace:2026-10:fuel',
      title: 'Fuel spending pace is ahead',
      body: 'Fuel is 85% used, 6 days left.',
      kind: 'pace',
      repeatDailyAt: { hour: 8, minute: 0 },
    };
    const reminder: Alert = {
      id: 'debt-reminder:debt:7',
      title: 'Debt reminder',
      body: 'Due in 7 days.',
      kind: 'debt_due',
      scheduledAt: new Date(2026, 9, 31, 9, 0),
    };

    await createNotificationScheduler(adapter)([paceAlert, reminder], new Date(2026, 9, 24, 10, 0));

    expect(adapter.scheduledInputs[0].trigger).toEqual({
      type: 'daily',
      hour: 8,
      minute: 0,
      channelId: 'alerts',
      delivery: 'bestEffort',
    });
    expect(adapter.scheduledInputs[1].trigger).toMatchObject({
      type: 'date',
      date: reminder.scheduledAt,
      channelId: 'reminders',
      delivery: 'bestEffort',
    });
  });

  it('uses alarm-clock delivery when Android exact-alarm access is granted', async () => {
    const adapter = makeAdapter();
    adapter.getExactAlarmPermission = vi.fn(async () => true);
    const reminder: Alert = {
      id: 'debt-reminder:debt:7',
      title: 'Debt reminder',
      body: 'Due in 7 days.',
      kind: 'debt_due',
      scheduledAt: new Date(2026, 9, 31, 9, 0),
    };

    await createNotificationScheduler(adapter)([reminder], new Date(2026, 9, 24, 10, 0));

    expect(adapter.scheduledInputs[0].trigger).toMatchObject({ delivery: 'alarmClock' });
  });

  it('schedules the next daily summary at its configured local time', async () => {
    const adapter = makeAdapter();
    adapter.getDailySummaryTime = vi.fn(async () => '07:05');
    const schedule = createNotificationScheduler(adapter);
    const summary: Alert = {
      id: 'daily-summary',
      title: 'Daily budget summary',
      body: 'Spent today: 100 XAF.',
      kind: 'daily_summary',
    };

    await schedule([summary], new Date(2026, 9, 24, 10, 0));

    expect(adapter.getDailySummaryTime).toHaveBeenCalledOnce();
    expect(adapter.scheduledInputs[0].trigger).toMatchObject({
      type: 'date',
      date: getNextNotificationTime(new Date(2026, 9, 24, 10, 0), 7, 5),
      channelId: 'daily',
    });
  });

  it('removes managed notifications but does not schedule when permission is not granted', async () => {
    const adapter = makeAdapter(
      [{ identifier: 'old-app', data: { schedulerIdentifier } }],
      'denied',
    );
    const schedule = createNotificationScheduler(adapter);

    await expect(schedule(alerts)).resolves.toEqual([]);
    expect(adapter.cancel).toHaveBeenCalledTimes(1);
    expect(adapter.cancel).toHaveBeenCalledWith('old-app');
    expect(adapter.schedule).not.toHaveBeenCalled();
  });

  it('debounces changes and reschedules from the latest alert state', async () => {
    vi.useFakeTimers();
    const loadAlerts = vi.fn(async () => alerts);
    const reschedule = vi.fn(async (nextAlerts: readonly Alert[]) => nextAlerts.map((a) => a.id));
    const onError = vi.fn();
    const enqueue = createDebouncedRescheduler(loadAlerts, reschedule, onError, 100);

    enqueue();
    enqueue();
    await vi.advanceTimersByTimeAsync(100);

    expect(loadAlerts).toHaveBeenCalledOnce();
    expect(reschedule).toHaveBeenCalledTimes(1);
    expect(reschedule).toHaveBeenCalledWith(alerts);
    expect(onError).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('reloads the latest persisted state when a change arrives during an active refresh', async () => {
    vi.useFakeTimers();
    let resolveFirstLoad: ((value: readonly Alert[]) => void) | undefined;
    const loadAlerts = vi
      .fn<() => Promise<readonly Alert[]>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstLoad = resolve;
          }),
      )
      .mockResolvedValueOnce(alerts);
    const reschedule = vi.fn(async (nextAlerts: readonly Alert[]) => nextAlerts.map((a) => a.id));
    const onError = vi.fn();
    const enqueue = createDebouncedRescheduler(loadAlerts, reschedule, onError, 100);

    enqueue();
    await vi.advanceTimersByTimeAsync(100);
    enqueue();
    resolveFirstLoad?.(alerts.slice(0, 1));
    await vi.runAllTimersAsync();

    expect(loadAlerts).toHaveBeenCalledTimes(2);
    expect(reschedule).toHaveBeenCalledOnce();
    expect(reschedule).toHaveBeenCalledWith(alerts);
    expect(onError).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
