type SqlStatement = {
  run: (...args: unknown[]) => unknown;
  get: (...args: unknown[]) => Record<string, unknown> | undefined;
  all: (...args: unknown[]) => Record<string, unknown>[];
};

type SqlDatabase = {
  prepare?: (sql: string) => SqlStatement;
  transaction?: (fn: () => unknown) => () => unknown;
  exec?: (sql: string) => void;
  execSync?: (sql: string) => void;
};

type BudgetLineDraft = {
  name: string;
  kind: string;
  hard_cap?: boolean;
  sort_order?: number;
  archived?: boolean;
};

type SettingsValue = string | number | boolean | null;

export type TransactionDirection = 'expense' | 'income' | 'transfer';

const makeId = () => {
  if (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.crypto !== 'undefined' &&
    'randomUUID' in globalThis.crypto
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const nowIso = () => new Date().toISOString();

const prepareStatement = (db: SqlDatabase, sql: string): SqlStatement => {
  if (db.prepare) {
    return db.prepare(sql);
  }

  throw new Error('Database implementation does not support prepare().');
};

const runInTransaction = <T>(db: SqlDatabase, fn: () => T): T => {
  if (typeof db.transaction === 'function') {
    return db.transaction(fn)() as T;
  }

  return fn();
};

export const appendOutboxEntry = (
  db: SqlDatabase,
  householdId: string,
  tableName: string,
  rowId: string,
  op: 'create' | 'upsert' | 'update' | 'delete',
) => {
  const id = makeId();
  const timestamp = nowIso();

  const statement = prepareStatement(
    db,
    `INSERT INTO outbox (id, household_id, table_name, row_id, op, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL);`,
  );

  statement.run(id, householdId, tableName, rowId, op, timestamp, timestamp);
};

export const budgetLines = {
  create(db: SqlDatabase, householdId: string, draft: BudgetLineDraft) {
    return runInTransaction(db, () => {
      const id = makeId();
      const timestamp = nowIso();

      prepareStatement(
        db,
        `INSERT INTO budget_lines (
          id,
          household_id,
          name,
          kind,
          hard_cap,
          sort_order,
          archived,
          created_at,
          updated_at,
          deleted_at,
          device_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL);`,
      ).run(
        id,
        householdId,
        draft.name,
        draft.kind,
        draft.hard_cap ? 1 : 0,
        draft.sort_order ?? 0,
        draft.archived ? 1 : 0,
        timestamp,
        timestamp,
      );

      appendOutboxEntry(db, householdId, 'budget_lines', id, 'create');

      return {
        id,
        household_id: householdId,
        name: draft.name,
        kind: draft.kind,
        hard_cap: draft.hard_cap ? 1 : 0,
        sort_order: draft.sort_order ?? 0,
        archived: draft.archived ? 1 : 0,
        device_id: null,
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null,
      };
    });
  },
};

export const settings = {
  get(db: SqlDatabase, householdId: string, key: string): string | null {
    const row = prepareStatement(
      db,
      `SELECT value FROM settings WHERE household_id = ? AND key = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1;`,
    ).get(householdId, key) as { value: string } | undefined;

    return row ? String(row.value) : null;
  },

  set(db: SqlDatabase, householdId: string, key: string, value: SettingsValue) {
    return runInTransaction(db, () => {
      const existing = prepareStatement(
        db,
        `SELECT id, value FROM settings WHERE household_id = ? AND key = ? AND deleted_at IS NULL LIMIT 1;`,
      ).get(householdId, key) as { id: string; value: string } | undefined;

      const now = nowIso();
      const serialized = String(value ?? '');

      if (existing) {
        prepareStatement(
          db,
          `UPDATE settings SET value = ?, updated_at = ?, deleted_at = NULL WHERE id = ?;`,
        ).run(serialized, now, existing.id);

        appendOutboxEntry(db, householdId, 'settings', existing.id, 'upsert');

        return {
          id: existing.id,
          household_id: householdId,
          key,
          value: serialized,
          updated_at: now,
        };
      }

      const id = makeId();
      prepareStatement(
        db,
        `INSERT INTO settings (id, household_id, key, value, created_at, updated_at, deleted_at, device_id)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL);`,
      ).run(id, householdId, key, serialized, now, now);

      appendOutboxEntry(db, householdId, 'settings', id, 'upsert');

      return {
        id,
        household_id: householdId,
        key,
        value: serialized,
        created_at: now,
        updated_at: now,
      };
    });
  },
};

export const transactions = {
  add(
    db: SqlDatabase,
    householdId: string,
    draft: {
      occurred_at: string;
      amount: number;
      direction: TransactionDirection;
      line_id?: string | null;
      debt_id?: string | null;
      note?: string | null;
      source?: string;
      raw_text?: string | null;
      status?: string;
      override_reason?: string | null;
    },
  ) {
    return runInTransaction(db, () => {
      const id = makeId();
      const timestamp = nowIso();
      const source = draft.source ?? 'manual';
      const status = draft.status ?? 'confirmed';

      prepareStatement(
        db,
        `INSERT INTO transactions (
          id,
          household_id,
          occurred_at,
          amount,
          direction,
          line_id,
          debt_id,
          note,
          source,
          raw_text,
          status,
          override_reason,
          created_at,
          updated_at,
          deleted_at,
          device_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL);`,
      ).run(
        id,
        householdId,
        draft.occurred_at,
        draft.amount,
        draft.direction,
        draft.line_id ?? null,
        draft.debt_id ?? null,
        draft.note ?? null,
        source,
        draft.raw_text ?? null,
        status,
        draft.override_reason ?? null,
        timestamp,
        timestamp,
      );

      appendOutboxEntry(db, householdId, 'transactions', id, 'create');

      return {
        id,
        household_id: householdId,
        occurred_at: draft.occurred_at,
        amount: draft.amount,
        direction: draft.direction,
        line_id: draft.line_id ?? null,
        debt_id: draft.debt_id ?? null,
        note: draft.note ?? null,
        source,
        raw_text: draft.raw_text ?? null,
        status,
        override_reason: draft.override_reason ?? null,
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null,
      };
    });
  },

  listByMonth(db: SqlDatabase, householdId: string, month: string) {
    const rows = prepareStatement(
      db,
      `SELECT * FROM transactions WHERE household_id = ? AND substr(occurred_at, 1, 7) = ? AND deleted_at IS NULL ORDER BY occurred_at DESC;`,
    ).all(householdId, month) as Record<string, unknown>[];

    return rows;
  },
};
