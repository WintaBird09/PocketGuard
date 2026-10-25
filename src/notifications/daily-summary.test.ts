import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

import { runMigrations } from '../data/db';
import { settings } from '../data/repos';

import {
  dailySummarySettingKey,
  defaultDailySummaryTime,
  getPersistedDailySummary,
  getPersistedDailySummaries,
  getPersistedDailySummaryTime,
} from './daily-summary';

describe('persisted daily summary', () => {
  let db: Database.Database | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it('summarizes confirmed spending, high-use lines, and persisted items due tomorrow', () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name)
       VALUES ('household-1', 'household-1', 'Personal');`,
    ).run();
    db.prepare(
      `INSERT INTO budget_lines
        (id, household_id, name, kind, sort_order)
       VALUES
        ('food', 'household-1', 'Food', 'variable', 1),
        ('fuel', 'household-1', 'Fuel', 'running', 2),
        ('savings-line', 'household-1', 'Savings', 'savings', 3);`,
    ).run();
    db.prepare(
      `INSERT INTO allocations (id, household_id, line_id, month, planned_amount)
       VALUES
        ('food-plan', 'household-1', 'food', '2026-10', 2000),
        ('fuel-plan', 'household-1', 'fuel', '2026-10', 1000);`,
    ).run();
    const insertTransaction = db.prepare(
      `INSERT INTO transactions
        (id, household_id, occurred_at, amount, direction, line_id, status)
       VALUES (?, 'household-1', ?, ?, 'expense', ?, ?);`,
    );
    insertTransaction.run('food-today', '2026-10-24T03:00:00.000Z', 300, 'food', 'confirmed');
    insertTransaction.run('fuel-today', '2026-10-24T04:00:00.000Z', 100, 'fuel', 'confirmed');
    insertTransaction.run('fuel-month', '2026-10-12T12:00:00.000Z', 750, 'fuel', 'confirmed');
    insertTransaction.run('ignored-draft', '2026-10-24T05:00:00.000Z', 5000, 'food', 'draft');
    db.prepare(
      `INSERT INTO debts (id, household_id, creditor, original_amount, deadline)
       VALUES ('debt-1', 'household-1', 'Alex', 5000, '2026-10-25');`,
    ).run();
    db.prepare(
      `INSERT INTO savings_goals (id, household_id, name, target_amount, due_date)
       VALUES ('goal-1', 'household-1', 'Emergency fund', 1000, '2026-10-25');`,
    ).run();
    db.prepare(
      `INSERT INTO savings_commitments
        (id, household_id, goal_id, line_id, month, planned_amount, saved_amount)
       VALUES ('commitment-1', 'household-1', 'goal-1', 'savings-line', '2026-10', 500, 200);`,
    ).run();

    const summary = getPersistedDailySummary(db as never, new Date('2026-10-24T12:00:00.000Z'));

    expect(summary).toMatchObject({
      id: 'daily-summary',
      title: 'Daily budget summary',
      kind: 'daily_summary',
    });
    expect(summary.body).toContain('Spent today: 400 XAF.');
    expect(summary.body).toContain('Biggest line movements: Food 300 XAF, Fuel 100 XAF.');
    expect(summary.body).toContain('At or above 80%: Fuel 85%.');
    expect(summary.body).toContain('Due tomorrow: Alex debt, Emergency fund savings goal.');
    expect(summary.body).not.toContain('5,000 XAF');
  });

  it('uses and persists the daily summary time through the existing settings table', () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name)
       VALUES ('household-1', 'household-1', 'Personal');`,
    ).run();

    expect(getPersistedDailySummaryTime(db as never)).toBe(defaultDailySummaryTime);
    settings.set(db as never, 'household-1', dailySummarySettingKey, '07:05');
    expect(getPersistedDailySummaryTime(db as never)).toBe('07:05');

    settings.set(db as never, 'household-1', dailySummarySettingKey, '24:00');
    expect(() => getPersistedDailySummaryTime(db as never)).toThrow(
      'Daily summary time must be in 24-hour HH:mm format.',
    );
  });

  it('creates a stable next-seven-days series at the saved local summary time', () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name)
       VALUES ('household-1', 'household-1', 'Personal');`,
    ).run();
    settings.set(db as never, 'household-1', dailySummarySettingKey, '20:00');

    const now = new Date('2026-10-24T12:00:00.000Z');
    const summaries = getPersistedDailySummaries(db as never, now);

    expect(summaries).toHaveLength(7);
    expect(new Set(summaries.map((summary) => summary.id)).size).toBe(7);
    expect(summaries[0].scheduledAt?.getHours()).toBe(20);
    expect(summaries[0].scheduledAt?.getMinutes()).toBe(0);
    expect(summaries.map((summary) => summary.scheduledAt?.getDate())).toEqual([
      24, 25, 26, 27, 28, 29, 30,
    ]);
    expect(summaries.every((summary) => summary.body === summaries[0].body)).toBe(true);
  });
});
