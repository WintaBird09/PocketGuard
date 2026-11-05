import { describe, expect, it } from 'vitest';

import { goalPeriodView } from './goalPeriod';

const input = {
  month: '2025-06',
  monthLength: 30,
  months: [
    { month: '2025-05', planned: 20000, saved: 20000 },
    { month: '2025-06', planned: 30000, saved: 15000 },
  ],
  yearPlanned: 50000,
  yearSaved: 35000,
};

describe('goalPeriodView', () => {
  it('defaults to the month figures', () => {
    expect(goalPeriodView('month', input)).toMatchObject({
      target: 30000,
      saved: 15000,
      progress: 50,
    });
  });
  it('prorates a week and sums a year', () => {
    expect(goalPeriodView('week', input).target).toBe(7000);
    expect(goalPeriodView('year', input)).toMatchObject({
      target: 50000,
      saved: 35000,
      progress: 70,
    });
  });
  it('handles a month with no plan', () => {
    expect(goalPeriodView('month', { ...input, month: '2025-07' }).progress).toBe(0);
  });
});
