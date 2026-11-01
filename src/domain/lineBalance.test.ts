import { describe, expect, it } from 'vitest';

import { balancesAfterEachExpense, toneForUsedRatio } from './lineBalance';

describe('line balance', () => {
  it('uses green below 40%, orange to 80%, red above', () => {
    expect(toneForUsedRatio(0.39)).toBe('green');
    expect(toneForUsedRatio(0.4)).toBe('orange');
    expect(toneForUsedRatio(0.8)).toBe('orange');
    expect(toneForUsedRatio(0.81)).toBe('red');
  });

  it('tracks the balance after each expense, oldest first', () => {
    const items = [
      { id: 'b', lineId: 'fuel', direction: 'expense', amount: 20000 },
      { id: 'x', lineId: null, direction: 'income', amount: 5 },
      { id: 'a', lineId: 'fuel', direction: 'expense', amount: 10000 },
    ];
    const result = balancesAfterEachExpense(items, new Map([['fuel', 50000]]));
    expect(result.get('a')).toMatchObject({ left: 40000, tone: 'green' });
    expect(result.get('b')).toMatchObject({ left: 20000, tone: 'orange' });
    expect(result.has('x')).toBe(false);
  });

  it('goes negative when over budget and skips unbudgeted lines', () => {
    const items = [{ id: 'a', lineId: 'l', direction: 'expense', amount: 150 }];
    expect(balancesAfterEachExpense(items, new Map([['l', 100]])).get('a')).toMatchObject({
      left: -50,
      tone: 'red',
    });
    expect(balancesAfterEachExpense(items, new Map()).size).toBe(0);
  });
});
