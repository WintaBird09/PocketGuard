import { describe, expect, it, vi } from 'vitest';

import {
  buildSmartScheduleRequests,
  rescheduleSmartNotifications,
  type SmartScheduleRequest,
  type SmartSchedulerAdapter,
} from './smartScheduler';
import { smartNotificationSchedulerIdentifier } from './smartPreferences';

const preferences = {
  momoAlerts: false,
  morningEnabled: true,
  morningTime: '07:00',
  eveningEnabled: true,
  eveningTime: '20:00',
};

function adapter(
  requests: SmartSchedulerAdapter['getScheduled'] extends () => Promise<infer R> ? R : never = [],
): SmartSchedulerAdapter & { scheduled: SmartScheduleRequest[] } {
  const state = {
    requests: [...requests],
    scheduled: [] as SmartScheduleRequest[],
  };
  return {
    scheduled: state.scheduled,
    getPermission: vi.fn(async () => 'granted'),
    getScheduled: vi.fn(async () => state.requests),
    cancel: vi.fn(async (identifier: string) => {
      state.requests = state.requests.filter((item) => item.identifier !== identifier);
    }),
    schedule: vi.fn(async (request) => {
      state.scheduled.push(request);
      return request.identifier;
    }),
  };
}

describe('smart notification scheduler', () => {
  it('creates local morning and evening requests with independent channels and IDs', () => {
    const requests = buildSmartScheduleRequests(preferences, new Date(2026, 10, 11, 6, 0), 2);
    expect(requests.map((request) => request.trigger.channelId)).toEqual([
      'morning-greeting',
      'morning-greeting',
      'evening-reminder',
    ]);
    expect(requests[0]?.content.body).toContain('Spend wisely today.');
    expect(requests.map((request) => request.identifier)).toEqual([
      `${smartNotificationSchedulerIdentifier}:morning:2026-11-11`,
      `${smartNotificationSchedulerIdentifier}:morning:2026-11-12`,
      `${smartNotificationSchedulerIdentifier}:evening`,
    ]);
    expect(requests[2]?.trigger).toMatchObject({ type: 'daily', hour: 20, minute: 0 });
  });

  it('uses positive evening wording whether today is already logged or not', () => {
    const requests = buildSmartScheduleRequests(preferences, new Date(2026, 10, 11, 19, 0), 1);
    const reminder = requests.find(
      (request) => request.content.data.smartNotificationType === 'evening',
    );
    expect(reminder?.content.body).toContain('Record today’s transactions.');
    expect(reminder?.content.body).toContain('nice work');
  });

  it('cancels old smart requests before scheduling enabled tasks and clears them when disabled', async () => {
    const scheduled = adapter([
      {
        identifier: 'old-smart',
        data: { schedulerIdentifier: smartNotificationSchedulerIdentifier },
      },
      { identifier: 'other', data: { schedulerIdentifier: 'other' } },
    ]);
    const ids = await rescheduleSmartNotifications(
      scheduled,
      { ...preferences, eveningEnabled: false },
      new Date(2026, 10, 11, 6, 0),
    );
    expect(scheduled.cancel).toHaveBeenCalledWith('old-smart');
    expect(ids.every((id) => id.includes(':morning:'))).toBe(true);

    const disabled = adapter([
      {
        identifier: 'old-smart',
        data: { schedulerIdentifier: smartNotificationSchedulerIdentifier },
      },
    ]);
    await expect(
      rescheduleSmartNotifications(
        disabled,
        { ...preferences, morningEnabled: false, eveningEnabled: false },
        new Date(2026, 10, 11, 6, 0),
      ),
    ).resolves.toEqual([]);
    expect(disabled.cancel).toHaveBeenCalledWith('old-smart');
  });
});
