import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { runMigrations } from './db';
import { budgetLines, settings, transactions } from './repos';

describe('data repositories', () => {
  it('creates a budget line and records the outbox entry in the same transaction', () => {
    const db = new Database(':memory:');

    runMigrations(db as never);

    const line = budgetLines.create(db as never, 'household-1', {
      name: 'Fuel',
      kind: 'running',
      hard_cap: true,
      sort_order: 10,
    });

    expect(line.name).toBe('Fuel');

    const row = db
      .prepare('SELECT COUNT(*) as count FROM budget_lines WHERE household_id = ? AND name = ?')
      .get('household-1', 'Fuel') as { count: number };

    const outbox = db
      .prepare(
        'SELECT COUNT(*) as count FROM outbox WHERE table_name = ? AND row_id = ? AND op = ?',
      )
      .get('budget_lines', line.id, 'create') as { count: number };

    expect(row.count).toBe(1);
    expect(outbox.count).toBe(1);
  });

  it('writes settings and appends an outbox row atomically', () => {
    const db = new Database(':memory:');

    runMigrations(db as never);

    settings.set(db as never, 'household-1', 'summary_time', '20:00');

    const saved = settings.get(db as never, 'household-1', 'summary_time');
    const outbox = db
      .prepare('SELECT COUNT(*) as count FROM outbox WHERE table_name = ? AND op = ?')
      .get('settings', 'upsert') as { count: number };

    expect(saved).toBe('20:00');
    expect(outbox.count).toBe(1);
  });

  it('adds a transaction and keeps the outbox entry with the same transaction', () => {
    const db = new Database(':memory:');

    runMigrations(db as never);

    const tx = transactions.add(db as never, 'household-1', {
      occurred_at: '2026-10-18T08:00:00.000Z',
      amount: 20000,
      direction: 'expense',
      line_id: 'line-1',
      note: 'Fuel',
      source: 'manual',
    });

    const outbox = db
      .prepare(
        'SELECT COUNT(*) as count FROM outbox WHERE table_name = ? AND row_id = ? AND op = ?',
      )
      .get('transactions', tx.id, 'create') as { count: number };

    expect(tx.amount).toBe(20000);
    expect(outbox.count).toBe(1);
  });

  it.each(['income', 'transfer'] as const)(
    'persists a %s entry without assigning it to a budget line',
    (direction) => {
      const db = new Database(':memory:');

      runMigrations(db as never);

      const tx = transactions.add(db as never, 'household-1', {
        occurred_at: '2026-10-24T08:00:00.000Z',
        amount: 250000,
        direction,
        note: direction === 'income' ? 'Salary' : 'Bank to MoMo',
      });

      expect(tx.direction).toBe(direction);
      expect(tx.line_id).toBeNull();
      expect(
        db.prepare('SELECT direction, line_id FROM transactions WHERE id = ?').get(tx.id) as {
          direction: string;
          line_id: string | null;
        },
      ).toEqual({ direction, line_id: null });
    },
  );
});
