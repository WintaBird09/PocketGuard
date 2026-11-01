import { describe, expect, it } from 'vitest';

import {
  databaseNameForUser,
  getActiveDatabaseName,
  hasActiveDatabase,
  legacyDatabaseName,
  resolveUserDatabaseName,
  setActiveDatabaseName,
  type KeyValueStore,
} from './activeDatabase';

const userA = 'a1000000-0000-4000-8000-000000000001';
const userB = 'b2000000-0000-4000-8000-000000000002';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
  };
}

describe('active database', () => {
  it('refuses to hand out a database when nobody is signed in', () => {
    setActiveDatabaseName(null);
    expect(hasActiveDatabase()).toBe(false);
    expect(() => getActiveDatabaseName()).toThrow('Sign in');
    setActiveDatabaseName('x.db');
    expect(getActiveDatabaseName()).toBe('x.db');
    setActiveDatabaseName(null);
  });
});

describe('resolveUserDatabaseName', () => {
  it('gives the first account the legacy database and later accounts their own file', async () => {
    const store = memoryStore();
    expect(await resolveUserDatabaseName(userA, store)).toBe(legacyDatabaseName);
    const second = await resolveUserDatabaseName(userB, store);
    expect(second).toBe(databaseNameForUser(userB));
    expect(second).not.toBe(legacyDatabaseName);
  });

  it('is stable across sign-outs and sign-ins', async () => {
    const store = memoryStore();
    const firstA = await resolveUserDatabaseName(userA, store);
    const b = await resolveUserDatabaseName(userB, store);
    expect(await resolveUserDatabaseName(userA, store)).toBe(firstA);
    expect(await resolveUserDatabaseName(userB, store)).toBe(b);
  });

  it('recovers when the first sign-in was interrupted before saving the mapping', async () => {
    const store = memoryStore();
    store.data.set('pg.localdb.legacy-owner', userA);
    expect(await resolveUserDatabaseName(userA, store)).toBe(legacyDatabaseName);
    expect(await resolveUserDatabaseName(userB, store)).toBe(databaseNameForUser(userB));
  });

  it('rejects malformed account ids', async () => {
    await expect(resolveUserDatabaseName('../evil', memoryStore())).rejects.toThrow('Invalid');
    expect(() => databaseNameForUser('a/b')).toThrow('Invalid');
  });
});
