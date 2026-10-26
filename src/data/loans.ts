import { effectiveNow, localDateString } from '../domain/dates';
import {
  addMonths,
  assertRepayable,
  deriveLoanState,
  generateInstallments,
  type Installment,
  type LoanPlan,
  type LoanState,
} from '../domain/loans';

import type { DatabaseLike } from './db';
import { assertWholeAmount, inTransaction, newId, requirePrepared } from './household';
import { checkLendingCap } from './lendingCap';
import { appendOutboxEntry } from './repos';

export const defaultInstallmentCount = 4;

export type LoanInput = {
  personName: string;
  personPhone?: string | null;
  contactId?: string | null;
  lentOn: string;
  amount: number;
  plan: LoanPlan;
  // single / flexible: the expected deadline. installments: derived from the schedule.
  deadline?: string | null;
  firstDueOn?: string | null;
  installmentCount?: number;
  note?: string | null;
};

export type LoanPayment = { id: string; paidAt: string; amount: number; note: string };

export type LoanSummary = LoanState & {
  id: string;
  personName: string;
  personPhone: string | null;
  contactId: string | null;
  lentOn: string;
  amount: number;
  plan: LoanPlan;
  deadline: string | null;
  note: string;
  writtenOffAt: string | null;
  installments: Installment[];
  payments: LoanPayment[];
};

export type PersonSummary = {
  key: string;
  personName: string;
  personPhone: string | null;
  loanCount: number;
  totalLent: number;
  totalRepaid: number;
  outstanding: number;
  writtenOff: number;
  overdueCount: number;
  loans: LoanSummary[];
};

type LoanRow = {
  id: string;
  person_name: string;
  person_phone: string | null;
  contact_id: string | null;
  lent_on: string;
  amount: number;
  plan: string;
  deadline: string | null;
  note: string | null;
  written_off_at: string | null;
};

function validDate(value: string | null | undefined, label: string): string {
  try {
    if (!value) throw new Error('missing');
    addMonths(value, 0);
    return value;
  } catch {
    throw new Error(`Enter ${label} as YYYY-MM-DD.`);
  }
}

type Normalized = {
  personName: string;
  personPhone: string | null;
  contactId: string | null;
  lentOn: string;
  amount: number;
  plan: LoanPlan;
  deadline: string | null;
  note: string | null;
  installments: Installment[];
};

function normalize(input: LoanInput): Normalized {
  const personName = input.personName.trim();
  if (!personName) throw new Error('Choose or enter who you lent the money to.');
  assertWholeAmount(input.amount);
  const lentOn = validDate(input.lentOn, 'the lending date');
  if (!['single', 'installments', 'flexible'].includes(input.plan)) {
    throw new Error('Choose a valid payment plan.');
  }

  let deadline = input.deadline?.trim() || null;
  let installments: Installment[] = [];
  if (input.plan === 'installments') {
    const firstDueOn = validDate(input.firstDueOn, 'the first installment date');
    installments = generateInstallments({
      amount: input.amount,
      firstDueOn,
      count: input.installmentCount ?? defaultInstallmentCount,
    });
    deadline = installments[installments.length - 1].dueOn;
  } else if (deadline) {
    deadline = validDate(deadline, 'the deadline');
  } else if (input.plan === 'single') {
    throw new Error('A single-payment loan needs a deadline.');
  }
  if (deadline && deadline < lentOn)
    throw new Error('The deadline cannot be before the lending date.');
  if (installments[0] && installments[0].dueOn < lentOn) {
    throw new Error('The first installment cannot be before the lending date.');
  }

  return {
    personName,
    personPhone: input.personPhone?.trim() || null,
    contactId: input.contactId?.trim() || null,
    lentOn,
    amount: input.amount,
    plan: input.plan,
    deadline,
    note: input.note?.trim() || null,
    installments,
  };
}

function insertInstallments(
  db: DatabaseLike,
  householdId: string,
  loanId: string,
  installments: Installment[],
  now: string,
) {
  for (const installment of installments) {
    const id = newId();
    requirePrepared(db)(
      `INSERT INTO loan_installments (id, household_id, loan_id, due_on, amount, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
    ).run(id, householdId, loanId, installment.dueOn, installment.amount, now, now);
    appendOutboxEntry(db, householdId, 'loan_installments', id, 'create');
  }
}

function softDeleteInstallments(
  db: DatabaseLike,
  householdId: string,
  loanId: string,
  now: string,
) {
  const prepare = requirePrepared(db);
  const rows = prepare(
    `SELECT id FROM loan_installments WHERE household_id = ? AND loan_id = ? AND deleted_at IS NULL;`,
  ).all(householdId, loanId) as { id: string }[];
  for (const row of rows) {
    prepare(`UPDATE loan_installments SET deleted_at = ?, updated_at = ? WHERE id = ?;`).run(
      now,
      now,
      row.id,
    );
    appendOutboxEntry(db, householdId, 'loan_installments', row.id, 'delete');
  }
}

function paidTotal(db: DatabaseLike, householdId: string, loanId: string): number {
  const row = requirePrepared(db)(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM loan_payments
      WHERE household_id = ? AND loan_id = ? AND deleted_at IS NULL;`,
  ).get(householdId, loanId);
  return Number(row?.total ?? 0);
}

function requireLoan(db: DatabaseLike, householdId: string, loanId: string): LoanRow {
  const row = requirePrepared(db)(
    `SELECT id, person_name, person_phone, contact_id, lent_on, amount, plan, deadline, note, written_off_at
       FROM loans WHERE id = ? AND household_id = ? AND deleted_at IS NULL;`,
  ).get(loanId, householdId) as LoanRow | undefined;
  if (!row) throw new Error('Loan was not found.');
  return row;
}

export function createLoan(db: DatabaseLike, householdId: string, input: LoanInput): string {
  const loan = normalize(input);
  return inTransaction(db, () => {
    const cap = checkLendingCap(db, householdId, { amount: loan.amount, lentOn: loan.lentOn });
    if (cap.status === 'BLOCKED') throw new Error(cap.reason);
    const id = newId();
    const now = new Date().toISOString();
    requirePrepared(db)(
      `INSERT INTO loans
        (id, household_id, person_name, person_phone, contact_id, lent_on, amount, plan, deadline, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    ).run(
      id,
      householdId,
      loan.personName,
      loan.personPhone,
      loan.contactId,
      loan.lentOn,
      loan.amount,
      loan.plan,
      loan.deadline,
      loan.note,
      now,
      now,
    );
    appendOutboxEntry(db, householdId, 'loans', id, 'create');
    insertInstallments(db, householdId, id, loan.installments, now);
    return id;
  });
}

export function updateLoan(
  db: DatabaseLike,
  householdId: string,
  loanId: string,
  input: LoanInput,
): void {
  const loan = normalize(input);
  inTransaction(db, () => {
    requireLoan(db, householdId, loanId);
    const paid = paidTotal(db, householdId, loanId);
    if (loan.amount < paid) {
      throw new Error(`The amount cannot be less than the ${paid} XAF already repaid.`);
    }
    const cap = checkLendingCap(db, householdId, {
      amount: loan.amount,
      lentOn: loan.lentOn,
      excludeLoanId: loanId,
    });
    if (cap.status === 'BLOCKED') throw new Error(cap.reason);
    const now = new Date().toISOString();
    requirePrepared(db)(
      `UPDATE loans SET person_name = ?, person_phone = ?, contact_id = ?, lent_on = ?, amount = ?,
         plan = ?, deadline = ?, note = ?, updated_at = ?
       WHERE id = ? AND household_id = ?;`,
    ).run(
      loan.personName,
      loan.personPhone,
      loan.contactId,
      loan.lentOn,
      loan.amount,
      loan.plan,
      loan.deadline,
      loan.note,
      now,
      loanId,
      householdId,
    );
    appendOutboxEntry(db, householdId, 'loans', loanId, 'update');
    // The schedule is always rebuilt from the loan so it never drifts from the amount.
    softDeleteInstallments(db, householdId, loanId, now);
    insertInstallments(db, householdId, loanId, loan.installments, now);
  });
}

export function recordLoanRepayment(
  db: DatabaseLike,
  householdId: string,
  draft: { loanId: string; amount: number; paidAt?: Date; note?: string },
): string {
  return inTransaction(db, () => {
    const loan = requireLoan(db, householdId, draft.loanId);
    const balance = Math.max(0, loan.amount - paidTotal(db, householdId, loan.id));
    if (balance <= 0) throw new Error('This loan is already fully repaid.');
    assertRepayable(loan.amount, draft.amount, balance);
    const id = newId();
    const now = new Date().toISOString();
    requirePrepared(db)(
      `INSERT INTO loan_payments (id, household_id, loan_id, paid_at, amount, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    ).run(
      id,
      householdId,
      loan.id,
      (draft.paidAt ?? effectiveNow()).toISOString(),
      draft.amount,
      draft.note?.trim() || null,
      now,
      now,
    );
    appendOutboxEntry(db, householdId, 'loan_payments', id, 'create');
    return id;
  });
}

// Mistaken repayments are soft-deleted so history and sync stay consistent.
export function deleteLoanRepayment(
  db: DatabaseLike,
  householdId: string,
  paymentId: string,
): boolean {
  return inTransaction(db, () => {
    const now = new Date().toISOString();
    const result = requirePrepared(db)(
      `UPDATE loan_payments SET deleted_at = ?, updated_at = ?
        WHERE id = ? AND household_id = ? AND deleted_at IS NULL;`,
    ).run(now, now, paymentId, householdId) as { changes?: number };
    if (result.changes === 0) return false;
    appendOutboxEntry(db, householdId, 'loan_payments', paymentId, 'delete');
    return true;
  });
}

function setWrittenOff(
  db: DatabaseLike,
  householdId: string,
  loanId: string,
  value: string | null,
) {
  const now = new Date().toISOString();
  requirePrepared(db)(
    `UPDATE loans SET written_off_at = ?, updated_at = ? WHERE id = ? AND household_id = ?;`,
  ).run(value, now, loanId, householdId);
  appendOutboxEntry(db, householdId, 'loans', loanId, 'update');
}

export function writeOffLoan(
  db: DatabaseLike,
  householdId: string,
  loanId: string,
  at: Date = effectiveNow(),
): void {
  inTransaction(db, () => {
    const loan = requireLoan(db, householdId, loanId);
    if (loan.written_off_at) throw new Error('This loan is already written off.');
    if (loan.amount - paidTotal(db, householdId, loanId) <= 0) {
      throw new Error('A fully repaid loan cannot be written off.');
    }
    setWrittenOff(db, householdId, loanId, at.toISOString());
  });
}

export function reinstateLoan(db: DatabaseLike, householdId: string, loanId: string): void {
  inTransaction(db, () => {
    const loan = requireLoan(db, householdId, loanId);
    if (!loan.written_off_at) throw new Error('This loan is not written off.');
    setWrittenOff(db, householdId, loanId, null);
  });
}

// Removes a loan (and its schedule and repayments) from every list; kept as soft deletes.
export function deleteLoan(db: DatabaseLike, householdId: string, loanId: string): void {
  inTransaction(db, () => {
    requireLoan(db, householdId, loanId);
    const prepare = requirePrepared(db);
    const now = new Date().toISOString();
    softDeleteInstallments(db, householdId, loanId, now);
    const payments = prepare(
      `SELECT id FROM loan_payments WHERE household_id = ? AND loan_id = ? AND deleted_at IS NULL;`,
    ).all(householdId, loanId) as { id: string }[];
    for (const payment of payments) {
      prepare(`UPDATE loan_payments SET deleted_at = ?, updated_at = ? WHERE id = ?;`).run(
        now,
        now,
        payment.id,
      );
      appendOutboxEntry(db, householdId, 'loan_payments', payment.id, 'delete');
    }
    prepare(`UPDATE loans SET deleted_at = ?, updated_at = ? WHERE id = ?;`).run(now, now, loanId);
    appendOutboxEntry(db, householdId, 'loans', loanId, 'delete');
  });
}

export function listLoans(
  db: DatabaseLike,
  householdId: string,
  today: string = localDateString(),
): LoanSummary[] {
  const prepare = requirePrepared(db);
  const rows = prepare(
    `SELECT id, person_name, person_phone, contact_id, lent_on, amount, plan, deadline, note, written_off_at
       FROM loans WHERE household_id = ? AND deleted_at IS NULL ORDER BY lent_on DESC, created_at DESC;`,
  ).all(householdId) as LoanRow[];
  const installmentRows = prepare(
    `SELECT loan_id, due_on, amount FROM loan_installments
      WHERE household_id = ? AND deleted_at IS NULL ORDER BY due_on;`,
  ).all(householdId) as { loan_id: string; due_on: string; amount: number }[];
  const paymentRows = prepare(
    `SELECT id, loan_id, paid_at, amount, note FROM loan_payments
      WHERE household_id = ? AND deleted_at IS NULL ORDER BY paid_at DESC;`,
  ).all(householdId) as {
    id: string;
    loan_id: string;
    paid_at: string;
    amount: number;
    note: string | null;
  }[];

  return rows.map((row) => {
    const installments = installmentRows
      .filter((item) => item.loan_id === row.id)
      .map((item) => ({ dueOn: item.due_on, amount: Number(item.amount) }));
    const payments = paymentRows
      .filter((item) => item.loan_id === row.id)
      .map((item) => ({
        id: item.id,
        paidAt: item.paid_at,
        amount: Number(item.amount),
        note: item.note ?? '',
      }));
    const amount = Number(row.amount);
    return {
      ...deriveLoanState({
        amount,
        payments,
        deadline: row.deadline,
        installments,
        writtenOff: Boolean(row.written_off_at),
        today,
      }),
      id: row.id,
      personName: row.person_name,
      personPhone: row.person_phone,
      contactId: row.contact_id,
      lentOn: row.lent_on,
      amount,
      plan: row.plan as LoanPlan,
      deadline: row.deadline,
      note: row.note ?? '',
      writtenOffAt: row.written_off_at,
      installments,
      payments,
    };
  });
}

export function getLoan(
  db: DatabaseLike,
  householdId: string,
  loanId: string,
  today?: string,
): LoanSummary | null {
  return listLoans(db, householdId, today).find((loan) => loan.id === loanId) ?? null;
}

// The same borrower is matched by contact, then phone digits, then name, so one person
// lent to twice (even via picker and then typed) shows as one summary.
function personKey(loan: LoanSummary): string {
  if (loan.contactId) return `contact:${loan.contactId}`;
  const digits = (loan.personPhone ?? '').replace(/\D/g, '');
  if (digits.length >= 6) return `phone:${digits}`;
  return `name:${loan.personName.trim().toLowerCase()}`;
}

export function listPersonSummaries(
  db: DatabaseLike,
  householdId: string,
  today?: string,
): PersonSummary[] {
  const groups = new Map<string, PersonSummary>();
  for (const loan of listLoans(db, householdId, today)) {
    const key = personKey(loan);
    const group = groups.get(key) ?? {
      key,
      personName: loan.personName,
      personPhone: loan.personPhone,
      loanCount: 0,
      totalLent: 0,
      totalRepaid: 0,
      outstanding: 0,
      writtenOff: 0,
      overdueCount: 0,
      loans: [],
    };
    group.loanCount += 1;
    group.totalLent += loan.amount;
    group.totalRepaid += loan.paid;
    if (loan.status === 'WRITTEN_OFF') group.writtenOff += loan.balance;
    else group.outstanding += loan.balance;
    if (loan.status === 'OVERDUE') group.overdueCount += 1;
    group.personPhone ??= loan.personPhone;
    group.loans.push(loan);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.outstanding - a.outstanding || a.personName.localeCompare(b.personName),
  );
}

export function totalOwedToYou(db: DatabaseLike, householdId: string, today?: string): number {
  return listLoans(db, householdId, today)
    .filter((loan) => loan.status !== 'WRITTEN_OFF')
    .reduce((sum, loan) => sum + loan.balance, 0);
}
