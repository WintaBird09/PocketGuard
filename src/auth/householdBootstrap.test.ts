import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import { initializeLocalApp } from '../data/bootstrap';

import {
  ensureRemoteHouseholdMapping,
  householdMappingKey,
  readLocalHousehold,
} from './householdBootstrap';

const remoteHouseholdId = 'c3000000-0000-4000-8000-000000000003';
const userId = 'a1000000-0000-4000-8000-000000000001';

describe('authenticated household bootstrap', () => {
  it('creates a remote household once and persists its mapping without changing local data', async () => {
    const db = new Database(':memory:');
    const local = initializeLocalApp(db as never);
    const createHousehold = vi.fn().mockResolvedValue(remoteHouseholdId);

    await expect(
      ensureRemoteHouseholdMapping(db as never, userId, { createHousehold }),
    ).resolves.toBe(remoteHouseholdId);

    expect(createHousehold).toHaveBeenCalledWith({
      id: local.householdId,
      name: 'Pocket Guard Household',
      currency: 'XAF',
      monthStartDay: 1,
    });
    expect(
      db
        .prepare('SELECT household_id FROM sync_state WHERE table_name = ?;')
        .get(householdMappingKey(local.householdId, userId)),
    ).toEqual({ household_id: remoteHouseholdId });
    expect(db.prepare('SELECT id FROM households;').all()).toEqual([{ id: local.householdId }]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM outbox;').get()).toEqual({ count: 33 });

    const retry = vi.fn().mockResolvedValue('f6000000-0000-4000-8000-000000000006');
    await expect(
      ensureRemoteHouseholdMapping(db as never, userId, { createHousehold: retry }),
    ).resolves.toBe(remoteHouseholdId);
    expect(retry).not.toHaveBeenCalled();
  });

  it('keeps local data and does not persist a mapping when server bootstrap fails', async () => {
    const db = new Database(':memory:');
    const local = initializeLocalApp(db as never);
    const createHousehold = vi.fn().mockRejectedValue(new Error('Network unavailable'));

    await expect(
      ensureRemoteHouseholdMapping(db as never, userId, { createHousehold }),
    ).rejects.toThrow('Network unavailable');

    expect(db.prepare('SELECT id FROM households;').all()).toEqual([{ id: local.householdId }]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM outbox;').get()).toEqual({ count: 33 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM sync_state;').get()).toEqual({ count: 0 });
  });

  it('rejects an invalid server ID before storing a mapping', async () => {
    const db = new Database(':memory:');
    initializeLocalApp(db as never);

    await expect(
      ensureRemoteHouseholdMapping(db as never, userId, {
        createHousehold: async () => 'not-a-uuid',
      }),
    ).rejects.toThrow('Supabase returned an invalid household ID.');
    expect(db.prepare('SELECT COUNT(*) AS count FROM sync_state;').get()).toEqual({ count: 0 });
  });

  it('reads the existing seeded household details for bootstrap', () => {
    const db = new Database(':memory:');
    initializeLocalApp(db as never);

    expect(readLocalHousehold(db as never)).toEqual({
      id: 'household-seed',
      name: 'Pocket Guard Household',
      currency: 'XAF',
      monthStartDay: 1,
    });
  });
});
