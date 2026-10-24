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

export async function openAppDatabase(name = 'pocket-guard.db'): Promise<DatabaseLike> {
  const sqlite = await import('expo-sqlite');
  const database = sqlite.openDatabaseSync(name, { enableChangeListener: false });

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
      let result: unknown;
      database.withTransactionSync(() => {
        result = fn();
      });
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
}
