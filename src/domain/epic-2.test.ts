import { describe, expect, it } from 'vitest';

import { buildAlerts } from './alerts';
import {
  debtBalance,
  lineStatus,
  monthSummary,
  savingsProgress,
  sumTransactionTotals,
} from './budget';
import { evaluateSpendCheck } from './spendCheck';
import { loadPlanSep2026, plannedSavingsTotalForMonths, seedShortfall } from '../data/seed';

describe('Epic 2: budget engine', () => {
  it('tracks planned, spent, remaining, pace, and projected finish', () => {
    const status = lineStatus(120000, 98000, 18, 30);

    expect(status.remaining).toBe(22000);
    expect(status.pctUsed).toBe(81.67);
    expect(status.state).toBe('warning');
    expect(status.projectedFinish).toBeGreaterThan(120000);
  });

  it('returns a safe summary for zero-plan and rollover scenarios', () => {
    expect(lineStatus(0, 0, 5, 30)).toMatchObject({ remaining: 0, state: 'unset' });
    expect(
      monthSummary({ planned: 500000, spent: 350000, income: 0, expenses: 350000, transfers: 0 }),
    ).toMatchObject({
      planned: 500000,
      spent: 350000,
      remaining: 150000,
    });
    expect(savingsProgress(2000000, 1300000)).toMatchObject({
      saved: 1300000,
      remaining: 700000,
      gap: 700000,
    });
    expect(debtBalance(300000, 150000)).toBe(150000);
  });

  it('keeps transfers separate from expenses when totaling transactions', () => {
    expect(
      sumTransactionTotals([
        { amount: 120000, direction: 'income' },
        { amount: 20000, direction: 'expense' },
        { amount: 50000, direction: 'transfer' },
      ]),
    ).toEqual({ income: 120000, expenses: 20000, transfers: 50000 });
  });
});

describe('Epic 2: spend checks', () => {
  it('blocks a fuel expense when the line is hard-capped and the spend would exceed the remaining amount', () => {
    const result = evaluateSpendCheck({
      amount: 30000,
      planned: 120000,
      spent: 100000,
      hardCap: true,
      lineName: 'Fuel',
      daysElapsed: 18,
      daysInMonth: 30,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toContain('remaining planned amount');
    expect(result.remainingAfter).toBe(-10000);
  });

  it('warns once the budget is above the warning threshold or pace is too fast', () => {
    const thresholdResult = evaluateSpendCheck({
      amount: 10000,
      planned: 100000,
      spent: 70000,
      threshold: 80,
      daysElapsed: 20,
      daysInMonth: 30,
    });

    expect(thresholdResult.status).toBe('WARN');
    expect(thresholdResult.reason).toContain('80%');
  });

  it('returns OK for a safe expense that stays within the remaining budget and below the warning threshold', () => {
    const result = evaluateSpendCheck({
      amount: 1000,
      planned: 120000,
      spent: 20000,
      hardCap: true,
      threshold: 80,
      daysElapsed: 5,
      daysInMonth: 30,
      lineName: 'Fuel',
    });

    expect(result.status).toBe('OK');
    expect(result.remainingAfter).toBe(99000);
    expect(result.reason).toContain('under 80%');
  });

  it('warns when the pace or threshold checks are triggered before the month ends', () => {
    const result = evaluateSpendCheck({
      amount: 20000,
      planned: 120000,
      spent: 98000,
      hardCap: false,
      threshold: 80,
      daysElapsed: 18,
      daysInMonth: 30,
      lineName: 'Fuel',
    });

    expect(result.status).toBe('WARN');
    expect(result.reason).toContain('monthly budget');
  });
});

describe('Epic 2: alerts and seed data', () => {
  it('creates the expected alert titles and bodies for threshold and summary states', () => {
    const alerts = buildAlerts({
      lineName: 'Fuel',
      planned: 120000,
      spent: 120000,
      pctUsed: 100,
      daysLeft: 0,
      paceAlert: true,
      savingsDue: true,
      debtDue: true,
      summaryText: 'Fuel is at 100% usage and has a tight finish to the month.',
    });

    expect(alerts.map((alert) => alert.title)).toContain('Fuel at 100% of monthly budget');
    expect(alerts.find((alert) => alert.id === 'pace-alert')?.title).toBe(
      'Budget pace is ahead of plan',
    );
    expect(alerts.find((alert) => alert.id === 'savings-due')?.title).toBe(
      'Savings goal due this month',
    );
    expect(alerts.find((alert) => alert.id === 'daily-summary')?.body).toContain(
      'Fuel is at 100% usage',
    );
  });

  it('loads the Sep–Dec seed plan with the expected totals and shortfall', () => {
    const plan = loadPlanSep2026();
    const totalPlannedSavings = plannedSavingsTotalForMonths([
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);

    expect(plan.lines.map((line) => line.name)).toContain('Fuel');
    expect(plan.debts).toHaveLength(2);
    expect(totalPlannedSavings).toBe(1508000);
    expect(seedShortfall()).toBe(492000);
    expect(plan.savingsGoal.target_amount).toBe(2000000);
  });
});
