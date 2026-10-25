import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { ensureRemoteHouseholdMapping } from '../auth/householdBootstrap';
import { initializeLocalApp } from '../data/bootstrap';

import { pullRemoteChanges, type PullApi, type PullTable } from './pull';

const householdId = 'c3000000-0000-4000-8000-000000000003';
const userId = 'a1000000-0000-4000-8000-000000000001';
const restoredAt = '2026-10-25T11:00:00.000Z';

function createRemoteSnapshot(): Partial<Record<PullTable, Record<string, unknown>[]>> {
  const lineId = 'd4000000-0000-4000-8000-000000000004';
  const debtId = 'e5000000-0000-4000-8000-000000000005';
  const goalId = 'f6000000-0000-4000-8000-000000000006';
  const createdAt = '2026-10-01T08:00:00.000Z';
  const row = (id: string, values: Record<string, unknown>) => ({
    id,
    household_id: householdId,
    created_at: createdAt,
    updated_at: restoredAt,
    deleted_at: null,
    ...values,
  });

  return {
    households: [
      row(householdId, {
        name: 'Restored household',
        month_start_day: 1,
        currency: 'XAF',
        device_id: null,
      }),
    ],
    budget_lines: [
      row(lineId, {
        name: 'Transport',
        kind: 'running',
        hard_cap: false,
        sort_order: 1,
        archived: false,
        device_id: null,
      }),
    ],
    allocations: [
      row('a7000000-0000-4000-8000-000000000007', {
        line_id: lineId,
        month: '2026-10',
        planned_amount: 40000,
        device_id: null,
      }),
    ],
    debts: [
      row(debtId, {
        creditor: 'Petra',
        original_amount: 30000,
        deadline: '2026-12-01',
        note: null,
        device_id: null,
      }),
    ],
    savings_goals: [
      row(goalId, {
        name: 'Family savings',
        target_amount: 200000,
        due_date: '2026-12-31',
        include_kids_savings: false,
        device_id: null,
      }),
    ],
    savings_commitments: [
      row('b8000000-0000-4000-8000-000000000008', {
        goal_id: goalId,
        line_id: lineId,
        month: '2026-10',
        planned_amount: 10000,
        saved_amount: 5000,
        saved_at: restoredAt,
        device_id: null,
      }),
    ],
    transactions: [
      row('c9000000-0000-4000-8000-000000000009', {
        occurred_at: restoredAt,
        amount: 2500,
        direction: 'expense',
        line_id: lineId,
        debt_id: debtId,
        note: 'Restored transaction',
        source: 'manual',
        raw_text: null,
        status: 'confirmed',
        override_reason: null,
        device_id: null,
      }),
      row('d0000000-0000-4000-8000-000000000010', {
        occurred_at: restoredAt,
        amount: 100,
        direction: 'expense',
        line_id: lineId,
        debt_id: null,
        note: 'Previously deleted transaction',
        source: 'manual',
        raw_text: null,
        status: 'confirmed',
        override_reason: null,
        device_id: null,
        deleted_at: restoredAt,
      }),
    ],
    settings: [
      row('e1000000-0000-4000-8000-000000000011', {
        key: 'daily-summary',
        value: 'on',
        device_id: null,
      }),
    ],
  };
}

describe('account restore pull', () => {
  it('restores every synced table and preserves remote row counts and tombstones', async () => {
    const remoteRows = createRemoteSnapshot();
    const expectedCounts = Object.fromEntries(
      Object.entries(remoteRows).map(([table, rows]) => [table, rows.length]),
    );
    const db = new Database(':memory:');
    initializeLocalApp(db as never, { loadPlan: false });
    await ensureRemoteHouseholdMapping(db as never, userId, {
      createHousehold: async () => householdId,
    });
    db.prepare('DELETE FROM outbox;').run();

    const api: PullApi = {
      fetchUpdated: async (table, requestedHouseholdId, _updatedAfter, offset, limit) => {
        if (requestedHouseholdId !== householdId) {
          return { rows: [], error: 'Unexpected household.' };
        }
        const rows = remoteRows[table] ?? [];
        return { rows: rows.slice(offset, offset + limit), error: null };
      },
    };

    const result = await pullRemoteChanges(db as never, api, householdId);

    expect(result).toEqual({
      fetched: 9,
      applied: 8,
      error: null,
    });
    for (const [table, expectedCount] of Object.entries(expectedCounts)) {
      const count = db
        .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE household_id = ?;`)
        .get(householdId);
      expect(count, `${table} restored row count`).toEqual({ count: expectedCount });
    }
    expect(
      db.prepare('SELECT id, line_id, debt_id, deleted_at FROM transactions ORDER BY id;').all(),
    ).toEqual([
      {
        id: 'c9000000-0000-4000-8000-000000000009',
        line_id: 'd4000000-0000-4000-8000-000000000004',
        debt_id: 'e5000000-0000-4000-8000-000000000005',
        deleted_at: null,
      },
      {
        id: 'd0000000-0000-4000-8000-000000000010',
        line_id: 'd4000000-0000-4000-8000-000000000004',
        debt_id: null,
        deleted_at: restoredAt,
      },
    ]);
    db.close();
  });
});
