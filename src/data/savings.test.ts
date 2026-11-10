import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

import { runMigrations } from './db';
import { addIncomeStream } from './income';
import { getMonthPlan } from './plan';
import {
  addSavingsGoal,
  confirmSavingsCommitment,
  deleteSavingsGoal,
  getSavingsOverview,
  getSavingsPlanner,
} from './savings';

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

  it('adds a goal with monthly commitments, an annual view, and deletes it', () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name) VALUES ('h1', 'h1', 'Personal');`,
    ).run();

    const goalId = addSavingsGoal(
      db as never,
      'h1',
      { name: 'Laptop', target: 250000, monthlyAmount: 100000, dueDate: '2026-12-15' },
      '2026-10',
    );
    const planner = getSavingsPlanner(db as never, 'h1', 2026, '2026-10');
    expect(planner.goals[0]).toMatchObject({ name: 'Laptop', planned: 250000, saved: 0 });
    expect(planner.goals[0].commitments.map((c) => c.plannedAmount)).toEqual([
      100000, 100000, 50000,
    ]);
    expect(planner.months[9]).toMatchObject({ planned: 100000 });
    expect(planner.yearPlanned).toBe(250000);
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM allocations WHERE planned_amount > 0;`).get(),
    ).toMatchObject({ n: 3 });

    expect(() =>
      addSavingsGoal(
        db as never,
        'h1',
        { name: 'Old', target: 1000, monthlyAmount: 100, dueDate: '2026-01-01' },
        '2026-10',
      ),
    ).toThrow('this month or later');

    deleteSavingsGoal(db as never, 'h1', goalId);
    expect(getSavingsPlanner(db as never, 'h1', 2026, '2026-10').goals).toHaveLength(0);
  });

  it('creates a goal with zero saved and no planned contributions', () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name) VALUES ('h1', 'h1', 'Personal');`,
    ).run();

    addSavingsGoal(
      db as never,
      'h1',
      { name: 'Emergency fund', target: 500000, monthlyAmount: 0, dueDate: '2026-12-31' },
      '2026-10',
    );

    expect(getSavingsPlanner(db as never, 'h1', 2026, '2026-10').goals[0]).toMatchObject({
      name: 'Emergency fund',
      target: 500000,
      saved: 0,
      planned: 0,
      commitments: [],
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM allocations;').get()).toMatchObject({ n: 0 });
  });

  it('links only the first month of a goal to the chosen income source', () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name) VALUES ('h1', 'h1', 'Personal');`,
    ).run();
    const stream = addIncomeStream(db as never, 'h1', { kind: 'salary' });
    addSavingsGoal(
      db as never,
      'h1',
      { name: 'Trip', target: 200000, monthlyAmount: 100000, dueDate: '2026-11-30' },
      '2026-10',
      stream.id,
    );
    const first = getMonthPlan(db as never, 'h1', '2026-10').lines[0];
    const second = getMonthPlan(db as never, 'h1', '2026-11').lines[0];
    expect(first).toMatchObject({ planned: 100000, incomeStreamId: stream.id });
    expect(second).toMatchObject({ planned: 100000, incomeStreamId: null });
  });
});
