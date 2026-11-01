import { describe, expect, it } from 'vitest';

import { monthsInRange, rangeFor, rangeLabel, shiftAnchor } from './dateRange';

describe('dateRange', () => {
  it('starts weeks on Monday', () => {
    // 2026-11-01 is a Sunday
    expect(rangeFor('week', '2026-11-01')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(rangeFor('week', '2026-11-02')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
  });

  it('covers whole months', () => {
    expect(rangeFor('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('shifts by one unit', () => {
    expect(shiftAnchor('day', '2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftAnchor('week', '2026-12-30', 1)).toBe('2027-01-06');
    expect(shiftAnchor('month', '2026-01-31', 1)).toBe('2026-02-01');
  });

  it('lists the months a range touches', () => {
    expect(monthsInRange({ from: '2026-10-26', to: '2026-12-02' })).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
  });

  it('labels ranges', () => {
    expect(rangeLabel('day', { from: '2026-11-01', to: '2026-11-01' }, '2026-11-01')).toBe('Today');
    expect(rangeLabel('week', { from: '2026-11-02', to: '2026-11-08' }, '2026-11-01')).toBe(
      '2 Nov – 8 Nov 2026',
    );
  });
});
