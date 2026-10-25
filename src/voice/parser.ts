import { monthKeyForDate, localDateString } from '../domain/dates';
import { listExpenseLines } from '../data/transaction-entry';
import type { DatabaseLike } from '../data/db';
import { supabase } from '../auth/client';

import {
  parseExpenseInputSchema,
  parseExpenseResponseSchema,
  type ParseExpenseResponse,
} from './contract';

export async function parseVoiceTranscript(
  db: DatabaseLike,
  householdId: string,
  transcript: string,
  today = localDateString(),
): Promise<ParseExpenseResponse> {
  if (!supabase) throw new Error('Voice parsing requires Supabase authentication.');
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Unable to check your sign-in: ${sessionError.message}`);
  if (!data.session)
    throw new Error('Sign in to parse voice entries. Your transcript can be saved offline.');

  const month = monthKeyForDate(new Date(`${today}T12:00:00`), 'Africa/Douala');
  const input = parseExpenseInputSchema.parse({
    transcript,
    lines: listExpenseLines(db, householdId, month).map(({ id, name }) => ({ id, name })),
    today,
    timezone: 'Africa/Douala',
  });
  const { data: response, error } = await supabase.functions.invoke('parse-expense', {
    body: input,
    headers: { Authorization: `Bearer ${data.session.access_token}` },
  });
  if (error) {
    throw new Error(`Voice parser unavailable: ${error.message}`);
  }
  return parseExpenseResponseSchema.parse(response);
}
