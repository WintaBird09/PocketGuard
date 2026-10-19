import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { budgetLines, households, outbox, transactions } from './schema';

describe('schema + migrations', () => {
  it('defines the expected tables and columns', () => {
    expect(households).toBeDefined();
    expect(budgetLines).toBeDefined();
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
});
