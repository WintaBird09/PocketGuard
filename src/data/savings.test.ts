import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

import { runMigrations } from './db';
import { confirmSavingsCommitment, getSavingsOverview } from './savings';

describe('persisted savings commitments', () => {
  let db: Database.Database | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it('loads persisted progress and confirms a commitment through the existing schema', () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name)
       VALUES ('household-1', 'household-1', 'Personal');`,
    ).run();
    db.prepare(
      `INSERT INTO savings_goals (id, household_id, name, target_amount, due_date)
       VALUES ('goal-1', 'household-1', 'Emergency fund', 10000, '2026-12-31');`,
    ).run();
    db.prepare(
      `INSERT INTO savings_commitments
        (id, household_id, goal_id, line_id, month, planned_amount, saved_amount)
       VALUES ('commitment-1', 'household-1', 'goal-1', 'line-savings', '2026-10', 5000, NULL);`,
    ).run();

    expect(getSavingsOverview(db as never, 'household-1', '2026-10')).toMatchObject({
      goalName: 'Emergency fund',
      target: 10000,
      saved: 0,
      monthlyCommitment: 5000,
      commitments: [{ id: 'commitment-1', savedAmount: null, savedAt: null }],
    });
    expect(() => confirmSavingsCommitment(db as never, 'household-1', 'commitment-1', 0)).toThrow(
      'Saved amount must be a positive whole number.',
    );

    expect(
      confirmSavingsCommitment(
        db as never,
        'household-1',
        'commitment-1',
        3500,
        '2026-10-25T12:00:00.000Z',
      ),
    ).toBe(true);
    expect(
      confirmSavingsCommitment(
        db as never,
        'household-1',
        'commitment-1',
        3500,
        '2026-10-25T12:00:00.000Z',
      ),
    ).toBe(false);
    expect(getSavingsOverview(db as never, 'household-1', '2026-10')).toMatchObject({
      saved: 3500,
      projectedGap: 6500,
      commitments: [
        {
          savedAmount: 3500,
          savedAt: '2026-10-25T12:00:00.000Z',
        },
      ],
    });
    expect(
      db
        .prepare(
          `SELECT table_name, row_id, op FROM outbox WHERE table_name = 'savings_commitments';`,
        )
        .all(),
    ).toHaveLength(1);
  });

  it('fails explicitly for missing or foreign-household commitments', () => {
    db = new Database(':memory:');
    runMigrations(db as never);

    expect(() => confirmSavingsCommitment(db as never, 'household-1', 'missing')).toThrow(
      'Savings commitment was not found.',
    );
  });
});
