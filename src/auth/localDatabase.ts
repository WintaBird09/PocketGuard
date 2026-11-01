import { resolveUserDatabaseName } from '@/src/data/activeDatabase';
import { initializeLocalApp } from '@/src/data/bootstrap';
import { openAppDatabase } from '@/src/data/db';
import { deviceKeyValueStore } from '@/src/data/deviceKeyValueStore';

// Opens (creating if needed) the signed-in user's own database and returns its file name.
export async function prepareLocalDatabase(userId: string): Promise<string> {
  const name = await resolveUserDatabaseName(userId, deviceKeyValueStore);
  const database = await openAppDatabase(name);
  initializeLocalApp(database, { loadPlan: false });
  return name;
}
