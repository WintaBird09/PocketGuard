import { debtBalance, lineStatus, sumTransactionTotals } from '../domain/budget';
import { dayOfMonth, daysInMonth, effectiveNow } from '../domain/dates';

import type { DatabaseLike } from './db';
import type { BudgetLine, DashboardSummary } from './types';

type DashboardDatabase = DatabaseLike & {
  prepare: (sql: string) => {
    all: (...values: unknown[]) => Record<string, unknown>[];
    get: (...values: unknown[]) => Record<string, unknown> | undefined;
  };
};

export type HomeDashboardSnapshot = {
  summary: DashboardSummary & {
    daysLeft: number;
    daysElapsed: number;
    monthLength: number;
    savingsStatus: 'On track' | 'Behind';
  };
  lines: BudgetLine[];
  totalPlanned: number;
};

type LineRow = {
  id: string;
  name: string;
  kind: string;
  hard_cap: number;
  planned: number;
};

type TransactionRow = {
  amount: number;
  direction: 'expense' | 'income' | 'transfer';
  line_id: string | null;
  debt_id: string | null;
};

function requireDatabase(db: DatabaseLike): DashboardDatabase {
  if (!db.prepare) {
    throw new Error('Database does not support prepared queries.');
  }
  return db as DashboardDatabase;
}

export function getHomeDashboardSnapshot(
  db: DatabaseLike,
  householdId: string,
  monthKey: string,
  now = effectiveNow(),
): HomeDashboardSnapshot {
  const database = requireDatabase(db);
  const monthStart = `${monthKey}-01`;
  const monthDate = new Date(`${monthStart}T12:00:00`);
  const elapsed =
    monthKey === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      ? dayOfMonth(now, 'Africa/Douala')
      : monthDate > now
        ? 0
        : daysInMonth(monthDate, 'Africa/Douala');
  const monthLength = daysInMonth(monthDate, 'Africa/Douala');
  const daysLeft = Math.max(0, monthLength - elapsed);

  const linesRows = database
    .prepare(
      `SELECT bl.id, bl.name, bl.kind, bl.hard_cap,
        COALESCE(a.planned_amount, 0) AS planned
       FROM budget_lines bl
       LEFT JOIN allocations a
         ON a.line_id = bl.id AND a.household_id = bl.household_id
        AND a.month = ? AND a.deleted_at IS NULL
       WHERE bl.household_id = ? AND bl.deleted_at IS NULL AND bl.archived = 0
       ORDER BY bl.sort_order, bl.name;`,
    )
    .all(monthKey, householdId) as unknown as LineRow[];

  const transactionRows = database
    .prepare(
      `SELECT amount, direction, line_id, debt_id
       FROM transactions
       WHERE household_id = ? AND substr(occurred_at, 1, 7) = ?
         AND deleted_at IS NULL AND status = 'confirmed';`,
    )
    .all(householdId, monthKey) as unknown as TransactionRow[];

  const totals = sumTransactionTotals(transactionRows);
  const spentByLine = new Map<string, number>();
  const paidByDebt = new Map<string, number>();
  for (const transaction of transactionRows) {
    if (transaction.direction !== 'expense') continue;
    if (transaction.line_id) {
      spentByLine.set(
        transaction.line_id,
        (spentByLine.get(transaction.line_id) ?? 0) + transaction.amount,
      );
    }
    if (transaction.debt_id) {
      paidByDebt.set(
        transaction.debt_id,
        (paidByDebt.get(transaction.debt_id) ?? 0) + transaction.amount,
      );
    }
  }

  const lines: BudgetLine[] = linesRows.map((line) => {
    const planned = Number(line.planned);
    const spent = spentByLine.get(line.id) ?? 0;
    const state = lineStatus(planned, spent, elapsed, monthLength).state;
    // Pace needs at least 3 days of data (PRD spend-check rule).
    const projected = elapsed >= 3 ? Math.round((spent / elapsed) * monthLength) : null;
    return {
      id: line.id,
      name: line.name,
      kind: line.kind,
      planned,
      spent,
      remaining: planned - spent,
      percentUsed: planned > 0 ? Math.round((spent / planned) * 100) : spent > 0 ? 100 : 0,
      projected,
      hardCap: Boolean(line.hard_cap),
      status: state === 'over' ? 'blocked' : state === 'warning' ? 'warn' : 'ok',
    };
  });

  const totalPlanned = lines.reduce((sum, line) => sum + line.planned, 0);
  const debtRows = database
    .prepare(
      `SELECT id, original_amount FROM debts
       WHERE household_id = ? AND deleted_at IS NULL;`,
    )
    .all(householdId) as { id: string; original_amount: number }[];
  const debtRemaining = debtRows.reduce(
    (sum, debt) => sum + debtBalance(Number(debt.original_amount), paidByDebt.get(debt.id) ?? 0),
    0,
  );

  const savingsRows = database
    .prepare(
      `SELECT sg.target_amount, sc.month, sc.planned_amount, sc.saved_amount
       FROM savings_goals sg
       LEFT JOIN savings_commitments sc
         ON sc.goal_id = sg.id AND sc.household_id = sg.household_id AND sc.deleted_at IS NULL
       WHERE sg.household_id = ? AND sg.deleted_at IS NULL;`,
    )
    .all(householdId) as {
    target_amount: number;
    month: string | null;
    planned_amount: number | null;
    saved_amount: number | null;
  }[];
  const savingsTarget = Number(savingsRows[0]?.target_amount ?? 0);
  const savingsSaved = savingsRows.reduce(
    (sum, row) => sum + (row.saved_amount === null ? 0 : Number(row.saved_amount)),
    0,
  );
  const plannedToDate = savingsRows.reduce(
    (sum, row) =>
      row.month && row.month <= monthKey ? sum + Number(row.planned_amount ?? 0) : sum,
    0,
  );
  const savingsStatus = savingsSaved >= plannedToDate ? 'On track' : 'Behind';

  const label = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const summary: HomeDashboardSnapshot['summary'] = {
    label,
    income: totals.income,
    spent: totals.expenses,
    remaining: totals.income - totals.expenses,
    savingsTarget,
    savingsSaved,
    debtRemaining,
    daysLeft,
    daysElapsed: elapsed,
    monthLength,
    savingsStatus,
  };

  return { summary, lines, totalPlanned };
}
