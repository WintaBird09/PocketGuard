import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

import { runMigrations } from '../data/db';
import { settings, transactions } from '../data/repos';

import {
  getPersistedBudgetAlerts,
  getPersistedPaceAlerts,
  getPersistedSavingsAndDebtReminders,
  markPersistedThresholdAlertsScheduled,
  paceAlertMarginKey,
  savingsReminderDaysKey,
} from './persisted-alerts';
import {
  createDebouncedRescheduler,
  createNotificationScheduler,
  schedulerIdentifier,
  type ScheduleRequest,
  type SchedulerAdapter,
  type ScheduledRequest,
} from './scheduler';

describe('persisted notification refresh flow', () => {
  let db: Database.Database | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
    vi.useRealTimers();
  });

  it('replans from committed transactions and replaces owned schedules without duplicates', async () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name)
       VALUES ('household-1', 'household-1', 'Personal');`,
    ).run();
    db.prepare(
      `INSERT INTO budget_lines
        (id, household_id, name, kind, hard_cap, sort_order, archived)
       VALUES ('fuel', 'household-1', 'Fuel', 'running', 1, 1, 0);`,
    ).run();
    db.prepare(
      `INSERT INTO allocations (id, household_id, line_id, month, planned_amount)
       VALUES ('fuel-plan', 'household-1', 'fuel', '2026-10', 1000);`,
    ).run();
    transactions.add(db as never, 'household-1', {
      occurred_at: '2026-10-24T10:00:00.000Z',
      amount: 900,
      direction: 'expense',
      line_id: 'fuel',
    });

    const requests: ScheduledRequest[] = [];
    const scheduledInputs: ScheduleRequest[] = [];
    const adapter: SchedulerAdapter = {
      getPermission: vi.fn(async () => 'granted'),
      getScheduled: vi.fn(async () => requests),
      cancel: vi.fn(async (identifier) => {
        const index = requests.findIndex((request) => request.identifier === identifier);
        if (index >= 0) requests.splice(index, 1);
      }),
      schedule: vi.fn(async (request) => {
        scheduledInputs.push(request);
        const identifier = `notification-${scheduledInputs.length}`;
        requests.push({
          identifier,
          data: request.content.data,
        });
        return identifier;
      }),
    };
    const now = new Date('2026-10-24T12:00:00.000Z');
    const reschedule = createNotificationScheduler(adapter);
    const loadAlerts = vi.fn(async () => getPersistedBudgetAlerts(db as never, now));
    adapter.onScheduled = async (alerts) =>
      markPersistedThresholdAlertsScheduled(db as never, alerts, now);
    const refresh = createDebouncedRescheduler(loadAlerts, reschedule, vi.fn(), 50);

    vi.useFakeTimers();
    refresh();
    refresh();
    await vi.advanceTimersByTimeAsync(50);

    expect(loadAlerts).toHaveBeenCalledOnce();
    expect(scheduledInputs.map((request) => request.content.title)).toEqual([
      'Fuel at 50% of monthly budget',
      'Fuel at 80% of monthly budget',
    ]);
    expect(scheduledInputs.map((request) => request.identifier)).toEqual([
      '2026-10:fuel:50',
      '2026-10:fuel:80',
    ]);
    expect(scheduledInputs.map((request) => request.trigger)).toEqual([null, null]);
    expect(requests).toHaveLength(2);
    expect(getPersistedBudgetAlerts(db as never, now)).toEqual([]);

    transactions.add(db as never, 'household-1', {
      occurred_at: '2026-10-24T11:00:00.000Z',
      amount: 100,
      direction: 'expense',
      line_id: 'fuel',
    });
    refresh();
    await vi.advanceTimersByTimeAsync(50);

    const managedRequests = requests.filter(
      (request) => request.data?.schedulerIdentifier === schedulerIdentifier,
    );
    expect(managedRequests).toHaveLength(1);
    expect(scheduledInputs.map((request) => request.content.title)).toEqual([
      'Fuel at 50% of monthly budget',
      'Fuel at 80% of monthly budget',
      'Fuel at 100% of monthly budget',
    ]);
    expect(scheduledInputs[2].trigger).toBeNull();
    expect(scheduledInputs[2].identifier).toBe('2026-10:fuel:100');
    expect(adapter.cancel).toHaveBeenCalledTimes(2);
    expect(getPersistedBudgetAlerts(db as never, now)).toEqual([]);
  });

  it('evaluates pace on transaction refresh and records a one-time alert', async () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name)
       VALUES ('household-1', 'household-1', 'Personal');`,
    ).run();
    db.prepare(
      `INSERT INTO budget_lines
        (id, household_id, name, kind, hard_cap, sort_order, archived)
       VALUES ('fuel', 'household-1', 'Fuel', 'running', 1, 1, 0);`,
    ).run();
    db.prepare(
      `INSERT INTO allocations (id, household_id, line_id, month, planned_amount)
       VALUES ('fuel-plan', 'household-1', 'fuel', '2026-10', 1000);`,
    ).run();
    transactions.add(db as never, 'household-1', {
      occurred_at: '2026-10-04T10:00:00.000Z',
      amount: 850,
      direction: 'expense',
      line_id: 'fuel',
    });

    const now = new Date('2026-10-05T12:00:00.000Z');
    const alerts = getPersistedPaceAlerts(db as never, now);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].body).toContain('Fuel is 85% used');
    expect(alerts[0].immediate).toBe(true);
    const adapter: SchedulerAdapter = {
      getPermission: vi.fn(async () => 'granted'),
      getScheduled: vi.fn(async () => []),
      cancel: vi.fn(async () => undefined),
      schedule: vi.fn(async (request) => {
        expect(request.trigger).toBeNull();
        expect(request.identifier).toBe('2026-10:fuel:pace');
        return request.identifier;
      }),
      onScheduled: async (scheduledAlerts) =>
        markPersistedThresholdAlertsScheduled(db as never, scheduledAlerts, now),
    };
    await createNotificationScheduler(adapter)(alerts, now);
    expect(getPersistedPaceAlerts(db as never, now)).toEqual([]);

    settings.set(db as never, 'household-1', paceAlertMarginKey, 80);
    expect(getPersistedPaceAlerts(db as never, now)).toEqual([]);
  });

  it('schedules configured savings and debt reminders, then cancels confirmed or paid items', async () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name)
       VALUES ('household-1', 'household-1', 'Personal');`,
    ).run();
    db.prepare(
      `INSERT INTO budget_lines
        (id, household_id, name, kind, sort_order)
       VALUES ('savings-line', 'household-1', 'Savings', 'savings', 1);`,
    ).run();
    db.prepare(
      `INSERT INTO savings_goals
        (id, household_id, name, target_amount, due_date)
       VALUES ('goal', 'household-1', 'Emergency fund', 10000, '2026-12-31');`,
    ).run();
    db.prepare(
      `INSERT INTO savings_commitments
        (id, household_id, goal_id, line_id, month, planned_amount)
       VALUES ('commitment', 'household-1', 'goal', 'savings-line', '2026-10', 5000);`,
    ).run();
    db.prepare(
      `INSERT INTO debts (id, household_id, creditor, original_amount, deadline)
       VALUES ('debt', 'household-1', 'Alex', 2000, '2026-10-31');`,
    ).run();
    settings.set(db as never, 'household-1', savingsReminderDaysKey, '[7,2,0]');

    const now = new Date('2026-10-24T12:00:00.000Z');
    const alerts = getPersistedSavingsAndDebtReminders(db as never, now);
    expect(alerts.map((alert) => alert.id)).toEqual([
      'savings-reminder:commitment:2026-10-31:7',
      'debt-reminder:debt:7',
    ]);
    const requests: ScheduledRequest[] = [];
    const reminderAdapter: SchedulerAdapter = {
      getPermission: vi.fn(async () => 'granted'),
      getScheduled: vi.fn(async () => requests),
      cancel: vi.fn(async (identifier) => {
        const index = requests.findIndex((request) => request.identifier === identifier);
        if (index >= 0) requests.splice(index, 1);
      }),
      schedule: vi.fn(async (request) => {
        const identifier = `reminder-${requests.length + 1}`;
        requests.push({ identifier, data: request.content.data });
        return identifier;
      }),
    };
    const reschedule = createNotificationScheduler(reminderAdapter);
    await reschedule(alerts, now);
    expect(requests).toHaveLength(2);

    db.prepare(
      `UPDATE savings_commitments SET saved_amount = 5000, saved_at = '2026-10-24T12:30:00Z'
       WHERE id = 'commitment';`,
    ).run();
    transactions.add(db as never, 'household-1', {
      occurred_at: '2026-10-24T13:00:00.000Z',
      amount: 2000,
      direction: 'expense',
      debt_id: 'debt',
    });
    expect(getPersistedSavingsAndDebtReminders(db as never, now)).toEqual([]);
    await reschedule(getPersistedSavingsAndDebtReminders(db as never, now), now);
    expect(requests).toEqual([]);
    expect(reminderAdapter.cancel).toHaveBeenCalledTimes(2);
  });

  it('uses deterministic overdue IDs and leaves one scheduled reminder per item and day after refresh', async () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name)
       VALUES ('household-1', 'household-1', 'Personal');`,
    ).run();
    db.prepare(
      `INSERT INTO budget_lines (id, household_id, name, kind)
       VALUES ('savings-line', 'household-1', 'Savings', 'savings');`,
    ).run();
    db.prepare(
      `INSERT INTO savings_goals (id, household_id, name, target_amount, due_date)
       VALUES ('goal', 'household-1', 'Emergency fund', 10000, '2026-12-31');`,
    ).run();
    db.prepare(
      `INSERT INTO savings_commitments
        (id, household_id, goal_id, line_id, month, planned_amount)
       VALUES ('commitment', 'household-1', 'goal', 'savings-line', '2026-10', 5000);`,
    ).run();
    db.prepare(
      `INSERT INTO debts (id, household_id, creditor, original_amount, deadline)
       VALUES ('debt', 'household-1', 'Alex', 2000, '2026-10-20');`,
    ).run();

    const now = new Date('2026-11-02T12:00:00.000Z');
    const alerts = getPersistedSavingsAndDebtReminders(db as never, now);
    expect(alerts.map((alert) => alert.id)).toEqual([
      'savings-overdue:commitment:2026-11-02',
      'debt-overdue:debt:2026-11-02',
    ]);

    const requests: ScheduledRequest[] = [];
    const scheduledRequests: ScheduleRequest[] = [];
    const adapter: SchedulerAdapter = {
      getPermission: vi.fn(async () => 'granted'),
      getScheduled: vi.fn(async () => requests),
      cancel: vi.fn(async (identifier) => {
        const index = requests.findIndex((request) => request.identifier === identifier);
        if (index >= 0) requests.splice(index, 1);
      }),
      schedule: vi.fn(async (request) => {
        scheduledRequests.push(request);
        requests.push({ identifier: request.identifier, data: request.content.data });
        return request.identifier;
      }),
    };
    const reschedule = createNotificationScheduler(adapter);
    await reschedule(alerts, now);
    await reschedule(getPersistedSavingsAndDebtReminders(db as never, now), now);

    expect(scheduledRequests.map((request) => request.identifier)).toEqual([
      'savings-overdue:commitment:2026-11-02',
      'debt-overdue:debt:2026-11-02',
      'savings-overdue:commitment:2026-11-02',
      'debt-overdue:debt:2026-11-02',
    ]);
    expect(requests.map((request) => request.identifier)).toEqual([
      'savings-overdue:commitment:2026-11-02',
      'debt-overdue:debt:2026-11-02',
    ]);
    expect(adapter.cancel).toHaveBeenCalledTimes(2);
  });

  it('fails explicitly if the persisted household is unavailable', () => {
    db = new Database(':memory:');
    runMigrations(db as never);

    expect(() => getPersistedBudgetAlerts(db as never, new Date('2026-10-24T12:00:00Z'))).toThrow(
      'The local household has not been initialized.',
    );
  });
});
