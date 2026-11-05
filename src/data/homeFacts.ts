import { localDateString } from '../domain/dates';
import type { FinanceFacts } from '../domain/financeInsights';

import type { HomeDashboardSnapshot } from './dashboard';
import type { DatabaseLike } from './db';
import { listDebts } from './debts';
import { buildFundingBreakdown } from './funding';
import { getIncomeMonth } from './income';
import { getMonthPlan, previousMonth } from './plan';
import type { SavingsPlanner } from './savings';

type Prepared = {
  all: (...values: unknown[]) => Record<string, unknown>[];
};

function monthsBack(month: string, count: number): string[] {
  const result: string[] = [];
  let cursor = month;
  for (let index = 0; index < count; index += 1) {
    cursor = previousMonth(cursor);
    result.push(cursor);
  }
  return result;
}

/** Gathers everything the insight engine needs; each piece degrades to empty on failure. */
export function getFinanceFacts(
  db: DatabaseLike,
  householdId: string,
  month: string,
  snapshot: HomeDashboardSnapshot,
  previous: HomeDashboardSnapshot['lines'],
  savings: SavingsPlanner | null,
  now: Date,
): FinanceFacts {
  const prepare = db.prepare as unknown as ((sql: string) => Prepared) | undefined;
  const today = localDateString(now);

  let expenses: FinanceFacts['expenses'] = [];
  let avgMonthlyExpense: number | null = null;
  if (prepare) {
    const bound = db.prepare!.bind(db) as unknown as (sql: string) => Prepared;
    try {
      expenses = bound(
        `SELECT id, amount, occurred_at, line_id, note FROM transactions
          WHERE household_id = ? AND substr(occurred_at, 1, 7) = ? AND direction = 'expense'
            AND deleted_at IS NULL AND status = 'confirmed' ORDER BY occurred_at;`,
      )
        .all(householdId, month)
        .map((row) => ({
          id: String(row.id),
          amount: Number(row.amount),
          occurredAt: String(row.occurred_at),
          lineId: row.line_id === null ? null : String(row.line_id),
          note: row.note === null ? '' : String(row.note),
        }));
      const earlier = monthsBack(month, 3);
      const totals = bound(
        `SELECT substr(occurred_at, 1, 7) AS month, SUM(amount) AS total FROM transactions
          WHERE household_id = ? AND direction = 'expense' AND deleted_at IS NULL
            AND status = 'confirmed' AND substr(occurred_at, 1, 7) IN (?, ?, ?)
          GROUP BY substr(occurred_at, 1, 7);`,
      ).all(householdId, ...earlier);
      if (totals.length > 0) {
        avgMonthlyExpense = Math.round(
          totals.reduce((sum, row) => sum + Number(row.total), 0) / totals.length,
        );
      }
    } catch {
      expenses = [];
    }
  }

  let sources: FinanceFacts['sources'] = [];
  let unfundedBudget = 0;
  let expectedIncome = 0;
  try {
    const plan = getMonthPlan(db, householdId, month);
    const income = getIncomeMonth(db, householdId, month);
    const breakdown = buildFundingBreakdown(plan.lines, income);
    sources = breakdown
      .filter((item) => item.streamId !== null)
      .map((item) => ({
        name: item.name,
        received: item.received,
        budgeted: item.budgeted,
        left: item.left,
      }));
    unfundedBudget = breakdown
      .filter((item) => item.streamId === null)
      .reduce((sum, item) => sum + item.budgeted, 0);
    expectedIncome = income.plannedIncome
      .filter((item) => !item.confirmed)
      .reduce((sum, item) => sum + item.amount, 0);
  } catch {
    // Funding insights are optional.
  }

  let debts: FinanceFacts['debts'] = [];
  try {
    debts = listDebts(db, householdId, now).map((debt) => ({
      creditor: debt.creditor,
      original: debt.originalAmount,
      paid: debt.paid,
      balance: debt.balance,
      deadline: debt.deadline,
    }));
  } catch {
    debts = [];
  }

  const goals = (savings?.goals ?? []).map((goal) => ({
    name: goal.name,
    target: goal.target,
    saved: goal.saved,
    dueDate: goal.dueDate,
    monthlyAmount: goal.monthlyAmount,
    overdueMonths: goal.overdueMonths.length,
  }));

  return {
    today,
    daysElapsed: snapshot.summary.daysElapsed,
    monthLength: snapshot.summary.monthLength,
    daysLeft: snapshot.summary.daysLeft,
    income: snapshot.summary.income,
    expectedIncome,
    spent: snapshot.summary.spent,
    lines: snapshot.lines,
    previous,
    savedThisMonth: savings?.months.find((row) => row.month === month)?.saved ?? 0,
    totalSaved: savings?.totalSaved ?? 0,
    goals,
    avgMonthlyExpense,
    debts,
    sources,
    unfundedBudget,
    expenses,
  };
}
