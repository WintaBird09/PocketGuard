import { describe, expect, it, vi } from 'vitest';

import type { Alert } from '../domain/alerts';

import {
  createDebouncedRescheduler,
  createNotificationScheduler,
  getNextNotificationTime,
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
    expect(adapter.scheduledInputs[0].trigger).toMatchObject({ channelId: 'alerts' });
    expect(adapter.scheduledInputs[1].trigger).toMatchObject({ channelId: 'reminders' });
    expect(adapter.scheduledInputs[0].trigger).toMatchObject({
      type: 'date',
      date: new Date(2026, 9, 24, 20, 0),
    });
    expect(adapter.requests.some((request) => request.identifier === 'other-app')).toBe(true);
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
    const reschedule = vi.fn(async (nextAlerts: readonly Alert[]) => nextAlerts.map((a) => a.id));
    const onError = vi.fn();
    const enqueue = createDebouncedRescheduler(reschedule, onError, 100);

    enqueue(alerts.slice(0, 1));
    enqueue(alerts);
    await vi.advanceTimersByTimeAsync(100);

    expect(reschedule).toHaveBeenCalledTimes(1);
    expect(reschedule).toHaveBeenCalledWith(alerts);
    expect(onError).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
