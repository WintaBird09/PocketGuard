import type { DatabaseLike } from '@/src/data/db';

export type LocalHousehold = {
  id: string;
  name: string;
  currency: string;
  monthStartDay: number;
};

export type HouseholdBootstrapApi = {
  createHousehold: (household: LocalHousehold) => Promise<string>;
};

export function readLocalHousehold(db: DatabaseLike): LocalHousehold {
  const row = db
    .prepare?.(
      `SELECT id, name, currency, month_start_day
       FROM households
       WHERE deleted_at IS NULL
       ORDER BY created_at
       LIMIT 1;`,
    )
    .get();

  if (
    !row ||
    typeof row.id !== 'string' ||
    typeof row.name !== 'string' ||
    typeof row.currency !== 'string' ||
    typeof row.month_start_day !== 'number'
  ) {
    throw new Error('The local household is not ready to link to your account.');
  }

  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    monthStartDay: row.month_start_day,
  };
}

export function householdMappingKey(localHouseholdId: string, userId: string): string {
  return `remote-household:${userId}:${localHouseholdId}`;
}

const householdOwnedTables = [
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

export async function ensureRemoteHouseholdMapping(
  db: DatabaseLike,
  userId: string,
  api: HouseholdBootstrapApi,
): Promise<string> {
  if (!db.prepare || !db.transaction) {
    throw new Error('Database does not support household mapping.');
  }
  const prepare = db.prepare.bind(db);
  const transaction = db.transaction.bind(db);

  const localHousehold = readLocalHousehold(db);
  const mappingKey = householdMappingKey(localHousehold.id, userId);
  const existingMapping = prepare(
    'SELECT household_id FROM sync_state WHERE table_name = ? AND deleted_at IS NULL;',
  ).get(mappingKey);

  if (typeof existingMapping?.household_id === 'string') {
    rekeyLocalHousehold(
      prepare,
      transaction,
      localHousehold.id,
      userId,
      existingMapping.household_id,
    );
    return existingMapping.household_id;
  }

  const remoteHouseholdId = await api.createHousehold(localHousehold);
  if (!isUuid(remoteHouseholdId)) {
    throw new Error('Supabase returned an invalid household ID.');
  }

  rekeyLocalHousehold(prepare, transaction, localHousehold.id, userId, remoteHouseholdId);
  return remoteHouseholdId;
}

function rekeyLocalHousehold(
  prepare: NonNullable<DatabaseLike['prepare']>,
  transaction: NonNullable<DatabaseLike['transaction']>,
  localHouseholdId: string,
  userId: string,
  remoteHouseholdId: string,
): void {
  const timestamp = new Date().toISOString();
  const originalMappingKey = householdMappingKey(localHouseholdId, userId);
  const remoteMappingKey = householdMappingKey(remoteHouseholdId, userId);

  transaction(() => {
    const rootHousehold = prepare(
      'SELECT id FROM households WHERE id = ? AND deleted_at IS NULL LIMIT 1;',
    ).get(localHouseholdId);
    if (!rootHousehold) {
      const completedMapping = prepare(
        'SELECT household_id FROM sync_state WHERE table_name = ? AND deleted_at IS NULL LIMIT 1;',
      ).get(remoteMappingKey);
      if (completedMapping?.household_id === remoteHouseholdId) return;
      throw new Error('The local household changed before it could be linked.');
    }

    const conflictingHousehold = prepare(
      'SELECT id FROM households WHERE id = ? AND id != ? LIMIT 1;',
    ).get(remoteHouseholdId, localHouseholdId);
    if (conflictingHousehold) {
      throw new Error('The server household ID already belongs to another local household.');
    }

    prepare('UPDATE households SET id = ? WHERE id = ?;').run(remoteHouseholdId, localHouseholdId);
    prepare('UPDATE households SET household_id = ? WHERE household_id = ?;').run(
      remoteHouseholdId,
      localHouseholdId,
    );

    for (const table of householdOwnedTables) {
      prepare(`UPDATE ${table} SET household_id = ? WHERE household_id = ?;`).run(
        remoteHouseholdId,
        localHouseholdId,
      );
    }

    prepare(
      `UPDATE outbox
       SET row_id = ?
       WHERE household_id = ?
         AND table_name = 'households'
         AND row_id = ?;`,
    ).run(remoteHouseholdId, remoteHouseholdId, localHouseholdId);

    const priorMapping = prepare(
      'SELECT household_id FROM sync_state WHERE table_name = ? AND deleted_at IS NULL LIMIT 1;',
    ).get(originalMappingKey);
    const conflictingMapping =
      originalMappingKey === remoteMappingKey
        ? undefined
        : prepare(
            'SELECT household_id FROM sync_state WHERE table_name = ? AND deleted_at IS NULL LIMIT 1;',
          ).get(remoteMappingKey);

    if (conflictingMapping) {
      throw new Error('A server household mapping already exists for this user and household.');
    }

    if (priorMapping) {
      prepare(
        `UPDATE sync_state
         SET table_name = ?, household_id = ?, last_pull_at = ?, updated_at = ?, deleted_at = NULL
         WHERE table_name = ?;`,
      ).run(remoteMappingKey, remoteHouseholdId, timestamp, timestamp, originalMappingKey);
    } else {
      prepare(
        `INSERT INTO sync_state
          (table_name, household_id, last_pull_at, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, NULL);`,
      ).run(remoteMappingKey, remoteHouseholdId, timestamp, timestamp, timestamp);
    }
  })();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
