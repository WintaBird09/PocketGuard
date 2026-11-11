import type { DatabaseLike } from '../data/db';
import { settings } from '../data/repos';

export const smartNotificationSchedulerIdentifier = 'pocket-guard-smart-notifications';
export const momoAlertsSettingKey = 'smart_notification_momo_alerts';
export const morningGreetingSettingKey = 'smart_notification_morning_enabled';
export const morningGreetingTimeSettingKey = 'smart_notification_morning_time';
export const eveningReminderSettingKey = 'smart_notification_evening_enabled';
export const eveningReminderTimeSettingKey = 'smart_notification_evening_time';

export type SmartNotificationPreferences = {
  momoAlerts: boolean;
  morningEnabled: boolean;
  morningTime: string;
  eveningEnabled: boolean;
  eveningTime: string;
};

export const defaultSmartNotificationPreferences: SmartNotificationPreferences = {
  momoAlerts: false,
  morningEnabled: false,
  morningTime: '07:00',
  eveningEnabled: false,
  eveningTime: '20:00',
};

export function parseSmartNotificationTime(value: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error('Choose a valid time in 24-hour HH:mm format.');
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

const storedBoolean = (db: DatabaseLike, householdId: string, key: string): boolean =>
  settings.get(db, householdId, key) === 'true';

export function getSmartNotificationPreferences(
  db: DatabaseLike,
  householdId: string,
): SmartNotificationPreferences {
  const morningTime =
    settings.get(db, householdId, morningGreetingTimeSettingKey) ??
    defaultSmartNotificationPreferences.morningTime;
  const eveningTime =
    settings.get(db, householdId, eveningReminderTimeSettingKey) ??
    defaultSmartNotificationPreferences.eveningTime;
  parseSmartNotificationTime(morningTime);
  parseSmartNotificationTime(eveningTime);
  return {
    momoAlerts: storedBoolean(db, householdId, momoAlertsSettingKey),
    morningEnabled: storedBoolean(db, householdId, morningGreetingSettingKey),
    morningTime,
    eveningEnabled: storedBoolean(db, householdId, eveningReminderSettingKey),
    eveningTime,
  };
}

export function saveSmartNotificationPreferences(
  db: DatabaseLike,
  householdId: string,
  preferences: SmartNotificationPreferences,
): void {
  parseSmartNotificationTime(preferences.morningTime);
  parseSmartNotificationTime(preferences.eveningTime);
  settings.set(db, householdId, momoAlertsSettingKey, preferences.momoAlerts);
  settings.set(db, householdId, morningGreetingSettingKey, preferences.morningEnabled);
  settings.set(db, householdId, morningGreetingTimeSettingKey, preferences.morningTime);
  settings.set(db, householdId, eveningReminderSettingKey, preferences.eveningEnabled);
  settings.set(db, householdId, eveningReminderTimeSettingKey, preferences.eveningTime);
}
