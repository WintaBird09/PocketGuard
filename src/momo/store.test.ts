import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { runMigrations } from '../data/db';
import { createLoan } from '../data/loans';

import { parseMomoSmsBatch } from './MomoSmsParser';
import {
  confirmMomoImport,
  dismissMomoImport,
  getMomoDuplicateState,
  listPendingMomoImports,
  registerMomoPending,
} from './store';

describe('MoMo local import ledger', () => {
  let db: Database.Database;
  const householdId = 'household-momo';
  const sms =
    'Your payment of 4000 XAF to SHOP SARL (237671313148) has been completed at 2026-11-08 22:38:54. Your new balance: 989 XAF. Financial Transaction Id: 19647283217. Promo text';

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db as never);
    db.prepare('INSERT INTO households (id, household_id, name) VALUES (?, ?, ?);').run(
      householdId,
      householdId,
      'Home',
    );
  });

  it('deduplicates confirmed items after a subsequent import', () => {
    const [item] = parseMomoSmsBatch(sms, 'MOMO_PASTE');
    const [registered] = registerMomoPending(db as never, householdId, [item]);
    confirmMomoImport(db as never, householdId, registered.item.id, {
      amount: 4000,
      direction: 'expense',
      note: 'SHOP SARL',
      occurredAt: '2026-11-08T21:38:54.000Z',
    });

    const [duplicate] = registerMomoPending(db as never, householdId, [item]);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.item.state).toBe('confirmed');
    expect(db.prepare('SELECT COUNT(*) AS count FROM transactions').get()).toEqual({ count: 1 });
    expect(getMomoDuplicateState(db as never, item.transactionId!)).toBe('confirmed');
  });

  it('keeps dismissed transaction IDs reserved and out of the pending list', () => {
    const [item] = parseMomoSmsBatch(sms, 'MOMO_PASTE');
    const [registered] = registerMomoPending(db as never, householdId, [item]);
    dismissMomoImport(db as never, householdId, registered.item.id);

    const [duplicate] = registerMomoPending(db as never, householdId, [item]);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.item.state).toBe('dismissed');
    expect(listPendingMomoImports(db as never, householdId)).toEqual([]);
  });

  it('keeps raw SMS local and does not copy it to the syncable transaction row', () => {
    const [item] = parseMomoSmsBatch(sms, 'MOMO_PASTE');
    const [registered] = registerMomoPending(db as never, householdId, [item]);
    confirmMomoImport(db as never, householdId, registered.item.id, {
      amount: 4000,
      direction: 'expense',
      note: 'SHOP SARL',
      occurredAt: '2026-11-08T21:38:54.000Z',
    });
    const transaction = db.prepare('SELECT source, raw_text FROM transactions').get();
    expect(transaction).toEqual({ source: 'MOMO_PASTE', raw_text: null });
    expect(db.prepare('SELECT raw_sms FROM momo_imports').get()).toMatchObject({
      raw_sms: sms.split('. Promo')[0],
    });
  });

  it('records a selected loan repayment and the matching income transaction', () => {
    const loanId = createLoan(db as never, householdId, {
      personName: 'Hope Chenwi Nshiom',
      personPhone: '237674926555',
      lentOn: '2026-10-25',
      amount: 8000,
      plan: 'flexible',
    });
    const [item] = parseMomoSmsBatch(
      'You have received 2000 XAF from HOPE CHENWI NSHIOM (237674926555) on your mobile money account at 2026-11-11 07:45:54. Your new balance: 2911 XAF. Financial Transaction Id: repayment-1.',
      'MOMO_PASTE',
    );
    const [registered] = registerMomoPending(db as never, householdId, [item]);

    confirmMomoImport(db as never, householdId, registered.item.id, {
      amount: 2000,
      direction: 'loan_repayment',
      loanId,
      note: 'Hope Chenwi Nshiom',
      occurredAt: '2026-11-11T06:45:54.000Z',
    });

    expect(db.prepare('SELECT amount FROM loan_payments WHERE loan_id = ?').get(loanId)).toEqual({
      amount: 2000,
    });
    expect(db.prepare('SELECT amount, direction FROM transactions').get()).toEqual({
      amount: 2000,
      direction: 'income',
    });
  });

  it('confirms Mobile Money income with the selected income stream', () => {
    db.prepare(
      `INSERT INTO income_streams (id, household_id, name, kind) VALUES (?, ?, ?, ?);`,
    ).run('stream-salary', householdId, 'Salary', 'salary');
    const [item] = parseMomoSmsBatch(
      'You have received 2000 XAF from HOPE CHENWI NSHIOM (237674926555) on your mobile money account at 2026-11-11 07:45:54. Your new balance: 2911 XAF. Financial Transaction Id: income-1.',
      'MOMO_PASTE',
    );
    const [registered] = registerMomoPending(db as never, householdId, [item]);

    confirmMomoImport(db as never, householdId, registered.item.id, {
      amount: 2000,
      direction: 'income',
      incomeStreamId: 'stream-salary',
      note: 'Hope Chenwi Nshiom',
      occurredAt: '2026-11-11T06:45:54.000Z',
    });

    expect(
      db.prepare('SELECT amount, direction, income_stream_id FROM transactions').get(),
    ).toEqual({
      amount: 2000,
      direction: 'income',
      income_stream_id: 'stream-salary',
    });
    expect(listPendingMomoImports(db as never, householdId)).toEqual([]);
  });

  it('confirms a transfer from the loan form with its selected income stream', () => {
    db.prepare(
      `INSERT INTO income_streams (id, household_id, name, kind) VALUES (?, ?, ?, ?);`,
    ).run('stream-business', householdId, 'Business', 'business');
    const [item] = parseMomoSmsBatch(
      'You have transferred 15000 XAF to HILDA GHANDZENI KELEN (237650332566) from your mobile money account 39306538 at 2026-11-08 15:13:52 FEES 34 FCFA. Your new balance: 0 XAF. Financial Transaction Id: transfer-1.',
      'MOMO_PASTE',
    );
    const [registered] = registerMomoPending(db as never, householdId, [item]);

    confirmMomoImport(db as never, householdId, registered.item.id, {
      amount: 15000,
      direction: 'loan',
      note: 'Hilda Ghandzeni Kelen',
      occurredAt: '2026-11-08T14:13:52.000Z',
      counterpartyName: 'Hilda Ghandzeni Kelen',
      counterpartyPhone: '237650332566',
      incomeStreamId: 'stream-business',
      loanInput: {
        personName: 'Hilda Ghandzeni Kelen',
        personPhone: '237650332566',
        lentOn: '2026-11-08',
        amount: 15000,
        plan: 'flexible',
        incomeStreamId: 'stream-business',
      },
    });

    expect(db.prepare('SELECT income_stream_id FROM loans').get()).toEqual({
      income_stream_id: 'stream-business',
    });
    expect(db.prepare('SELECT amount, direction FROM transactions').get()).toEqual({
      amount: 15034,
      direction: 'expense',
    });
  });
});
