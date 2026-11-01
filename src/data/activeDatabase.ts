export const legacyDatabaseName = 'pocket-guard.db';

const legacyOwnerKey = 'pg.localdb.legacy-owner';
const userKey = (userId: string) => `pg.localdb.user.${userId}`;

export type KeyValueStore = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
};

let activeName: string | null = null;

export function setActiveDatabaseName(name: string | null): void {
  activeName = name;
}

export function hasActiveDatabase(): boolean {
  return activeName !== null;
}

export function getActiveDatabaseName(): string {
  if (activeName === null) throw new Error('Sign in to open your budget data.');
  return activeName;
}

function assertUserId(userId: string): void {
  if (!/^[0-9a-zA-Z-]{8,64}$/.test(userId)) throw new Error('Invalid account identifier.');
}

export function databaseNameForUser(userId: string): string {
  assertUserId(userId);
  return `pocket-guard-${userId.toLowerCase()}.db`;
}

// Each account gets its own database file. The first account to sign in on a device
// adopts the pre-accounts database so existing local data is not lost; every later
// account gets a separate file and can never see that data.
export async function resolveUserDatabaseName(
  userId: string,
  store: KeyValueStore,
): Promise<string> {
  assertUserId(userId);
  const existing = await store.get(userKey(userId));
  if (existing) return existing;

  const legacyOwner = await store.get(legacyOwnerKey);
  let name: string;
  if (legacyOwner === null) {
    await store.set(legacyOwnerKey, userId);
    name = legacyDatabaseName;
  } else {
    name = legacyOwner === userId ? legacyDatabaseName : databaseNameForUser(userId);
  }
  await store.set(userKey(userId), name);
  return name;
}
