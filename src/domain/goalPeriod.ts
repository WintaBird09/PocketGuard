export type GoalPeriod = 'week' | 'month' | 'year';

export type GoalPeriodView = {
  label: string;
  target: number;
  saved: number;
  /** 0..100 progress against the period's target. */
  progress: number;
  note: string;
};

type MonthRow = { month: string; planned: number; saved: number };

/**
 * Savings are committed monthly, so a week is the month prorated to seven days and the year
 * is the sum of the twelve months.
 */
export function goalPeriodView(
  period: GoalPeriod,
  input: {
    month: string;
    monthLength: number;
    months: MonthRow[];
    yearPlanned: number;
    yearSaved: number;
  },
): GoalPeriodView {
  const current = input.months.find((row) => row.month === input.month);
  const monthPlanned = current?.planned ?? 0;
  const monthSaved = current?.saved ?? 0;
  const ratio = (saved: number, target: number) =>
    target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;

  if (period === 'year') {
    return {
      label: 'This year',
      target: input.yearPlanned,
      saved: input.yearSaved,
      progress: ratio(input.yearSaved, input.yearPlanned),
      note: 'Planned and confirmed savings for the whole year',
    };
  }
  if (period === 'week') {
    const share = 7 / Math.max(1, input.monthLength);
    const target = Math.round(monthPlanned * share);
    const saved = Math.round(monthSaved * share);
    return {
      label: 'Per week',
      target,
      saved,
      progress: ratio(monthSaved, monthPlanned),
      note: 'This month prorated to seven days',
    };
  }
  return {
    label: 'This month',
    target: monthPlanned,
    saved: monthSaved,
    progress: ratio(monthSaved, monthPlanned),
    note: 'Planned and confirmed savings for this month',
  };
}
