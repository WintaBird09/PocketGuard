import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { initializeLocalApp, loadSeedPlan } from './bootstrap';
import { getInsightsSnapshot } from './insights';

describe('period insights data', () => {
  it('aggregates confirmed transactions, links categories and sources, and projects from daily pace', () => {
    const db = new Database(':memory:');
    try {
      initializeLocalApp(db as never, { loadPlan: false });
      loadSeedPlan(db as never, 'household-seed');
      db.prepare(
        `INSERT INTO budget_lines
          (id, household_id, name, kind, created_at, updated_at)
         VALUES ('line-fuel-secondary', 'household-seed', 'Fuel', 'running',
                 '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z');`,
      ).run();
      db.prepare(
        `INSERT INTO allocations
          (id, household_id, line_id, month, planned_amount, created_at, updated_at)
         VALUES ('allocation-fuel-secondary', 'household-seed', 'line-fuel-secondary',
                 '2026-11', 80_000, '2026-11-01T00:00:00.000Z',
                 '2026-11-01T00:00:00.000Z');`,
      ).run();
      db.prepare(
        `INSERT INTO income_streams (id, household_id, name, kind)
         VALUES ('source-salary', 'household-seed', 'Salary', 'salary');`,
      ).run();
      const insertTransaction = db.prepare(
        `INSERT INTO transactions
          (id, household_id, occurred_at, amount, direction, line_id, income_stream_id,
           source, status, created_at, updated_at)
         VALUES (?, 'household-seed', ?, ?, ?, ?, ?, 'manual', 'confirmed', ?, ?);`,
      );
      insertTransaction.run(
        'expense-this-period',
        '2026-11-10T12:00:00.000Z',
        100_000,
        'expense',
        'line-fuel',
        null,
        '2026-11-10T12:00:00.000Z',
        '2026-11-10T12:00:00.000Z',
      );
      insertTransaction.run(
        'expense-this-period-secondary-fuel',
        '2026-11-08T12:00:00.000Z',
        50_000,
        'expense',
        'line-fuel-secondary',
        null,
        '2026-11-08T12:00:00.000Z',
        '2026-11-08T12:00:00.000Z',
      );
      insertTransaction.run(
        'income-this-period',
        '2026-11-09T12:00:00.000Z',
        500_000,
        'income',
        null,
        'source-salary',
        '2026-11-09T12:00:00.000Z',
        '2026-11-09T12:00:00.000Z',
      );
      insertTransaction.run(
        'expense-previous-period',
        '2026-10-10T12:00:00.000Z',
        20_000,
        'expense',
        'line-fuel',
        null,
        '2026-10-10T12:00:00.000Z',
        '2026-10-10T12:00:00.000Z',
      );

      const snapshot = getInsightsSnapshot(
        db as never,
        'household-seed',
        'month',
        new Date('2026-11-10T12:00:00.000Z'),
      );

      expect(snapshot.current).toMatchObject({
        income: 500_000,
        expenses: 150_000,
        transactionCount: 3,
      });
      expect(snapshot.current.incomeSources).toEqual([{ name: 'Salary', received: 500_000 }]);
      expect(snapshot.current.categories.filter((category) => category.name === 'Fuel')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'line-fuel', spent: 100_000 }),
          expect.objectContaining({ id: 'line-fuel-secondary', spent: 50_000 }),
        ]),
      );
      expect(snapshot.previous.expenses).toBe(20_000);
      expect(snapshot.projection).toEqual({ expenses: 450_000, income: 1_500_000 });
      expect(snapshot.current.fullPeriodPlanned).toBeGreaterThan(0);

      const historicalRange = getInsightsSnapshot(
        db as never,
        'household-seed',
        'custom',
        new Date('2026-11-10T12:00:00.000Z'),
        { start: '2026-11-08', end: '2026-11-09' },
      );
      expect(historicalRange.current).toMatchObject({ income: 500_000, expenses: 50_000 });
      expect(historicalRange.projection).toEqual({ expenses: null, income: null });
    } finally {
      db.close();
    }
  });
});
