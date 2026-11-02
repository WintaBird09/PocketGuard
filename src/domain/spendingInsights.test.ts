import { describe, expect, it } from 'vitest';

import { buildInsights, topSpending, type InsightLine } from './spendingInsights';

const line = (id: string, spent: number, planned: number, extra: Partial<InsightLine> = {}) => ({
  id,
  name: id,
  kind: 'running',
  planned,
  spent,
  projected: null,
  hardCap: false,
  ...extra,
});

describe('spending insights', () => {
  it('ranks spending, shares it and compares with last month', () => {
    const top = topSpending(
      [line('fuel', 60000, 80000), line('food', 30000, 50000), line('misc', 10000, 0)],
      [line('fuel', 40000, 80000)],
      2,
    );
    expect(top.map((item) => item.id)).toEqual(['fuel', 'food']);
    expect(top[0]).toMatchObject({ share: 0.6, usedRatio: 0.75, change: 0.5 });
    expect(top[1].change).toBeNull();
  });

  it('flags overspending first, then pace, concentration and savings', () => {
    const insights = buildInsights(
      [line('fuel', 90000, 80000), line('food', 40000, 100000, { projected: 120000 })],
      [],
      { behind: true, shortfall: 50000 },
    );
    expect(insights[0]).toMatchObject({ tone: 'danger' });
    expect(insights.some((item) => item.title.includes('on course to overspend'))).toBe(true);
    expect(insights).toHaveLength(4);
  });

  it('reports healthy spending when nothing is wrong', () => {
    expect(buildInsights([line('fuel', 1000, 80000), line('food', 900, 50000)])[0].tone).toBe(
      'info',
    );
    expect(buildInsights(['a', 'b', 'c', 'd'].map((id) => line(id, 100, 1000)))[0].tone).toBe(
      'success',
    );
  });
});
