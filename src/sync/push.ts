import type { DatabaseLike } from '@/src/data/db';

type LocalRow = Record<string, unknown>;
type SupportedTable =
  | 'households'
  | 'budget_lines'
  | 'allocations'
  | 'transactions'
  | 'debts'
  | 'savings_goals'
  | 'savings_commitments'
  | 'settings';

type PushError = {
  message: string;
};

export type PushResult = {
  sent: number;
  remaining: number;
  retryAt: string | null;
  error: string | null;
};

export type PushApi = {
  upsert: (
    table: SupportedTable,
    row: LocalRow,
    options: { onConflict: 'id' },
  ) => Promise<{ error: PushError | null }>;
  updateHousehold: (row: LocalRow) => Promise<{ error: PushError | null }>;
};

type OutboxRow = {
  id: string;
  household_id: string;
  table_name: string;
  row_id: string;
  op: string;
};

type SyncStatement = {
  all: (...values: unknown[]) => Record<string, unknown>[];
  get: (...values: unknown[]) => Record<string, unknown> | undefined;
  run: (...values: unknown[]) => unknown;
};

const supportedTables = new Set<SupportedTable>([
  'households',
  'budget_lines',
  'allocations',
  'transactions',
  'debts',
  'savings_goals',
  'savings_commitments',
  'settings',
]);

// Outbox rows for other tables (e.g. loans, until Task 10.4) stay queued untouched: they are
// neither pushed nor reported as errors or pending.
const supportedTableList = [...supportedTables].map((table) => `'${table}'`).join(', ');

const idReferences: Partial<Record<SupportedTable, Record<string, SupportedTable>>> = {
  allocations: { line_id: 'budget_lines' },
  transactions: { line_id: 'budget_lines', debt_id: 'debts' },
  savings_commitments: { goal_id: 'savings_goals', line_id: 'budget_lines' },
};

const booleanColumns: Partial<Record<SupportedTable, string[]>> = {
  budget_lines: ['hard_cap', 'archived'],
  savings_goals: ['include_kids_savings'],
};

const baseRetryDelayMs = 1_000;
const maximumRetryDelayMs = 5 * 60_000;
const defaultBatchSize = 50;

export async function pushOutbox(
  db: DatabaseLike,
  api: PushApi,
  options: { now?: Date; batchSize?: number } = {},
): Promise<PushResult> {
  if (!db.prepare || !db.transaction) {
    throw new Error('Database does not support the sync outbox.');
  }

  const prepare = db.prepare.bind(db) as (sql: string) => SyncStatement;
  const transaction = db.transaction.bind(db);
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? defaultBatchSize;
  const queued = prepare(
    `SELECT id, household_id, table_name, row_id, op
     FROM outbox
     WHERE table_name IN (${supportedTableList})
     ORDER BY
       CASE table_name
         WHEN 'households' THEN 0
         WHEN 'budget_lines' THEN 1
         WHEN 'debts' THEN 2
         WHEN 'savings_goals' THEN 3
         WHEN 'allocations' THEN 4
         WHEN 'savings_commitments' THEN 5
         WHEN 'transactions' THEN 6
         WHEN 'settings' THEN 7
         ELSE 8
       END,
       created_at,
       id
     LIMIT ?;`,
  ).all(batchSize) as OutboxRow[];

  let sent = 0;
  for (const entry of queued) {
    const retryKey = retryMetadataKey(entry.id);
    const retryMetadata = prepare(
      'SELECT last_pull_at, device_id FROM sync_state WHERE table_name = ? AND deleted_at IS NULL;',
    ).get(retryKey);
    const retryAt =
      typeof retryMetadata?.last_pull_at === 'string' ? new Date(retryMetadata.last_pull_at) : null;
    if (retryAt && retryAt.getTime() > now.getTime()) continue;

    try {
      const table = getSupportedTable(entry.table_name);
      const localRow = prepare(
        `SELECT * FROM ${table} WHERE id = ? AND household_id = ? LIMIT 1;`,
      ).get(entry.row_id, entry.household_id);
      if (!localRow) {
        throw new Error(`Queued ${table} row ${entry.row_id} no longer exists locally.`);
      }

      const payload = await toRemoteRow(db, entry.household_id, table, localRow, now.toISOString());

      const result =
        table === 'households'
          ? await api.updateHousehold(payload)
          : await api.upsert(table, payload, { onConflict: 'id' });
      if (result.error) throw new Error(result.error.message);

      transaction(() => {
        prepare('DELETE FROM outbox WHERE id = ?;').run(entry.id);
        prepare('DELETE FROM sync_state WHERE table_name = ?;').run(retryKey);
      })();
      sent += 1;
    } catch (cause) {
      const attempt = parseAttempt(retryMetadata?.device_id) + 1;
      const delay = Math.min(baseRetryDelayMs * 2 ** (attempt - 1), maximumRetryDelayMs);
      const nextRetryAt = new Date(now.getTime() + delay).toISOString();
      persistRetry(prepare, transaction, retryKey, entry.household_id, attempt, nextRetryAt);
      const remaining = countOutbox(prepare);
      return {
        sent,
        remaining,
        retryAt: nextRetryAt,
        error: cause instanceof Error ? cause.message : 'Unable to push queued data.',
      };
    }
  }

  return {
    sent,
    remaining: countOutbox(prepare),
    retryAt: earliestRetryAt(prepare),
    error: null,
  };
}

function getSupportedTable(tableName: string): SupportedTable {
  if (!supportedTables.has(tableName as SupportedTable)) {
    throw new Error(`Unsupported outbox table: ${tableName}.`);
  }
  return tableName as SupportedTable;
}

async function toRemoteRow(
  db: DatabaseLike,
  householdId: string,
  table: SupportedTable,
  localRow: LocalRow,
  timestamp: string,
): Promise<LocalRow> {
  const id = typeof localRow.id === 'string' ? localRow.id : null;
  if (!id) throw new Error(`The ${table} row has no ID.`);

  const payload: LocalRow = { ...localRow };
  payload.id = await remoteIdFor(db, householdId, table, id, timestamp);
  payload.household_id = householdId;

  for (const [column, referencedTable] of Object.entries(idReferences[table] ?? {})) {
    const referencedId = payload[column];
    if (typeof referencedId === 'string' && referencedId.length > 0) {
      payload[column] = await remoteIdFor(
        db,
        householdId,
        referencedTable,
        referencedId,
        timestamp,
      );
    }
  }

  for (const column of booleanColumns[table] ?? []) {
    if (column in payload) payload[column] = Boolean(payload[column]);
  }

  return payload;
}

async function remoteIdFor(
  db: DatabaseLike,
  householdId: string,
  table: SupportedTable,
  localId: string,
  timestamp: string,
): Promise<string> {
  if (isUuid(localId)) return localId;
  if (!db.prepare || !db.transaction) {
    throw new Error('Database does not support stable ID mapping.');
  }

  const prepare = db.prepare.bind(db) as (sql: string) => SyncStatement;
  const transaction = db.transaction.bind(db);
  const mappingKey = remoteIdMappingKey(table, localId);
  const existing = prepare(
    'SELECT household_id FROM sync_state WHERE table_name = ? AND deleted_at IS NULL;',
  ).get(mappingKey);
  if (typeof existing?.household_id === 'string') return existing.household_id;

  const remoteId = createUuid();
  transaction(() => {
    prepare(
      `INSERT INTO sync_state
        (table_name, household_id, last_pull_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(table_name) DO NOTHING;`,
    ).run(mappingKey, remoteId, timestamp, timestamp, timestamp);
  })();

  const stored = prepare(
    'SELECT household_id FROM sync_state WHERE table_name = ? AND deleted_at IS NULL;',
  ).get(mappingKey);
  if (typeof stored?.household_id !== 'string') {
    throw new Error(`Unable to persist the remote ID mapping for ${table}:${localId}.`);
  }
  return stored.household_id;
}

function persistRetry(
  prepare: (sql: string) => SyncStatement,
  transaction: NonNullable<DatabaseLike['transaction']>,
  key: string,
  householdId: string,
  attempt: number,
  retryAt: string,
): void {
  transaction(() => {
    prepare(
      `INSERT INTO sync_state
        (table_name, household_id, last_pull_at, device_id, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(table_name) DO UPDATE SET
         household_id = excluded.household_id,
         last_pull_at = excluded.last_pull_at,
         device_id = excluded.device_id,
         updated_at = excluded.updated_at,
         deleted_at = NULL;`,
    ).run(key, householdId, retryAt, String(attempt), retryAt, retryAt);
  })();
}

function countOutbox(prepare: (sql: string) => SyncStatement): number {
  const result = prepare(
    `SELECT COUNT(*) AS count FROM outbox WHERE table_name IN (${supportedTableList});`,
  ).get();
  if (typeof result?.count !== 'number') throw new Error('Unable to count pending sync rows.');
  return result.count;
}

function earliestRetryAt(prepare: (sql: string) => SyncStatement): string | null {
  const result = prepare(
    `SELECT MIN(last_pull_at) AS retry_at
     FROM sync_state
     WHERE table_name LIKE 'push-retry:%' AND deleted_at IS NULL;`,
  ).get();
  return typeof result?.retry_at === 'string' ? result.retry_at : null;
}

function parseAttempt(value: unknown): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : 0;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function retryMetadataKey(outboxId: string): string {
  return `push-retry:${outboxId}`;
}

function remoteIdMappingKey(table: SupportedTable, localId: string): string {
  return `remote-id:${table}:${localId}`;
}

function createUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
