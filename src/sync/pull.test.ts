import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { ensureRemoteHouseholdMapping } from '../auth/householdBootstrap';
import { initializeLocalApp } from '../data/bootstrap';

import { pullRemoteChanges, type PullApi, type PullTable } from './pull';

const householdId = 'c3000000-0000-4000-8000-000000000003';
const userId = 'a1000000-0000-4000-8000-000000000001';
const lastPull = '2026-10-25T10:00:00.000Z';
const remoteUpdate = '2026-10-25T10:05:00.000Z';

function createDatabase() {
  const db = new Database(':memory:');
  initializeLocalApp(db as never);
  ensureRemoteHouseholdMapping(db as never, userId, {
    createHousehold: async () => householdId,
  });
  db.prepare('DELETE FROM outbox;').run();
  db.prepare(
    `INSERT INTO sync_state
      (table_name, household_id, last_pull_at, created_at, updated_at)
     VALUES ('transactions', ?, ?, ?, ?);`,
  ).run(householdId, lastPull, lastPull, lastPull);
  return db;
}

function saveIdMapping(db: Database.Database, table: string, localId: string, remoteId: string) {
  db.prepare(
    `INSERT INTO sync_state
      (table_name, household_id, last_pull_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?);`,
  ).run(`remote-id:${table}:${localId}`, remoteId, lastPull, lastPull, lastPull);
}

function createPullApi(rowsByTable: Partial<Record<PullTable, Record<string, unknown>[]>>) {
  const requests: Array<{
    table: PullTable;
    householdId: string;
    updatedAfter: string;
    offset: number;
    limit: number;
  }> = [];
  const api: PullApi = {
    fetchUpdated: async (table, requestedHouseholdId, updatedAfter, offset, limit) => {
      requests.push({
        table,
        householdId: requestedHouseholdId,
        updatedAfter,
        offset,
        limit,
      });
      const rows = rowsByTable[table] ?? [];
      return { rows: rows.slice(offset, offset + limit), error: null };
    },
  };
  return { api, requests };
}

describe('remote pull sync', () => {
  it('pulls newer server edits, resolves stable local IDs and references, and advances the cursor', async () => {
    const db = createDatabase();
    saveIdMapping(db, 'budget_lines', 'line-local', 'd4000000-0000-4000-8000-000000000004');
    saveIdMapping(db, 'transactions', 'transaction-local', 'e5000000-0000-4000-8000-000000000005');
    db.prepare(
      `INSERT INTO budget_lines (id, household_id, name, kind, updated_at)
       VALUES ('line-local', ?, 'Old transport', 'running', ?);`,
    ).run(householdId, lastPull);
    db.prepare(
      `INSERT INTO transactions
        (id, household_id, occurred_at, amount, direction, line_id, note, updated_at)
       VALUES ('transaction-local', ?, ?, 100, 'expense', 'line-local', 'Old note', ?);`,
    ).run(householdId, lastPull, lastPull);

    const { api, requests } = createPullApi({
      budget_lines: [
        {
          id: 'd4000000-0000-4000-8000-000000000004',
          household_id: householdId,
          name: 'Transport',
          kind: 'running',
          hard_cap: true,
          sort_order: 2,
          archived: false,
          created_at: lastPull,
          updated_at: remoteUpdate,
          deleted_at: null,
        },
      ],
      transactions: [
        {
          id: 'e5000000-0000-4000-8000-000000000005',
          household_id: householdId,
          occurred_at: remoteUpdate,
          amount: 725,
          direction: 'expense',
          line_id: 'd4000000-0000-4000-8000-000000000004',
          debt_id: null,
          note: 'Updated note',
          source: 'manual',
          raw_text: null,
          status: 'confirmed',
          override_reason: null,
          created_at: lastPull,
          updated_at: remoteUpdate,
          deleted_at: null,
        },
      ],
    });

    const result = await pullRemoteChanges(db as never, api, householdId);

    expect(result).toEqual({ fetched: 2, applied: 2, error: null });
    expect(
      db.prepare('SELECT name, hard_cap FROM budget_lines WHERE id = ?;').get('line-local'),
    ).toEqual({
      name: 'Transport',
      hard_cap: 1,
    });
    expect(
      db
        .prepare('SELECT amount, line_id, note FROM transactions WHERE id = ?;')
        .get('transaction-local'),
    ).toEqual({ amount: 725, line_id: 'line-local', note: 'Updated note' });
    expect(
      db.prepare('SELECT last_pull_at FROM sync_state WHERE table_name = ?;').get('transactions'),
    ).toEqual({ last_pull_at: remoteUpdate });
    expect(requests.find((request) => request.table === 'transactions')).toMatchObject({
      householdId,
      updatedAfter: lastPull,
    });
    db.close();
  });

  it('keeps newer local edits and their pending outbox row when an older remote version arrives', async () => {
    const db = createDatabase();
    const localUpdatedAt = '2026-10-25T10:10:00.000Z';
    db.prepare(
      `INSERT INTO transactions
        (id, household_id, occurred_at, amount, direction, note, updated_at)
       VALUES ('transaction-uuid', ?, ?, 900, 'expense', 'Local edit', ?);`,
    ).run(householdId, localUpdatedAt, localUpdatedAt);
    db.prepare(
      `INSERT INTO outbox
        (id, household_id, table_name, row_id, op, created_at, updated_at)
       VALUES ('pending-local-edit', ?, 'transactions', 'transaction-uuid', 'upsert', ?, ?);`,
    ).run(householdId, localUpdatedAt, localUpdatedAt);
    const { api } = createPullApi({
      transactions: [
        {
          id: 'transaction-uuid',
          household_id: householdId,
          occurred_at: lastPull,
          amount: 700,
          direction: 'expense',
          line_id: null,
          debt_id: null,
          note: 'Older remote edit',
          source: 'manual',
          raw_text: null,
          status: 'confirmed',
          override_reason: null,
          created_at: lastPull,
          updated_at: remoteUpdate,
          deleted_at: null,
        },
      ],
    });

    const result = await pullRemoteChanges(db as never, api, householdId);

    expect(result.applied).toBe(0);
    expect(
      db.prepare('SELECT amount, note FROM transactions WHERE id = ?;').get('transaction-uuid'),
    ).toEqual({
      amount: 900,
      note: 'Local edit',
    });
    expect(db.prepare('SELECT id FROM outbox WHERE id = ?;').get('pending-local-edit')).toEqual({
      id: 'pending-local-edit',
    });
    db.close();
  });

  it('applies soft-delete timestamps without physically deleting rows', async () => {
    const db = createDatabase();
    db.prepare(
      `INSERT INTO transactions
        (id, household_id, occurred_at, amount, direction, note, updated_at)
       VALUES ('transaction-uuid', ?, ?, 500, 'expense', 'Deleted remotely', ?);`,
    ).run(householdId, lastPull, lastPull);
    const deletedAt = '2026-10-25T10:04:00.000Z';
    const { api } = createPullApi({
      transactions: [
        {
          id: 'transaction-uuid',
          household_id: householdId,
          occurred_at: lastPull,
          amount: 500,
          direction: 'expense',
          line_id: null,
          debt_id: null,
          note: 'Deleted remotely',
          source: 'manual',
          raw_text: null,
          status: 'confirmed',
          override_reason: null,
          created_at: lastPull,
          updated_at: remoteUpdate,
          deleted_at: deletedAt,
        },
      ],
    });

    const result = await pullRemoteChanges(db as never, api, householdId);

    expect(result.applied).toBe(1);
    expect(
      db.prepare('SELECT deleted_at FROM transactions WHERE id = ?;').get('transaction-uuid'),
    ).toEqual({ deleted_at: deletedAt });
    expect(db.prepare('SELECT COUNT(*) AS count FROM transactions;').get()).toEqual({ count: 1 });
    db.close();
  });

  it('merges remote settings into the existing local key rather than duplicating the setting', async () => {
    const db = createDatabase();
    db.prepare(
      `INSERT INTO settings
        (id, household_id, key, value, created_at, updated_at)
       VALUES ('setting-local', ?, 'daily-summary', 'off', ?, ?);`,
    ).run(householdId, lastPull, lastPull);
    const { api } = createPullApi({
      settings: [
        {
          id: 'f6000000-0000-4000-8000-000000000006',
          household_id: householdId,
          key: 'daily-summary',
          value: 'on',
          created_at: lastPull,
          updated_at: remoteUpdate,
          deleted_at: null,
        },
      ],
    });

    const result = await pullRemoteChanges(db as never, api, householdId);

    expect(result.applied).toBe(1);
    expect(
      db
        .prepare('SELECT id, value FROM settings WHERE household_id = ? AND key = ?;')
        .all(householdId, 'daily-summary'),
    ).toEqual([{ id: 'setting-local', value: 'on' }]);
    db.close();
  });

  it('pages through out-of-order remote rows and advances to the newest timestamp', async () => {
    const db = createDatabase();
    const rows = [
      {
        id: 'transaction-uuid-1',
        household_id: householdId,
        occurred_at: lastPull,
        amount: 200,
        direction: 'expense',
        line_id: null,
        debt_id: null,
        note: 'First page',
        source: 'manual',
        raw_text: null,
        status: 'confirmed',
        override_reason: null,
        created_at: lastPull,
        updated_at: '2026-10-25T10:03:00.000Z',
        deleted_at: null,
      },
      {
        id: 'transaction-uuid-2',
        household_id: householdId,
        occurred_at: lastPull,
        amount: 300,
        direction: 'expense',
        line_id: null,
        debt_id: null,
        note: 'Later update',
        source: 'manual',
        raw_text: null,
        status: 'confirmed',
        override_reason: null,
        created_at: lastPull,
        updated_at: '2026-10-25T10:09:00.000Z',
        deleted_at: null,
      },
    ];
    const { api, requests } = createPullApi({ transactions: rows });

    const result = await pullRemoteChanges(db as never, api, householdId, { pageSize: 1 });

    expect(result).toEqual({ fetched: 2, applied: 2, error: null });
    expect(
      requests.filter((request) => request.table === 'transactions').map(({ offset }) => offset),
    ).toEqual([0, 1, 2]);
    expect(
      db.prepare('SELECT last_pull_at FROM sync_state WHERE table_name = ?;').get('transactions'),
    ).toEqual({ last_pull_at: '2026-10-25T10:09:00.000Z' });
    db.close();
  });

  it('does not advance the cursor when a table fetch fails', async () => {
    const db = createDatabase();
    const api: PullApi = {
      fetchUpdated: async (table) => ({
        rows: [],
        error: table === 'transactions' ? 'Network unavailable.' : null,
      }),
    };

    const result = await pullRemoteChanges(db as never, api, householdId);

    expect(result.error).toBe('Unable to pull transactions: Network unavailable.');
    expect(
      db.prepare('SELECT last_pull_at FROM sync_state WHERE table_name = ?;').get('transactions'),
    ).toEqual({ last_pull_at: lastPull });
    db.close();
  });

  it('rolls back a table page and cursor when the server returns a row for another household', async () => {
    const db = createDatabase();
    const { api } = createPullApi({
      transactions: [
        {
          id: 'transaction-valid',
          household_id: householdId,
          occurred_at: lastPull,
          amount: 200,
          direction: 'expense',
          line_id: null,
          debt_id: null,
          note: 'Valid row',
          source: 'manual',
          raw_text: null,
          status: 'confirmed',
          override_reason: null,
          created_at: lastPull,
          updated_at: remoteUpdate,
          deleted_at: null,
        },
        {
          id: 'transaction-foreign',
          household_id: 'another-household',
          occurred_at: lastPull,
          amount: 900,
          direction: 'expense',
          line_id: null,
          debt_id: null,
          note: 'Wrong household',
          source: 'manual',
          raw_text: null,
          status: 'confirmed',
          override_reason: null,
          created_at: lastPull,
          updated_at: '2026-10-25T10:06:00.000Z',
          deleted_at: null,
        },
      ],
    });

    const result = await pullRemoteChanges(db as never, api, householdId);

    expect(result.error).toContain('unexpected household');
    expect(db.prepare('SELECT COUNT(*) AS count FROM transactions;').get()).toEqual({ count: 0 });
    expect(
      db.prepare('SELECT last_pull_at FROM sync_state WHERE table_name = ?;').get('transactions'),
    ).toEqual({ last_pull_at: lastPull });
    db.close();
  });
});
