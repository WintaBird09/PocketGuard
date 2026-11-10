import { describe, expect, it } from 'vitest';

import {
  answerInsightsQuestion,
  getInsightRange,
  projectPeriodAmount,
  type InsightsSnapshot,
} from './insights';

const sample: InsightsSnapshot = {
  period: 'month',
  range: {
    start: '2026-11-01',
    end: '2026-11-30',
    through: '2026-11-10',
    comparisonStart: '2026-10-02',
    comparisonThrough: '2026-10-11',
    elapsedDays: 10,
    totalDays: 30,
  },
  current: {
    income: 500_000,
    expenses: 250_000,
    saved: 50_000,
    planned: 200_000,
    fullPeriodPlanned: 600_000,
    transactionCount: 12,
    uncategorizedCount: 0,
    categories: [
      {
        id: 'line-food',
        name: 'Food',
        kind: 'running',
        spent: 120_000,
        planned: 100_000,
        fullPeriodPlanned: 300_000,
      },
    ],
    incomeSources: [{ name: 'Salary', received: 500_000 }],
  },
  previous: {
    income: 450_000,
    expenses: 200_000,
    saved: 20_000,
    planned: 150_000,
    fullPeriodPlanned: 500_000,
    transactionCount: 10,
    uncategorizedCount: 0,
    categories: [],
    incomeSources: [],
  },
  projection: { expenses: 750_000, income: 1_500_000 },
  position: {
    saved: 200_000,
    savingsTarget: 1_000_000,
    debtRemaining: 150_000,
    loansOutstanding: 25_000,
    goals: 1,
  },
};

describe('insight periods and advice', () => {
  it('uses Monday-based calendar weeks and compares the same elapsed days', () => {
    expect(getInsightRange('week', '2026-11-10')).toEqual({
      start: '2026-11-09',
      end: '2026-11-15',
      through: '2026-11-10',
      comparisonStart: '2026-11-02',
      comparisonThrough: '2026-11-03',
      elapsedDays: 2,
      totalDays: 7,
    });
  });

  it('uses calendar month, quarter, half-year, and annual periods', () => {
    expect(getInsightRange('month', '2026-11-10')).toMatchObject({
      start: '2026-11-01',
      end: '2026-11-30',
    });
    expect(getInsightRange('quarter', '2026-11-10')).toMatchObject({
      start: '2026-10-01',
      end: '2026-12-31',
    });
    expect(getInsightRange('halfYear', '2026-11-10')).toMatchObject({
      start: '2026-07-01',
      end: '2026-12-31',
    });
    expect(getInsightRange('year', '2026-11-10')).toMatchObject({
      start: '2026-01-01',
      end: '2026-12-31',
    });
  });

  it('uses explicit custom dates and compares the same elapsed number of days', () => {
    expect(
      getInsightRange('custom', '2026-11-10', { start: '2026-11-03', end: '2026-11-07' }),
    ).toEqual({
      start: '2026-11-03',
      end: '2026-11-07',
      through: '2026-11-07',
      comparisonStart: '2026-10-29',
      comparisonThrough: '2026-11-02',
      elapsedDays: 5,
      totalDays: 5,
    });
    expect(() =>
      getInsightRange('custom', '2026-11-10', { start: '2026-11-08', end: '2026-11-07' }),
    ).toThrow('Choose a valid date range');
    expect(() =>
      getInsightRange('custom', '2026-11-10', { start: '2026-11-11', end: '2026-11-12' }),
    ).toThrow('Choose a valid date range');
  });

  it('projects only after three elapsed days and rounds to whole currency units', () => {
    expect(projectPeriodAmount(100_000, 2, 7)).toBeNull();
    expect(projectPeriodAmount(100_000, 5, 30)).toBe(600_000);
    expect(projectPeriodAmount(1, 3, 5)).toBe(2);
  });

  it('answers budget, savings, debt, and projection questions from supplied records', () => {
    expect(answerInsightsQuestion('How can I reduce spending?', sample).title).toBe('Review Food');
    expect(answerInsightsQuestion('How are my savings goals?', sample).title).toBe(
      'Your savings picture',
    );
    expect(answerInsightsQuestion('What about my debt?', sample).title).toBe(
      'Your debt and lending picture',
    );
    expect(answerInsightsQuestion('Project my pace', sample).title).toBe('Your current pace');
  });
});
