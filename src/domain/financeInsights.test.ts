import { describe, expect, it } from 'vitest';

import {
  anomalyInsight,
  buildFinanceInsights,
  debtInsight,
  forecastInsight,
  goalsInsight,
  incomeDependencyInsight,
  runwayInsight,
  safeToSpendInsight,
  savingsRateInsight,
  topCategoriesInsight,
  type FinanceFacts,
} from './financeInsights';

const line = (id: string, kind: string, planned: number, spent: number) => ({
  id,
  name: id,
  kind,
  planned,
  spent,
  projected: null,
  hardCap: false,
});

const facts = (over: Partial<FinanceFacts> = {}): FinanceFacts => ({
  today: '2025-06-10',
  daysElapsed: 10,
  monthLength: 30,
  daysLeft: 20,
  income: 100000,
  expectedIncome: 0,
  spent: 40000,
  lines: [line('rent', 'fixed', 30000, 30000), line('fun', 'misc', 20000, 10000)],
  previous: [line('rent', 'fixed', 30000, 30000), line('fun', 'misc', 20000, 5000)],
  savedThisMonth: 10000,
  totalSaved: 120000,
  goals: [],
  avgMonthlyExpense: 40000,
  debts: [],
  sources: [],
  unfundedBudget: 0,
  expenses: [],
  ...over,
});

describe('finance insights', () => {
  it('computes the savings rate and 50/30/20 split', () => {
    const insight = savingsRateInsight(facts());
    expect(insight?.title).toBe('Savings rate 10%');
    expect(insight?.tone).toBe('info');
    expect(savingsRateInsight(facts({ income: 0 }))).toBeNull();
  });

  it('forecasts month end and flags overspend', () => {
    const insight = forecastInsight(facts());
    expect(insight?.tone).toBe('danger');
    expect(insight?.title).toContain('overspend by 70,000');
    expect(forecastInsight(facts({ daysElapsed: 2 }))).toBeNull();
  });

  it('highlights top categories and rises', () => {
    const insight = topCategoriesInsight(facts());
    expect(insight?.tone).toBe('warning');
    expect(insight?.working[0].label).toBe('rent');
  });

  it('detects over-allocated and concentrated income', () => {
    const short = incomeDependencyInsight(
      facts({ sources: [{ name: 'Salary', received: 50000, budgeted: 60000, left: -10000 }] }),
    );
    expect(short?.tone).toBe('danger');
    const concentrated = incomeDependencyInsight(
      facts({
        sources: [
          { name: 'Salary', received: 90000, budgeted: 10000, left: 80000 },
          { name: 'Side', received: 10000, budgeted: 0, left: 10000 },
        ],
      }),
    );
    expect(concentrated?.title).toContain('90%');
    expect(incomeDependencyInsight(facts())).toBeNull();
  });

  it('measures emergency runway in months', () => {
    expect(runwayInsight(facts())?.title).toBe('Emergency runway 3.0 months');
    expect(runwayInsight(facts({ totalSaved: 10000 }))?.tone).toBe('danger');
  });

  it('summarises debt progress and says interest is not tracked', () => {
    const insight = debtInsight(
      facts({
        debts: [
          {
            creditor: 'Bank',
            original: 100000,
            paid: 40000,
            balance: 60000,
            deadline: '2025-12-10',
          },
        ],
      }),
    );
    expect(insight?.title).toBe('Debt 40% repaid');
    expect(insight?.working.some((row) => row.label === 'Interest cost')).toBe(true);
    expect(debtInsight(facts())).toBeNull();
  });

  it('works out a safe daily amount', () => {
    const insight = safeToSpendInsight(facts());
    expect(insight?.title).toContain('Safe to spend 476');
  });

  it('flags duplicates and outliers', () => {
    const tx = (id: string, amount: number, day: string) => ({
      id,
      amount,
      occurredAt: `2025-06-${day}`,
      lineId: 'fun',
      note: '',
    });
    const insight = anomalyInsight(
      facts({
        expenses: [
          tx('a', 1000, '01'),
          tx('b', 1000, '01'),
          tx('c', 900, '02'),
          tx('d', 50000, '03'),
        ],
      }),
    );
    expect(insight?.tone).toBe('warning');
    expect(insight?.working.length).toBe(2);
  });

  it('marks goals behind when the monthly plan is too small', () => {
    const insight = goalsInsight(
      facts({
        goals: [
          {
            name: 'Car',
            target: 120000,
            saved: 0,
            dueDate: '2025-12-10',
            monthlyAmount: 5000,
            overdueMonths: 0,
          },
        ],
      }),
    );
    expect(insight?.tone).toBe('warning');
    expect(insight?.summary).toContain('20,000');
  });

  it('orders insights by urgency', () => {
    const list = buildFinanceInsights(facts());
    expect(list[0].tone).toBe('danger');
    expect(list.length).toBeGreaterThanOrEqual(5);
  });
});
