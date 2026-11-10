import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import {
  beginOnboarding,
  completeOnboardingWithoutPlan,
  initializeLocalApp,
  loadSeedPlan,
  needsOnboarding,
} from './bootstrap';
import { addIncomeStream } from './income';

describe('first-run bootstrap flow', () => {
  it('links seed-plan allocations to the income source selected during onboarding', () => {
    const db = new Database(':memory:');
    const { householdId } = initializeLocalApp(db as never, { loadPlan: false });
    const stream = addIncomeStream(db as never, householdId, { kind: 'salary' });

    loadSeedPlan(db as never, householdId, stream.id);

    const allocations = db
      .prepare(
        'SELECT income_stream_id FROM allocations WHERE household_id = ? AND deleted_at IS NULL;',
      )
      .all(householdId) as { income_stream_id: string | null }[];
    expect(allocations.length).toBeGreaterThan(0);
    expect(allocations.every((allocation) => allocation.income_stream_id === stream.id)).toBe(true);
    db.close();
  });

  it('keeps onboarding active while the sample plan is loaded, then completes it explicitly', () => {
    const db = new Database(':memory:');
    const { householdId } = initializeLocalApp(db as never, { loadPlan: false });
    const stream = addIncomeStream(db as never, householdId, { kind: 'salary' });

    beginOnboarding(db as never, householdId);
    loadSeedPlan(db as never, householdId, stream.id, false);

    expect(needsOnboarding(db as never, householdId)).toBe(true);

    completeOnboardingWithoutPlan(db as never, householdId);

    expect(needsOnboarding(db as never, householdId)).toBe(false);
    db.close();
  });

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
      lines: { count: 15 },
      allocations: { count: 60 },
      debts: { count: 2 },
      goals: { count: 1 },
      commitments: { count: 4 },
      outbox: { count: 85 },
    });

    const secondLaunch = initializeLocalApp(db as never);
    expect(secondLaunch).toEqual(firstLaunch);
    expect(db.prepare('SELECT COUNT(*) AS count FROM outbox').get()).toEqual({ count: 85 });
  });
});
