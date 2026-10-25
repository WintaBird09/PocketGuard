import { z } from 'zod';

import { localDateString } from '../domain/dates';
import { inTransaction, requirePrepared } from '../data/household';
import { appendOutboxEntry, transactions } from '../data/repos';
import type { DatabaseLike } from '../data/db';

import { parseExpenseItemSchema, type ParseExpenseItem } from './contract';

const metadataPrefix = 'voice-parse:v1:';
const metadataSchema = z.object({ item: parseExpenseItemSchema });

export type VoiceDraftRow = {
  id: string;
  household_id: string;
  raw_text: string;
  amount: number;
  direction: 'expense' | 'income';
  line_id: string | null;
  note: string | null;
  occurred_at: string;
  status: string;
  deleted_at: string | null;
};

export function encodeVoiceDraftMetadata(item: ParseExpenseItem): string {
  return `${metadataPrefix}${JSON.stringify({ item })}`;
}

export function decodeVoiceDraftMetadata(value: unknown): ParseExpenseItem | null {
  if (typeof value !== 'string' || !value.startsWith(metadataPrefix)) return null;
  try {
    const parsed = metadataSchema.safeParse(JSON.parse(value.slice(metadataPrefix.length)));
    return parsed.success ? parsed.data.item : null;
  } catch {
    return null;
  }
}

function occurredAtForDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Voice parser returned an invalid transaction date.');
  }
  return parsed.toISOString();
}

export function createVoiceDraft(
  db: DatabaseLike,
  householdId: string,
  transcript: string,
): string {
  const normalizedTranscript = transcript.trim();
  if (!normalizedTranscript) throw new Error('Record a voice note before saving a draft.');
  const transaction = transactions.add(db, householdId, {
    occurred_at: occurredAtForDate(localDateString()),
    amount: 0,
    direction: 'expense',
    source: 'voice',
    raw_text: normalizedTranscript,
    status: 'draft',
  });
  return transaction.id;
}

export function listUnparsedVoiceDrafts(db: DatabaseLike, householdId: string): VoiceDraftRow[] {
  return requirePrepared(db)(
    `SELECT id, household_id, raw_text, amount, direction, line_id, note, occurred_at, status, deleted_at
     FROM transactions
     WHERE household_id = ? AND source = 'voice' AND status = 'draft'
       AND deleted_at IS NULL AND raw_text IS NOT NULL
     ORDER BY created_at;`,
  )
    .all(householdId)
    .map((row): VoiceDraftRow => ({
      id: String(row.id),
      household_id: String(row.household_id),
      raw_text: String(row.raw_text),
      amount: Number(row.amount),
      direction: row.direction === 'income' ? 'income' : 'expense',
      line_id: typeof row.line_id === 'string' ? row.line_id : null,
      note: typeof row.note === 'string' ? row.note : null,
      occurred_at: String(row.occurred_at),
      status: String(row.status),
      deleted_at: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    }))
    .filter((draft) => decodeVoiceDraftMetadata(draft.note) === null);
}

export function saveVoiceDraftParse(
  db: DatabaseLike,
  householdId: string,
  draftId: string,
  items: readonly ParseExpenseItem[],
): string[] {
  if (items.length === 0) throw new Error('Voice parser returned no items.');
  return inTransaction(db, () => {
    const prepare = requirePrepared(db);
    const draft = prepare(
      `SELECT raw_text FROM transactions
       WHERE id = ? AND household_id = ? AND source = 'voice'
         AND status = 'draft' AND deleted_at IS NULL;`,
    ).get(draftId, householdId);
    if (!draft || typeof draft.raw_text !== 'string') {
      throw new Error('Voice draft was not found.');
    }

    const ids: string[] = [];
    const now = new Date().toISOString();
    items.forEach((item, index) => {
      const id =
        index === 0
          ? draftId
          : transactions.add(db, householdId, {
              occurred_at: occurredAtForDate(item.date),
              amount: item.amount_xaf,
              direction: item.intent === 'log_income' ? 'income' : 'expense',
              line_id: item.line_id,
              note: encodeVoiceDraftMetadata(item),
              source: 'voice',
              raw_text: draft.raw_text as string,
              status: 'draft',
            }).id;
      if (index === 0) {
        prepare(
          `UPDATE transactions SET amount = ?, direction = ?, line_id = ?, note = ?,
             occurred_at = ?, updated_at = ?
           WHERE id = ? AND household_id = ? AND status = 'draft' AND deleted_at IS NULL;`,
        ).run(
          item.amount_xaf,
          item.intent === 'log_income' ? 'income' : 'expense',
          item.line_id,
          encodeVoiceDraftMetadata(item),
          occurredAtForDate(item.date),
          now,
          draftId,
          householdId,
        );
        appendOutboxEntry(db, householdId, 'transactions', draftId, 'upsert');
      }
      ids.push(id);
    });
    return ids;
  });
}

export function completeVoiceDraft(db: DatabaseLike, householdId: string, draftId: string): void {
  inTransaction(db, () => {
    const now = new Date().toISOString();
    const result = requirePrepared(db)(
      `UPDATE transactions SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND household_id = ? AND source = 'voice'
         AND status = 'draft' AND deleted_at IS NULL;`,
    ).run(now, now, draftId, householdId) as { changes?: number };
    if (result.changes === 0) throw new Error('Voice draft was not found.');
    appendOutboxEntry(db, householdId, 'transactions', draftId, 'delete');
  });
}

export function listVoiceDraftsReadyForConfirmation(
  db: DatabaseLike,
  householdId: string,
): Array<{ id: string; rawText: string; item: ParseExpenseItem }> {
  const rows = requirePrepared(db)(
    `SELECT id, raw_text, note FROM transactions
     WHERE household_id = ? AND source = 'voice' AND status = 'draft'
       AND deleted_at IS NULL AND note LIKE 'voice-parse:v1:%'
     ORDER BY created_at;`,
  ).all(householdId);
  return rows.flatMap((row) => {
    const item = decodeVoiceDraftMetadata(row.note);
    return item && typeof row.raw_text === 'string'
      ? [{ id: String(row.id), rawText: row.raw_text, item }]
      : [];
  });
}
