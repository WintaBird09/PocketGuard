import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { initializeLocalApp } from '../data/bootstrap';
import {
  createLoan,
  deleteLoan,
  listLoans,
  recordLoanRepayment,
  reinstateLoan,
  writeOffLoan,
} from '../data/loans';

import { buildLoanReminders, getPersistedLoanReminders } from './loan-alerts';
import { createNotificationScheduler, type SchedulerAdapter } from './scheduler';

const now = new Date(2026, 9, 25, 8, 0, 0);

function setup() {
  const db = new Database(':memory:');
  const hh = initializeLocalApp(db as never).householdId;
  return { db, hh, d: db as never };
}
const loan = (deadline: string, extra: object = {}) => ({
  personName: 'Desmond',
  lentOn: '2026-10-01',
  amount: 20000,
  plan: 'single' as const,
  deadline,
  ...extra,
});
const ids = (db: never) => getPersistedLoanReminders(db, now).map((a) => a.id);

describe('loan reminders', () => {
  it('schedules 7 days, 2 days and due-day reminders at 09:00', () => {
    const { d, hh } = setup();
    const id = createLoan(d, hh, loan('2026-11-10'));
    const alerts = getPersistedLoanReminders(d, now);
    expect(alerts.map((a) => a.id)).toEqual([
      `loan-reminder:${id}:2026-11-10:7`,
      `loan-reminder:${id}:2026-11-10:2`,
      `loan-reminder:${id}:2026-11-10:0`,
    ]);
    expect(alerts.every((a) => a.kind === 'loan_due')).toBe(true);
    expect(alerts[0].scheduledAt).toEqual(new Date(2026, 10, 3, 9, 0));
    expect(alerts[2].body).toContain('due today');
    expect(alerts[0].body).toContain('20,000 XAF');
  });

  it('skips reminder times already in the past so refreshes never re-notify', () => {
    const { d, hh } = setup();
    createLoan(d, hh, loan('2026-10-30'));
    // 7 days before is Oct 23 (past); 2 days before and due day remain
    expect(getPersistedLoanReminders(d, now)).toHaveLength(2);
    const afterNine = new Date(2026, 9, 28, 10, 0);
    expect(getPersistedLoanReminders(d, afterNine).map((a) => a.id.split(':').pop())).toEqual([
      '0',
    ]);
  });

  it('nudges weekly while overdue, four weeks ahead', () => {
    const { d, hh } = setup();
    createLoan(d, hh, loan('2026-10-20'));
    const alerts = getPersistedLoanReminders(d, now);
    expect(alerts).toHaveLength(4);
    expect(alerts[0].scheduledAt).toEqual(new Date(2026, 9, 27, 9, 0));
    expect(alerts[3].scheduledAt).toEqual(new Date(2026, 10, 17, 9, 0));
    expect(alerts[0].title).toContain('overdue');
  });

  it('uses the next unpaid installment and moves on after it is paid', () => {
    const { d, hh } = setup();
    const id = createLoan(d, hh, {
      personName: 'Petra',
      lentOn: '2026-10-01',
      amount: 100000,
      plan: 'installments',
      firstDueOn: '2026-11-05',
      installmentCount: 4,
    });
    expect(ids(d)[0]).toBe(`loan-reminder:${id}:2026-11-05:7`);
    recordLoanRepayment(d, hh, { loanId: id, amount: 25000 });
    expect(ids(d)[0]).toBe(`loan-reminder:${id}:2026-12-05:7`);
  });

  it('stays silent for flexible loans without a deadline', () => {
    const { d, hh } = setup();
    createLoan(d, hh, { personName: 'Open', lentOn: '2026-10-01', amount: 5000, plan: 'flexible' });
    expect(ids(d)).toEqual([]);
  });

  it('removes reminders when repaid, written off or deleted, and restores them on reinstate', () => {
    const { d, hh } = setup();
    const paid = createLoan(d, hh, loan('2026-11-10'));
    recordLoanRepayment(d, hh, { loanId: paid, amount: 20000 });
    const off = createLoan(d, hh, loan('2026-11-10'));
    writeOffLoan(d, hh, off);
    const gone = createLoan(d, hh, loan('2026-11-10'));
    deleteLoan(d, hh, gone);
    expect(ids(d)).toEqual([]);
    reinstateLoan(d, hh, off);
    expect(ids(d)).toHaveLength(3);
  });

  it('does not touch existing alert kinds and replaces its own schedule without duplicates', async () => {
    const { d, hh } = setup();
    createLoan(d, hh, loan('2026-11-10'));
    const scheduled: { identifier: string; data?: Record<string, unknown> }[] = [];
    const channels: string[] = [];
    const adapter: SchedulerAdapter = {
      getPermission: async () => 'granted',
      getScheduled: async () => scheduled.map((s) => ({ ...s, data: s.data })),
      cancel: async (identifier) => {
        const i = scheduled.findIndex((s) => s.identifier === identifier);
        if (i >= 0) scheduled.splice(i, 1);
      },
      schedule: async (request) => {
        scheduled.push({ identifier: request.identifier, data: request.content.data });
        if (request.trigger) channels.push(request.trigger.channelId);
        return request.identifier;
      },
    };
    const run = createNotificationScheduler(adapter);
    const alerts = getPersistedLoanReminders(d, now);
    await run(alerts, now);
    await run(alerts, now);
    expect(scheduled).toHaveLength(3);
    expect(new Set(channels)).toEqual(new Set(['reminders']));
  });

  it('builds from plain summaries and ignores complete loans', () => {
    const { d, hh } = setup();
    const id = createLoan(d, hh, loan('2026-11-10'));
    recordLoanRepayment(d, hh, { loanId: id, amount: 20000 });
    expect(buildLoanReminders(listLoans(d, hh, '2026-10-25'), now)).toEqual([]);
  });
});
