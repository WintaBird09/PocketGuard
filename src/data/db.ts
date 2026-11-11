import { getActiveDatabaseName } from './activeDatabase';
import { createTableSql, tableDefinitions } from './schema';

export type DatabaseLike = {
  exec?: (sql: string) => void;
  execSync?: (sql: string) => void;
  prepare?: (sql: string) => {
    run: (...args: unknown[]) => unknown;
    get: (...args: unknown[]) => Record<string, unknown> | undefined;
    all: (...args: unknown[]) => Record<string, unknown>[];
  };
  transaction?: (fn: () => unknown) => () => unknown;
};

export async function openAppDatabase(name = getActiveDatabaseName()): Promise<DatabaseLike> {
  const sqlite = await import('expo-sqlite');
  const database = await sqlite.openDatabaseAsync(name, { enableChangeListener: false });

  // expo-sqlite cannot nest transactions, so inner calls join the outer one.
  let transactionDepth = 0;

  return {
    execSync: (sql) => database.execSync(sql),
    prepare: (sql) => ({
      run: (...args) => database.runSync(sql, ...toSqliteBindValues(args)),
      get: (...args) =>
        database.getFirstSync<Record<string, unknown>>(sql, ...toSqliteBindValues(args)) ??
        undefined,
      all: (...args) =>
        database.getAllSync<Record<string, unknown>>(sql, ...toSqliteBindValues(args)),
    }),
    transaction: (fn) => () => {
      if (transactionDepth > 0) return fn();
      let result: unknown;
      transactionDepth += 1;
      try {
        database.withTransactionSync(() => {
          result = fn();
        });
      } finally {
        transactionDepth -= 1;
      }
      return result;
    },
  };
}

function toSqliteBindValues(values: unknown[]): (string | number | null | boolean)[] {
  return values.map((value) => {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    throw new TypeError('Unsupported SQLite bind value.');
  });
}

export function runMigrations(db: DatabaseLike): void {
  const runSql = (sql: string) => {
    if (typeof db.exec === 'function') {
      db.exec(sql);
      return;
    }

    if (typeof db.execSync === 'function') {
      db.execSync(sql);
      return;
    }

    throw new Error('Database implementation does not support exec() or execSync().');
  };

  runSql('PRAGMA foreign_keys = ON;');

  for (const definition of tableDefinitions) {
    runSql(createTableSql(definition));
  }

  addColumnIfMissing(db, 'allocations', 'income_stream_id', 'TEXT NULL');
  addColumnIfMissing(db, 'income_streams', 'recurring_amount', 'INTEGER NULL');
  addColumnIfMissing(db, 'income_streams', 'recurring_day', 'INTEGER NULL');
  addColumnIfMissing(db, 'income_streams', 'recurring_start_month', 'TEXT NULL');
  addColumnIfMissing(db, 'transactions', 'income_stream_id', 'TEXT NULL');
  addColumnIfMissing(db, 'transactions', 'recurring_income_month', 'TEXT NULL');
  addColumnIfMissing(db, 'loans', 'income_stream_id', 'TEXT NULL');
  addColumnIfMissing(db, 'debts', 'income_stream_id', 'TEXT NULL');
  runSql(
    `CREATE UNIQUE INDEX IF NOT EXISTS transactions_recurring_income_month_unique
       ON transactions (household_id, income_stream_id, recurring_income_month)
       WHERE recurring_income_month IS NOT NULL AND deleted_at IS NULL;`,
  );
  runSql(
    `CREATE UNIQUE INDEX IF NOT EXISTS momo_imports_transaction_id_unique
       ON momo_imports (transaction_id) WHERE transaction_id IS NOT NULL;`,
  );
}

function addColumnIfMissing(
  db: DatabaseLike,
  table: 'allocations' | 'income_streams' | 'transactions' | 'loans' | 'debts',
  column: string,
  definition: string,
): void {
  if (!db.prepare) throw new Error('Database implementation does not support prepared queries.');
  const columns = db.prepare(`PRAGMA table_info(${table});`).all();
  if (!columns.some((entry) => entry.name === column)) {
    const runSql = db.exec ?? db.execSync;
    if (!runSql) throw new Error('Database implementation does not support exec() or execSync().');
    runSql.call(db, `ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}
