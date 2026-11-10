export const insightPeriods = ['week', 'month', 'quarter', 'halfYear', 'year', 'custom'] as const;
export type InsightPeriod = (typeof insightPeriods)[number];

export type InsightCustomRange = {
  start: string;
  end: string;
};

export type InsightRange = {
  start: string;
  end: string;
  through: string;
  comparisonStart: string;
  comparisonThrough: string;
  elapsedDays: number;
  totalDays: number;
};

export type InsightPeriodTotals = {
  income: number;
  expenses: number;
  saved: number;
  planned: number;
  fullPeriodPlanned: number;
  transactionCount: number;
  uncategorizedCount: number;
  categories: {
    id: string;
    name: string;
    kind: string;
    spent: number;
    planned: number;
    fullPeriodPlanned: number;
  }[];
  incomeSources: { name: string; received: number }[];
};

export type InsightsSnapshot = {
  period: InsightPeriod;
  range: InsightRange;
  current: InsightPeriodTotals;
  previous: InsightPeriodTotals;
  projection: {
    expenses: number | null;
    income: number | null;
  };
  position: {
    saved: number;
    savingsTarget: number;
    debtRemaining: number;
    loansOutstanding: number;
    goals: number;
  };
};

export type InsightsAdvice = {
  title: string;
  message: string;
  nextStep: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Enter a valid calendar date.');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Enter a valid calendar date.');
  }
  return parsed;
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, count: number): Date {
  return new Date(date.getTime() + count * DAY_MS);
}

function daysBetween(start: string, end: string): number {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / DAY_MS) + 1;
}

function monthDay(year: number, monthIndex: number, day: number): string {
  return dateString(new Date(Date.UTC(year, monthIndex, day)));
}

function getBoundaries(
  period: InsightPeriod,
  today: string,
  customRange?: InsightCustomRange,
): { start: string; end: string } {
  if (period === 'custom') {
    if (!customRange) throw new Error('Choose a start and end date for the custom period.');
    parseDate(customRange.start);
    parseDate(customRange.end);
    if (customRange.start > customRange.end || customRange.start > today) {
      throw new Error('Choose a valid date range that starts today or earlier.');
    }
    return customRange;
  }

  const date = parseDate(today);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  if (period === 'week') {
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    const start = addDays(date, -mondayOffset);
    return { start: dateString(start), end: dateString(addDays(start, 6)) };
  }
  if (period === 'month') {
    return { start: monthDay(year, month, 1), end: monthDay(year, month + 1, 0) };
  }
  if (period === 'quarter') {
    const startMonth = Math.floor(month / 3) * 3;
    return { start: monthDay(year, startMonth, 1), end: monthDay(year, startMonth + 3, 0) };
  }
  if (period === 'halfYear') {
    const startMonth = month < 6 ? 0 : 6;
    return { start: monthDay(year, startMonth, 1), end: monthDay(year, startMonth + 6, 0) };
  }
  return { start: monthDay(year, 0, 1), end: monthDay(year + 1, 0, 0) };
}

export function getInsightRange(
  period: InsightPeriod,
  today: string,
  customRange?: InsightCustomRange,
): InsightRange {
  const { start, end } = getBoundaries(period, today, customRange);
  const through = today < end ? today : end;
  const totalDays = daysBetween(start, end);
  const elapsedDays = daysBetween(start, through);
  const comparisonStartDate = addDays(parseDate(start), -totalDays);
  const comparisonStart = dateString(comparisonStartDate);
  const comparisonThrough = dateString(addDays(comparisonStartDate, elapsedDays - 1));

  return {
    start,
    end,
    through,
    comparisonStart,
    comparisonThrough,
    elapsedDays,
    totalDays,
  };
}

export function projectPeriodAmount(
  amount: number,
  elapsedDays: number,
  totalDays: number,
): number | null {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    !Number.isSafeInteger(elapsedDays) ||
    !Number.isSafeInteger(totalDays) ||
    elapsedDays < 3 ||
    totalDays < elapsedDays
  ) {
    return null;
  }
  const numerator = BigInt(amount) * BigInt(totalDays);
  const projected = (numerator + BigInt(Math.floor(elapsedDays / 2))) / BigInt(elapsedDays);
  return projected <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(projected) : null;
}

export function answerInsightsQuestion(
  question: string,
  snapshot: InsightsSnapshot,
): InsightsAdvice {
  const prompt = question.trim().toLowerCase();
  const current = snapshot.current;
  const topCategory = [...current.categories].sort((a, b) => b.spent - a.spent)[0];
  const topSource = [...current.incomeSources].sort((a, b) => b.received - a.received)[0];

  if (!prompt) {
    return {
      title: 'What would you like to understand?',
      message: 'I can review the records available for the selected period.',
      nextStep: 'Ask about spending, a budget line, income, savings, debt, or a projection.',
    };
  }

  if (/\b(save|saving|savings|goal|goals)\b/.test(prompt)) {
    return {
      title: 'Your savings picture',
      message: `You have recorded savings in this period and have ${snapshot.position.goals} ${snapshot.position.goals === 1 ? 'active goal' : 'active goals'}.`,
      nextStep:
        snapshot.position.savingsTarget > snapshot.position.saved
          ? 'Review your goal deadlines and set a repeatable amount you can confirm each month.'
          : 'Your recorded savings have reached the current goal target. Check whether the target still fits.',
    };
  }

  if (/\b(debt|debts|owe|owed|loan|loans|lent)\b/.test(prompt)) {
    return {
      title: 'Your debt and lending picture',
      message: 'Your current debt and lending balances are shown in your wider financial picture.',
      nextStep:
        snapshot.position.debtRemaining > 0
          ? 'Check upcoming debt deadlines and plan the next payment in your budget.'
          : 'Keep repayment records up to date so your balances and lending decisions stay clear.',
    };
  }

  if (/\b(income|earn|salary|source|business)\b/.test(prompt)) {
    return {
      title: 'Your income picture',
      message: topSource
        ? `${topSource.name} is your largest recorded income source for this period.`
        : 'No income has been recorded against a source in this period yet.',
      nextStep:
        'Record income against its source to make source-level trends and budget funding clearer.',
    };
  }

  if (/\b(project|projection|projected|forecast|future|pace)\b/.test(prompt)) {
    const projectionOverBudget =
      snapshot.projection.expenses !== null &&
      current.fullPeriodPlanned > 0 &&
      snapshot.projection.expenses > current.fullPeriodPlanned;
    return {
      title: 'Your current pace',
      message:
        snapshot.projection.expenses === null
          ? 'There is not enough activity in this period for a useful pace projection yet.'
          : current.fullPeriodPlanned <= 0
            ? 'At the current daily pace, spending can be projected, but there is no period budget to compare it with.'
            : projectionOverBudget
              ? 'At the current daily pace, spending may exceed the period budget.'
              : 'At the current daily pace, spending is projected within the period budget.',
      nextStep:
        snapshot.projection.expenses !== null && current.fullPeriodPlanned > 0
          ? projectionOverBudget
            ? 'Review the largest spending lines and adjust the remaining plan before adding commitments.'
            : 'Keep logging purchases; the projection becomes more useful as the period progresses.'
          : 'Keep logging transactions so the app can build a reliable projection.',
    };
  }

  if (/\b(budget|spend|spending|expense|expenses|cut|reduce)\b/.test(prompt)) {
    return {
      title: topCategory ? `Review ${topCategory.name}` : 'Your spending picture',
      message: topCategory
        ? `${topCategory.name} is your largest spending category for this period.`
        : 'There is no categorized spending recorded for this period.',
      nextStep: topCategory
        ? topCategory.planned > 0 && topCategory.spent > topCategory.planned
          ? 'This line is above its prorated plan. Check recent transactions and decide whether to reduce other flexible spending.'
          : 'Compare recent purchases in this line with your priorities before setting the next period’s plan.'
        : 'Add budget lines and assign expenses to them to get more specific guidance.',
    };
  }

  const priority =
    current.fullPeriodPlanned > 0 && snapshot.projection.expenses !== null
      ? snapshot.projection.expenses > current.fullPeriodPlanned
        ? 'Your spending pace is projected above the period budget.'
        : 'Your spending pace is currently within the period budget.'
      : topCategory
        ? `${topCategory.name} is your largest spending category this period.`
        : 'There is not enough recorded activity to identify a spending pattern yet.';
  return {
    title: 'A snapshot from your records',
    message: `${priority} Compare the income, spending, and cash-flow totals above with the previous period.`,
    nextStep:
      'Ask about spending, a budget line, income, savings, debt, or a projection for more targeted guidance.',
  };
}
