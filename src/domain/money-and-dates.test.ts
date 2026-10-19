import { describe, expect, it } from 'vitest';

import { formatXAF, parseAmountInput } from './money';
import {
  dayOfMonth,
  daysElapsedInMonth,
  daysInMonth,
  daysRemainingInMonth,
  monthKeyForDate,
} from './dates';

describe('money utils', () => {
  it('formats XAF values with grouping and suffix', () => {
    expect(formatXAF(120000)).toBe('120,000 XAF');
    expect(formatXAF(2500)).toBe('2,500 XAF');
    expect(formatXAF(-2500)).toBe('-2,500 XAF');
  });

  it('parses common amount input formats', () => {
    expect(parseAmountInput('20k')).toBe(20000);
    expect(parseAmountInput('20,000')).toBe(20000);
    expect(parseAmountInput('20 000')).toBe(20000);
    expect(parseAmountInput('20,000 XAF')).toBe(20000);
    expect(parseAmountInput('20000')).toBe(20000);
  });

  it('rejects empty or negative values', () => {
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('   ')).toBeNull();
    expect(parseAmountInput('-2000')).toBeNull();
    expect(parseAmountInput('abc')).toBeNull();
  });
});

describe('date utils', () => {
  it('computes the month key in Africa/Douala', () => {
    expect(monthKeyForDate(new Date('2026-10-18T12:00:00Z'), 'Africa/Douala')).toBe('2026-10');
    expect(monthKeyForDate('2026-02-15T12:00:00Z', 'Africa/Douala')).toBe('2026-02');
  });

  it('handles month length and day counts', () => {
    expect(daysInMonth(new Date('2026-02-15T12:00:00Z'), 'Africa/Douala')).toBe(28);
    expect(daysInMonth(new Date('2026-12-15T12:00:00Z'), 'Africa/Douala')).toBe(31);

    const sampleDate = new Date('2026-10-18T12:00:00Z');
    expect(dayOfMonth(sampleDate, 'Africa/Douala')).toBe(18);
    expect(daysElapsedInMonth(sampleDate, 'Africa/Douala')).toBe(18);
    expect(daysRemainingInMonth(sampleDate, 'Africa/Douala')).toBe(13);
  });
});
