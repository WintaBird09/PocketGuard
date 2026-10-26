import { getHomeDashboardSnapshot } from '../data/dashboard';
import type { DatabaseLike } from '../data/db';
import { settings } from '../data/repos';
import { effectiveNow, monthKeyForDate } from '../domain/dates';
import type { Alert } from '../domain/alerts';

import { getNextNotificationTime, parseDailySummaryTime } from './scheduler';

export const dailySummarySettingKey = 'daily_summary_time';
export const defaultDailySummaryTime = '20:00';
const timeZone = 'Africa/Douala';

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getDateParts(date: Date, zone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function getOffsetMinutes(date: Date, zone: string): number {
  const parts = getDateParts(date, zone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((localAsUtc - date.getTime()) / 60_000);
}

function localDayRange(now: Date, zone: string): { start: string; end: string; day: string } {
  const today = getDateParts(now, zone);
  const day = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
  const nextDayDate = new Date(Date.UTC(today.year, today.month - 1, today.day + 1, 12));
  const nextDay = getDateParts(nextDayDate, zone);
  const startUtc =
    Date.UTC(today.year, today.month - 1, today.day) -
    getOffsetMinutes(new Date(Date.UTC(today.year, today.month - 1, today.day, 12)), zone) * 60_000;
  const endUtc =
    Date.UTC(nextDay.year, nextDay.month - 1, nextDay.day) -
    getOffsetMinutes(new Date(Date.UTC(nextDay.year, nextDay.month - 1, nextDay.day, 12)), zone) *
      60_000;

  return {
    start: new Date(startUtc).toISOString(),
    end: new Date(endUtc).toISOString(),
    day,
  };
}

function formatAmount(amount: number): string {
  return `${Math.trunc(amount).toLocaleString('en-US')} XAF`;
}

function requirePreparedDatabase(db: DatabaseLike) {
  if (!db.prepare) throw new Error('Database does not support prepared queries.');
  return db;
}

function getHouseholdId(db: DatabaseLike): string {
  const household = requirePreparedDatabase(db)
    .prepare?.('SELECT id FROM households WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;')
    .get();
  if (!household || typeof household.id !== 'string') {
    throw new Error('The local household has not been initialized.');
  }
  return household.id;
}

export function getPersistedDailySummaryTime(db: DatabaseLike): string {
  const value = settings.get(db, getHouseholdId(db), dailySummarySettingKey);
  const time = value ?? defaultDailySummaryTime;
  parseDailySummaryTime(time);
  return time;
}

export function getPersistedDailySummary(db: DatabaseLike, now = effectiveNow()): Alert {
  const database = requirePreparedDatabase(db);
  const householdId = getHouseholdId(database);
  const { start, end, day } = localDayRange(now, timeZone);
  const transactions = database
    .prepare?.(
      `SELECT t.amount, t.direction, t.line_id, bl.name AS line_name
       FROM transactions t
       LEFT JOIN budget_lines bl ON bl.id = t.line_id AND bl.household_id = t.household_id
         AND bl.deleted_at IS NULL
       WHERE t.household_id = ? AND t.occurred_at >= ? AND t.occurred_at < ?
         AND t.deleted_at IS NULL AND t.status = 'confirmed';`,
    )
    .all(householdId, start, end) as {
    amount: number;
    direction: string;
    line_id: string | null;
    line_name: string | null;
  }[];
  const spentToday = transactions.reduce(
    (total, transaction) =>
      transaction.direction === 'expense' ? total + Number(transaction.amount) : total,
    0,
  );
  const spentByLine = new Map<string, { name: string; amount: number }>();
  for (const transaction of transactions) {
    if (transaction.direction !== 'expense' || !transaction.line_id || !transaction.line_name) {
      continue;
    }
    const current = spentByLine.get(transaction.line_id) ?? {
      name: transaction.line_name,
      amount: 0,
    };
    current.amount += Number(transaction.amount);
    spentByLine.set(transaction.line_id, current);
  }
  const biggestMovements = [...spentByLine.values()]
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 3)
    .map((line) => `${line.name} ${formatAmount(line.amount)}`);

  const monthKey = monthKeyForDate(now, timeZone);
  const snapshot = getHomeDashboardSnapshot(database, householdId, monthKey, now);
  const highUsageLines = snapshot.lines
    .filter((line) => line.planned > 0 && line.spent / line.planned >= 0.8)
    .map((line) => `${line.name} ${Math.floor((line.spent / line.planned) * 100)}%`);
  const tomorrow = new Date(`${day}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowKey = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}`;
  const dueDebts = database
    .prepare?.(
      `SELECT d.id, d.creditor, d.original_amount,
         COALESCE(SUM(CASE WHEN t.direction = 'expense' AND t.status = 'confirmed'
           THEN t.amount ELSE 0 END), 0) AS paid
       FROM debts d
       LEFT JOIN transactions t ON t.debt_id = d.id AND t.household_id = d.household_id
         AND t.deleted_at IS NULL
       WHERE d.household_id = ? AND d.deadline = ? AND d.deleted_at IS NULL
       GROUP BY d.id;`,
    )
    .all(householdId, tomorrowKey) as {
    creditor: string;
    original_amount: number;
    paid: number;
  }[];
  const dueGoals = database
    .prepare?.(
      `SELECT sg.name, sg.target_amount,
         COALESCE(SUM(sc.saved_amount), 0) AS saved
       FROM savings_goals sg
       LEFT JOIN savings_commitments sc ON sc.goal_id = sg.id
         AND sc.household_id = sg.household_id AND sc.deleted_at IS NULL
       WHERE sg.household_id = ? AND sg.due_date = ? AND sg.deleted_at IS NULL
       GROUP BY sg.id;`,
    )
    .all(householdId, tomorrowKey) as {
    name: string;
    target_amount: number;
    saved: number;
  }[];
  const dueItems = [
    ...dueDebts
      .filter((debt) => Number(debt.paid) < Number(debt.original_amount))
      .map((debt) => `${debt.creditor} debt`),
    ...dueGoals
      .filter((goal) => Number(goal.saved) < Number(goal.target_amount))
      .map((goal) => `${goal.name} savings goal`),
  ];

  const body = [
    `Spent today: ${formatAmount(spentToday)}.`,
    biggestMovements.length
      ? `Biggest line movements: ${biggestMovements.join(', ')}.`
      : 'No line spending today.',
    highUsageLines.length
      ? `At or above 80%: ${highUsageLines.join(', ')}.`
      : 'No budget lines are at 80%.',
    dueItems.length ? `Due tomorrow: ${dueItems.join(', ')}.` : 'Nothing is due tomorrow.',
  ].join(' ');

  return {
    id: 'daily-summary',
    title: 'Daily budget summary',
    body,
    kind: 'daily_summary',
  };
}

export function getPersistedDailySummaries(
  db: DatabaseLike,
  now = effectiveNow(),
  days = 7,
): Alert[] {
  if (!Number.isInteger(days) || days < 1 || days > 31) {
    throw new Error('Daily summaries must be scheduled for between 1 and 31 days.');
  }
  const time = parseDailySummaryTime(getPersistedDailySummaryTime(db));
  const firstDate = getNextNotificationTime(now, time.hour, time.minute);
  const summary = getPersistedDailySummary(db, now);

  return Array.from({ length: days }, (_, index) => {
    const scheduledAt = new Date(firstDate);
    scheduledAt.setDate(scheduledAt.getDate() + index);
    const dateKey = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(scheduledAt)
      .filter((part) => part.type === 'year' || part.type === 'month' || part.type === 'day')
      .map((part) => part.value)
      .join('-');
    return {
      ...summary,
      id: `${summary.id}:${dateKey}`,
      scheduledAt,
    };
  });
}
