import { describe, expect, it } from 'vitest';

import { financeQuotes, getDailyQuote, motivationQuotes } from './quotes';

describe('offline daily quote cycle', () => {
  it('contains at least fifty unique finance and motivation lines', () => {
    expect(financeQuotes.length).toBeGreaterThanOrEqual(50);
    expect(new Set(financeQuotes).size).toBe(financeQuotes.length);
    expect(motivationQuotes.length).toBeGreaterThanOrEqual(50);
    expect(new Set(motivationQuotes).size).toBe(motivationQuotes.length);
  });

  it('cycles through every quote before repeating and avoids adjacent repeats', () => {
    const start = new Date('2026-01-01T12:00:00Z');
    const cycleLength = financeQuotes.length + motivationQuotes.length;
    const quotes = Array.from({ length: cycleLength + 1 }, (_, offset) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + offset);
      return getDailyQuote(date.toISOString().slice(0, 10));
    });
    expect(new Set(quotes.slice(0, cycleLength).map((quote) => quote.id)).size).toBe(cycleLength);
    expect(quotes[cycleLength]?.id).toBe(quotes[0]?.id);
    expect(quotes.every((quote, index) => index === 0 || quote.id !== quotes[index - 1]?.id)).toBe(
      true,
    );
  });
});
