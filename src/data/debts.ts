import { debtBalance } from '../domain/budget';
import { effectiveNow, localDateString } from '../domain/dates';

import type { DatabaseLike } from './db';
import { assertWholeAmount, inTransaction, newId, requirePrepared } from './household';
import { setAllocation } from './plan';
import { appendOutboxEntry, transactions } from './repos';
import { getCurrencyCode } from '../domain/currency';

export type DebtPayment = {
  id: string;
  amount: number;
  occurredAt: string;
  note: string;
};

export type DebtStatus = 'OPEN' | 'PAID' | 'OVERDUE';

export type DebtSummary = {
  id: string;
  creditor: string;
  originalAmount: number;
  paid: number;
  balance: number;
  deadline: string | null;
  daysLeft: number | null;
  status: DebtStatus;
  payments: DebtPayment[];
};

export type ScheduleEntry = {
  month: string;
  debtId: string | null;
  lineId: string;
  creditor: string;
  planned: number;
  paid: number;
  state: 'Paid' | 'Due' | 'Planned';
};

const localDate = localDateString;

function dayDifference(from: string, to: string): number {
  const start = Date.UTC(...(from.split('-').map(Number) as [number, number, number]));
  const end = Date.UTC(...(to.split('-').map(Number) as [number, number, number]));
  return Math.round((end - start) / 86_400_000);
}

// Pure so it can be tested without a database. Balance is never stored; it is derived.
export function deriveDebtStatus(
  balance: number,
  deadline: string | null,
  today: string,
): DebtStatus {
  if (balance <= 0) return 'PAID';
  if (deadline && deadline < today) return 'OVERDUE';
  return 'OPEN';
}

export function listDebts(
  db: DatabaseLike,
  householdId: string,
  asOf: Date = effectiveNow(),
): DebtSummary[] {
  const prepare = requirePrepared(db);
  const today = localDate(asOf);
  const debtRows = prepare(
    `SELECT id, creditor, original_amount, deadline FROM debts
      WHERE household_id = ? AND deleted_at IS NULL ORDER BY created_at, creditor;`,
  ).all(householdId);
  const paymentRows = prepare(
    `SELECT id, debt_id, amount, occurred_at, note FROM transactions
      WHERE household_id = ? AND debt_id IS NOT NULL AND direction = 'expense'
        AND status = 'confirmed' AND deleted_at IS NULL
      ORDER BY occurred_at DESC, created_at DESC;`,
  ).all(householdId);

  return debtRows.map((row) => {
    const id = String(row.id);
    const payments: DebtPayment[] = paymentRows
      .filter((payment) => payment.debt_id === id)
      .map((payment) => ({
        id: String(payment.id),
        amount: Number(payment.amount),
        occurredAt: String(payment.occurred_at),
        note: payment.note === null ? '' : String(payment.note),
      }));
    const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const originalAmount = Number(row.original_amount);
    const balance = debtBalance(originalAmount, paid);
    const deadline = row.deadline ? String(row.deadline) : null;
    return {
      id,
      creditor: String(row.creditor),
      originalAmount,
      paid,
      balance,
      deadline,
      daysLeft: deadline ? dayDifference(today, deadline) : null,
      status: deriveDebtStatus(balance, deadline, today),
      payments,
    };
  });
}

// A debt's budget line is the active `debt` line whose name mentions the creditor.
export function findDebtLineId(
  db: DatabaseLike,
  householdId: string,
  creditor: string,
): string | null {
  const rows = requirePrepared(db)(
    `SELECT id, name FROM budget_lines
      WHERE household_id = ? AND kind = 'debt' AND deleted_at IS NULL AND archived = 0
      ORDER BY sort_order;`,
  ).all(householdId);
  const match = rows.find((row) => String(row.name).toLowerCase().includes(creditor.toLowerCase()));
  return match ? String(match.id) : null;
}

export function getDebtSchedule(
  db: DatabaseLike,
  householdId: string,
  debts: DebtSummary[],
  asOf: Date = effectiveNow(),
): ScheduleEntry[] {
  const currentMonth = localDate(asOf).slice(0, 7);
  const rows = requirePrepared(db)(
    `SELECT a.month, a.planned_amount, a.line_id, bl.name FROM allocations a
       JOIN budget_lines bl ON bl.id = a.line_id AND bl.household_id = a.household_id
      WHERE a.household_id = ? AND a.deleted_at IS NULL AND bl.deleted_at IS NULL
        AND bl.kind = 'debt' AND a.planned_amount > 0
      ORDER BY a.month, bl.sort_order;`,
  ).all(householdId);

  return rows.map((row) => {
    const name = String(row.name).toLowerCase();
    const debt = debts.find((candidate) => name.includes(candidate.creditor.toLowerCase()));
    const month = String(row.month);
    const planned = Number(row.planned_amount);
    const paid = (debt?.payments ?? [])
      .filter((payment) => payment.occurredAt.slice(0, 7) === month)
      .reduce((sum, payment) => sum + payment.amount, 0);
    const state: ScheduleEntry['state'] =
      paid >= planned ? 'Paid' : month <= currentMonth ? 'Due' : 'Planned';
    return {
      month,
      debtId: debt?.id ?? null,
      lineId: String(row.line_id),
      creditor: debt?.creditor ?? String(row.name),
      planned,
      paid,
      state,
    };
  });
}

export function addDebt(
  db: DatabaseLike,
  householdId: string,
  draft: { creditor: string; originalAmount: number; deadline?: string | null },
): string {
  const creditor = draft.creditor.trim();
  if (!creditor) throw new Error('Enter who the debt is owed to.');
  assertWholeAmount(draft.originalAmount);
  const deadline = draft.deadline?.trim() || null;
  if (deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(Date.parse(deadline)))) {
    throw new Error('Enter the deadline as YYYY-MM-DD.');
  }
  return inTransaction(db, () => {
    const id = newId();
    const now = new Date().toISOString();
    requirePrepared(db)(
      `INSERT INTO debts (id, household_id, creditor, original_amount, deadline, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
    ).run(id, householdId, creditor, draft.originalAmount, deadline, now, now);
    appendOutboxEntry(db, householdId, 'debts', id, 'create');
    return id;
  });
}

export function recordDebtPayment(
  db: DatabaseLike,
  householdId: string,
  draft: { debtId: string; amount: number; note?: string; paidAt?: Date },
): string {
  assertWholeAmount(draft.amount);
  return inTransaction(db, () => {
    const debt = listDebts(db, householdId).find((candidate) => candidate.id === draft.debtId);
    if (!debt) throw new Error('Debt was not found.');
    if (debt.balance <= 0) throw new Error('This debt is already fully paid.');
    if (draft.amount > debt.balance) {
      throw new Error(
        `Payment exceeds the remaining balance of ${debt.balance} ${getCurrencyCode()}.`,
      );
    }
    const lineId = findDebtLineId(db, householdId, debt.creditor);
    return transactions.add(db, householdId, {
      occurred_at: (draft.paidAt ?? effectiveNow()).toISOString(),
      amount: draft.amount,
      direction: 'expense',
      line_id: lineId,
      debt_id: debt.id,
      note: draft.note?.trim() || `Payment to ${debt.creditor}`,
      source: 'manual',
    }).id;
  });
}

// Soft delete. Payments already recorded stay in Activity as spending on the debt's budget line.
export function deleteDebt(db: DatabaseLike, householdId: string, debtId: string): void {
  inTransaction(db, () => {
    const now = new Date().toISOString();
    const result = requirePrepared(db)(
      `UPDATE debts SET deleted_at = ?, updated_at = ?
        WHERE id = ? AND household_id = ? AND deleted_at IS NULL;`,
    ).run(now, now, debtId, householdId) as { changes?: number };
    if (result.changes === 0) throw new Error('Debt was not found.');
    appendOutboxEntry(db, householdId, 'debts', debtId, 'delete');
  });
}

function plannedFor(db: DatabaseLike, householdId: string, lineId: string, month: string): number {
  const row = requirePrepared(db)(
    `SELECT planned_amount FROM allocations
      WHERE household_id = ? AND line_id = ? AND month = ? AND deleted_at IS NULL LIMIT 1;`,
  ).get(householdId, lineId, month);
  return Number(row?.planned_amount ?? 0);
}

// Removing a planned payment zeroes that month's allocation; recorded payments are untouched.
export function removePlannedPayment(
  db: DatabaseLike,
  householdId: string,
  lineId: string,
  month: string,
): void {
  inTransaction(db, () => {
    if (plannedFor(db, householdId, lineId, month) <= 0) {
      throw new Error('That planned payment was not found.');
    }
    setAllocation(db, householdId, lineId, month, 0);
  });
}

export function reschedulePlannedPayment(
  db: DatabaseLike,
  householdId: string,
  lineId: string,
  fromMonth: string,
  toMonth: string,
): void {
  if (fromMonth === toMonth) throw new Error('Pick a different month.');
  inTransaction(db, () => {
    const amount = plannedFor(db, householdId, lineId, fromMonth);
    if (amount <= 0) throw new Error('That planned payment was not found.');
    if (plannedFor(db, householdId, lineId, toMonth) > 0) {
      throw new Error('A payment is already planned for that month.');
    }
    setAllocation(db, householdId, lineId, toMonth, amount);
    setAllocation(db, householdId, lineId, fromMonth, 0);
  });
}
