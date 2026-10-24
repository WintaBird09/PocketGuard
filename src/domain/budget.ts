export type LineStatusState = 'unset' | 'under' | 'warning' | 'over';

export type LineStatusResult = {
  remaining: number;
  pctUsed: number;
  state: LineStatusState;
  projectedFinish: number | null;
};

export type MonthSummaryInput = {
  planned?: number;
  spent?: number;
  income?: number;
  expenses?: number;
  transfers?: number;
  plannedSavings?: number;
};

export function lineStatus(
  planned: number,
  spent: number,
  daysElapsed: number,
  daysInMonthValue: number,
): LineStatusResult {
  const safePlanned = Number.isFinite(planned) ? Math.trunc(planned) : 0;
  const safeSpent = Number.isFinite(spent) ? Math.trunc(spent) : 0;
  const safeDaysElapsed = Number.isFinite(daysElapsed)
    ? Math.max(0, Math.min(Math.trunc(daysElapsed), Math.max(1, Math.trunc(daysInMonthValue))))
    : 0;
  const safeDaysInMonth = Number.isFinite(daysInMonthValue)
    ? Math.max(1, Math.trunc(daysInMonthValue))
    : 30;

  const remaining = safePlanned - safeSpent;
  const pctUsed = safePlanned > 0 ? (safeSpent / safePlanned) * 100 : 0;

  let projectedFinish: number | null = null;
  if (safeDaysElapsed > 0 && safeDaysInMonth > 0) {
    const projected = (safeSpent / safeDaysElapsed) * safeDaysInMonth;
    projectedFinish = Number.isFinite(projected) ? projected : null;
  }

  let state: LineStatusState = 'under';
  if (safePlanned <= 0) {
    state = 'unset';
  } else if (safeSpent >= safePlanned) {
    state = 'over';
  } else if (projectedFinish !== null && projectedFinish > safePlanned) {
    state = 'warning';
  } else if (pctUsed >= 80) {
    state = 'warning';
  }

  return {
    remaining,
    pctUsed: Number(pctUsed.toFixed(2)),
    state,
    projectedFinish,
  };
}

export type MonthSummaryResult = {
  planned: number;
  spent: number;
  remaining: number;
  income: number;
  expenses: number;
  transfers: number;
  plannedSavings: number;
  unallocated: number;
};

export function monthSummary(input: MonthSummaryInput | number = 0): MonthSummaryResult {
  if (typeof input === 'number') {
    const planned = Number.isFinite(input) ? Math.trunc(input) : 0;
    return {
      planned,
      spent: 0,
      remaining: planned,
      income: 0,
      expenses: 0,
      transfers: 0,
      plannedSavings: 0,
      unallocated: planned,
    };
  }

  const planned = Number.isFinite(input.planned) ? Math.trunc(input.planned ?? 0) : 0;
  const spent = Number.isFinite(input.spent) ? Math.trunc(input.spent ?? 0) : 0;
  const income = Number.isFinite(input.income) ? Math.trunc(input.income ?? 0) : 0;
  const expenses = Number.isFinite(input.expenses) ? Math.trunc(input.expenses ?? 0) : 0;
  const transfers = Number.isFinite(input.transfers) ? Math.trunc(input.transfers ?? 0) : 0;
  const plannedSavings = Number.isFinite(input.plannedSavings)
    ? Math.trunc(input.plannedSavings ?? 0)
    : 0;

  return {
    planned,
    spent,
    remaining: planned - spent,
    income,
    expenses,
    transfers,
    plannedSavings,
    unallocated: Math.max(planned - spent, 0),
  };
}

export function savingsProgress(
  targetAmount: number,
  savedAmount: number,
  includeAmount = 0,
): {
  saved: number;
  target: number;
  percent: number;
  remaining: number;
  gap: number;
} {
  const safeTarget = Number.isFinite(targetAmount) ? Math.trunc(targetAmount) : 0;
  const safeSaved = Number.isFinite(savedAmount) ? Math.trunc(savedAmount) : 0;
  const safeInclude = Number.isFinite(includeAmount) ? Math.trunc(includeAmount) : 0;

  const totalSaved = safeSaved + safeInclude;
  const percent = safeTarget > 0 ? (totalSaved / safeTarget) * 100 : 0;

  return {
    saved: totalSaved,
    target: safeTarget,
    percent: Number(percent.toFixed(2)),
    remaining: Math.max(safeTarget - totalSaved, 0),
    gap: Math.max(safeTarget - totalSaved, 0),
  };
}

export function debtBalance(originalAmount: number, paidAmount: number): number {
  const safeOriginal = Number.isFinite(originalAmount) ? Math.trunc(originalAmount) : 0;
  const safePaid = Number.isFinite(paidAmount) ? Math.trunc(paidAmount) : 0;
  return Math.max(safeOriginal - safePaid, 0);
}
