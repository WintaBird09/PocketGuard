import { describe, expect, it } from 'vitest';

import {
  extractAmount,
  localExpenseItem,
  matchLine,
  parseLocally,
  parseVoiceTransaction,
} from './localParse';

const lines = [
  { id: 'fuel', name: 'Fuel' },
  { id: 'groc', name: 'Groceries & Food' },
  { id: 'mom', name: 'Debt – Mom' },
];

describe('local voice parsing', () => {
  it('reads plain, grouped and spoken amounts', () => {
    expect(extractAmount('spent 20000 on fuel')).toBe(20000);
    expect(extractAmount('I paid 20,000 francs')).toBe(20000);
    expect(extractAmount('bought food for 15k')).toBe(15000);
    expect(extractAmount('1.5 million for rent')).toBe(1_500_000);
    expect(extractAmount('no number here')).toBeNull();
  });

  it('matches the budget line by shared words', () => {
    expect(matchLine('20000 for fuel today', lines)).toBe('fuel');
    expect(matchLine('bought some food', lines)).toBe('groc');
    expect(matchLine('paid mom 5000', lines)).toBe('mom');
    expect(matchLine('something else', lines)).toBeNull();
  });

  it('returns both together', () => {
    expect(parseLocally('spent 20000 on fuel', lines)).toEqual({ amount: 20000, lineId: 'fuel' });
  });

  it('builds a reviewable item offline', () => {
    expect(localExpenseItem('spent 20000 on fuel', lines, '2026-11-01')).toMatchObject({
      intent: 'log_expense',
      amount_xaf: 20000,
      line_id: 'fuel',
      date: '2026-11-01',
    });
    expect(localExpenseItem('can I spend 5000 on food', lines, '2026-11-01')?.intent).toBe(
      'check_spend',
    );
    expect(localExpenseItem('hello there', lines, '2026-11-01')).toBeNull();
  });

  it('extracts voice direction, description, amount and a relative date', () => {
    expect(
      parseVoiceTransaction('Spent 2500 on transport today', lines, '2026-11-11'),
    ).toMatchObject({
      amount: 2500,
      direction: 'expense',
      description: 'transport',
      occurredOn: '2026-11-11',
      lineId: null,
    });
    expect(
      parseVoiceTransaction('Received 2,000 from Hope yesterday', lines, '2026-11-11'),
    ).toMatchObject({
      amount: 2000,
      direction: 'income',
      description: 'Hope',
      occurredOn: '2026-11-10',
    });
  });
});
