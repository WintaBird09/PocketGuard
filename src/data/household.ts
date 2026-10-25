import type { DatabaseLike } from './db';

export function requirePrepared(db: DatabaseLike): NonNullable<DatabaseLike['prepare']> {
  const prepare = db.prepare?.bind(db);
  if (!prepare) throw new Error('Database does not support prepared queries.');
  return prepare;
}

export function getActiveHouseholdId(db: DatabaseLike): string {
  const row = requirePrepared(db)(
    'SELECT id FROM households WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;',
  ).get();
  if (!row || typeof row.id !== 'string') {
    throw new Error('The local household has not been initialized.');
  }
  return row.id;
}

export function inTransaction<T>(db: DatabaseLike, fn: () => T): T {
  return db.transaction ? (db.transaction(fn)() as T) : fn();
}

export function newId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && 'randomUUID' in cryptoApi) return cryptoApi.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function assertMonthKey(month: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Enter a valid month (YYYY-MM).');
}

export function assertWholeAmount(amount: number, allowZero = false): void {
  const valid = Number.isSafeInteger(amount) && (allowZero ? amount >= 0 : amount > 0);
  if (!valid) {
    throw new Error(
      allowZero
        ? 'Enter a whole amount in XAF (0 or more).'
        : 'Enter a positive whole amount in XAF.',
    );
  }
}
