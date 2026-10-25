import type { DatabaseLike } from '@/src/data/db';
import { authConfigurationError, supabase } from '@/src/auth/client';

import { pullRemoteChanges, type PullApi, type PullResult } from './pull';
import { pushOutbox, type PushApi, type PushResult } from './push';

export async function pushPendingChanges(db: DatabaseLike): Promise<PushResult> {
  if (!supabase) {
    throw new Error(authConfigurationError ?? 'Supabase is not configured.');
  }
  const client = supabase;

  const { data, error } = await client.auth.getSession();
  if (error) throw new Error(`Unable to restore the signed-in session: ${error.message}`);
  if (!data.session) throw new Error('Sign in before syncing local changes.');

  return pushOutbox(db, createPushApi(client));
}

export async function pullPendingChanges(
  db: DatabaseLike,
  householdId: string,
): Promise<PullResult> {
  if (!supabase) {
    throw new Error(authConfigurationError ?? 'Supabase is not configured.');
  }
  const client = supabase;

  const { data, error } = await client.auth.getSession();
  if (error) throw new Error(`Unable to restore the signed-in session: ${error.message}`);
  if (!data.session) throw new Error('Sign in before syncing local changes.');

  return pullRemoteChanges(db, createPullApi(client), householdId);
}

function createPushApi(client: NonNullable<typeof supabase>): PushApi {
  return {
    upsert: async (table, row, options) => {
      const { error } = await client.from(table).upsert(row, options);
      return { error: error ? { message: error.message } : null };
    },
    updateHousehold: async (row) => {
      if (typeof row.id !== 'string') {
        return { error: { message: 'The linked household row has no ID.' } };
      }
      const { data, error } = await client
        .from('households')
        .update(row)
        .eq('id', row.id)
        .select('id');
      if (error) return { error: { message: error.message } };
      if (!data?.length) {
        return { error: { message: 'The linked household could not be found on Supabase.' } };
      }
      return { error: null };
    },
  };
}

function createPullApi(client: NonNullable<typeof supabase>): PullApi {
  return {
    fetchUpdated: async (table, householdId, updatedAfter, offset, limit) => {
      const { data, error } = await client
        .from(table)
        .select('*')
        .eq('household_id', householdId)
        .gt('updated_at', updatedAfter)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) return { rows: [], error: error.message };
      return { rows: data ?? [], error: null };
    },
  };
}
