import type { DatabaseLike } from './db';
import { assertMonthKey, assertWholeAmount, inTransaction, requirePrepared } from './household';
import { appendOutboxEntry } from './repos';

export type ActivityItem = {
  id: string;
  occurredAt: string;
  amount: number;
  direction: 'expense' | 'income' | 'transfer';
  lineId: string | null;
  lineName: string | null;
  debtId: string | null;
  note: string;
  source: string;
  overrideReason: string | null;
};

export type ActivityFilter = {
  month: string;
  lineId?: string | null;
  overridesOnly?: boolean;
};

const activitySelect = `SELECT t.id, t.occurred_at, t.amount, t.direction, t.line_id, t.debt_id,
    t.note, t.source, t.override_reason, bl.name AS line_name
  FROM transactions t
  LEFT JOIN budget_lines bl ON bl.id = t.line_id AND bl.household_id = t.household_id`;

function toItem(row: Record<string, unknown>): ActivityItem {
  return {
    id: String(row.id),
    occurredAt: String(row.occurred_at),
    amount: Number(row.amount),
    direction: row.direction as ActivityItem['direction'],
    lineId: row.line_id === null ? null : String(row.line_id),
    lineName: row.line_name === null || row.line_name === undefined ? null : String(row.line_name),
    debtId: row.debt_id === null ? null : String(row.debt_id),
    note: row.note === null || row.note === undefined ? '' : String(row.note),
    source: String(row.source),
    overrideReason: row.override_reason === null ? null : String(row.override_reason),
  };
}

export function listActivity(
  db: DatabaseLike,
  householdId: string,
  filter: ActivityFilter,
): ActivityItem[] {
  assertMonthKey(filter.month);
  const clauses = [
    't.household_id = ?',
    "t.status = 'confirmed'",
    't.deleted_at IS NULL',
    'substr(t.occurred_at, 1, 7) = ?',
  ];
  const values: unknown[] = [householdId, filter.month];
  if (filter.lineId) {
    clauses.push('t.line_id = ?');
    values.push(filter.lineId);
  }
  if (filter.overridesOnly) clauses.push('t.override_reason IS NOT NULL');
  return requirePrepared(db)(
    `${activitySelect} WHERE ${clauses.join(' AND ')} ORDER BY t.occurred_at DESC, t.created_at DESC;`,
  )
    .all(...values)
    .map(toItem);
}

export type OverrideRecord = ActivityItem & { overrideReason: string };

export function listOverrides(
  db: DatabaseLike,
  householdId: string,
  month?: string,
): OverrideRecord[] {
  const clauses = ['t.household_id = ?', 't.deleted_at IS NULL', 't.override_reason IS NOT NULL'];
  const values: unknown[] = [householdId];
  if (month) {
    assertMonthKey(month);
    clauses.push('substr(t.occurred_at, 1, 7) = ?');
    values.push(month);
  }
  return requirePrepared(db)(
    `${activitySelect} WHERE ${clauses.join(' AND ')} ORDER BY t.occurred_at DESC;`,
  )
    .all(...values)
    .map((row) => toItem(row) as OverrideRecord);
}

export type TransactionEdit = {
  amount: number;
  note: string;
  occurredOn: string;
  lineId?: string | null;
};

function occurredAtForDate(occurredOn: string): string {
  const date = new Date(`${occurredOn}T12:00:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== occurredOn
  ) {
    throw new Error('Enter a valid transaction date.');
  }
  return date.toISOString();
}

export function updateTransaction(
  db: DatabaseLike,
  householdId: string,
  id: string,
  edit: TransactionEdit,
): void {
  assertWholeAmount(edit.amount);
  const occurredAt = occurredAtForDate(edit.occurredOn);
  inTransaction(db, () => {
    const prepare = requirePrepared(db);
    const existing = prepare(
      `SELECT direction, line_id FROM transactions
        WHERE id = ? AND household_id = ? AND deleted_at IS NULL;`,
    ).get(id, householdId);
    if (!existing) throw new Error('Transaction was not found.');

    let lineId = existing.line_id === null ? null : String(existing.line_id);
    if (edit.lineId !== undefined && existing.direction === 'expense') {
      if (!edit.lineId) throw new Error('Choose a budget line.');
      const line = prepare(
        'SELECT id FROM budget_lines WHERE id = ? AND household_id = ? AND deleted_at IS NULL;',
      ).get(edit.lineId, householdId);
      if (!line) throw new Error('Choose an active budget line.');
      lineId = edit.lineId;
    }

    prepare(
      `UPDATE transactions SET amount = ?, note = ?, occurred_at = ?, line_id = ?, updated_at = ?
        WHERE id = ? AND household_id = ?;`,
    ).run(
      edit.amount,
      edit.note.trim() || null,
      occurredAt,
      lineId,
      new Date().toISOString(),
      id,
      householdId,
    );
    appendOutboxEntry(db, householdId, 'transactions', id, 'upsert');
  });
}

export function deleteTransaction(db: DatabaseLike, householdId: string, id: string): boolean {
  return inTransaction(db, () => {
    const now = new Date().toISOString();
    const result = requirePrepared(db)(
      `UPDATE transactions SET deleted_at = ?, updated_at = ?
        WHERE id = ? AND household_id = ? AND deleted_at IS NULL;`,
    ).run(now, now, id, householdId) as { changes?: number };
    if (result.changes === 0) return false;
    appendOutboxEntry(db, householdId, 'transactions', id, 'delete');
    return true;
  });
}

export function restoreTransaction(db: DatabaseLike, householdId: string, id: string): boolean {
  return inTransaction(db, () => {
    const result = requirePrepared(db)(
      `UPDATE transactions SET deleted_at = NULL, updated_at = ?
        WHERE id = ? AND household_id = ? AND deleted_at IS NOT NULL;`,
    ).run(new Date().toISOString(), id, householdId) as { changes?: number };
    if (result.changes === 0) return false;
    appendOutboxEntry(db, householdId, 'transactions', id, 'upsert');
    return true;
  });
}

function csvCell(value: unknown, guardFormula = false): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (guardFormula && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildTransactionsCsv(db: DatabaseLike, householdId: string): string {
  const rows = requirePrepared(db)(
    `SELECT t.occurred_at, t.direction, bl.name AS line_name, d.creditor, t.amount, t.note,
            t.source, t.status, t.override_reason
       FROM transactions t
       LEFT JOIN budget_lines bl ON bl.id = t.line_id AND bl.household_id = t.household_id
       LEFT JOIN debts d ON d.id = t.debt_id AND d.household_id = t.household_id
      WHERE t.household_id = ? AND t.deleted_at IS NULL
      ORDER BY t.occurred_at, t.created_at;`,
  ).all(householdId);
  const header = 'date,type,line,debt,amount_xaf,note,source,status,override_reason';
  const body = rows.map((row) =>
    [
      csvCell(String(row.occurred_at).slice(0, 10)),
      csvCell(row.direction),
      csvCell(row.line_name, true),
      csvCell(row.creditor, true),
      csvCell(row.amount),
      csvCell(row.note, true),
      csvCell(row.source),
      csvCell(row.status),
      csvCell(row.override_reason, true),
    ].join(','),
  );
  return [header, ...body].join('\n');
}
