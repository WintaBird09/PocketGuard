import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { initializeLocalApp } from './bootstrap';
import { buildLoanInput, emptyLoanForm, loanToForm } from './loanForm';
import { checkLendingCap, getLendingCap, setLendingCap } from './lendingCap';
import { createLoan, getLoan, listLoans, updateLoan } from './loans';

let db: Database.Database;
let hh: string;
const d = () => db as never;

const loan = (amount: number, lentOn = '2026-10-10') => ({
  personName: 'Desmond',
  lentOn,
  amount,
  plan: 'flexible' as const,
});

beforeEach(() => {
  db = new Database(':memory:');
  hh = initializeLocalApp(d()).householdId;
  db.prepare('DELETE FROM outbox').run();
});

describe('lending cap', () => {
  it('is off by default and allows any loan', () => {
    expect(getLendingCap(d(), hh)).toBeNull();
    expect(() => createLoan(d(), hh, loan(5_000_000))).not.toThrow();
  });

  it('blocks a loan that would exceed the monthly cap and writes nothing', () => {
    setLendingCap(d(), hh, 50000);
    createLoan(d(), hh, loan(30000));
    const before = db.prepare('SELECT COUNT(*) AS c FROM outbox').get() as { c: number };
    expect(() => createLoan(d(), hh, loan(25000))).toThrow(/monthly lending cap of 50000/);
    expect(listLoans(d(), hh)).toHaveLength(1);
    expect((db.prepare('SELECT COUNT(*) AS c FROM outbox').get() as { c: number }).c).toBe(
      before.c,
    );
    expect(() => createLoan(d(), hh, loan(20000))).not.toThrow();
  });

  it('counts each month separately', () => {
    setLendingCap(d(), hh, 50000);
    createLoan(d(), hh, loan(50000, '2026-10-10'));
    expect(() => createLoan(d(), hh, loan(50000, '2026-11-02'))).not.toThrow();
  });

  it('excludes the loan being edited from its own month total', () => {
    setLendingCap(d(), hh, 50000);
    const id = createLoan(d(), hh, loan(40000));
    expect(() => updateLoan(d(), hh, id, loan(50000))).not.toThrow();
    expect(() => updateLoan(d(), hh, id, loan(50001))).toThrow(/cap/);
    expect(getLoan(d(), hh, id)!.amount).toBe(50000);
  });

  it('can be turned off again and syncs as a setting change', () => {
    setLendingCap(d(), hh, 1000);
    setLendingCap(d(), hh, null);
    expect(getLendingCap(d(), hh)).toBeNull();
    expect(checkLendingCap(d(), hh, { amount: 9e6, lentOn: '2026-10-10' }).status).toBe('OK');
    const rows = db
      .prepare(`SELECT COUNT(*) AS c FROM outbox WHERE table_name = 'settings'`)
      .get() as {
      c: number;
    };
    expect(rows.c).toBeGreaterThan(0);
  });

  it('rejects a negative or fractional cap', () => {
    expect(() => setLendingCap(d(), hh, -5)).toThrow();
    expect(() => setLendingCap(d(), hh, 10.5)).toThrow();
  });
});

describe('loan form', () => {
  const today = '2026-10-25';

  it('builds a single-payment input from text fields', () => {
    const form = {
      ...emptyLoanForm(today),
      personName: ' Desmond ',
      amount: '20,000',
      deadline: '2026-11-30',
    };
    expect(buildLoanInput(form)).toMatchObject({
      amount: 20000,
      plan: 'single',
      deadline: '2026-11-30',
      installmentCount: undefined,
    });
  });

  it('rejects bad amounts and installment counts', () => {
    const base = { ...emptyLoanForm(today), personName: 'A' };
    expect(() => buildLoanInput({ ...base, amount: '12.5' })).toThrow(/whole number/);
    expect(() => buildLoanInput({ ...base, amount: '0' })).toThrow(/whole number/);
    expect(() =>
      buildLoanInput({ ...base, amount: '1000', plan: 'installments', installmentCount: '1' }),
    ).toThrow(/between 2 and 60/);
  });

  it('round-trips an installment loan through the form and saves it', () => {
    const form = {
      ...emptyLoanForm(today),
      personName: 'Petra',
      personPhone: '+237 600',
      amount: '100000',
      plan: 'installments' as const,
      firstDueOn: '2026-11-25',
      installmentCount: '4',
    };
    const id = createLoan(d(), hh, buildLoanInput(form));
    const saved = getLoan(d(), hh, id)!;
    expect(saved.installments).toHaveLength(4);
    const back = loanToForm(saved);
    expect(back).toMatchObject({
      plan: 'installments',
      firstDueOn: '2026-11-25',
      amount: '100000',
    });
    expect(() =>
      updateLoan(d(), hh, id, buildLoanInput({ ...back, installmentCount: '5' })),
    ).not.toThrow();
    expect(getLoan(d(), hh, id)!.installments).toHaveLength(5);
  });

  it('requires a deadline for single payment and a person name', () => {
    const base = { ...emptyLoanForm(today), amount: '1000' };
    expect(() => createLoan(d(), hh, buildLoanInput({ ...base, personName: 'A' }))).toThrow(
      /deadline/,
    );
    expect(() =>
      createLoan(d(), hh, buildLoanInput({ ...base, personName: ' ', deadline: '2026-11-30' })),
    ).toThrow(/Choose or enter/);
  });
});
