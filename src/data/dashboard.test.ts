import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { initializeLocalApp, loadSeedPlan } from './bootstrap';
import { getHomeDashboardSnapshot } from './dashboard';

describe('dashboard performance', () => {
  it('loads the monthly snapshot with 1,000 transactions in under two seconds', () => {
    const db = new Database(':memory:');
    try {
      initializeLocalApp(db as never, { loadPlan: false });
      loadSeedPlan(db as never, 'household-seed');
      const insert = db.prepare(
        `INSERT INTO transactions
          (id, household_id, occurred_at, amount, direction, line_id, source, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'expense', 'line-fuel', 'manual', 'confirmed', ?, ?);`,
      );
      db.transaction(() => {
        for (let index = 0; index < 1000; index += 1) {
          insert.run(
            `perf-${index}`,
            'household-seed',
            `2026-10-${String((index % 28) + 1).padStart(2, '0')}T12:00:00.000Z`,
            1000,
            '2026-10-26T12:00:00.000Z',
            '2026-10-26T12:00:00.000Z',
          );
        }
      })();

      const start = performance.now();
      const snapshot = getHomeDashboardSnapshot(
        db as never,
        'household-seed',
        '2026-10',
        new Date('2026-10-26T12:00:00.000Z'),
      );
      const elapsedMs = performance.now() - start;

      expect(snapshot.lines.find((line) => line.id === 'line-fuel')?.spent).toBe(1_000_000);
      expect(elapsedMs).toBeLessThan(2000);
    } finally {
      db.close();
    }
  });
});
