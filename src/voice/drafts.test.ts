import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { initializeLocalApp, loadSeedPlan } from '../data/bootstrap';
import { classifyInboxItem, listInbox } from '../data/inbox';

import {
  completeVoiceDraft,
  createVoiceDraft,
  listUnparsedVoiceDrafts,
  listVoiceDraftsReadyForConfirmation,
  saveVoiceDraftParse,
} from './drafts';
import type { ParseExpenseItem } from './contract';

const householdId = 'household-seed';
const parsedExpense: ParseExpenseItem = {
  intent: 'log_expense',
  amount_xaf: 20000,
  line_id: 'line-fuel',
  line_guess_name: 'Fuel',
  note: 'Fuel',
  date: '2026-10-25',
  confidence: 0.9,
};

describe('offline voice drafts', () => {
  let db: Database.Database | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  function createDb() {
    db = new Database(':memory:');
    initializeLocalApp(db as never, { loadPlan: false });
    return db;
  }

  it('stores a raw transcript locally as an outboxed draft without schema changes', () => {
    const database = createDb();
    const id = createVoiceDraft(database as never, householdId, 'Spent twenty thousand on fuel');

    expect(
      database
        .prepare('SELECT status, source, amount, raw_text FROM transactions WHERE id = ?;')
        .get(id),
    ).toEqual({
      status: 'draft',
      source: 'voice',
      amount: 0,
      raw_text: 'Spent twenty thousand on fuel',
    });
    expect(
      database.prepare('SELECT table_name, row_id FROM outbox WHERE row_id = ?;').get(id),
    ).toEqual({
      table_name: 'transactions',
      row_id: id,
    });
    expect(listUnparsedVoiceDrafts(database as never, householdId)).toHaveLength(1);
  });

  it('stores one parsed suggestion per item and leaves each visible for confirmation', () => {
    const database = createDb();
    const id = createVoiceDraft(
      database as never,
      householdId,
      'Paid 5,000 for wash and 3,000 airtime',
    );
    const second: ParseExpenseItem = {
      ...parsedExpense,
      amount_xaf: 3000,
      line_id: null,
      line_guess_name: null,
      note: 'airtime',
    };

    const ids = saveVoiceDraftParse(database as never, householdId, id, [parsedExpense, second]);
    const ready = listVoiceDraftsReadyForConfirmation(database as never, householdId);

    expect(ids).toHaveLength(2);
    expect(ready).toHaveLength(2);
    expect(ready.map(({ item }) => item.amount_xaf)).toEqual([20000, 3000]);
    expect(listUnparsedVoiceDrafts(database as never, householdId)).toHaveLength(0);
    expect(
      listInbox(database as never, householdId).map((item) => item.voiceSuggestion?.intent),
    ).toEqual(['log_expense', 'log_expense']);
  });

  it('soft-deletes a completed draft and retains its sync outbox record', () => {
    const database = createDb();
    const id = createVoiceDraft(database as never, householdId, 'Received salary');
    completeVoiceDraft(database as never, householdId, id);

    expect(
      database.prepare('SELECT deleted_at FROM transactions WHERE id = ?;').get(id),
    ).toMatchObject({ deleted_at: expect.any(String) });
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM outbox WHERE row_id = ? AND op = 'delete';")
        .get(id),
    ).toEqual({ count: 1 });
  });

  it('lets an unknown voice suggestion be manually classified without losing its source text', () => {
    const database = createDb();
    loadSeedPlan(database as never, householdId);
    const transcript = 'Paid for something at the market';
    const id = createVoiceDraft(database as never, householdId, transcript);
    const unknown: ParseExpenseItem = {
      ...parsedExpense,
      intent: 'unknown',
      amount_xaf: 0,
      line_id: null,
      line_guess_name: null,
      confidence: 0.2,
    };
    saveVoiceDraftParse(database as never, householdId, id, [unknown]);

    const result = classifyInboxItem(
      database as never,
      householdId,
      id,
      { lineId: 'line-fuel', amount: 1200, occurredOn: '2026-10-25' },
      true,
    );

    expect(result.saved).toBe(true);
    expect(
      database
        .prepare("SELECT source, raw_text FROM transactions WHERE status = 'confirmed';")
        .get(),
    ).toMatchObject({ source: 'voice', raw_text: transcript });
    expect(
      database.prepare('SELECT deleted_at FROM transactions WHERE id = ?;').get(id),
    ).toMatchObject({ deleted_at: expect.any(String) });
  });

  it('makes a draft with invalid parse metadata eligible for retry', () => {
    const database = createDb();
    const id = createVoiceDraft(database as never, householdId, 'Spent on fuel');
    database
      .prepare('UPDATE transactions SET note = ? WHERE id = ?;')
      .run('voice-parse:v1:{invalid', id);

    expect(
      listUnparsedVoiceDrafts(database as never, householdId).map((draft) => draft.id),
    ).toEqual([id]);
  });
});
