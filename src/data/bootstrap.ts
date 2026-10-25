import type { DatabaseLike } from './db';
import { runMigrations } from './db';
import { ensureMiscLine } from './plan';
import { settings } from './repos';
import { loadPlanSep2026, SEED_MONTHLY_INCOME } from './seed';

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
    `INSERT OR IGNORE INTO outbox (id, household_id, table_name, row_id, op, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'create', ?, ?);`,
  ).run(`seed-outbox-${table}-${rowId}`, householdId, table, rowId, timestamp, timestamp);
}

export const onboardingCompleteKey = 'onboarding_complete';

function insertIfMissing(
  db: BootstrapDatabase,
  householdId: string,
  table: string,
  rowId: string,
  sql: string,
  values: (string | number | null)[],
  timestamp: string,
): void {
  const result = db.prepare(sql).run(...values) as { changes?: number };
  if (result.changes !== 0) appendOutbox(db, householdId, table, rowId, timestamp);
}

// Adds the PRD Sep-Dec 2026 plan. Existing rows (including user edits) are never overwritten.
export function loadSeedPlan(db: BootstrapDatabase, householdId: string): void {
  const plan = loadPlanSep2026();
  db.transaction(() => {
    const timestamp = new Date().toISOString();

    for (const line of plan.lines) {
      insertIfMissing(
        db,
        householdId,
        'budget_lines',
        line.id,
        `INSERT OR IGNORE INTO budget_lines
          (id, household_id, name, kind, hard_cap, sort_order, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?);`,
        [
          line.id,
          householdId,
          line.name,
          line.kind,
          line.hard_cap ? 1 : 0,
          line.sort_order,
          timestamp,
          timestamp,
        ],
        timestamp,
      );
    }

    for (const allocation of plan.allocations) {
      const id = `allocation-${allocation.month}-${allocation.line_id}`;
      insertIfMissing(
        db,
        householdId,
        'allocations',
        id,
        `INSERT OR IGNORE INTO allocations
          (id, household_id, line_id, month, planned_amount, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [
          id,
          householdId,
          allocation.line_id,
          allocation.month,
          allocation.planned_amount,
          timestamp,
          timestamp,
        ],
        timestamp,
      );
    }

    for (const debt of plan.debts) {
      insertIfMissing(
        db,
        householdId,
        'debts',
        debt.id,
        `INSERT OR IGNORE INTO debts
          (id, household_id, creditor, original_amount, deadline, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          debt.id,
          householdId,
          debt.creditor,
          debt.original_amount,
          debt.deadline,
          debt.note,
          timestamp,
          timestamp,
        ],
        timestamp,
      );
    }

    const goal = plan.savingsGoal;
    insertIfMissing(
      db,
      householdId,
      'savings_goals',
      goal.id,
      `INSERT OR IGNORE INTO savings_goals
        (id, household_id, name, target_amount, due_date, include_kids_savings, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        goal.id,
        householdId,
        goal.name,
        goal.target_amount,
        goal.due_date,
        goal.include_kids_savings ? 1 : 0,
        timestamp,
        timestamp,
      ],
      timestamp,
    );

    for (const commitment of plan.commitments) {
      insertIfMissing(
        db,
        householdId,
        'savings_commitments',
        commitment.id,
        `INSERT OR IGNORE INTO savings_commitments
          (id, household_id, goal_id, line_id, month, planned_amount, saved_amount, saved_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
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
        ],
        timestamp,
      );
    }

    const hasIncome = db
      .prepare(
        `SELECT 1 AS found FROM settings WHERE household_id = ? AND key = 'planned_income' AND deleted_at IS NULL;`,
      )
      .get(householdId);
    if (!hasIncome) settings.set(db, householdId, 'planned_income', SEED_MONTHLY_INCOME);
    markOnboardingComplete(db, householdId);
  })();
}

function markOnboardingComplete(db: BootstrapDatabase, householdId: string): void {
  const done = db
    .prepare(
      `SELECT 1 AS found FROM settings WHERE household_id = ? AND key = ? AND deleted_at IS NULL;`,
    )
    .get(householdId, onboardingCompleteKey);
  if (!done) settings.set(db, householdId, onboardingCompleteKey, 'true');
}

export function completeOnboardingWithoutPlan(db: BootstrapDatabase, householdId: string): void {
  db.transaction(() => {
    ensureMiscLine(db, householdId);
    markOnboardingComplete(db, householdId);
  })();
}

// Existing installs that already hold a plan skip onboarding.
export function needsOnboarding(db: DatabaseLike, householdId: string): boolean {
  if (!db.prepare) return false;
  const done = db
    .prepare(
      `SELECT 1 AS found FROM settings WHERE household_id = ? AND key = ? AND deleted_at IS NULL;`,
    )
    .get(householdId, onboardingCompleteKey);
  if (done) return false;
  const lines = db
    .prepare(
      `SELECT COUNT(*) AS total FROM budget_lines WHERE household_id = ? AND deleted_at IS NULL;`,
    )
    .get(householdId);
  return Number(lines?.total ?? 0) <= 1;
}

export function bootstrapHousehold(db: BootstrapDatabase, loadPlan = true): string {
  const plan = loadPlanSep2026();
  const householdId = plan.household.id;

  const created = db.transaction(() => {
    const existingHousehold = db
      .prepare('SELECT id FROM households WHERE id = ? AND deleted_at IS NULL;')
      .get(householdId);
    if (existingHousehold) return false;

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
    return true;
  })() as boolean;

  if (created && loadPlan) loadSeedPlan(db, householdId);
  return householdId;
}

export function initializeLocalApp(
  db: DatabaseLike,
  options: { loadPlan?: boolean } = {},
): {
  householdId: string;
  initialRoute: typeof initialAppRoute;
} {
  runMigrations(db);
  if (!isBootstrapDatabase(db)) {
    throw new Error('Database does not support the operations required for app bootstrap.');
  }

  return {
    householdId: bootstrapHousehold(db, options.loadPlan ?? true),
    initialRoute: initialAppRoute,
  };
}
