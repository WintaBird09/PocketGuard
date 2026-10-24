import { describe, expect, it } from 'vitest';

import {
  getAddTransactionReview,
  getBudgetOverview,
  getDebtsSnapshot,
  getSavingsSnapshot,
} from './epic3';

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
});
