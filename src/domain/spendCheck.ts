export type SpendStatus = 'OK' | 'WARN' | 'BLOCKED';

export type SpendCheckOptions = {
  amount: number;
  planned: number;
  spent: number;
  hardCap?: boolean;
  threshold?: number;
  daysElapsed?: number;
  daysInMonth?: number;
  lineName?: string;
};

export type SpendCheckResult = {
  status: SpendStatus;
  reason: string;
  remainingAfter: number;
  pctAfter: number;
  projectedFinish: number | null;
};

export function evaluateSpendCheck(options: SpendCheckOptions): SpendCheckResult {
  const amount = Number.isFinite(options.amount) ? Math.trunc(options.amount) : 0;
  const planned = Number.isFinite(options.planned) ? Math.trunc(options.planned) : 0;
  const spent = Number.isFinite(options.spent) ? Math.trunc(options.spent) : 0;
  const hardCap = Boolean(options.hardCap);
  const threshold = Number.isFinite(options.threshold) ? Math.max(0, Number(options.threshold)) : 80;
  const daysElapsed = Number.isFinite(options.daysElapsed)
    ? Math.max(0, Math.trunc(options.daysElapsed ?? 0))
    : 0;
  const daysInMonth = Number.isFinite(options.daysInMonth)
    ? Math.max(1, Math.trunc(options.daysInMonth ?? 30))
    : 30;

  const remaining = planned - spent;
  const remainingAfter = remaining - amount;
  const pctAfter = planned > 0 ? ((spent + amount) / planned) * 100 : 0;

  let projectedFinish: number | null = null;
  if (daysElapsed > 0) {
    projectedFinish = (spent / Math.max(1, daysElapsed)) * daysInMonth;
  }

  if (hardCap && amount > remaining) {
    const lineName = options.lineName ? `${options.lineName} ` : '';
    return {
      status: 'BLOCKED',
      reason: `${lineName}would exceed the remaining planned amount for this line.`,
      remainingAfter,
      pctAfter: Number(pctAfter.toFixed(2)),
      projectedFinish,
    };
  }

  if (remainingAfter < 0) {
    return {
      status: 'WARN',
      reason: 'This would overrun the remaining planned amount for the month.',
      remainingAfter,
      pctAfter: Number(pctAfter.toFixed(2)),
      projectedFinish,
    };
  }

  if (pctAfter >= threshold) {
    return {
      status: 'WARN',
      reason: `This would move the line past ${threshold}% of its monthly budget.`,
      remainingAfter,
      pctAfter: Number(pctAfter.toFixed(2)),
      projectedFinish,
    };
  }

  if (projectedFinish !== null && projectedFinish > planned) {
    return {
      status: 'WARN',
      reason: 'Current pace would exceed the monthly plan before the month ends.',
      remainingAfter,
      pctAfter: Number(pctAfter.toFixed(2)),
      projectedFinish,
    };
  }

  return {
    status: 'OK',
    reason: `This is within the remaining planned amount and keeps the line under ${threshold}%.`,
    remainingAfter,
    pctAfter: Number(pctAfter.toFixed(2)),
    projectedFinish,
  };
}
