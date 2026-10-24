import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { initializeLocalApp } from './bootstrap';

describe('first-run bootstrap flow', () => {
  it('persists the household and complete seed plan once, then opens Home on later launches', () => {
    const db = new Database(':memory:');

    const firstLaunch = initializeLocalApp(db as never);
    expect(firstLaunch).toEqual({
      householdId: 'household-seed',
      initialRoute: '/(tabs)',
    });

    const counts = {
      household: db.prepare('SELECT COUNT(*) AS count FROM households').get() as { count: number },
      lines: db.prepare('SELECT COUNT(*) AS count FROM budget_lines').get() as { count: number },
      allocations: db.prepare('SELECT COUNT(*) AS count FROM allocations').get() as {
        count: number;
      },
      debts: db.prepare('SELECT COUNT(*) AS count FROM debts').get() as { count: number },
      goals: db.prepare('SELECT COUNT(*) AS count FROM savings_goals').get() as { count: number },
      commitments: db.prepare('SELECT COUNT(*) AS count FROM savings_commitments').get() as {
        count: number;
      },
      outbox: db.prepare('SELECT COUNT(*) AS count FROM outbox').get() as { count: number },
    };
    expect(counts).toEqual({
      household: { count: 1 },
      lines: { count: 5 },
      allocations: { count: 20 },
      debts: { count: 2 },
      goals: { count: 1 },
      commitments: { count: 4 },
      outbox: { count: 33 },
    });

    const secondLaunch = initializeLocalApp(db as never);
    expect(secondLaunch).toEqual(firstLaunch);
    expect(db.prepare('SELECT COUNT(*) AS count FROM outbox').get()).toEqual({ count: 33 });
  });
});
