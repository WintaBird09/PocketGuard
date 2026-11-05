import type { DatabaseLike } from './db';
import { assertWholeAmount, inTransaction, newId, requirePrepared } from './household';
import { addBudgetLine, nextMonth, setAllocation } from './plan';
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

export type GoalPlan = {
  id: string;
  name: string;
  target: number;
  dueDate: string;
  saved: number;
  /** Everything planned across all months, confirmed or not. */
  planned: number;
  monthlyAmount: number;
  thisMonthPlanned: number;
  overdueMonths: string[];
  commitments: SavingsCommitment[];
};

export type YearMonth = { month: string; planned: number; saved: number };

export type SavingsPlanner = {
  year: number;
  goals: GoalPlan[];
  months: YearMonth[];
  yearPlanned: number;
  yearSaved: number;
  totalTarget: number;
  totalSaved: number;
};

const maxCommitmentMonths = 120;

export function getSavingsPlanner(
  db: DatabaseLike,
  householdId: string,
  year: number,
  currentMonth: string,
): SavingsPlanner {
  const database = requirePreparedDatabase(db);
  const goalRows = database
    .prepare(
      `SELECT id, name, target_amount, due_date FROM savings_goals
       WHERE household_id = ? AND deleted_at IS NULL ORDER BY created_at, id;`,
    )
    .all(householdId) as { id: string; name: string; target_amount: number; due_date: string }[];
  const commitmentRows = database
    .prepare(
      `SELECT id, goal_id, month, planned_amount, saved_amount, saved_at FROM savings_commitments
       WHERE household_id = ? AND deleted_at IS NULL ORDER BY month, id;`,
    )
    .all(householdId) as {
    id: string;
    goal_id: string;
    month: string;
    planned_amount: number;
    saved_amount: number | null;
    saved_at: string | null;
  }[];

  const goals: GoalPlan[] = goalRows.map((goal) => {
    const commitments = commitmentRows
      .filter((row) => row.goal_id === goal.id)
      .map((row) => ({
        id: row.id,
        month: row.month,
        plannedAmount: Number(row.planned_amount),
        savedAmount: row.saved_amount === null ? null : Number(row.saved_amount),
        savedAt: row.saved_at,
      }));
    return {
      id: goal.id,
      name: goal.name,
      target: Number(goal.target_amount),
      dueDate: goal.due_date,
      saved: commitments.reduce((n, c) => n + (c.savedAt ? (c.savedAmount ?? 0) : 0), 0),
      planned: commitments.reduce((n, c) => n + c.plannedAmount, 0),
      monthlyAmount: commitments[0]?.plannedAmount ?? 0,
      thisMonthPlanned: commitments
        .filter((c) => c.month === currentMonth)
        .reduce((n, c) => n + c.plannedAmount, 0),
      overdueMonths: commitments
        .filter((c) => !c.savedAt && c.month < currentMonth)
        .map((c) => c.month),
      commitments,
    };
  });

  const months: YearMonth[] = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    const inMonth = goals.flatMap((goal) => goal.commitments).filter((c) => c.month === month);
    return {
      month,
      planned: inMonth.reduce((n, c) => n + c.plannedAmount, 0),
      saved: inMonth.reduce((n, c) => n + (c.savedAt ? (c.savedAmount ?? 0) : 0), 0),
    };
  });

  return {
    year,
    goals,
    months,
    yearPlanned: months.reduce((n, m) => n + m.planned, 0),
    yearSaved: months.reduce((n, m) => n + m.saved, 0),
    totalTarget: goals.reduce((n, g) => n + g.target, 0),
    totalSaved: goals.reduce((n, g) => n + g.saved, 0),
  };
}

// Creates a goal, its savings budget line and one commitment (and allocation) per month
// from `startMonth` to the due month. The last month only takes what is still missing.
export function addSavingsGoal(
  db: DatabaseLike,
  householdId: string,
  draft: { name: string; target: number; monthlyAmount: number; dueDate: string },
  startMonth: string,
  // Funds only the start month; later months are linked from the Budget screen.
  incomeStreamId: string | null = null,
): string {
  const name = draft.name.trim();
  if (!name) throw new Error('Enter a name for the savings goal.');
  assertWholeAmount(draft.target);
  assertWholeAmount(draft.monthlyAmount);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate)) throw new Error('Choose a target date.');
  const dueMonth = draft.dueDate.slice(0, 7);
  if (dueMonth < startMonth) throw new Error('The target date must be this month or later.');

  const months: string[] = [];
  for (let month = startMonth; month <= dueMonth; month = nextMonth(month)) months.push(month);
  if (months.length > maxCommitmentMonths) throw new Error('Choose a target within 10 years.');

  return inTransaction(db, () => {
    const prepare = requirePrepared(db);
    const lineId = addBudgetLine(db, householdId, { name, kind: 'savings' });
    const goalId = newId();
    const now = new Date().toISOString();
    prepare(
      `INSERT INTO savings_goals (id, household_id, name, target_amount, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
    ).run(goalId, householdId, name, draft.target, draft.dueDate, now, now);
    appendOutboxEntry(db, householdId, 'savings_goals', goalId, 'create');

    let remaining = draft.target;
    for (const month of months) {
      const amount = Math.min(draft.monthlyAmount, remaining);
      if (amount <= 0) break;
      remaining -= amount;
      const id = newId();
      prepare(
        `INSERT INTO savings_commitments
           (id, household_id, goal_id, line_id, month, planned_amount, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      ).run(id, householdId, goalId, lineId, month, amount, now, now);
      appendOutboxEntry(db, householdId, 'savings_commitments', id, 'create');
      setAllocation(
        db,
        householdId,
        lineId,
        month,
        amount,
        month === startMonth ? incomeStreamId : undefined,
      );
    }
    return goalId;
  });
}

export function deleteSavingsGoal(db: DatabaseLike, householdId: string, goalId: string): void {
  inTransaction(db, () => {
    const prepare = requirePrepared(db);
    const now = new Date().toISOString();
    const result = prepare(
      `UPDATE savings_goals SET deleted_at = ?, updated_at = ?
        WHERE id = ? AND household_id = ? AND deleted_at IS NULL;`,
    ).run(now, now, goalId, householdId) as { changes?: number };
    if (result.changes === 0) throw new Error('Savings goal was not found.');
    appendOutboxEntry(db, householdId, 'savings_goals', goalId, 'delete');
    const rows = prepare(
      `SELECT id FROM savings_commitments
        WHERE household_id = ? AND goal_id = ? AND deleted_at IS NULL;`,
    ).all(householdId, goalId) as { id: string }[];
    prepare(
      `UPDATE savings_commitments SET deleted_at = ?, updated_at = ?
        WHERE household_id = ? AND goal_id = ? AND deleted_at IS NULL;`,
    ).run(now, now, householdId, goalId);
    for (const row of rows) {
      appendOutboxEntry(db, householdId, 'savings_commitments', row.id, 'delete');
    }
  });
}
