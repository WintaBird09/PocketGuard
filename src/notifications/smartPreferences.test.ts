import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { runMigrations } from '../data/db';

import {
  defaultSmartNotificationPreferences,
  getSmartNotificationPreferences,
  parseSmartNotificationTime,
  saveSmartNotificationPreferences,
} from './smartPreferences';

describe('smart notification preferences', () => {
  it('uses the requested default times and keeps notifications opt-in', () => {
    const db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare('INSERT INTO households (id, household_id, name) VALUES (?, ?, ?);').run(
      'h1',
      'h1',
      'Home',
    );

    expect(getSmartNotificationPreferences(db as never, 'h1')).toEqual(
      defaultSmartNotificationPreferences,
    );
  });

  it('persists each toggle and time across reads', () => {
    const db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare('INSERT INTO households (id, household_id, name) VALUES (?, ?, ?);').run(
      'h1',
      'h1',
      'Home',
    );
    const preferences = {
      momoAlerts: true,
      morningEnabled: true,
      morningTime: '06:45',
      eveningEnabled: false,
      eveningTime: '20:30',
    };

    saveSmartNotificationPreferences(db as never, 'h1', preferences);

    expect(getSmartNotificationPreferences(db as never, 'h1')).toEqual(preferences);
  });

  it('validates times in 24-hour format', () => {
    expect(parseSmartNotificationTime('07:05')).toEqual({ hour: 7, minute: 5 });
    expect(() => parseSmartNotificationTime('25:00')).toThrow(/24-hour HH:mm/);
  });
});
