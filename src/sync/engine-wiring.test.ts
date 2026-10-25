import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureRemoteHouseholdMapping } from '../auth/householdBootstrap';
import { initializeLocalApp } from '../data/bootstrap';
import { onOutboxAppended } from '../data/outboxEvents';
import { settings } from '../data/repos';

import { createSyncEngine } from './engine';
import { pullRemoteChanges, type PullApi } from './pull';
import { countPendingChanges, pushOutbox, type PushApi } from './push';

const remoteHousehold = 'c3000000-0000-4000-8000-000000000003';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// Real database, real push and pull code, fake network: proves a local write reaches the server
// through the engine, survives an outage, and is not sent twice.
describe('sync engine with real push and pull', () => {
  it('uploads a write after the debounce, retries after failure, and never duplicates', async () => {
    const db = new Database(':memory:');
    initializeLocalApp(db as never);
    await ensureRemoteHouseholdMapping(db as never, 'a1000000-0000-4000-8000-000000000001', {
      createHousehold: async () => remoteHousehold,
    });
    db.prepare('DELETE FROM outbox;').run();

    const remote = new Map<string, Record<string, unknown>>();
    let failing = true;
    const api: PushApi = {
      upsert: vi.fn(async (_table, row) => {
        if (failing) return { error: { message: 'network down' } };
        remote.set(String(row.id), row);
        return { error: null };
      }),
      updateHousehold: vi.fn(async () => ({ error: null })),
    };
    const pullApi: PullApi = { fetchUpdated: vi.fn(async () => ({ rows: [], error: null })) };

    const engine = createSyncEngine({
      push: async () => pushOutbox(db as never, api),
      pull: async () => pullRemoteChanges(db as never, pullApi, remoteHousehold),
      pendingCount: () => countPendingChanges(db as never),
    });
    const stop = onOutboxAppended(() => engine.requestSync());
    engine.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.getSnapshot().status).toBe('synced');

    settings.set(db as never, remoteHousehold, 'lending_cap_monthly', '50000');
    expect(engine.getSnapshot()).toMatchObject({ status: 'pending', pending: 1 });

    await vi.advanceTimersByTimeAsync(2000);
    expect(engine.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'network down',
      pending: 1,
    });

    failing = false;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(engine.getSnapshot()).toMatchObject({ status: 'synced', pending: 0, error: null });
    expect(remote.size).toBe(1);
    const sentCalls = vi
      .mocked(api.upsert)
      .mock.calls.filter(([, row]) => row.key === 'lending_cap_monthly');
    expect(sentCalls.length).toBe(2); // one failed attempt, one success

    await vi.advanceTimersByTimeAsync(60_000);
    expect(
      vi.mocked(api.upsert).mock.calls.filter(([, row]) => row.key === 'lending_cap_monthly'),
    ).toHaveLength(2);
    stop();
    engine.dispose();
  });

  it('queues writes made offline and uploads them when the connection returns', async () => {
    const db = new Database(':memory:');
    initializeLocalApp(db as never);
    await ensureRemoteHouseholdMapping(db as never, 'a1000000-0000-4000-8000-000000000001', {
      createHousehold: async () => remoteHousehold,
    });
    db.prepare('DELETE FROM outbox;').run();
    const upsert = vi.fn(async () => ({ error: null }));
    const api: PushApi = { upsert, updateHousehold: vi.fn(async () => ({ error: null })) };
    const pullApi: PullApi = { fetchUpdated: async () => ({ rows: [], error: null }) };
    const engine = createSyncEngine({
      push: async () => pushOutbox(db as never, api),
      pull: async () => pullRemoteChanges(db as never, pullApi, remoteHousehold),
      pendingCount: () => countPendingChanges(db as never),
    });
    const stop = onOutboxAppended(() => engine.requestSync());
    engine.setEnabled(true);
    engine.setOnline(false);
    await vi.advanceTimersByTimeAsync(0);

    settings.set(db as never, remoteHousehold, 'a', '1');
    settings.set(db as never, remoteHousehold, 'b', '2');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(upsert).not.toHaveBeenCalled();
    expect(engine.getSnapshot()).toMatchObject({ status: 'offline', pending: 2 });

    engine.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(engine.getSnapshot()).toMatchObject({ status: 'synced', pending: 0 });
    stop();
    engine.dispose();
  });
});
