import { createTableSql, tableDefinitions } from './schema';

export type DatabaseLike = {
  exec?: (sql: string) => void;
  execSync?: (sql: string) => void;
};

export async function openAppDatabase(name = 'pocket-guard.db'): Promise<DatabaseLike> {
  const sqlite = await import('expo-sqlite');
  return sqlite.openDatabaseSync(name, { enableChangeListener: false });
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
