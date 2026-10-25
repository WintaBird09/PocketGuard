import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureRemoteHouseholdMapping } from '../auth/householdBootstrap';
import { deleteTransaction, restoreTransaction, updateTransaction } from '../data/activity';
import { initializeLocalApp } from '../data/bootstrap';

import { pushOutbox, type PushApi } from './push';

const linkedHouseholdId = 'c3000000-0000-4000-8000-000000000003';
const signedInUserId = 'a1000000-0000-4000-8000-000000000001';
const startTime = new Date('2026-10-25T10:00:00.000Z');

function createTransactionDatabase() {
  const db = new Database(':memory:');
  initializeLocalApp(db as never);
  ensureRemoteHouseholdMapping(db as never, signedInUserId, {
    createHousehold: async () => linkedHouseholdId,
  });

  const timestamp = startTime.toISOString();
  db.prepare('DELETE FROM outbox;').run();
  db.prepare(
    `INSERT INTO budget_lines
      (id, household_id, name, kind, created_at, updated_at)
     VALUES ('line-real', ?, 'Transport', 'running', ?, ?);`,
  ).run(linkedHouseholdId, timestamp, timestamp);
  db.prepare(
    `INSERT INTO transactions
      (id, household_id, occurred_at, amount, direction, line_id, note, source, status, created_at, updated_at)
     VALUES ('transaction-real', ?, ?, 725, 'expense', 'line-real', 'Taxi fare', 'manual', 'confirmed', ?, ?);`,
  ).run(linkedHouseholdId, timestamp, timestamp, timestamp);
  db.prepare(
    `INSERT INTO outbox
      (id, household_id, table_name, row_id, op, created_at, updated_at)
     VALUES ('outbox-transaction-real', ?, 'transactions', 'transaction-real', 'create', ?, ?);`,
  ).run(linkedHouseholdId, timestamp, timestamp);

  return { db, householdId: linkedHouseholdId };
}

function createApi() {
  const remoteRows = new Map<string, Record<string, unknown>>();
  const api: PushApi = {
    upsert: vi.fn(async (_table, row) => {
      const id = row.id;
      if (typeof id !== 'string') return { error: { message: 'Missing remote row ID.' } };
      remoteRows.set(id, { ...remoteRows.get(id), ...row });
      return { error: null };
    }),
    updateHousehold: vi.fn(async () => ({ error: null })),
  };
  return { api, remoteRows };
}

describe('persisted outbox push', () => {
  let fixture: ReturnType<typeof createTransactionDatabase>;
  let apiState: ReturnType<typeof createApi>;

  beforeEach(() => {
    fixture?.db.close();
    fixture = createTransactionDatabase();
    apiState = createApi();
  });

  it('pushes the persisted transaction once using stable UUIDs for local IDs', async () => {
    const result = await pushOutbox(fixture.db as never, apiState.api, { now: startTime });

    expect(result).toEqual({ sent: 1, remaining: 0, retryAt: null, error: null });
    expect(apiState.api.upsert).toHaveBeenCalledOnce();
    const [table, pushedRow, options] = vi.mocked(apiState.api.upsert).mock.calls[0];
    expect(table).toBe('transactions');
    expect(options).toEqual({ onConflict: 'id' });
    expect(pushedRow).toMatchObject({
      household_id: linkedHouseholdId,
      amount: 725,
      direction: 'expense',
      note: 'Taxi fare',
    });
    expect(pushedRow.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(pushedRow.line_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(apiState.remoteRows.size).toBe(1);
    expect(fixture.db.prepare('SELECT COUNT(*) AS count FROM outbox;').get()).toEqual({
      count: 0,
    });

    const secondResult = await pushOutbox(fixture.db as never, apiState.api, { now: startTime });
    expect(secondResult.sent).toBe(0);
    expect(apiState.api.upsert).toHaveBeenCalledOnce();
    expect(apiState.remoteRows.size).toBe(1);
  });

  it('retains an offline item and retries it after its persisted backoff expires', async () => {
    const online = { value: false };
    const attemptedIds: unknown[] = [];
    apiState.api.upsert = vi.fn(async (_table, row) => {
      attemptedIds.push(row.id);
      return online.value ? { error: null } : { error: { message: 'Network unavailable.' } };
    });

    const failedPush = await pushOutbox(fixture.db as never, apiState.api, { now: startTime });
    expect(failedPush).toEqual({
      sent: 0,
      remaining: 1,
      retryAt: '2026-10-25T10:00:01.000Z',
      error: 'Network unavailable.',
    });
    expect(fixture.db.prepare('SELECT COUNT(*) AS count FROM outbox;').get()).toEqual({
      count: 1,
    });

    const beforeBackoff = await pushOutbox(fixture.db as never, apiState.api, {
      now: new Date('2026-10-25T10:00:00.500Z'),
    });
    expect(beforeBackoff.sent).toBe(0);
    expect(apiState.api.upsert).toHaveBeenCalledOnce();

    online.value = true;
    const retriedPush = await pushOutbox(fixture.db as never, apiState.api, {
      now: new Date('2026-10-25T10:00:01.000Z'),
    });
    expect(retriedPush).toEqual({ sent: 1, remaining: 0, retryAt: null, error: null });
    expect(fixture.db.prepare('SELECT COUNT(*) AS count FROM outbox;').get()).toEqual({
      count: 0,
    });
    expect(attemptedIds).toHaveLength(2);
    expect(attemptedIds[0]).toBe(attemptedIds[1]);
  });

  it('updates an existing remote row by stable ID instead of creating a duplicate', async () => {
    const remoteTransactionId = 'e4000000-0000-4000-8000-000000000004';
    fixture.db
      .prepare(
        `INSERT INTO sync_state
          (table_name, household_id, last_pull_at, created_at, updated_at)
         VALUES ('remote-id:transactions:transaction-real', ?, ?, ?, ?);`,
      )
      .run(
        remoteTransactionId,
        startTime.toISOString(),
        startTime.toISOString(),
        startTime.toISOString(),
      );
    apiState.remoteRows.set(remoteTransactionId, {
      id: remoteTransactionId,
      household_id: linkedHouseholdId,
      amount: 900,
    });

    await pushOutbox(fixture.db as never, apiState.api, { now: startTime });

    expect(apiState.remoteRows.size).toBe(1);
    expect(apiState.remoteRows.get(remoteTransactionId)).toMatchObject({ amount: 725 });
    expect(apiState.api.upsert).toHaveBeenCalledWith(
      'transactions',
      expect.objectContaining({ id: remoteTransactionId }),
      { onConflict: 'id' },
    );
  });

  it('pushes the final edit after a delete and restore without leaving a remote tombstone', async () => {
    fixture.db.prepare('DELETE FROM outbox;').run();
    expect(deleteTransaction(fixture.db as never, fixture.householdId, 'transaction-real')).toBe(
      true,
    );
    expect(restoreTransaction(fixture.db as never, fixture.householdId, 'transaction-real')).toBe(
      true,
    );
    updateTransaction(fixture.db as never, fixture.householdId, 'transaction-real', {
      amount: 950,
      note: 'Corrected after restore',
      occurredOn: '2026-10-25',
    });

    const result = await pushOutbox(fixture.db as never, apiState.api, { now: startTime });

    expect(result).toEqual({ sent: 3, remaining: 0, retryAt: null, error: null });
    expect(apiState.api.upsert).toHaveBeenCalledTimes(3);
    expect(apiState.remoteRows.size).toBe(1);
    expect([...apiState.remoteRows.values()][0]).toMatchObject({
      amount: 950,
      note: 'Corrected after restore',
      deleted_at: null,
    });
    expect(fixture.db.prepare('SELECT COUNT(*) AS count FROM outbox;').get()).toEqual({
      count: 0,
    });
  });
});
