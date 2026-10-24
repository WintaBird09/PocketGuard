import { describe, expect, it } from 'vitest';

import Database from 'better-sqlite3';

import { initializeLocalApp } from './bootstrap';
import { getHomeDashboardSnapshot } from './dashboard';
import {
  getAddTransactionReview,
  getBudgetOverview,
  getDebtsSnapshot,
  getSavingsSnapshot,
} from './epic3';
import { transactions } from './repos';

describe('Epic 3: add transaction review', () => {
  it('blocks a new entry on a hard-cap line when the transaction exceeds the remaining amount', () => {
    const review = getAddTransactionReview('line-fuel', 50000);

    expect(review.result.status).toBe('BLOCKED');
    expect(review.result.reason).toContain('remaining planned amount');
    expect(review.result.remainingAfter).toBe(-16000);
  });

  it('warns when a transaction would overrun the remaining planned amount on a flexible line', () => {
    const review = getAddTransactionReview('line-mom-meeting', 40000);

    expect(review.result.status).toBe('WARN');
    expect(review.result.reason).toContain('remaining planned amount');
  });

  it('keeps a safe entry as OK when the line is under budget and pace remains healthy', () => {
    const review = getAddTransactionReview('line-debt-mom', 1000);

    expect(review.result.status).toBe('OK');
    expect(review.result.remainingAfter).toBe(149000);
    expect(review.result.reason).toContain('under 80%');
  });

  it('summarizes the budget plan from the seeded monthly allocations', () => {
    const overview = getBudgetOverview();

    expect(overview.totalPlanned).toBe(729500);
    expect(overview.totalSpent).toBe(358000);
    expect(overview.totalRemaining).toBe(371500);
    expect(overview.unallocated).toBe(0);
    expect(overview.flexible).toBe(371500);
  });

  it('builds savings goal progress and monthly commitment from the seeded plan', () => {
    const savings = getSavingsSnapshot();

    expect(savings.goalName).toBe('Kids savings');
    expect(savings.target).toBe(2000000);
    expect(savings.saved).toBe(892000);
    expect(savings.monthlyCommitment).toBe(359500);
    expect(savings.projectedGap).toBe(1108000);
  });

  it('uses the selected month commitment for the savings plan', () => {
    expect(getSavingsSnapshot('2026-11').monthlyCommitment).toBe(394500);
  });

  it('derives debt balances, monthly payment schedules, and payment histories', () => {
    const debts = getDebtsSnapshot('2026-09', new Date('2026-10-24T12:00:00'));

    expect(debts).toMatchObject([
      {
        id: 'debt-mom',
        balance: 150000,
        status: 'OPEN',
        scheduledThisMonth: 150000,
        payments: [{ id: 't3', amount: 150000 }],
      },
      {
        id: 'debt-petra',
        balance: 230000,
        status: 'OPEN',
        scheduledThisMonth: 0,
        payments: [],
      },
    ]);
  });

  it('marks a debt overdue after its deadline and leaves a not-yet-due debt open', () => {
    expect(getDebtsSnapshot('2026-11', new Date('2026-12-01T12:00:00'))[0].status).toBe('OVERDUE');
    expect(getDebtsSnapshot('2026-11', new Date('2026-12-01T12:00:00'))[1].status).toBe('OPEN');
  });

  it('updates the Home snapshot from persisted transactions and seeded plan data', () => {
    const db = new Database(':memory:');
    const { householdId } = initializeLocalApp(db as never);

    transactions.add(db as never, householdId, {
      occurred_at: '2026-10-10T08:00:00.000Z',
      amount: 520000,
      direction: 'income',
    });
    transactions.add(db as never, householdId, {
      occurred_at: '2026-10-12T08:00:00.000Z',
      amount: 20000,
      direction: 'expense',
      line_id: 'line-fuel',
    });
    transactions.add(db as never, householdId, {
      occurred_at: '2026-10-13T08:00:00.000Z',
      amount: 50000,
      direction: 'expense',
      line_id: 'line-debt-mom',
      debt_id: 'debt-mom',
    });
    transactions.add(db as never, householdId, {
      occurred_at: '2026-10-14T08:00:00.000Z',
      amount: 100000,
      direction: 'transfer',
    });

    const dashboard = getHomeDashboardSnapshot(
      db as never,
      householdId,
      '2026-10',
      new Date('2026-10-24T12:00:00'),
    );

    expect(dashboard.summary).toMatchObject({
      income: 520000,
      spent: 70000,
      remaining: 450000,
      savingsTarget: 2000000,
      savingsSaved: 0,
      debtRemaining: 480000,
      daysLeft: 7,
      savingsStatus: 'Behind',
    });
    expect(dashboard.lines.find((line) => line.id === 'line-fuel')).toMatchObject({
      planned: 120000,
      spent: 20000,
      remaining: 100000,
      status: 'ok',
    });
    expect(dashboard.lines.find((line) => line.id === 'line-debt-mom')).toMatchObject({
      spent: 50000,
      remaining: 100000,
    });
  });
});
