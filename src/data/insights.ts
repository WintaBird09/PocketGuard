import { getInsightRange, projectPeriodAmount } from '../domain/insights';
import type {
  InsightCustomRange,
  InsightPeriod,
  InsightPeriodTotals,
  InsightsSnapshot,
} from '../domain/insights';
import { localDateString } from '../domain/dates';

import type { DatabaseLike } from './db';
import { listDebts } from './debts';
import { requirePrepared } from './household';
import { totalOwedToYou } from './loans';
import { getSavingsPlanner } from './savings';

type TransactionRow = {
  amount: number;
  direction: 'expense' | 'income' | 'transfer';
  line_id: string | null;
  line_name: string | null;
  line_kind: string | null;
  source_name: string | null;
};

type AllocationRow = {
  month: string;
  line_id: string;
  line_name: string;
  line_kind: string;
  planned_amount: number;
};

type RangeBounds = {
  start: string;
  end: string;
  through: string;
};

type MutableCategory = {
  id: string;
  name: string;
  kind: string;
  spent: number;
  planned: number;
  fullPeriodPlanned: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function prorate(amount: number, days: number, periodDays: number): number {
  const numerator = BigInt(amount) * BigInt(days);
  return Number((numerator + BigInt(Math.floor(periodDays / 2))) / BigInt(periodDays));
}

function overlapDays(start: string, end: string, rangeStart: string, rangeEnd: string): number {
  const from = start > rangeStart ? start : rangeStart;
  const to = end < rangeEnd ? end : rangeEnd;
  if (from > to) return 0;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

function aggregateRange(
  bounds: RangeBounds,
  transactions: TransactionRow[],
  allocations: AllocationRow[],
): InsightPeriodTotals {
  const categories = new Map<string, MutableCategory>();
  const sources = new Map<string, number>();
  let income = 0;
  let expenses = 0;
  let saved = 0;
  let transactionCount = 0;
  let uncategorizedCount = 0;

  for (const transaction of transactions) {
    const amount = Number(transaction.amount);
    if (transaction.direction === 'income') {
      income += amount;
      const sourceName = transaction.source_name ?? 'Unassigned income';
      sources.set(sourceName, (sources.get(sourceName) ?? 0) + amount);
      transactionCount += 1;
    } else if (transaction.direction === 'expense') {
      expenses += amount;
      transactionCount += 1;
      if (transaction.line_kind === 'savings') saved += amount;
      if (!transaction.line_id) uncategorizedCount += 1;
      else {
        const key = transaction.line_id;
        const category = categories.get(key) ?? {
          id: key,
          name: transaction.line_name ?? 'Uncategorized',
          kind: transaction.line_kind ?? 'misc',
          spent: 0,
          planned: 0,
          fullPeriodPlanned: 0,
        };
        category.spent += amount;
        categories.set(key, category);
      }
    } else {
      transactionCount += 1;
    }
  }

  let planned = 0;
  let fullPeriodPlanned = 0;
  for (const allocation of allocations) {
    const daysInAllocationMonth = daysInMonth(allocation.month);
    const allocationStart = `${allocation.month}-01`;
    const [year, month] = allocation.month.split('-').map(Number);
    const allocationEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const daysToDate = overlapDays(allocationStart, allocationEnd, bounds.start, bounds.through);
    const daysInPeriod = overlapDays(allocationStart, allocationEnd, bounds.start, bounds.end);
    const amount = Number(allocation.planned_amount);
    const prorated = prorate(amount, daysToDate, daysInAllocationMonth);
    const periodAmount = prorate(amount, daysInPeriod, daysInAllocationMonth);
    planned += prorated;
    fullPeriodPlanned += periodAmount;

    const key = allocation.line_id;
    const category = categories.get(key) ?? {
      id: key,
      name: allocation.line_name,
      kind: allocation.line_kind,
      spent: 0,
      planned: 0,
      fullPeriodPlanned: 0,
    };
    category.planned += prorated;
    category.fullPeriodPlanned += periodAmount;
    categories.set(key, category);
  }

  return {
    income,
    expenses,
    saved,
    planned,
    fullPeriodPlanned,
    transactionCount,
    uncategorizedCount,
    categories: [...categories.values()].sort((a, b) => b.spent - a.spent),
    incomeSources: [...sources.entries()]
      .map(([name, received]) => ({ name, received }))
      .sort((a, b) => b.received - a.received),
  };
}

export function getInsightsSnapshot(
  db: DatabaseLike,
  householdId: string,
  period: InsightPeriod,
  now: Date,
  customRange?: InsightCustomRange,
): InsightsSnapshot {
  const today = localDateString(now);
  const range = getInsightRange(period, today, customRange);
  const previousEnd = new Date(
    Date.parse(`${range.comparisonStart}T00:00:00Z`) + (range.totalDays - 1) * DAY_MS,
  )
    .toISOString()
    .slice(0, 10);
  const previousBounds = {
    start: range.comparisonStart,
    through: range.comparisonThrough,
    end: previousEnd,
  };
  const currentBounds = { start: range.start, through: range.through, end: range.end };
  const prepare = requirePrepared(db);
  const transactionQuery = prepare(
    `SELECT t.amount, t.direction, t.line_id, bl.name AS line_name, bl.kind AS line_kind,
            ins.name AS source_name
       FROM transactions t
       LEFT JOIN budget_lines bl ON bl.id = t.line_id AND bl.household_id = t.household_id
       LEFT JOIN income_streams ins
         ON ins.id = t.income_stream_id AND ins.household_id = t.household_id
      WHERE t.household_id = ? AND t.deleted_at IS NULL AND t.status = 'confirmed'
        AND substr(t.occurred_at, 1, 10) BETWEEN ? AND ?;`,
  );
  const allocationQuery = prepare(
    `SELECT a.month, a.line_id, bl.name AS line_name, bl.kind AS line_kind, a.planned_amount
       FROM allocations a
       JOIN budget_lines bl ON bl.id = a.line_id AND bl.household_id = a.household_id
      WHERE a.household_id = ? AND a.deleted_at IS NULL AND bl.deleted_at IS NULL
        AND substr(a.month, 1, 7) BETWEEN ? AND ?;`,
  );
  const readPeriod = (bounds: RangeBounds): InsightPeriodTotals => {
    const transactionRows = transactionQuery.all(
      householdId,
      bounds.start,
      bounds.through,
    ) as unknown as TransactionRow[];
    const allocationRows = allocationQuery.all(
      householdId,
      monthKey(bounds.start),
      monthKey(bounds.end),
    ) as unknown as AllocationRow[];
    return aggregateRange(bounds, transactionRows, allocationRows);
  };

  const current = readPeriod(currentBounds);
  const previous = readPeriod(previousBounds);
  const savings = getSavingsPlanner(db, householdId, now.getFullYear(), monthKey(today));
  const debts = listDebts(db, householdId, now);
  const projection = {
    expenses:
      period === 'custom' && range.end < today
        ? null
        : projectPeriodAmount(current.expenses, range.elapsedDays, range.totalDays),
    income:
      period === 'custom' && range.end < today
        ? null
        : projectPeriodAmount(current.income, range.elapsedDays, range.totalDays),
  };

  return {
    period,
    range,
    current,
    previous,
    projection,
    position: {
      saved: savings.totalSaved,
      savingsTarget: savings.totalTarget,
      debtRemaining: debts.reduce((sum, debt) => sum + debt.balance, 0),
      loansOutstanding: totalOwedToYou(db, householdId),
      goals: savings.goals.length,
    },
  };
}
