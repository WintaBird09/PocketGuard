import { getHomeDashboardSnapshot } from '../data/dashboard';
import type { DatabaseLike } from '../data/db';
import { dayOfMonth, daysInMonth, monthKeyForDate } from '../domain/dates';
import { buildAlerts, type Alert } from '../domain/alerts';
import { settings } from '../data/repos';

const thresholdStatePrefix = 'notifications.threshold-alerts.';
export const defaultPaceAlertMargin = 20;
export const paceAlertMarginKey = 'pace_alert_margin';

function requireHouseholdId(db: DatabaseLike): string {
  if (!db.prepare) throw new Error('Database does not support prepared queries.');
  const household = db
    .prepare('SELECT id FROM households WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;')
    .get();
  if (!household || typeof household.id !== 'string') {
    throw new Error('The local household has not been initialized.');
  }
  return household.id;
}

function getNotifiedThresholds(db: DatabaseLike, householdId: string, monthKey: string): string[] {
  const stored = settings.get(db, householdId, `${thresholdStatePrefix}${monthKey}`);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== 'string')) {
      throw new Error('Saved threshold alert state is invalid.');
    }
    return parsed;
  } catch (error) {
    throw new Error('Unable to read saved threshold alert state.', { cause: error });
  }
}

export function markPersistedThresholdAlertsScheduled(
  db: DatabaseLike,
  alerts: readonly Alert[],
  now = new Date(),
): void {
  const householdId = requireHouseholdId(db);
  const monthKey = monthKeyForDate(now, 'Africa/Douala');
  const settingKey = `${thresholdStatePrefix}${monthKey}`;
  const notified = new Set(getNotifiedThresholds(db, householdId, monthKey));
  let changed = false;
  for (const alert of alerts) {
    if (
      (alert.kind !== 'threshold' && alert.kind !== 'pace') ||
      !alert.id.startsWith(`${monthKey}:`)
    ) {
      continue;
    }
    if (!notified.has(alert.id)) {
      notified.add(alert.id);
      changed = true;
    }
  }
  if (changed) settings.set(db, householdId, settingKey, JSON.stringify([...notified]));
}

export function getPersistedBudgetAlerts(db: DatabaseLike, now = new Date()): Alert[] {
  const householdId = requireHouseholdId(db);
  const timeZone = 'Africa/Douala';
  const monthKey = monthKeyForDate(now, timeZone);
  const snapshot = getHomeDashboardSnapshot(db, householdId, monthKey, now);
  const elapsed = dayOfMonth(now, timeZone);
  const monthLength = daysInMonth(now, timeZone);
  const notifiedThresholds = new Set(getNotifiedThresholds(db, householdId, monthKey));

  return snapshot.lines.flatMap((line) => {
    if (line.planned <= 0) return [];
    return buildAlerts({
      lineName: line.name,
      planned: line.planned,
      spent: line.spent,
      pctUsed: (line.spent / line.planned) * 100,
      daysLeft: Math.max(0, monthLength - elapsed),
    })
      .filter((alert) => alert.kind === 'threshold')
      .map((alert, index) => ({
        ...alert,
        id: `${monthKey}:${line.id}:${[50, 80, 100][index]}`,
        immediate: true,
      }))
      .filter((alert) => !notifiedThresholds.has(alert.id));
  });
}

export function getPersistedPaceAlerts(db: DatabaseLike, now = new Date()): Alert[] {
  const householdId = requireHouseholdId(db);
  const timeZone = 'Africa/Douala';
  const monthKey = monthKeyForDate(now, timeZone);
  const snapshot = getHomeDashboardSnapshot(db, householdId, monthKey, now);
  const elapsedPct = (dayOfMonth(now, timeZone) / daysInMonth(now, timeZone)) * 100;
  const margin = getPersistedPaceAlertMargin(db, householdId);
  const notified = new Set(getNotifiedThresholds(db, householdId, monthKey));
  return snapshot.lines.flatMap((line) => {
    if (line.planned <= 0) return [];
    const usedPct = (line.spent / line.planned) * 100;
    const alertId = `${monthKey}:${line.id}:pace`;
    if (usedPct <= elapsedPct + margin || notified.has(alertId)) return [];
    return [
      {
        id: alertId,
        title: `${line.name} spending pace is ahead`,
        body: `${line.name} is ${Math.floor(usedPct)}% used, ${Math.max(
          0,
          daysInMonth(now, timeZone) - dayOfMonth(now, timeZone),
        )} days left. This is ${Math.floor(usedPct - elapsedPct)} points ahead of monthly pace.`,
        kind: 'pace' as const,
        immediate: true,
      },
    ];
  });
}

const savingsReminderDaysKey = 'savings_reminder_days';
export const defaultSavingsReminderDays = [7, 2, 0] as const;
export { savingsReminderDaysKey };
const remindersTimeZone = 'Africa/Douala';

function localDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: remindersTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`;
}

function addDaysToKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDifference(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000,
  );
}

export function getPersistedPaceAlertMargin(
  db: DatabaseLike,
  householdId = requireHouseholdId(db),
): number {
  const stored = settings.get(db, householdId, paceAlertMarginKey);
  const margin = stored === null ? defaultPaceAlertMargin : Number(stored);
  if (!Number.isFinite(margin) || margin < 0 || margin > 100) {
    throw new Error('The pace alert margin setting must be between 0 and 100.');
  }
  return margin;
}

export function parseSavingsReminderDays(value: string): number[] {
  const days = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number);
  if (days.length === 0 || days.some((day) => !Number.isInteger(day) || day < 0 || day > 365)) {
    throw new Error('Savings reminder days must be whole days from 0 to 365, separated by commas.');
  }
  return [...new Set(days)].sort((left, right) => right - left);
}

export function getPersistedSavingsReminderDays(
  db: DatabaseLike,
  householdId = requireHouseholdId(db),
): number[] {
  const stored = settings.get(db, householdId, savingsReminderDaysKey);
  if (stored === null) return [...defaultSavingsReminderDays];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch (error) {
    throw new Error('Unable to read saved savings reminder days.', { cause: error });
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.some((day) => !Number.isInteger(day) || day < 0 || day > 365)
  ) {
    throw new Error('Savings reminder days must be a non-empty list of whole days from 0 to 365.');
  }
  return parseSavingsReminderDays(parsed.join(','));
}

function localReminderTime(dateKey: string, now: Date): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const reminderTime = new Date(year, month - 1, day, 9, 0, 0, 0);
  return reminderTime.getTime() <= now.getTime() ? now : reminderTime;
}

export function getPersistedSavingsAndDebtReminders(db: DatabaseLike, now = new Date()): Alert[] {
  const householdId = requireHouseholdId(db);
  if (!db.prepare) throw new Error('Database does not support prepared queries.');
  const today = localDateKey(now);
  const savingsReminderDays = getPersistedSavingsReminderDays(db, householdId);
  const commitments = db
    .prepare(
      `SELECT sc.id, sc.month, sc.planned_amount, sc.saved_at, sg.name AS goal_name
       FROM savings_commitments sc
       JOIN savings_goals sg ON sg.id = sc.goal_id AND sg.household_id = sc.household_id
         AND sg.deleted_at IS NULL
       WHERE sc.household_id = ? AND sc.deleted_at IS NULL AND sc.saved_at IS NULL;`,
    )
    .all(householdId) as {
    id: string;
    month: string;
    planned_amount: number;
    saved_at: string | null;
    goal_name: string;
  }[];
  const debtRows = db
    .prepare(
      `SELECT d.id, d.creditor, d.original_amount, d.deadline,
         COALESCE(SUM(CASE WHEN t.direction = 'expense' AND t.status = 'confirmed'
           THEN t.amount ELSE 0 END), 0) AS paid
       FROM debts d
       LEFT JOIN transactions t ON t.debt_id = d.id AND t.household_id = d.household_id
         AND t.deleted_at IS NULL
       WHERE d.household_id = ? AND d.deleted_at IS NULL AND d.deadline IS NOT NULL
       GROUP BY d.id;`,
    )
    .all(householdId) as {
    id: string;
    creditor: string;
    original_amount: number;
    deadline: string;
    paid: number;
  }[];

  const savingsAlerts = commitments.flatMap((commitment) => {
    const [year, month] = commitment.month.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const dueDate = `${commitment.month}-${String(lastDay).padStart(2, '0')}`;
    const daysUntilDue = dayDifference(today, dueDate);
    if (daysUntilDue < 0) {
      const reminderTime = localReminderTime(today, now);
      return [
        {
          id: `savings-overdue:${commitment.id}:${today}`,
          title: `${commitment.goal_name} savings commitment overdue`,
          body: `The planned ${Number(commitment.planned_amount).toLocaleString('en-US')} XAF savings commitment is overdue. Confirm it when saved.`,
          kind: 'savings_due' as const,
          scheduledAt: reminderTime,
        },
      ];
    }
    const reminderOffsets = savingsReminderDays.filter((daysBefore) => daysUntilDue === daysBefore);

    return reminderOffsets.map((offset) => {
      const reminderDay =
        offset < 0 ? addDaysToKey(today, -offset) : addDaysToKey(dueDate, -offset);
      return {
        id: `savings-reminder:${commitment.id}:${dueDate}:${offset}`,
        title: `${commitment.goal_name} savings commitment`,
        body:
          daysUntilDue < 0
            ? `The planned ${Number(commitment.planned_amount).toLocaleString('en-US')} XAF savings commitment is overdue. Confirm it when saved.`
            : `The planned ${Number(commitment.planned_amount).toLocaleString('en-US')} XAF savings commitment is due ${offset === 0 ? 'today' : `in ${offset} days`}.`,
        kind: 'savings_due' as const,
        scheduledAt: localReminderTime(reminderDay, now),
      };
    });
  });

  const debtAlerts = debtRows.flatMap((debt) => {
    if (Number(debt.paid) >= Number(debt.original_amount)) return [];
    const daysUntilDue = dayDifference(today, debt.deadline);
    if (daysUntilDue < 0) {
      return [
        {
          id: `debt-overdue:${debt.id}:${today}`,
          title: `${debt.creditor} debt payment overdue`,
          body: `A remaining debt balance of ${Math.max(
            0,
            Number(debt.original_amount) - Number(debt.paid),
          ).toLocaleString('en-US')} XAF is overdue.`,
          kind: 'debt_due' as const,
          scheduledAt: localReminderTime(today, now),
        },
      ];
    }
    return [7, 2]
      .filter((daysBefore) => daysUntilDue === daysBefore)
      .map((daysBefore) => ({
        id: `debt-reminder:${debt.id}:${daysBefore}`,
        title: `${debt.creditor} debt payment reminder`,
        body: `A remaining debt balance of ${Math.max(
          0,
          Number(debt.original_amount) - Number(debt.paid),
        ).toLocaleString('en-US')} XAF is due in ${daysBefore} days.`,
        kind: 'debt_due' as const,
        scheduledAt: localReminderTime(addDaysToKey(debt.deadline, -daysBefore), now),
      }));
  });

  return [...savingsAlerts, ...debtAlerts];
}
