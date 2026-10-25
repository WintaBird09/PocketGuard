import type { DatabaseLike } from './db';
import {
  assertMonthKey,
  assertWholeAmount,
  inTransaction,
  newId,
  requirePrepared,
} from './household';
import { appendOutboxEntry, settings } from './repos';

export const plannedIncomeKey = 'planned_income';

export type PlanLine = {
  id: string;
  name: string;
  kind: string;
  hardCap: boolean;
  archived: boolean;
  planned: number;
  spent: number;
};

export type MonthPlan = {
  month: string;
  income: number;
  plannedOut: number;
  flexible: number;
  plannedSavings: number;
  lines: PlanLine[];
};

const lineKinds = ['running', 'fixed', 'debt', 'savings', 'misc'] as const;
export type LineKind = (typeof lineKinds)[number];

export function defaultHardCap(kind: string): boolean {
  return kind === 'running' || kind === 'misc';
}

export function previousMonth(month: string): string {
  assertMonthKey(month);
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function nextMonth(month: string): string {
  assertMonthKey(month);
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function listPlanMonths(db: DatabaseLike, householdId: string, current: string): string[] {
  const rows = requirePrepared(db)(
    `SELECT DISTINCT month FROM allocations WHERE household_id = ? AND deleted_at IS NULL;`,
  ).all(householdId);
  const months = new Set<string>([current, ...rows.map((row) => String(row.month))]);
  return [...months].sort();
}

export function getPlannedIncome(db: DatabaseLike, householdId: string): number | null {
  const value = settings.get(db, householdId, plannedIncomeKey);
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function setPlannedIncome(db: DatabaseLike, householdId: string, amount: number): void {
  assertWholeAmount(amount, true);
  settings.set(db, householdId, plannedIncomeKey, amount);
}

export function getMonthPlan(
  db: DatabaseLike,
  householdId: string,
  month: string,
  includeArchived = false,
): MonthPlan {
  assertMonthKey(month);
  const prepare = requirePrepared(db);
  const rows = prepare(
    `SELECT bl.id, bl.name, bl.kind, bl.hard_cap, bl.archived,
        COALESCE(a.planned_amount, 0) AS planned,
        COALESCE((SELECT SUM(t.amount) FROM transactions t
          WHERE t.household_id = bl.household_id AND t.line_id = bl.id
            AND t.direction = 'expense' AND t.status = 'confirmed'
            AND t.deleted_at IS NULL AND substr(t.occurred_at, 1, 7) = ?), 0) AS spent
       FROM budget_lines bl
       LEFT JOIN allocations a
         ON a.line_id = bl.id AND a.household_id = bl.household_id
        AND a.month = ? AND a.deleted_at IS NULL
      WHERE bl.household_id = ? AND bl.deleted_at IS NULL ${includeArchived ? '' : 'AND bl.archived = 0'}
      ORDER BY bl.archived, bl.sort_order, bl.name;`,
  ).all(month, month, householdId);

  const lines: PlanLine[] = rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    kind: String(row.kind),
    hardCap: Boolean(row.hard_cap),
    archived: Boolean(row.archived),
    planned: Number(row.planned),
    spent: Number(row.spent),
  }));
  const active = lines.filter((line) => !line.archived);
  const plannedOut = active.reduce((sum, line) => sum + line.planned, 0);
  const recordedIncome = Number(
    prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
        WHERE household_id = ? AND direction = 'income' AND status = 'confirmed'
          AND deleted_at IS NULL AND substr(occurred_at, 1, 7) = ?;`,
    ).get(householdId, month)?.total ?? 0,
  );
  const income = getPlannedIncome(db, householdId) ?? recordedIncome;
  const flexible = income - plannedOut;
  const savingsLines = active
    .filter((line) => line.kind === 'savings')
    .reduce((sum, line) => sum + line.planned, 0);

  return {
    month,
    income,
    plannedOut,
    flexible,
    plannedSavings: savingsLines + Math.max(0, flexible),
    lines,
  };
}

export function setAllocation(
  db: DatabaseLike,
  householdId: string,
  lineId: string,
  month: string,
  amount: number,
): void {
  assertMonthKey(month);
  assertWholeAmount(amount, true);
  inTransaction(db, () => writeAllocation(db, householdId, lineId, month, amount));
}

function writeAllocation(
  db: DatabaseLike,
  householdId: string,
  lineId: string,
  month: string,
  amount: number,
): void {
  const prepare = requirePrepared(db);
  const line = prepare(
    'SELECT id FROM budget_lines WHERE id = ? AND household_id = ? AND deleted_at IS NULL;',
  ).get(lineId, householdId);
  if (!line) throw new Error('Budget line was not found.');

  const now = new Date().toISOString();
  const existing = prepare(
    `SELECT id FROM allocations
      WHERE household_id = ? AND line_id = ? AND month = ? AND deleted_at IS NULL LIMIT 1;`,
  ).get(householdId, lineId, month);
  let id: string;
  if (existing) {
    id = String(existing.id);
    prepare('UPDATE allocations SET planned_amount = ?, updated_at = ? WHERE id = ?;').run(
      amount,
      now,
      id,
    );
  } else {
    id = newId();
    prepare(
      `INSERT INTO allocations (id, household_id, line_id, month, planned_amount, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
    ).run(id, householdId, lineId, month, amount, now, now);
  }
  appendOutboxEntry(db, householdId, 'allocations', id, 'upsert');
}

// Copies planned amounts into `to` for every active line that has no allocation there yet.
export function copyForward(
  db: DatabaseLike,
  householdId: string,
  from: string,
  to: string,
): number {
  assertMonthKey(from);
  assertMonthKey(to);
  if (from === to) throw new Error('Choose two different months.');
  return inTransaction(db, () => {
    const prepare = requirePrepared(db);
    const rows = prepare(
      `SELECT src.line_id, src.planned_amount FROM allocations src
         JOIN budget_lines bl ON bl.id = src.line_id AND bl.household_id = src.household_id
        WHERE src.household_id = ? AND src.month = ? AND src.deleted_at IS NULL
          AND bl.deleted_at IS NULL AND bl.archived = 0
          AND NOT EXISTS (SELECT 1 FROM allocations dst
                           WHERE dst.household_id = src.household_id AND dst.line_id = src.line_id
                             AND dst.month = ? AND dst.deleted_at IS NULL);`,
    ).all(householdId, from, to);
    for (const row of rows) {
      writeAllocation(db, householdId, String(row.line_id), to, Number(row.planned_amount));
    }
    return rows.length;
  });
}

export function addBudgetLine(
  db: DatabaseLike,
  householdId: string,
  draft: { name: string; kind: LineKind; hardCap?: boolean },
): string {
  const name = draft.name.trim();
  if (!name) throw new Error('Enter a name for the budget line.');
  if (!lineKinds.includes(draft.kind)) throw new Error('Choose a valid line type.');
  return inTransaction(db, () => {
    const prepare = requirePrepared(db);
    const duplicate = prepare(
      `SELECT 1 AS found FROM budget_lines
        WHERE household_id = ? AND deleted_at IS NULL AND archived = 0 AND lower(name) = lower(?);`,
    ).get(householdId, name);
    if (duplicate) throw new Error('A budget line with this name already exists.');
    const next = Number(
      prepare(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM budget_lines WHERE household_id = ?;',
      ).get(householdId)?.next ?? 0,
    );
    const id = newId();
    const now = new Date().toISOString();
    prepare(
      `INSERT INTO budget_lines (id, household_id, name, kind, hard_cap, sort_order, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?);`,
    ).run(
      id,
      householdId,
      name,
      draft.kind,
      (draft.hardCap ?? defaultHardCap(draft.kind)) ? 1 : 0,
      next,
      now,
      now,
    );
    appendOutboxEntry(db, householdId, 'budget_lines', id, 'create');
    return id;
  });
}

function updateLine(
  db: DatabaseLike,
  householdId: string,
  lineId: string,
  assignment: string,
  value: unknown,
): void {
  inTransaction(db, () => {
    const now = new Date().toISOString();
    requirePrepared(db)(
      `UPDATE budget_lines SET ${assignment} = ?, updated_at = ?
        WHERE id = ? AND household_id = ? AND deleted_at IS NULL;`,
    ).run(value, now, lineId, householdId);
    appendOutboxEntry(db, householdId, 'budget_lines', lineId, 'upsert');
  });
}

export function setHardCap(
  db: DatabaseLike,
  householdId: string,
  lineId: string,
  hardCap: boolean,
): void {
  updateLine(db, householdId, lineId, 'hard_cap', hardCap ? 1 : 0);
}

export function setLineArchived(
  db: DatabaseLike,
  householdId: string,
  lineId: string,
  archived: boolean,
): void {
  updateLine(db, householdId, lineId, 'archived', archived ? 1 : 0);
}

export function renameLine(
  db: DatabaseLike,
  householdId: string,
  lineId: string,
  name: string,
): void {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a name for the budget line.');
  updateLine(db, householdId, lineId, 'name', trimmed);
}

// FR-7: a Miscellaneous line always exists, with its own cap.
export function ensureMiscLine(db: DatabaseLike, householdId: string): void {
  const existing = requirePrepared(db)(
    `SELECT 1 AS found FROM budget_lines
      WHERE household_id = ? AND kind = 'misc' AND deleted_at IS NULL LIMIT 1;`,
  ).get(householdId);
  if (!existing) addBudgetLine(db, householdId, { name: 'Miscellaneous', kind: 'misc' });
}
