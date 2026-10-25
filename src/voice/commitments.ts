import type { DatabaseLike } from '../data/db';
import { requirePrepared } from '../data/household';

import type { SavingsCommitmentOption } from './VoiceConfirmCard';

export function listPendingVoiceSavingsCommitments(
  db: DatabaseLike,
  householdId: string,
  month: string,
): SavingsCommitmentOption[] {
  return requirePrepared(db)(
    `SELECT sc.id, sc.line_id, bl.name AS line_name, sc.month, sc.planned_amount
     FROM savings_commitments sc
     JOIN budget_lines bl ON bl.id = sc.line_id AND bl.household_id = sc.household_id
     WHERE sc.household_id = ? AND sc.month = ? AND sc.saved_at IS NULL
       AND sc.deleted_at IS NULL AND bl.deleted_at IS NULL
     ORDER BY sc.created_at, sc.id;`,
  )
    .all(householdId, month)
    .map((row) => ({
      id: String(row.id),
      lineId: String(row.line_id),
      lineName: String(row.line_name),
      month: String(row.month),
      plannedAmount: Number(row.planned_amount),
    }));
}
