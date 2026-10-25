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
    return existingMapping.household_id;
  }

  const remoteHouseholdId = await api.createHousehold(localHousehold);
  if (!isUuid(remoteHouseholdId)) {
    throw new Error('Supabase returned an invalid household ID.');
  }

  const timestamp = new Date().toISOString();
  transaction(() => {
    prepare(
      `INSERT INTO sync_state
        (table_name, household_id, last_pull_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(table_name) DO UPDATE SET
         household_id = excluded.household_id,
         last_pull_at = excluded.last_pull_at,
         updated_at = excluded.updated_at,
         deleted_at = NULL;`,
    ).run(mappingKey, remoteHouseholdId, timestamp, timestamp, timestamp);
  })();

  return remoteHouseholdId;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
