import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { runMigrations } from './db';
import {
  addIncomeStream,
  confirmRecurringIncome,
  deleteIncomeStream,
  removeRecurringIncomePlan,
  updateIncomeStream,
  getIncomeMonth,
  listIncomeStreams,
  updateRecurringIncomePlan,
} from './income';
import { deleteTransaction, updateTransaction } from './activity';
import { addBudgetLine, setAllocation, copyForward, getMonthPlan } from './plan';
import { transactions } from './repos';

describe('income streams', () => {
  let db: Database.Database | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it('creates a source, links budget allocations and expenses, and writes outbox entries', () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name) VALUES ('h1', 'h1', 'Personal');`,
    ).run();
    db.prepare(
      `INSERT INTO budget_lines (id, household_id, name, kind)
       VALUES ('line-1', 'h1', 'Food', 'running');`,
    ).run();

    const stream = addIncomeStream(db as never, 'h1', { kind: 'salary' });
    expect(stream).toMatchObject({ name: 'Income from Salary', kind: 'salary' });
    expect(listIncomeStreams(db as never, 'h1')).toEqual([stream]);

    setAllocation(db as never, 'h1', 'line-1', '2026-11', 50000, stream.id);
    expect(getMonthPlan(db as never, 'h1', '2026-11').lines[0].incomeStreamId).toBe(stream.id);
    expect(copyForward(db as never, 'h1', '2026-11', '2026-12')).toBe(1);
    expect(
      db.prepare('SELECT income_stream_id FROM allocations WHERE month = ?;').get('2026-12'),
    ).toEqual({ income_stream_id: stream.id });

    transactions.add(db as never, 'h1', {
      occurred_at: '2026-11-04T11:00:00.000Z',
      amount: 12500,
      direction: 'expense',
      line_id: 'line-1',
    });
    expect(db.prepare('SELECT income_stream_id FROM transactions;').get()).toEqual({
      income_stream_id: stream.id,
    });
    expect(db.prepare('SELECT table_name FROM outbox ORDER BY created_at, rowid;').all()).toEqual(
      expect.arrayContaining([
        { table_name: 'income_streams' },
        { table_name: 'allocations' },
        { table_name: 'transactions' },
      ]),
    );
  });

  it('rejects duplicate names and references outside the household', () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name) VALUES ('h1', 'h1', 'Personal');`,
    ).run();
    db.prepare(
      `INSERT INTO budget_lines (id, household_id, name, kind)
       VALUES ('line-1', 'h1', 'Food', 'running');`,
    ).run();
    addIncomeStream(db as never, 'h1', { kind: 'rental', name: 'Flat rent' });

    expect(() => addIncomeStream(db as never, 'h1', { kind: 'other', name: 'FLAT RENT' })).toThrow(
      'An income source with this name already exists.',
    );
    expect(() => setAllocation(db as never, 'h1', 'line-1', '2026-11', 100, 'foreign')).toThrow(
      'Income source was not found.',
    );
  });

  it('creates a budget line with its planned amount and income source in one step', () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name) VALUES ('h1', 'h1', 'Personal');`,
    ).run();
    const stream = addIncomeStream(db as never, 'h1', { kind: 'salary' });
    const id = addBudgetLine(db as never, 'h1', {
      name: 'Groceries',
      kind: 'running',
      month: '2026-11',
      amount: 40000,
      incomeStreamId: stream.id,
    });
    expect(
      getMonthPlan(db as never, 'h1', '2026-11').lines.find((line) => line.id === id),
    ).toMatchObject({ planned: 40000, incomeStreamId: stream.id });
    expect(() =>
      addBudgetLine(db as never, 'h1', { name: 'Gym', kind: 'running', amount: 5 }),
    ).toThrow('Choose a month');
  });

  it('shows fixed income as planned each month and confirms it only once when received', () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name) VALUES ('h1', 'h1', 'Personal');`,
    ).run();

    const stream = addIncomeStream(db as never, 'h1', {
      kind: 'salary',
      recurring: { amount: 350000, day: 1, startMonth: '2026-11' },
    });

    expect(getIncomeMonth(db as never, 'h1', '2026-11')).toMatchObject({
      monthTotal: 0,
      entryCount: 0,
      monthStreams: [stream],
      plannedIncome: [{ amount: 350000, day: 1, confirmed: false }],
    });
    expect(getIncomeMonth(db as never, 'h1', '2026-12').plannedIncome).toHaveLength(1);
    expect(getIncomeMonth(db as never, 'h1', '2026-10').plannedIncome).toHaveLength(0);

    confirmRecurringIncome(db as never, 'h1', stream.id, '2026-11');
    expect(getIncomeMonth(db as never, 'h1', '2026-11')).toMatchObject({
      monthTotal: 350000,
      entryCount: 1,
      plannedIncome: [{ amount: 350000, day: 1, confirmed: true }],
    });
    expect(() => confirmRecurringIncome(db as never, 'h1', stream.id, '2026-11')).toThrow(
      'This recurring income has already been confirmed for that month.',
    );
    expect(db.prepare('SELECT substr(occurred_at, 1, 10) AS day FROM transactions;').get()).toEqual(
      {
        day: '2026-11-01',
      },
    );
  });

  it('moves a payday onto the last day of shorter months', () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name) VALUES ('h1', 'h1', 'Personal');`,
    ).run();

    const stream = addIncomeStream(db as never, 'h1', {
      kind: 'salary',
      recurring: { amount: 1000, day: 31, startMonth: '2026-01' },
    });
    expect(getIncomeMonth(db as never, 'h1', '2026-02').plannedIncome).toMatchObject([
      { amount: 1000, day: 28 },
    ]);
    confirmRecurringIncome(db as never, 'h1', stream.id, '2026-02');

    expect(db.prepare('SELECT substr(occurred_at, 1, 10) AS day FROM transactions;').get()).toEqual(
      {
        day: '2026-02-28',
      },
    );
  });

  it('lets the user correct a monthly fixed-income plan', () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name) VALUES ('h1', 'h1', 'Personal');`,
    ).run();
    const stream = addIncomeStream(db as never, 'h1', {
      kind: 'salary',
      recurring: { amount: 350000, day: 1, startMonth: '2026-11' },
    });

    updateRecurringIncomePlan(db as never, 'h1', stream.id, { amount: 375000, day: 5 });

    expect(getIncomeMonth(db as never, 'h1', '2026-11').plannedIncome).toMatchObject([
      { amount: 375000, day: 5, confirmed: false },
    ]);
    expect(db.prepare('SELECT table_name FROM outbox;').all()).toContainEqual({
      table_name: 'income_streams',
    });
    expect(() =>
      updateRecurringIncomePlan(db as never, 'h1', stream.id, { amount: 0, day: 5 }),
    ).toThrow('Enter a positive whole amount in XAF.');
  });

  it('allows correcting a received recurring income and keeps its month confirmation in sync', () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name) VALUES ('h1', 'h1', 'Personal');`,
    ).run();
    const stream = addIncomeStream(db as never, 'h1', {
      kind: 'salary',
      recurring: { amount: 350000, day: 1, startMonth: '2026-11' },
    });
    const received = confirmRecurringIncome(db as never, 'h1', stream.id, '2026-11');

    updateTransaction(db as never, 'h1', received.id, {
      amount: 340000,
      note: 'Corrected salary',
      occurredOn: '2026-12-03',
    });

    expect(getIncomeMonth(db as never, 'h1', '2026-11')).toMatchObject({
      monthTotal: 0,
      plannedIncome: [{ confirmed: false }],
    });
    expect(getIncomeMonth(db as never, 'h1', '2026-12')).toMatchObject({
      monthTotal: 340000,
      entries: [{ amount: 340000, note: 'Corrected salary' }],
      plannedIncome: [{ confirmed: true }],
    });
    expect(
      db.prepare('SELECT recurring_income_month FROM transactions WHERE id = ?;').get(received.id),
    ).toEqual({ recurring_income_month: '2026-12' });
  });

  it('renames, stops the fixed plan of, and deletes an income source', () => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO households (id, household_id, name) VALUES ('h1', 'h1', 'Personal');`,
    ).run();
    const stream = addIncomeStream(db as never, 'h1', {
      kind: 'salary',
      recurring: { amount: 1000, day: 1, startMonth: '2026-11' },
    });
    addIncomeStream(db as never, 'h1', { kind: 'other', name: 'Gifts' });

    updateIncomeStream(db as never, 'h1', stream.id, { name: 'Main job', kind: 'business' });
    expect(
      listIncomeStreams(db as never, 'h1').find((item) => item.id === stream.id),
    ).toMatchObject({ name: 'Main job', kind: 'business' });
    expect(() =>
      updateIncomeStream(db as never, 'h1', stream.id, { name: 'gifts', kind: 'other' }),
    ).toThrow('An income source with this name already exists.');

    const received = confirmRecurringIncome(db as never, 'h1', stream.id, '2026-11');
    expect(() => deleteIncomeStream(db as never, 'h1', stream.id)).toThrow('linked to it');
    removeRecurringIncomePlan(db as never, 'h1', stream.id);
    expect(getIncomeMonth(db as never, 'h1', '2026-11').plannedIncome).toHaveLength(0);

    deleteTransaction(db as never, 'h1', received.id);
    deleteIncomeStream(db as never, 'h1', stream.id);
    expect(listIncomeStreams(db as never, 'h1').map((item) => item.name)).toEqual(['Gifts']);
  });
});
