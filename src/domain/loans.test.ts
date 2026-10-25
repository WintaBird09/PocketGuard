import { describe, expect, it } from 'vitest';

import {
  addMonths,
  assertRepayable,
  deriveLoanState,
  deriveLoanStatus,
  generateInstallments,
  loanBalance,
} from './loans';

const base = { amount: 20000, payments: [], deadline: '2026-11-30', today: '2026-10-25' };

describe('addMonths', () => {
  it('clamps to month end without drifting', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });

  it('rejects invalid dates', () => {
    expect(() => addMonths('2026-02-30', 1)).toThrow();
    expect(() => addMonths('nope', 1)).toThrow();
  });
});

describe('generateInstallments', () => {
  it('splits evenly with the remainder on the last installment', () => {
    const plan = generateInstallments({ amount: 10000, firstDueOn: '2026-11-25', count: 3 });
    expect(plan.map((i) => i.amount)).toEqual([3333, 3333, 3334]);
    expect(plan.map((i) => i.dueOn)).toEqual(['2026-11-25', '2026-12-25', '2027-01-25']);
    expect(plan.reduce((s, i) => s + i.amount, 0)).toBe(10000);
  });

  it('supports a single installment and the default of 4', () => {
    expect(generateInstallments({ amount: 5000, firstDueOn: '2026-12-01', count: 1 })).toEqual([
      { dueOn: '2026-12-01', amount: 5000 },
    ]);
    expect(
      generateInstallments({ amount: 20000, firstDueOn: '2026-11-30', count: 4 }),
    ).toHaveLength(4);
  });

  it('rejects bad input', () => {
    expect(() => generateInstallments({ amount: 0, firstDueOn: '2026-11-25', count: 2 })).toThrow();
    expect(() =>
      generateInstallments({ amount: 100.5, firstDueOn: '2026-11-25', count: 2 }),
    ).toThrow();
    expect(() =>
      generateInstallments({ amount: 100, firstDueOn: '2026-11-25', count: 0 }),
    ).toThrow();
    expect(() => generateInstallments({ amount: 3, firstDueOn: '2026-11-25', count: 5 })).toThrow();
    expect(() =>
      generateInstallments({ amount: 100, firstDueOn: '2026-13-01', count: 2 }),
    ).toThrow();
  });
});

describe('deriveLoanStatus', () => {
  it('is Pending with nothing paid and not late', () => {
    expect(deriveLoanStatus(base)).toBe('PENDING');
  });

  it('is Partial with some paid and not late', () => {
    expect(deriveLoanStatus({ ...base, payments: [{ amount: 5000 }] })).toBe('PARTIAL');
  });

  it('is Complete when fully paid, even past the deadline or written off', () => {
    const paid = { ...base, payments: [{ amount: 12000 }, { amount: 8000 }] };
    expect(deriveLoanStatus(paid)).toBe('COMPLETE');
    expect(deriveLoanStatus({ ...paid, today: '2027-01-01' })).toBe('COMPLETE');
    expect(deriveLoanStatus({ ...paid, writtenOff: true })).toBe('COMPLETE');
  });

  it('treats the deadline day itself as not yet overdue', () => {
    expect(deriveLoanStatus({ ...base, today: '2026-11-30' })).toBe('PENDING');
    expect(deriveLoanStatus({ ...base, today: '2026-12-01' })).toBe('OVERDUE');
  });

  it('Overdue wins over Partial but keeps the partial progress', () => {
    const state = deriveLoanState({ ...base, payments: [{ amount: 5000 }], today: '2026-12-05' });
    expect(state.status).toBe('OVERDUE');
    expect(state.paid).toBe(5000);
    expect(state.balance).toBe(15000);
    expect(state.percentPaid).toBe(25);
    expect(state.daysOverdue).toBe(5);
  });

  it('flexible loans without a deadline are never overdue', () => {
    expect(deriveLoanStatus({ ...base, deadline: null, today: '2030-01-01' })).toBe('PENDING');
  });

  it('is Written off with a balance, and stops being overdue', () => {
    const state = deriveLoanState({ ...base, writtenOff: true, today: '2027-01-01' });
    expect(state.status).toBe('WRITTEN_OFF');
    expect(state.daysOverdue).toBe(0);
    expect(state.balance).toBe(20000);
  });

  it('flags an unpaid installment as overdue before the final deadline', () => {
    const installments = generateInstallments({
      amount: 20000,
      firstDueOn: '2026-11-01',
      count: 4,
    });
    const input = { ...base, deadline: '2027-02-01', installments, today: '2026-11-10' };
    expect(deriveLoanStatus(input)).toBe('OVERDUE');
    const late = deriveLoanState(input);
    expect(late.overdueInstallments).toBe(1);
    expect(late.daysOverdue).toBe(9);
    expect(late.nextDueOn).toBe('2026-12-01');
  });

  it('is not overdue once installments up to today are covered', () => {
    const installments = generateInstallments({
      amount: 20000,
      firstDueOn: '2026-11-01',
      count: 4,
    });
    const state = deriveLoanState({
      ...base,
      deadline: '2027-02-01',
      installments,
      payments: [{ amount: 5000 }],
      today: '2026-11-10',
    });
    expect(state.status).toBe('PARTIAL');
    expect(state.nextDueOn).toBe('2026-12-01');
  });

  it('counts an advance payment toward later installments', () => {
    const installments = generateInstallments({
      amount: 20000,
      firstDueOn: '2026-11-01',
      count: 4,
    });
    const state = deriveLoanState({
      ...base,
      deadline: '2027-02-01',
      installments,
      payments: [{ amount: 10000 }],
      today: '2026-12-10',
    });
    expect(state.status).toBe('PARTIAL');
    expect(state.overdueInstallments).toBe(0);
  });

  it('reports a next due date for single and flexible loans with a deadline', () => {
    expect(deriveLoanState(base).nextDueOn).toBe('2026-11-30');
  });
});

describe('balance and repayment validation', () => {
  it('derives balance and never goes negative', () => {
    expect(loanBalance(20000, [{ amount: 5000 }])).toBe(15000);
    expect(loanBalance(20000, [{ amount: 25000 }])).toBe(0);
  });

  it('rejects overpayment and invalid repayments', () => {
    expect(() => assertRepayable(20000, 15001, 15000)).toThrow(/exceeds/);
    expect(() => assertRepayable(20000, 0, 15000)).toThrow();
    expect(() => assertRepayable(20000, 10.5, 15000)).toThrow();
    expect(() => assertRepayable(20000, 15000, 15000)).not.toThrow();
  });
});
