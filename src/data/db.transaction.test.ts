import { describe, expect, it, vi } from 'vitest';

let open = false;
let begins = 0;

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => ({
    execSync: () => undefined,
    runSync: () => undefined,
    getFirstSync: () => null,
    getAllSync: () => [],
    withTransactionSync: (fn: () => void) => {
      if (open) throw new Error('cannot start a transaction within a transaction');
      open = true;
      begins += 1;
      try {
        fn();
      } finally {
        open = false;
      }
    },
  }),
}));

describe('openAppDatabase transactions', () => {
  it('lets nested transactions join the outer one', async () => {
    const { openAppDatabase } = await import('./db');
    const db = await openAppDatabase();

    const result = db.transaction!(() => db.transaction!(() => 'inner')() + '-outer')();

    expect(result).toBe('inner-outer');
    expect(begins).toBe(1);
  });

  it('starts a fresh transaction after a failed one', async () => {
    const { openAppDatabase } = await import('./db');
    const db = await openAppDatabase();

    expect(() =>
      db.transaction!(() => {
        throw new Error('boom');
      })(),
    ).toThrow('boom');
    expect(db.transaction!(() => 'ok')()).toBe('ok');
  });
});
