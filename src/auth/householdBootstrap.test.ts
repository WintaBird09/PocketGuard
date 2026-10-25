import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import { initializeLocalApp } from '../data/bootstrap';
import { createLoan, listLoans, recordLoanRepayment } from '../data/loans';

import {
  ensureRemoteHouseholdMapping,
  householdMappingKey,
  readLocalHousehold,
} from './householdBootstrap';

const remoteHouseholdId = 'c3000000-0000-4000-8000-000000000003';
const userId = 'a1000000-0000-4000-8000-000000000001';

function createDatabaseWithRowsEverywhere() {
  const db = new Database(':memory:');
  const local = initializeLocalApp(db as never);
  const timestamp = new Date().toISOString();

  db.prepare(
    `INSERT INTO transactions
      (id, household_id, occurred_at, amount, direction, created_at, updated_at)
     VALUES ('transaction-existing', ?, ?, 1200, 'expense', ?, ?);`,
  ).run(local.householdId, timestamp, timestamp, timestamp);
  db.prepare(
    `INSERT INTO settings (id, household_id, key, value, created_at, updated_at)
     VALUES ('setting-existing', ?, 'test-setting', 'value', ?, ?);`,
  ).run(local.householdId, timestamp, timestamp);
  db.prepare(
    `INSERT INTO sync_state (table_name, household_id, last_pull_at, created_at, updated_at)
     VALUES ('transactions', ?, ?, ?, ?);`,
  ).run(local.householdId, timestamp, timestamp, timestamp);

  return { db, local };
}

const householdIdTables = [
  'households',
  'budget_lines',
  'allocations',
  'transactions',
  'debts',
  'savings_goals',
  'savings_commitments',
  'settings',
  'loans',
  'loan_installments',
  'loan_payments',
  'sync_state',
  'outbox',
] as const;

function getTableCounts(db: Database.Database) {
  return Object.fromEntries(
    householdIdTables.map((table) => [
      table,
      db.prepare(`SELECT COUNT(*) AS count FROM ${table};`).get(),
    ]),
  );
}

function expectHouseholdReferences(
  db: Database.Database,
  householdId: string,
  expectedCounts: Record<string, unknown>,
) {
  for (const table of householdIdTables) {
    const expectedCount = expectedCounts[table];
    expect(
      db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE household_id = ?;`).get(householdId),
      `${table} should preserve all rows under the expected household`,
    ).toEqual(expectedCount);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table};`).get()).toEqual(expectedCount);
  }
  expect(db.prepare('SELECT id FROM households;').all()).toEqual([{ id: householdId }]);
  expect(db.prepare(`SELECT row_id FROM outbox WHERE table_name = 'households';`).all()).toEqual([
    { row_id: householdId },
  ]);
}

describe('authenticated household bootstrap', () => {
  it('re-keys every existing local table in one transaction and persists an idempotent mapping', async () => {
    const { db, local } = createDatabaseWithRowsEverywhere();
    const countsBefore = getTableCounts(db);
    const countsAfter = {
      ...countsBefore,
      sync_state: { count: (countsBefore.sync_state as { count: number }).count + 1 },
    };
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
        .get(householdMappingKey(remoteHouseholdId, userId)),
    ).toEqual({ household_id: remoteHouseholdId });
    expect(getTableCounts(db)).toEqual(countsAfter);
    expectHouseholdReferences(db, remoteHouseholdId, countsAfter);

    const retry = vi.fn().mockResolvedValue('f6000000-0000-4000-8000-000000000006');
    await expect(
      ensureRemoteHouseholdMapping(db as never, userId, { createHousehold: retry }),
    ).resolves.toBe(remoteHouseholdId);
    expect(retry).not.toHaveBeenCalled();
    expect(getTableCounts(db)).toEqual(countsAfter);
  });

  it('keeps local data and does not persist a mapping when server bootstrap fails', async () => {
    const db = new Database(':memory:');
    const local = initializeLocalApp(db as never);
    const createHousehold = vi.fn().mockRejectedValue(new Error('Network unavailable'));

    await expect(
      ensureRemoteHouseholdMapping(db as never, userId, { createHousehold }),
    ).rejects.toThrow('Network unavailable');

    expect(db.prepare('SELECT id FROM households;').all()).toEqual([{ id: local.householdId }]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM outbox;').get()).toEqual({ count: 85 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM sync_state;').get()).toEqual({ count: 0 });
  });

  it('finishes re-keying from a mapping created by the previous bootstrap implementation', async () => {
    const { db, local } = createDatabaseWithRowsEverywhere();
    const timestamp = new Date().toISOString();
    db.prepare(
      `INSERT INTO sync_state (table_name, household_id, last_pull_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?);`,
    ).run(
      householdMappingKey(local.householdId, userId),
      remoteHouseholdId,
      timestamp,
      timestamp,
      timestamp,
    );
    const countsBefore = getTableCounts(db);
    const createHousehold = vi.fn();

    await expect(
      ensureRemoteHouseholdMapping(db as never, userId, { createHousehold }),
    ).resolves.toBe(remoteHouseholdId);

    expect(createHousehold).not.toHaveBeenCalled();
    expect(getTableCounts(db)).toEqual(countsBefore);
    expectHouseholdReferences(db, remoteHouseholdId, countsBefore);
    expect(
      db
        .prepare('SELECT household_id FROM sync_state WHERE table_name = ?;')
        .get(householdMappingKey(remoteHouseholdId, userId)),
    ).toEqual({ household_id: remoteHouseholdId });
  });

  it('rolls back a failed re-key and safely retries without losing or duplicating rows', async () => {
    const { db, local } = createDatabaseWithRowsEverywhere();
    const countsBefore = getTableCounts(db);
    const countsAfter = {
      ...countsBefore,
      sync_state: { count: (countsBefore.sync_state as { count: number }).count + 1 },
    };
    const createHousehold = vi.fn().mockResolvedValue(remoteHouseholdId);
    db.exec(
      `CREATE TRIGGER fail_household_rekey
       BEFORE UPDATE OF household_id ON settings
       BEGIN
         SELECT RAISE(ABORT, 'simulated local re-key failure');
       END;`,
    );

    await expect(
      ensureRemoteHouseholdMapping(db as never, userId, { createHousehold }),
    ).rejects.toThrow('simulated local re-key failure');
    expect(getTableCounts(db)).toEqual(countsBefore);
    expect(db.prepare('SELECT id FROM households;').all()).toEqual([{ id: local.householdId }]);
    expect(
      db
        .prepare('SELECT COUNT(*) AS count FROM sync_state WHERE table_name LIKE ?;')
        .get(`remote-household:${userId}:%`),
    ).toEqual({ count: 0 });
    expectHouseholdReferences(db, local.householdId, countsBefore);

    db.exec('DROP TRIGGER fail_household_rekey;');
    await expect(
      ensureRemoteHouseholdMapping(db as never, userId, { createHousehold }),
    ).resolves.toBe(remoteHouseholdId);
    expect(createHousehold).toHaveBeenCalledTimes(2);
    expect(getTableCounts(db)).toEqual(countsAfter);
    expectHouseholdReferences(db, remoteHouseholdId, countsAfter);
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

describe('household re-key keeps loans visible', () => {
  it('moves loans, installments and repayments to the linked household', async () => {
    const db = new Database(':memory:');
    const local = initializeLocalApp(db as never);
    const loanId = createLoan(db as never, local.householdId, {
      personName: 'Petra',
      lentOn: '2026-10-01',
      amount: 100000,
      plan: 'installments',
      firstDueOn: '2026-11-05',
      installmentCount: 4,
    });
    recordLoanRepayment(db as never, local.householdId, { loanId, amount: 25000 });

    await ensureRemoteHouseholdMapping(db as never, userId, {
      createHousehold: async () => remoteHouseholdId,
    });

    const loans = listLoans(db as never, remoteHouseholdId, '2026-10-25');
    expect(loans).toHaveLength(1);
    expect(loans[0].installments).toHaveLength(4);
    expect(loans[0].paid).toBe(25000);
    for (const table of ['loans', 'loan_installments', 'loan_payments']) {
      expect(
        db
          .prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE household_id <> ?;`)
          .get(remoteHouseholdId),
      ).toEqual({ c: 0 });
    }
  });
});
