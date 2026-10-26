import type { DatabaseLike } from './db';
import { appendOutboxEntry } from './repos';
import { effectiveNow } from '../domain/dates';

export type SavingsCommitment = {
  id: string;
  month: string;
  plannedAmount: number;
  savedAmount: number | null;
  savedAt: string | null;
};

export type SavingsOverview = {
  goalName: string;
  target: number;
  saved: number;
  monthlyCommitment: number;
  projectedGap: number;
  /** Confirmed savings plus every still-unconfirmed commitment, if the plan is followed. */
  projectedTotal: number;
  shortfall: number;
  overdueMonths: string[];
  commitments: SavingsCommitment[];
};

type PreparedDatabase = DatabaseLike & {
  prepare: NonNullable<DatabaseLike['prepare']>;
};

function requirePreparedDatabase(db: DatabaseLike): PreparedDatabase {
  if (!db.prepare) throw new Error('Database does not support prepared queries.');
  return db as PreparedDatabase;
}

export function getSavingsOverview(
  db: DatabaseLike,
  householdId: string,
  monthKey: string,
): SavingsOverview | null {
  const database = requirePreparedDatabase(db);
  const goal = database
    .prepare(
      `SELECT id, name, target_amount FROM savings_goals
       WHERE household_id = ? AND deleted_at IS NULL
       ORDER BY created_at LIMIT 1;`,
    )
    .get(householdId) as { id: string; name: string; target_amount: number } | undefined;
  if (!goal) return null;

  const commitmentRows = database
    .prepare(
      `SELECT id, month, planned_amount, saved_amount, saved_at
       FROM savings_commitments
       WHERE household_id = ? AND goal_id = ? AND month = ? AND deleted_at IS NULL
       ORDER BY created_at, id;`,
    )
    .all(householdId, goal.id, monthKey) as {
    id: string;
    month: string;
    planned_amount: number;
    saved_amount: number | null;
    saved_at: string | null;
  }[];
  const saved = Number(
    database
      .prepare(
        `SELECT COALESCE(SUM(saved_amount), 0) AS saved
         FROM savings_commitments
         WHERE household_id = ? AND goal_id = ? AND saved_at IS NOT NULL AND deleted_at IS NULL;`,
      )
      .get(householdId, goal.id)?.saved ?? 0,
  );
  const allRows = database
    .prepare(
      `SELECT month, planned_amount, saved_at FROM savings_commitments
       WHERE household_id = ? AND goal_id = ? AND deleted_at IS NULL;`,
    )
    .all(householdId, goal.id) as {
    month: string;
    planned_amount: number;
    saved_at: string | null;
  }[];
  const outstandingPlanned = allRows
    .filter((row) => row.saved_at === null)
    .reduce((sum, row) => sum + Number(row.planned_amount), 0);
  const projectedTotal = saved + outstandingPlanned;
  const overdueMonths = allRows
    .filter((row) => row.saved_at === null && row.month < monthKey)
    .map((row) => row.month)
    .sort();
  const commitments = commitmentRows.map((commitment) => ({
    id: commitment.id,
    month: commitment.month,
    plannedAmount: Number(commitment.planned_amount),
    savedAmount: commitment.saved_amount === null ? null : Number(commitment.saved_amount),
    savedAt: commitment.saved_at,
  }));
  const monthlyCommitment = commitments.reduce((total, commitment) => {
    return total + commitment.plannedAmount;
  }, 0);

  return {
    goalName: goal.name,
    target: Number(goal.target_amount),
    saved,
    monthlyCommitment,
    projectedGap: Math.max(0, Number(goal.target_amount) - saved),
    projectedTotal,
    shortfall: Math.max(0, Number(goal.target_amount) - projectedTotal),
    overdueMonths,
    commitments,
  };
}

export function confirmSavingsCommitment(
  db: DatabaseLike,
  householdId: string,
  commitmentId: string,
  savedAmount?: number,
  savedAt = effectiveNow().toISOString(),
): boolean {
  const database = requirePreparedDatabase(db);
  const transaction = database.transaction
    ? database.transaction.bind(database)
    : (fn: () => unknown) => fn;

  return transaction(() => {
    const commitment = database
      .prepare(
        `SELECT planned_amount, saved_at FROM savings_commitments
         WHERE id = ? AND household_id = ? AND deleted_at IS NULL LIMIT 1;`,
      )
      .get(commitmentId, householdId) as
      { planned_amount: number; saved_at: string | null } | undefined;
    if (!commitment) throw new Error('Savings commitment was not found.');
    if (commitment.saved_at !== null) return false;
    const amount = savedAmount ?? Number(commitment.planned_amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error('Saved amount must be a positive whole number.');
    }

    database
      .prepare(
        `UPDATE savings_commitments SET saved_amount = ?, saved_at = ?, updated_at = ?
         WHERE id = ? AND household_id = ? AND saved_at IS NULL AND deleted_at IS NULL;`,
      )
      .run(amount, savedAt, savedAt, commitmentId, householdId);
    appendOutboxEntry(database, householdId, 'savings_commitments', commitmentId, 'upsert');
    return true;
  })() as boolean;
}
