import { evaluateSpendCheck, type SpendCheckResult } from '../domain/spendCheck';
import { dayOfMonth, daysInMonth, monthKeyForDate } from '../domain/dates';

import type { DatabaseLike } from './db';
import { transactions, type TransactionDirection } from './repos';

type TransactionEntryDatabase = DatabaseLike & {
  prepare: (sql: string) => {
    all: (...values: unknown[]) => Record<string, unknown>[];
    get: (...values: unknown[]) => Record<string, unknown> | undefined;
  };
};

export type ExpenseLineOption = {
  id: string;
  name: string;
  hardCap: boolean;
  planned: number;
};

export type ExpenseReview = {
  lineId: string;
  lineName: string;
  amount: number;
  planned: number;
  spent: number;
  hardCap: boolean;
  month: string;
  result: SpendCheckResult;
};

export type ExpenseDraft = {
  lineId: string;
  amount: number;
  note: string;
  occurredOn: string;
  source?: 'manual' | 'voice';
  rawText?: string | null;
};

function requireDatabase(db: DatabaseLike): TransactionEntryDatabase {
  if (!db.prepare) throw new Error('Database does not support prepared queries.');
  return db as TransactionEntryDatabase;
}

function monthForDate(occurredOn: string): { date: Date; month: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    throw new Error('Enter a valid transaction date.');
  }
  const date = new Date(`${occurredOn}T12:00:00`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== occurredOn) {
    throw new Error('Enter a valid transaction date.');
  }
  return { date, month: monthKeyForDate(date, 'Africa/Douala') };
}

export function listExpenseLines(
  db: DatabaseLike,
  householdId: string,
  month: string,
): ExpenseLineOption[] {
  const rows = requireDatabase(db)
    .prepare(
      `SELECT bl.id, bl.name, bl.hard_cap, COALESCE(a.planned_amount, 0) AS planned
       FROM budget_lines bl
       LEFT JOIN allocations a
         ON a.line_id = bl.id AND a.household_id = bl.household_id
        AND a.month = ? AND a.deleted_at IS NULL
       WHERE bl.household_id = ? AND bl.deleted_at IS NULL AND bl.archived = 0
       ORDER BY bl.sort_order, bl.name;`,
    )
    .all(month, householdId);

  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    hardCap: Boolean(row.hard_cap),
    planned: Number(row.planned),
  }));
}

export function getExpenseReview(
  db: DatabaseLike,
  householdId: string,
  draft: Pick<ExpenseDraft, 'lineId' | 'amount' | 'occurredOn'>,
): ExpenseReview {
  if (!Number.isSafeInteger(draft.amount) || draft.amount <= 0) {
    throw new Error('Enter a positive whole amount in XAF.');
  }

  const { date, month } = monthForDate(draft.occurredOn);
  const database = requireDatabase(db);
  const line = database
    .prepare(
      `SELECT bl.id, bl.name, bl.hard_cap, COALESCE(a.planned_amount, 0) AS planned
       FROM budget_lines bl
       LEFT JOIN allocations a
         ON a.line_id = bl.id AND a.household_id = bl.household_id
        AND a.month = ? AND a.deleted_at IS NULL
       WHERE bl.id = ? AND bl.household_id = ? AND bl.deleted_at IS NULL AND bl.archived = 0;`,
    )
    .get(month, draft.lineId, householdId);
  if (!line) throw new Error('Choose an active budget line.');

  const spentRow = database
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS spent FROM transactions
       WHERE household_id = ? AND line_id = ? AND direction = 'expense'
         AND substr(occurred_at, 1, 7) = ? AND deleted_at IS NULL AND status = 'confirmed';`,
    )
    .get(householdId, draft.lineId, month);
  const planned = Number(line.planned);
  const spent = Number(spentRow?.spent ?? 0);
  const daysElapsed = dayOfMonth(date, 'Africa/Douala');
  const daysInCurrentMonth = daysInMonth(date, 'Africa/Douala');

  return {
    lineId: String(line.id),
    lineName: String(line.name),
    amount: draft.amount,
    planned,
    spent,
    hardCap: Boolean(line.hard_cap),
    month,
    result: evaluateSpendCheck({
      amount: draft.amount,
      planned,
      spent,
      hardCap: Boolean(line.hard_cap),
      daysElapsed,
      daysInMonth: daysInCurrentMonth,
      lineName: String(line.name),
    }),
  };
}

export type ExpenseSubmission =
  | { saved: false; reason: 'blocked' | 'confirmation-required'; review: ExpenseReview }
  | { saved: true; review: ExpenseReview; transaction: ReturnType<typeof transactions.add> };

export type ExpenseOverride = { reason: string; authenticated: boolean };

// A hard-cap overspend is saved only with a typed reason and a passed biometric/PIN check (FR-16).
export function submitExpense(
  db: DatabaseLike,
  householdId: string,
  draft: ExpenseDraft,
  confirmWarning = false,
  override?: ExpenseOverride,
): ExpenseSubmission {
  const review = getExpenseReview(db, householdId, draft);
  let overrideReason: string | null = null;
  if (review.result.status === 'BLOCKED') {
    const reason = override?.reason.trim() ?? '';
    if (!override || !override.authenticated || !reason) {
      return { saved: false, reason: 'blocked', review };
    }
    overrideReason = reason;
  }
  if (review.result.status === 'WARN' && !confirmWarning) {
    return { saved: false, reason: 'confirmation-required', review };
  }

  const { date } = monthForDate(draft.occurredOn);
  const occurredAt = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
  ).toISOString();
  const transaction = transactions.add(db, householdId, {
    occurred_at: occurredAt,
    amount: draft.amount,
    direction: 'expense' satisfies TransactionDirection,
    line_id: draft.lineId,
    note: draft.note.trim() || null,
    source: draft.source ?? 'manual',
    raw_text: draft.rawText ?? null,
    status: 'confirmed',
    override_reason: overrideReason,
  });

  return { saved: true, review, transaction };
}
