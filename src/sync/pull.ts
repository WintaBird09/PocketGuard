import type { DatabaseLike } from '@/src/data/db';

type LocalRow = Record<string, unknown>;
export type PullTable =
  | 'households'
  | 'budget_lines'
  | 'allocations'
  | 'transactions'
  | 'debts'
  | 'savings_goals'
  | 'savings_commitments'
  | 'settings';

export type PullApi = {
  fetchUpdated: (
    table: PullTable,
    householdId: string,
    updatedAfter: string,
    offset: number,
    limit: number,
  ) => Promise<{ rows: LocalRow[]; error: string | null }>;
};

export type PullResult = {
  fetched: number;
  applied: number;
  error: string | null;
};

type SyncStatement = {
  all: (...values: unknown[]) => Record<string, unknown>[];
  get: (...values: unknown[]) => Record<string, unknown> | undefined;
  run: (...values: unknown[]) => unknown;
};

const tableColumns: Record<PullTable, string[]> = {
  households: [
    'id',
    'household_id',
    'name',
    'month_start_day',
    'currency',
    'device_id',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  budget_lines: [
    'id',
    'household_id',
    'name',
    'kind',
    'hard_cap',
    'sort_order',
    'archived',
    'device_id',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  allocations: [
    'id',
    'household_id',
    'line_id',
    'month',
    'planned_amount',
    'device_id',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  transactions: [
    'id',
    'household_id',
    'occurred_at',
    'amount',
    'direction',
    'line_id',
    'debt_id',
    'note',
    'source',
    'raw_text',
    'status',
    'override_reason',
    'device_id',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  debts: [
    'id',
    'household_id',
    'creditor',
    'original_amount',
    'deadline',
    'note',
    'device_id',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  savings_goals: [
    'id',
    'household_id',
    'name',
    'target_amount',
    'due_date',
    'include_kids_savings',
    'device_id',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  savings_commitments: [
    'id',
    'household_id',
    'goal_id',
    'line_id',
    'month',
    'planned_amount',
    'saved_amount',
    'saved_at',
    'device_id',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
  settings: [
    'id',
    'household_id',
    'key',
    'value',
    'device_id',
    'created_at',
    'updated_at',
    'deleted_at',
  ],
};

const referenceTables: Partial<Record<PullTable, Record<string, PullTable>>> = {
  allocations: { line_id: 'budget_lines' },
  transactions: { line_id: 'budget_lines', debt_id: 'debts' },
  savings_commitments: { goal_id: 'savings_goals', line_id: 'budget_lines' },
};

const booleanColumns: Partial<Record<PullTable, string[]>> = {
  budget_lines: ['hard_cap', 'archived'],
  savings_goals: ['include_kids_savings'],
};

const pullOrder: PullTable[] = [
  'households',
  'budget_lines',
  'debts',
  'savings_goals',
  'allocations',
  'savings_commitments',
  'transactions',
  'settings',
];
const defaultPageSize = 100;

export async function pullRemoteChanges(
  db: DatabaseLike,
  api: PullApi,
  householdId: string,
  options: { pageSize?: number } = {},
): Promise<PullResult> {
  if (!db.prepare || !db.transaction) {
    throw new Error('Database does not support pull sync.');
  }
  if (!householdId) throw new Error('A linked household is required to pull changes.');
  const prepare = db.prepare.bind(db) as (sql: string) => SyncStatement;
  const transaction = db.transaction.bind(db);
  const pageSize = options.pageSize ?? defaultPageSize;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error('Pull page size must be a positive integer.');
  }

  let fetched = 0;
  let applied = 0;

  for (const table of pullOrder) {
    const syncState = prepare(
      'SELECT last_pull_at FROM sync_state WHERE table_name = ? AND deleted_at IS NULL;',
    ).get(table);
    const updatedAfter =
      typeof syncState?.last_pull_at === 'string'
        ? syncState.last_pull_at
        : '1970-01-01T00:00:00.000Z';
    const rows: LocalRow[] = [];
    let offset = 0;

    while (true) {
      const response = await api.fetchUpdated(table, householdId, updatedAfter, offset, pageSize);
      if (response.error) {
        return { fetched, applied, error: `Unable to pull ${table}: ${response.error}` };
      }
      if (!Array.isArray(response.rows)) {
        return {
          fetched,
          applied,
          error: `Unable to pull ${table}: the server returned invalid data.`,
        };
      }
      rows.push(...response.rows);
      if (response.rows.length < pageSize) break;
      offset += response.rows.length;
    }

    fetched += rows.length;
    try {
      const tableApplied = transaction(() => {
        let changed = 0;
        let latestUpdatedAt: string | null = null;
        let latestUpdatedAtMs = -1;
        for (const remoteRow of rows) {
          const remoteUpdatedAt = requireTimestamp(remoteRow.updated_at, table);
          const remoteUpdatedAtMs = parseTimestamp(remoteUpdatedAt, `remote ${table}`);
          if (remoteUpdatedAtMs > latestUpdatedAtMs) {
            latestUpdatedAt = remoteUpdatedAt;
            latestUpdatedAtMs = remoteUpdatedAtMs;
          }
          const localRow = toLocalRow(prepare, table, householdId, remoteRow);
          if (applyRemoteRow(prepare, table, householdId, localRow, remoteUpdatedAt)) {
            changed += 1;
          }
        }

        if (
          latestUpdatedAt !== null &&
          parseTimestamp(latestUpdatedAt, `remote ${table}`) >
            parseTimestamp(updatedAfter, `sync cursor for ${table}`)
        ) {
          saveCursor(prepare, table, householdId, latestUpdatedAt);
        }
        return changed;
      })() as number;
      applied += tableApplied;
    } catch (cause) {
      return {
        fetched,
        applied,
        error:
          cause instanceof Error
            ? `Unable to apply ${table}: ${cause.message}`
            : `Unable to apply ${table}.`,
      };
    }
  }

  return { fetched, applied, error: null };
}

function toLocalRow(
  prepare: (sql: string) => SyncStatement,
  table: PullTable,
  householdId: string,
  remoteRow: LocalRow,
): LocalRow {
  if (remoteRow.household_id !== householdId) {
    throw new Error(`Server returned a row for an unexpected household in ${table}.`);
  }
  if (typeof remoteRow.id !== 'string')
    throw new Error(`Server returned a row without an ID in ${table}.`);
  if (table === 'households' && remoteRow.id !== householdId) {
    throw new Error('Server returned a household whose ID does not match the linked household.');
  }

  const local: LocalRow = {};
  for (const column of tableColumns[table]) {
    if (column in remoteRow) local[column] = remoteRow[column];
  }
  local.id =
    table === 'settings' && typeof remoteRow.key === 'string'
      ? (localSettingsIdFor(prepare, householdId, remoteRow.key) ??
        localIdFor(prepare, table, remoteRow.id))
      : localIdFor(prepare, table, remoteRow.id);
  local.household_id = householdId;

  for (const [column, referencedTable] of Object.entries(referenceTables[table] ?? {})) {
    const referencedId = local[column];
    if (typeof referencedId === 'string' && referencedId.length > 0) {
      local[column] = localIdFor(prepare, referencedTable, referencedId);
    }
  }

  for (const column of booleanColumns[table] ?? []) {
    if (column in local) local[column] = local[column] ? 1 : 0;
  }

  if (table === 'households') {
    local.id = householdId;
    local.household_id = householdId;
  }
  return local;
}

function localIdFor(
  prepare: (sql: string) => SyncStatement,
  table: PullTable,
  remoteId: string,
): string {
  const prefix = `remote-id:${table}:`;
  const mapping = prepare(
    `SELECT table_name FROM sync_state
     WHERE substr(table_name, 1, ?) = ? AND household_id = ? AND deleted_at IS NULL
     LIMIT 1;`,
  ).get(prefix.length, prefix, remoteId);
  if (typeof mapping?.table_name === 'string' && mapping.table_name.startsWith(prefix)) {
    return mapping.table_name.slice(prefix.length);
  }
  return remoteId;
}

function localSettingsIdFor(
  prepare: (sql: string) => SyncStatement,
  householdId: string,
  key: string,
): string | null {
  const existing = prepare(
    `SELECT id FROM settings
     WHERE household_id = ? AND key = ?
     ORDER BY updated_at DESC, id
     LIMIT 1;`,
  ).get(householdId, key);
  return typeof existing?.id === 'string' ? existing.id : null;
}

function applyRemoteRow(
  prepare: (sql: string) => SyncStatement,
  table: PullTable,
  householdId: string,
  row: LocalRow,
  remoteUpdatedAt: string,
): boolean {
  const columns = tableColumns[table];
  const id = row.id;
  if (typeof id !== 'string') throw new Error(`Remote ${table} row has no local ID.`);
  const existing = prepare(
    `SELECT household_id, updated_at FROM ${table} WHERE id = ? LIMIT 1;`,
  ).get(id);
  if (existing && existing.household_id !== householdId) {
    throw new Error(`Remote ${table} row ID conflicts with a different local household.`);
  }
  if (typeof existing?.updated_at === 'string') {
    const localUpdatedAt = parseTimestamp(existing.updated_at, `local ${table}`);
    if (localUpdatedAt > parseTimestamp(remoteUpdatedAt, `remote ${table}`)) return false;
  }

  const placeholders = columns.map(() => '?').join(', ');
  const updates = columns
    .filter((column) => column !== 'id')
    .map((column) => `${column} = excluded.${column}`)
    .join(', ');
  const values = columns.map((column) => row[column] ?? null);
  prepare(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${updates};`,
  ).run(...values);

  prepare('DELETE FROM outbox WHERE table_name = ? AND row_id = ? AND household_id = ?;').run(
    table,
    id,
    householdId,
  );
  return true;
}

function saveCursor(
  prepare: (sql: string) => SyncStatement,
  table: PullTable,
  householdId: string,
  updatedAt: string,
): void {
  prepare(
    `INSERT INTO sync_state
      (table_name, household_id, last_pull_at, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON CONFLICT(table_name) DO UPDATE SET
       household_id = excluded.household_id,
       last_pull_at = excluded.last_pull_at,
       updated_at = excluded.updated_at,
       deleted_at = NULL;`,
  ).run(table, householdId, updatedAt, updatedAt, updatedAt);
}

function requireTimestamp(value: unknown, table: PullTable): string {
  if (typeof value !== 'string') throw new Error(`Server ${table} row is missing updated_at.`);
  parseTimestamp(value, `remote ${table}`);
  return value;
}

function parseTimestamp(value: string, label: string): number {
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed))
    throw new Error(`${label} row has an invalid updated_at timestamp.`);
  const fractional = normalized.match(/\.(\d+)(?=Z|[+-]\d{2}:?\d{2}$)/)?.[1] ?? '';
  const microsecondRemainder = Number(fractional.padEnd(6, '0').slice(3, 6) || '0');
  return parsed * 1_000 + microsecondRemainder;
}
