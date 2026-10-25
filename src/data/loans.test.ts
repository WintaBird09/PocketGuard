import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { localDateString } from '../domain/dates';
import { pushOutbox, type PushApi } from '../sync/push';

import { initializeLocalApp } from './bootstrap';
import {
  createLoan,
  deleteLoan,
  deleteLoanRepayment,
  getLoan,
  listLoans,
  listPersonSummaries,
  recordLoanRepayment,
  reinstateLoan,
  totalOwedToYou,
  updateLoan,
  writeOffLoan,
} from './loans';

let db: Database.Database;
let hh: string;
const d = () => db as never;
const today = '2026-10-25';

const outboxFor = (table: string) =>
  (db.prepare('SELECT COUNT(*) AS c FROM outbox WHERE table_name = ?').get(table) as { c: number })
    .c;

const base = {
  personName: 'Desmond',
  personPhone: '+237 670 000 111',
  lentOn: '2026-10-20',
  amount: 20000,
  plan: 'flexible' as const,
  deadline: '2026-11-30',
};

beforeEach(() => {
  db = new Database(':memory:');
  hh = initializeLocalApp(d()).householdId;
  db.prepare('DELETE FROM outbox').run();
});

describe('shared local date helper', () => {
  it('formats the local calendar day', () => {
    expect(localDateString(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
  });
});

describe('createLoan', () => {
  it('stores a flexible loan as Pending and queues an outbox row', () => {
    const id = createLoan(d(), hh, base);
    const loan = getLoan(d(), hh, id, today)!;
    expect(loan).toMatchObject({
      personName: 'Desmond',
      amount: 20000,
      status: 'PENDING',
      balance: 20000,
      nextDueOn: '2026-11-30',
    });
    expect(outboxFor('loans')).toBe(1);
  });

  it('builds the installment schedule and derives the deadline', () => {
    const id = createLoan(d(), hh, {
      ...base,
      plan: 'installments',
      deadline: null,
      firstDueOn: '2026-11-20',
      installmentCount: 4,
    });
    const loan = getLoan(d(), hh, id, today)!;
    expect(loan.installments.map((i) => i.dueOn)).toEqual([
      '2026-11-20',
      '2026-12-20',
      '2027-01-20',
      '2027-02-20',
    ]);
    expect(loan.installments.reduce((s, i) => s + i.amount, 0)).toBe(20000);
    expect(loan.deadline).toBe('2027-02-20');
    expect(outboxFor('loan_installments')).toBe(4);
  });

  it('defaults to 4 installments', () => {
    const id = createLoan(d(), hh, {
      ...base,
      plan: 'installments',
      deadline: null,
      firstDueOn: '2026-11-20',
    });
    expect(getLoan(d(), hh, id, today)!.installments).toHaveLength(4);
  });

  it('rejects invalid input and writes nothing', () => {
    expect(() => createLoan(d(), hh, { ...base, personName: '  ' })).toThrow();
    expect(() => createLoan(d(), hh, { ...base, amount: 0 })).toThrow();
    expect(() => createLoan(d(), hh, { ...base, amount: 10.5 })).toThrow();
    expect(() => createLoan(d(), hh, { ...base, plan: 'single', deadline: null })).toThrow(
      /deadline/,
    );
    expect(() => createLoan(d(), hh, { ...base, deadline: '2026-10-01' })).toThrow(/before/);
    expect(() => createLoan(d(), hh, { ...base, lentOn: '2026-02-30' })).toThrow();
    expect(() =>
      createLoan(d(), hh, { ...base, plan: 'installments', firstDueOn: null }),
    ).toThrow();
    expect(listLoans(d(), hh, today)).toHaveLength(0);
    expect(outboxFor('loans')).toBe(0);
  });
});

describe('repayments', () => {
  it('moves Pending to Partial to Complete and queues outbox rows', () => {
    const id = createLoan(d(), hh, base);
    recordLoanRepayment(d(), hh, {
      loanId: id,
      amount: 5000,
      paidAt: new Date('2026-10-22T10:00:00Z'),
    });
    expect(getLoan(d(), hh, id, today)).toMatchObject({
      status: 'PARTIAL',
      paid: 5000,
      balance: 15000,
    });
    recordLoanRepayment(d(), hh, { loanId: id, amount: 15000 });
    const done = getLoan(d(), hh, id, today)!;
    expect(done.status).toBe('COMPLETE');
    expect(done.payments).toHaveLength(2);
    expect(outboxFor('loan_payments')).toBe(2);
  });

  it('rejects overpayment, zero, fractions, unknown loans and repaying a completed loan', () => {
    const id = createLoan(d(), hh, base);
    expect(() => recordLoanRepayment(d(), hh, { loanId: id, amount: 20001 })).toThrow(/exceeds/);
    expect(() => recordLoanRepayment(d(), hh, { loanId: id, amount: 0 })).toThrow();
    expect(() => recordLoanRepayment(d(), hh, { loanId: id, amount: 1.5 })).toThrow();
    expect(() => recordLoanRepayment(d(), hh, { loanId: 'nope', amount: 1 })).toThrow(/not found/);
    expect(outboxFor('loan_payments')).toBe(0);
    recordLoanRepayment(d(), hh, { loanId: id, amount: 20000 });
    expect(() => recordLoanRepayment(d(), hh, { loanId: id, amount: 1 })).toThrow(/fully repaid/);
  });

  it('keeps partial progress when overdue', () => {
    const id = createLoan(d(), hh, base);
    recordLoanRepayment(d(), hh, { loanId: id, amount: 5000 });
    const late = getLoan(d(), hh, id, '2026-12-05')!;
    expect(late).toMatchObject({ status: 'OVERDUE', paid: 5000, percentPaid: 25, daysOverdue: 5 });
  });

  it('soft-deletes a mistaken repayment and restores the balance', () => {
    const id = createLoan(d(), hh, base);
    const paymentId = recordLoanRepayment(d(), hh, { loanId: id, amount: 5000 });
    expect(deleteLoanRepayment(d(), hh, paymentId)).toBe(true);
    expect(deleteLoanRepayment(d(), hh, paymentId)).toBe(false);
    expect(getLoan(d(), hh, id, today)).toMatchObject({ status: 'PENDING', balance: 20000 });
    expect(outboxFor('loan_payments')).toBe(2);
    expect(db.prepare('SELECT COUNT(*) AS c FROM loan_payments').get()).toEqual({ c: 1 });
  });
});

describe('updateLoan', () => {
  it('edits details and rebuilds the schedule', () => {
    const id = createLoan(d(), hh, {
      ...base,
      plan: 'installments',
      deadline: null,
      firstDueOn: '2026-11-20',
      installmentCount: 4,
    });
    updateLoan(d(), hh, id, {
      ...base,
      amount: 30000,
      plan: 'installments',
      deadline: null,
      firstDueOn: '2026-12-01',
      installmentCount: 3,
      note: 'Raised',
    });
    const loan = getLoan(d(), hh, id, today)!;
    expect(loan.amount).toBe(30000);
    expect(loan.note).toBe('Raised');
    expect(loan.installments.map((i) => i.amount)).toEqual([10000, 10000, 10000]);
    expect(
      db.prepare('SELECT COUNT(*) AS c FROM loan_installments WHERE deleted_at IS NULL').get(),
    ).toEqual({ c: 3 });
    expect(db.prepare('SELECT COUNT(*) AS c FROM loan_installments').get()).toEqual({ c: 7 });
  });

  it('cannot lower the amount below what was repaid, and changes nothing on failure', () => {
    const id = createLoan(d(), hh, base);
    recordLoanRepayment(d(), hh, { loanId: id, amount: 8000 });
    expect(() => updateLoan(d(), hh, id, { ...base, amount: 5000 })).toThrow(/already repaid/);
    expect(getLoan(d(), hh, id, today)!.amount).toBe(20000);
    expect(() => updateLoan(d(), hh, 'nope', base)).toThrow(/not found/);
  });
});

describe('write-off', () => {
  it('stops overdue, excludes it from the owed total, and can be reinstated', () => {
    const id = createLoan(d(), hh, base);
    expect(getLoan(d(), hh, id, '2027-01-01')!.status).toBe('OVERDUE');
    writeOffLoan(d(), hh, id);
    const written = getLoan(d(), hh, id, '2027-01-01')!;
    expect(written).toMatchObject({ status: 'WRITTEN_OFF', balance: 20000, daysOverdue: 0 });
    expect(totalOwedToYou(d(), hh, '2027-01-01')).toBe(0);
    expect(() => writeOffLoan(d(), hh, id)).toThrow(/already/);
    reinstateLoan(d(), hh, id);
    expect(getLoan(d(), hh, id, '2027-01-01')!.status).toBe('OVERDUE');
    expect(() => reinstateLoan(d(), hh, id)).toThrow(/not written off/);
  });

  it('cannot write off a fully repaid loan', () => {
    const id = createLoan(d(), hh, base);
    recordLoanRepayment(d(), hh, { loanId: id, amount: 20000 });
    expect(() => writeOffLoan(d(), hh, id)).toThrow(/fully repaid/);
  });

  it('a written-off loan that is later fully repaid shows Complete', () => {
    const id = createLoan(d(), hh, base);
    writeOffLoan(d(), hh, id);
    recordLoanRepayment(d(), hh, { loanId: id, amount: 20000 });
    expect(getLoan(d(), hh, id, today)!.status).toBe('COMPLETE');
  });
});

describe('deleteLoan', () => {
  it('soft-deletes the loan, schedule and repayments with outbox rows', () => {
    const id = createLoan(d(), hh, {
      ...base,
      plan: 'installments',
      deadline: null,
      firstDueOn: '2026-11-20',
    });
    recordLoanRepayment(d(), hh, { loanId: id, amount: 1000 });
    deleteLoan(d(), hh, id);
    expect(listLoans(d(), hh, today)).toHaveLength(0);
    expect(
      db.prepare('SELECT COUNT(*) AS c FROM loans WHERE deleted_at IS NOT NULL').get(),
    ).toEqual({ c: 1 });
    expect(
      db.prepare('SELECT COUNT(*) AS c FROM loan_payments WHERE deleted_at IS NOT NULL').get(),
    ).toEqual({ c: 1 });
    expect(() => recordLoanRepayment(d(), hh, { loanId: id, amount: 1 })).toThrow(/not found/);
  });
});

describe('per-person summary', () => {
  it('groups one borrower across contact, phone and name, with correct totals', () => {
    const a = createLoan(d(), hh, { ...base, contactId: 'c-1' });
    createLoan(d(), hh, { ...base, contactId: 'c-1', amount: 10000, lentOn: '2026-10-21' });
    createLoan(d(), hh, { ...base, personName: 'Desmond N.', contactId: null, amount: 5000 });
    createLoan(d(), hh, { ...base, personName: 'Aline', personPhone: null, amount: 7000 });
    const other = createLoan(d(), hh, {
      ...base,
      personName: 'aline',
      personPhone: null,
      amount: 3000,
      deadline: '2026-10-21',
      lentOn: '2026-10-20',
    });
    recordLoanRepayment(d(), hh, { loanId: a, amount: 5000 });
    writeOffLoan(d(), hh, other);

    const summaries = listPersonSummaries(d(), hh, today);
    const desmond = summaries.find((s) => s.key === 'contact:c-1')!;
    expect(desmond).toMatchObject({
      loanCount: 2,
      totalLent: 30000,
      totalRepaid: 5000,
      outstanding: 25000,
    });
    expect(summaries.find((s) => s.key.startsWith('phone:'))).toMatchObject({ totalLent: 5000 });
    const aline = summaries.find((s) => s.key === 'name:aline')!;
    expect(aline).toMatchObject({
      loanCount: 2,
      totalLent: 10000,
      outstanding: 7000,
      writtenOff: 3000,
    });
    expect(summaries[0].personName).toBe('Desmond');
  });

  it('is empty with no loans', () => {
    expect(listPersonSummaries(d(), hh, today)).toEqual([]);
    expect(totalOwedToYou(d(), hh, today)).toBe(0);
  });
});

describe('loan outbox rows and the existing push service', () => {
  it('leaves loan rows queued without an error and still pushes supported rows', async () => {
    createLoan(d(), hh, base);
    db.prepare(
      `INSERT INTO budget_lines (id, household_id, name, kind) VALUES ('l-push', ?, 'Push', 'running');`,
    ).run(hh);
    db.prepare(
      `INSERT INTO outbox (id, household_id, table_name, row_id, op) VALUES ('o-1', ?, 'budget_lines', 'l-push', 'create');`,
    ).run(hh);
    const api: PushApi = {
      upsert: vi.fn(async () => ({ error: null })),
      updateHousehold: vi.fn(async () => ({ error: null })),
    };
    const result = await pushOutbox(d(), api, { now: new Date('2026-10-25T10:00:00Z') });
    expect(result.error).toBeNull();
    expect(result.remaining).toBe(0);
    expect(api.upsert).toHaveBeenCalledTimes(1);
    expect(outboxFor('loans')).toBe(1);
  });
});
