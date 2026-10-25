import type { DatabaseLike } from './db';
import { inTransaction, requirePrepared } from './household';
import { appendOutboxEntry } from './repos';
import { getExpenseReview, submitExpense, type ExpenseOverride } from './transaction-entry';

export type InboxItem = {
  id: string;
  kind: 'draft' | 'unassigned';
  text: string;
  amount: number | null;
  occurredAt: string;
};

// FR-14: pending voice drafts plus confirmed expenses that have no budget line.
export function listInbox(db: DatabaseLike, householdId: string): InboxItem[] {
  const rows = requirePrepared(db)(
    `SELECT id, status, raw_text, note, amount, occurred_at FROM transactions
      WHERE household_id = ? AND deleted_at IS NULL
        AND (status = 'draft' OR (direction = 'expense' AND line_id IS NULL AND debt_id IS NULL))
      ORDER BY created_at DESC;`,
  ).all(householdId);
  return rows.map((row) => ({
    id: String(row.id),
    kind: row.status === 'draft' ? 'draft' : 'unassigned',
    text: String(row.raw_text ?? row.note ?? 'Untitled entry'),
    amount: row.amount === null ? null : Number(row.amount),
    occurredAt: String(row.occurred_at),
  }));
}

export function countInbox(db: DatabaseLike, householdId: string): number {
  return listInbox(db, householdId).length;
}

export function discardInboxItem(db: DatabaseLike, householdId: string, id: string): boolean {
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

// Manually classifies an inbox item. It goes through the same spend check as a new entry.
export function classifyInboxItem(
  db: DatabaseLike,
  householdId: string,
  id: string,
  draft: { lineId: string; amount: number; occurredOn: string },
  confirmWarning = false,
  override?: ExpenseOverride,
) {
  return inTransaction(db, () => {
    const prepare = requirePrepared(db);
    const item = prepare(
      `SELECT id, note, raw_text FROM transactions
        WHERE id = ? AND household_id = ? AND deleted_at IS NULL;`,
    ).get(id, householdId);
    if (!item) throw new Error('Inbox item was not found.');
    const review = getExpenseReview(db, householdId, draft);
    if (review.result.status === 'WARN' && !confirmWarning) {
      return { saved: false as const, reason: 'confirmation-required' as const, review };
    }
    const submission = submitExpense(
      db,
      householdId,
      { ...draft, note: String(item.note ?? item.raw_text ?? '') },
      true,
      override,
    );
    if (!submission.saved) return submission;
    const now = new Date().toISOString();
    prepare(
      `UPDATE transactions SET deleted_at = ?, updated_at = ?
        WHERE id = ? AND household_id = ?;`,
    ).run(now, now, id, householdId);
    appendOutboxEntry(db, householdId, 'transactions', id, 'delete');
    return submission;
  });
}
