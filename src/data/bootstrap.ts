import type { DatabaseLike } from './db';
import { runMigrations } from './db';
import { loadPlanSep2026 } from './seed';

type Statement = {
  run: (...values: (string | number | null)[]) => unknown;
  get: (...values: (string | number | null)[]) => Record<string, unknown> | undefined;
};

type BootstrapDatabase = DatabaseLike & {
  prepare: (sql: string) => Statement;
  transaction: (fn: () => unknown) => () => unknown;
};

export const initialAppRoute = '/(tabs)' as const;

function isBootstrapDatabase(db: DatabaseLike): db is BootstrapDatabase {
  return typeof db.prepare === 'function' && typeof db.transaction === 'function';
}

function appendOutbox(
  db: BootstrapDatabase,
  householdId: string,
  table: string,
  rowId: string,
  timestamp: string,
) {
  db.prepare(
    `INSERT INTO outbox (id, household_id, table_name, row_id, op, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'create', ?, ?);`,
  ).run(`seed-outbox-${table}-${rowId}`, householdId, table, rowId, timestamp, timestamp);
}

export function bootstrapHousehold(db: BootstrapDatabase): string {
  const plan = loadPlanSep2026();
  const householdId = plan.household.id;

  return db.transaction(() => {
    const existingHousehold = db
      .prepare('SELECT id FROM households WHERE id = ? AND deleted_at IS NULL;')
      .get(householdId);
    if (existingHousehold) return householdId;

    const timestamp = new Date().toISOString();
    db.prepare(
      `INSERT INTO households
        (id, household_id, name, month_start_day, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
    ).run(
      householdId,
      householdId,
      plan.household.name,
      plan.household.month_start_day,
      plan.household.currency,
      timestamp,
      timestamp,
    );
    appendOutbox(db, householdId, 'households', householdId, timestamp);

    for (const line of plan.lines) {
      db.prepare(
        `INSERT INTO budget_lines
          (id, household_id, name, kind, hard_cap, sort_order, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?);`,
      ).run(
        line.id,
        householdId,
        line.name,
        line.kind,
        line.hard_cap ? 1 : 0,
        line.sort_order,
        timestamp,
        timestamp,
      );
      appendOutbox(db, householdId, 'budget_lines', line.id, timestamp);
    }

    for (const allocation of plan.allocations) {
      const id = `allocation-${allocation.month}-${allocation.line_id}`;
      db.prepare(
        `INSERT INTO allocations
          (id, household_id, line_id, month, planned_amount, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
      ).run(
        id,
        householdId,
        allocation.line_id,
        allocation.month,
        allocation.planned_amount,
        timestamp,
        timestamp,
      );
      appendOutbox(db, householdId, 'allocations', id, timestamp);
    }

    for (const debt of plan.debts) {
      db.prepare(
        `INSERT INTO debts
          (id, household_id, creditor, original_amount, deadline, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      ).run(
        debt.id,
        householdId,
        debt.creditor,
        debt.original_amount,
        debt.deadline,
        debt.note,
        timestamp,
        timestamp,
      );
      appendOutbox(db, householdId, 'debts', debt.id, timestamp);
    }

    const goal = plan.savingsGoal;
    db.prepare(
      `INSERT INTO savings_goals
        (id, household_id, name, target_amount, due_date, include_kids_savings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    ).run(
      goal.id,
      householdId,
      goal.name,
      goal.target_amount,
      goal.due_date,
      goal.include_kids_savings ? 1 : 0,
      timestamp,
      timestamp,
    );
    appendOutbox(db, householdId, 'savings_goals', goal.id, timestamp);

    for (const commitment of plan.commitments) {
      db.prepare(
        `INSERT INTO savings_commitments
          (id, household_id, goal_id, line_id, month, planned_amount, saved_amount, saved_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      ).run(
        commitment.id,
        householdId,
        commitment.goal_id,
        commitment.line_id,
        commitment.month,
        commitment.planned_amount,
        commitment.saved_amount,
        commitment.saved_at,
        timestamp,
        timestamp,
      );
      appendOutbox(db, householdId, 'savings_commitments', commitment.id, timestamp);
    }

    return householdId;
  })() as string;
}

export function initializeLocalApp(db: DatabaseLike): {
  householdId: string;
  initialRoute: typeof initialAppRoute;
} {
  runMigrations(db);
  if (!isBootstrapDatabase(db)) {
    throw new Error('Database does not support the operations required for app bootstrap.');
  }

  return {
    householdId: bootstrapHousehold(db),
    initialRoute: initialAppRoute,
  };
}
