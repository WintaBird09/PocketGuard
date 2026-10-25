import type { DatabaseLike } from '../data/db';
import { getActiveHouseholdId } from '../data/household';
import { listLoans, type LoanSummary } from '../data/loans';
import { localDateString } from '../domain/dates';
import type { Alert } from '../domain/alerts';
import { formatXAF } from '../ui/theme';

const reminderHour = 9;
export const loanReminderOffsets = [7, 2, 0] as const;
// Weekly overdue nudges are scheduled this many weeks ahead and rebuilt on every refresh.
export const overdueWeeksAhead = 4;

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return localDateString(new Date(year, month - 1, day + days));
}

function at9(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, reminderHour, 0, 0, 0);
}

function describe(loan: LoanSummary): string {
  return `${loan.personName} owes you ${formatXAF(loan.balance)}`;
}

// Reminders are future-dated and rebuilt on each refresh, so a repayment, edit or write-off
// removes the pending ones. A reminder whose 09:00 has already passed is skipped, never fired
// late, so repeated refreshes cannot notify twice.
export function buildLoanReminders(loans: readonly LoanSummary[], now = new Date()): Alert[] {
  const today = localDateString(now);
  const alerts: Alert[] = [];

  for (const loan of loans) {
    if (loan.balance <= 0 || loan.status === 'WRITTEN_OFF' || loan.status === 'COMPLETE') continue;

    if (loan.status === 'OVERDUE') {
      const lateSince = addDays(today, -loan.daysOverdue);
      let scheduled = 0;
      for (let week = 1; scheduled < overdueWeeksAhead; week += 1) {
        const dayKey = addDays(lateSince, week * 7);
        const when = at9(dayKey);
        if (dayKey < today || when.getTime() <= now.getTime()) continue;
        scheduled += 1;
        alerts.push({
          id: `loan-overdue:${loan.id}:${dayKey}`,
          kind: 'loan_due',
          title: `Loan to ${loan.personName} is overdue`,
          body: `${describe(loan)}. It has been overdue since ${lateSince}.`,
          scheduledAt: when,
        });
      }
      continue;
    }

    if (!loan.nextDueOn) continue;
    for (const offset of loanReminderOffsets) {
      const dayKey = addDays(loan.nextDueOn, -offset);
      const when = at9(dayKey);
      if (dayKey < today || when.getTime() <= now.getTime()) continue;
      alerts.push({
        id: `loan-reminder:${loan.id}:${loan.nextDueOn}:${offset}`,
        kind: 'loan_due',
        title: `Loan to ${loan.personName}`,
        body:
          offset === 0
            ? `${describe(loan)} — payment is due today.`
            : `${describe(loan)} — payment is due in ${offset} days.`,
        scheduledAt: when,
      });
    }
  }
  return alerts;
}

export function getPersistedLoanReminders(db: DatabaseLike, now = new Date()): Alert[] {
  const householdId = getActiveHouseholdId(db);
  return buildLoanReminders(listLoans(db, householdId, localDateString(now)), now);
}
