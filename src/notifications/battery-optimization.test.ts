import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

import { runMigrations } from '../data/db';

import {
  batteryOptimizationOnboardingKey,
  dismissBatteryOptimizationOnboarding,
  shouldShowBatteryOptimizationOnboarding,
} from './battery-optimization';

describe('battery optimization onboarding flow', () => {
  const database = new Database(':memory:');

  afterEach(() => {
    database.exec('DELETE FROM outbox; DELETE FROM settings; DELETE FROM households;');
  });

  runMigrations(database as never);
  database
    .prepare(
      `INSERT INTO households (id, household_id, name) VALUES ('household-1', 'household-1', 'Test');`,
    )
    .run();

  it('shows the first-run guidance only on Android until the user dismisses it', () => {
    expect(
      shouldShowBatteryOptimizationOnboarding(database as never, 'household-1', 'android'),
    ).toBe(true);
    expect(shouldShowBatteryOptimizationOnboarding(database as never, 'household-1', 'ios')).toBe(
      false,
    );
    expect(shouldShowBatteryOptimizationOnboarding(database as never, 'household-1', 'web')).toBe(
      false,
    );

    dismissBatteryOptimizationOnboarding(database as never, 'household-1');

    expect(
      shouldShowBatteryOptimizationOnboarding(database as never, 'household-1', 'android'),
    ).toBe(false);
    expect(
      database
        .prepare('SELECT value FROM settings WHERE household_id = ? AND key = ?;')
        .get('household-1', batteryOptimizationOnboardingKey),
    ).toMatchObject({ value: 'true' });
    expect(database.prepare('SELECT table_name, op FROM outbox;').all()).toEqual([
      { table_name: 'settings', op: 'upsert' },
    ]);
  });
});
