import { beforeEach, describe, expect, it, vi } from 'vitest';

const notifications = vi.hoisted(() => ({
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(async () => undefined),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
}));

vi.mock('expo-notifications', () => notifications);
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { requestNotificationPermission, scheduleTestNotification } from './permissions';

describe('notification permission and test notification flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notifications.getPermissionsAsync.mockResolvedValue({
      granted: false,
      status: 'undetermined',
    });
    notifications.requestPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
    notifications.scheduleNotificationAsync.mockResolvedValue('test-notification');
  });

  it('creates the required Android channels and requests permission when not granted', async () => {
    await expect(requestNotificationPermission()).resolves.toBe('granted');

    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(3);
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'daily',
      expect.objectContaining({ name: 'Daily summaries' }),
    );
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'alerts',
      expect.objectContaining({ name: 'Budget alerts' }),
    );
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'reminders',
      expect.objectContaining({ name: 'Savings and debt reminders' }),
    );
    expect(notifications.requestPermissionsAsync).toHaveBeenCalledOnce();
  });

  it('schedules the immediate test notification for the Settings flow', async () => {
    await expect(scheduleTestNotification()).resolves.toBe('test-notification');

    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          title: 'Pocket Guard notifications are ready',
          channelId: 'alerts',
        }),
        trigger: null,
      }),
    );
  });

  it('does not schedule the test notification when permission is denied', async () => {
    notifications.requestPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied' });

    await expect(scheduleTestNotification()).rejects.toThrow(
      'Notification permission is not granted.',
    );
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
