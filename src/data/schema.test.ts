import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import {
  allocations,
  budgetLines,
  households,
  incomeStreams,
  outbox,
  transactions,
} from './schema';

describe('schema + migrations', () => {
  it('defines the expected tables and columns', () => {
    expect(households).toBeDefined();
    expect(budgetLines).toBeDefined();
    expect(incomeStreams).toBeDefined();
    expect(incomeStreams.columns.recurring_amount).toBe('INTEGER NULL');
    expect(incomeStreams.columns.recurring_day).toBe('INTEGER NULL');
    expect(incomeStreams.columns.recurring_start_month).toBe('TEXT NULL');
    expect(allocations.columns.income_stream_id).toBe('TEXT NULL');
    expect(transactions.columns.income_stream_id).toBe('TEXT NULL');
    expect(transactions.columns.recurring_income_month).toBe('TEXT NULL');
    expect(transactions).toBeDefined();
    expect(outbox).toBeDefined();
  });

  it('creates the database and allows insert + read cycles', async () => {
    const { runMigrations } = await import('./db');
    const db = new Database(':memory:');
    runMigrations(db as never);

    db.prepare(
      `INSERT INTO households (id, name, household_id, month_start_day, currency) VALUES (?, ?, ?, ?, ?);`,
    ).run('h1', 'Home', 'h1', 1, 'XAF');

    const row = db.prepare('SELECT id, name FROM households WHERE id = ?').get('h1') as {
      id: string;
      name: string;
    };

    expect(row).toBeTruthy();
    expect(row.name).toBe('Home');
  });

  it('adds the loan tables without touching existing ones and is safe to re-run', async () => {
    const { runMigrations } = await import('./db');
    const db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare(
      `INSERT INTO debts (id, household_id, creditor, original_amount) VALUES ('d1', 'h1', 'Mom', 100);`,
    ).run();

    runMigrations(db as never);

    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((row) => row.name);
    expect(tables).toEqual(expect.arrayContaining(['loans', 'loan_installments', 'loan_payments']));
    expect(db.prepare('SELECT COUNT(*) AS c FROM debts').get()).toEqual({ c: 1 });

    db.prepare(
      `INSERT INTO loans (id, household_id, person_name, lent_on, amount) VALUES ('l1', 'h1', 'Desmond', '2026-10-25', 20000);`,
    ).run();
    db.prepare(
      `INSERT INTO loan_installments (id, household_id, loan_id, due_on, amount) VALUES ('i1', 'h1', 'l1', '2026-11-25', 10000);`,
    ).run();
    db.prepare(
      `INSERT INTO loan_payments (id, household_id, loan_id, paid_at, amount) VALUES ('p1', 'h1', 'l1', '2026-11-01T10:00:00.000Z', 5000);`,
    ).run();
    expect(db.prepare('SELECT plan, written_off_at FROM loans WHERE id = ?').get('l1')).toEqual({
      plan: 'flexible',
      written_off_at: null,
    });
  });

  it('upgrades an existing database that only has the original tables', async () => {
    const { runMigrations } = await import('./db');
    const db = new Database(':memory:');
    db.exec(
      'CREATE TABLE households (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, name TEXT NOT NULL, month_start_day INTEGER NOT NULL DEFAULT 1, currency TEXT NOT NULL DEFAULT "XAF", device_id TEXT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT NULL);',
    );
    db.prepare("INSERT INTO households (id, household_id, name) VALUES ('h1','h1','Home');").run();
    runMigrations(db as never);
    expect(db.prepare('SELECT COUNT(*) AS c FROM households').get()).toEqual({ c: 1 });
    expect(db.prepare('SELECT COUNT(*) AS c FROM loans').get()).toEqual({ c: 0 });
  });

  it('adds income source columns to existing allocations and transactions tables', async () => {
    const { runMigrations } = await import('./db');
    const db = new Database(':memory:');
    db.exec(
      `CREATE TABLE allocations (
        id TEXT PRIMARY KEY, household_id TEXT NOT NULL, line_id TEXT NOT NULL,
        month TEXT NOT NULL, planned_amount INTEGER NOT NULL,
        device_id TEXT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT NULL
      );
      CREATE TABLE income_streams (
        id TEXT PRIMARY KEY, household_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
        device_id TEXT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT NULL
      );
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY, household_id TEXT NOT NULL, occurred_at TEXT NOT NULL,
        amount INTEGER NOT NULL, direction TEXT NOT NULL, line_id TEXT NULL,
        debt_id TEXT NULL, note TEXT NULL, source TEXT NOT NULL DEFAULT 'manual',
        raw_text TEXT NULL, status TEXT NOT NULL DEFAULT 'confirmed',
        override_reason TEXT NULL, device_id TEXT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT NULL
      );`,
    );
    runMigrations(db as never);
    runMigrations(db as never);
    const allocationColumns = (
      db.prepare('PRAGMA table_info(allocations);').all() as { name: string }[]
    ).map(({ name }) => name);
    const transactionColumns = (
      db.prepare('PRAGMA table_info(transactions);').all() as { name: string }[]
    ).map(({ name }) => name);
    const incomeStreamColumns = (
      db.prepare('PRAGMA table_info(income_streams);').all() as { name: string }[]
    ).map(({ name }) => name);
    expect(allocationColumns.filter((name) => name === 'income_stream_id')).toHaveLength(1);
    expect(transactionColumns.filter((name) => name === 'income_stream_id')).toHaveLength(1);
    expect(transactionColumns.filter((name) => name === 'recurring_income_month')).toHaveLength(1);
    expect(incomeStreamColumns.filter((name) => name === 'recurring_amount')).toHaveLength(1);
    expect(incomeStreamColumns.filter((name) => name === 'recurring_day')).toHaveLength(1);
    expect(incomeStreamColumns.filter((name) => name === 'recurring_start_month')).toHaveLength(1);
  });
});
