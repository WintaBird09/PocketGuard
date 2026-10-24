import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { initializeLocalApp } from './bootstrap';
import { getHomeDashboardSnapshot } from './dashboard';
import { submitExpense, getExpenseReview, listExpenseLines } from './transaction-entry';

describe('Epic 3 transaction entry flows', () => {
  it('loads seeded lines, saves a reviewed expense, and updates the repository-backed Home snapshot', () => {
    const db = new Database(':memory:');
    const { householdId } = initializeLocalApp(db as never);
    const lines = listExpenseLines(db as never, householdId, '2026-10');

    expect(lines.find((line) => line.id === 'line-fuel')).toMatchObject({
      name: 'Fuel',
      planned: 120000,
      hardCap: true,
    });

    const submission = submitExpense(db as never, householdId, {
      lineId: 'line-fuel',
      amount: 20000,
      note: 'Fuel top-up',
      occurredOn: '2026-10-24',
    });

    expect(submission.saved).toBe(true);
    if (!submission.saved) throw new Error('Expected the safe expense to be saved.');
    expect(submission.transaction).toMatchObject({
      amount: 20000,
      direction: 'expense',
      line_id: 'line-fuel',
      note: 'Fuel top-up',
    });

    const dashboard = getHomeDashboardSnapshot(
      db as never,
      householdId,
      '2026-10',
      new Date('2026-10-24T12:00:00'),
    );
    expect(dashboard.summary.spent).toBe(20000);
    expect(dashboard.lines.find((line) => line.id === 'line-fuel')?.spent).toBe(20000);
  });

  it('requires confirmation before saving a warning and never saves a hard-cap blocked entry', () => {
    const db = new Database(':memory:');
    const { householdId } = initializeLocalApp(db as never);

    const warningDraft = {
      lineId: 'line-mom-meeting',
      amount: 85000,
      note: 'Meeting contribution',
      occurredOn: '2026-10-24',
    };
    const pendingWarning = submitExpense(db as never, householdId, warningDraft);
    expect(pendingWarning).toMatchObject({ saved: false, reason: 'confirmation-required' });
    expect(db.prepare('SELECT COUNT(*) AS count FROM transactions').get()).toEqual({ count: 0 });

    const confirmedWarning = submitExpense(db as never, householdId, warningDraft, true);
    expect(confirmedWarning.saved).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS count FROM transactions').get()).toEqual({ count: 1 });

    const blocked = submitExpense(
      db as never,
      householdId,
      {
        lineId: 'line-fuel',
        amount: 130000,
        note: 'Over cap',
        occurredOn: '2026-10-24',
      },
      true,
    );
    expect(blocked).toMatchObject({ saved: false, reason: 'blocked' });
    expect(db.prepare('SELECT COUNT(*) AS count FROM transactions').get()).toEqual({ count: 1 });
  });

  it('runs Can I Spend against stored transactions without writing a transaction', () => {
    const db = new Database(':memory:');
    const { householdId } = initializeLocalApp(db as never);
    submitExpense(db as never, householdId, {
      lineId: 'line-fuel',
      amount: 20000,
      note: 'Existing fuel',
      occurredOn: '2026-10-20',
    });
    const before = db.prepare('SELECT COUNT(*) AS count FROM transactions').get();

    const review = getExpenseReview(db as never, householdId, {
      lineId: 'line-fuel',
      amount: 30000,
      occurredOn: '2026-10-24',
    });

    expect(review).toMatchObject({
      lineName: 'Fuel',
      planned: 120000,
      spent: 20000,
      result: { status: 'OK', remainingAfter: 70000 },
    });
    expect(db.prepare('SELECT COUNT(*) AS count FROM transactions').get()).toEqual(before);
  });
});
