import type { DatabaseLike } from '../data/db';
import { recordDebtPayment } from '../data/debts';
import { createLoan, recordLoanRepayment, type LoanInput } from '../data/loans';
import { transactions } from '../data/repos';

import type { MomoPendingTransaction, MomoSource } from './MomoSmsParser';

export type MomoImportState = 'pending' | 'confirmed' | 'dismissed';

export type StoredMomoImport = {
  id: string;
  transactionId: string | null;
  source: MomoSource;
  item: MomoPendingTransaction;
  state: MomoImportState;
  transactionRowId: string | null;
};

export type MomoReviewValues = {
  amount: number;
  fee?: number;
  direction: 'expense' | 'income' | 'loan' | 'loan_repayment';
  note: string;
  occurredAt: string;
  lineId?: string | null;
  incomeStreamId?: string | null;
  counterpartyName?: string | null;
  counterpartyPhone?: string | null;
  overrideReason?: string | null;
  loanId?: string | null;
  loanInput?: LoanInput;
};

type MomoDatabase = DatabaseLike & {
  prepare: (sql: string) => {
    run: (...values: unknown[]) => unknown;
    get: (...values: unknown[]) => Record<string, unknown> | undefined;
    all: (...values: unknown[]) => Record<string, unknown>[];
  };
};

const makeId = () => `momo-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function database(db: DatabaseLike): MomoDatabase {
  if (!db.prepare) throw new Error('Database does not support prepared queries.');
  return db as MomoDatabase;
}

function decode(row: Record<string, unknown>): StoredMomoImport {
  return {
    id: String(row.id),
    transactionId: typeof row.transaction_id === 'string' ? row.transaction_id : null,
    source: String(row.source) as MomoSource,
    item: JSON.parse(String(row.parsed_json)) as MomoPendingTransaction,
    state: String(row.state) as MomoImportState,
    transactionRowId: typeof row.transaction_row_id === 'string' ? row.transaction_row_id : null,
  };
}

function runTransaction<T>(db: MomoDatabase, operation: () => T): T {
  return db.transaction ? (db.transaction(operation)() as T) : operation();
}

export function registerMomoPending(
  db: DatabaseLike,
  householdId: string,
  items: readonly MomoPendingTransaction[],
): { item: StoredMomoImport; duplicate: boolean }[] {
  const sql = database(db);
  return runTransaction(sql, () =>
    items.map((item) => {
      const existing = item.transactionId
        ? sql
            .prepare('SELECT * FROM momo_imports WHERE transaction_id = ? LIMIT 1;')
            .get(item.transactionId)
        : sql
            .prepare(
              'SELECT * FROM momo_imports WHERE household_id = ? AND transaction_id IS NULL AND raw_sms = ? LIMIT 1;',
            )
            .get(householdId, item.rawSms);
      if (existing) return { item: decode(existing), duplicate: true };

      const id = makeId();
      sql
        .prepare(
          `INSERT INTO momo_imports (
          id, household_id, transaction_id, source, parsed_json, raw_sms, state
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending');`,
        )
        .run(id, householdId, item.transactionId, item.source, JSON.stringify(item), item.rawSms);
      const inserted = sql.prepare('SELECT * FROM momo_imports WHERE id = ?;').get(id);
      if (!inserted) throw new Error('Unable to create the pending MoMo review item.');
      return { item: decode(inserted), duplicate: false };
    }),
  );
}

export function listPendingMomoImports(db: DatabaseLike, householdId: string): StoredMomoImport[] {
  return database(db)
    .prepare(
      `SELECT * FROM momo_imports
       WHERE household_id = ? AND state = 'pending' ORDER BY created_at, id;`,
    )
    .all(householdId)
    .map(decode);
}

export function getMomoImport(db: DatabaseLike, id: string): StoredMomoImport | null {
  const row = database(db).prepare('SELECT * FROM momo_imports WHERE id = ?;').get(id);
  return row ? decode(row) : null;
}

export function confirmMomoImport(
  db: DatabaseLike,
  householdId: string,
  id: string,
  values: MomoReviewValues,
): string {
  const sql = database(db);
  return runTransaction(sql, () => {
    const row = sql
      .prepare(
        "SELECT * FROM momo_imports WHERE id = ? AND household_id = ? AND state = 'pending';",
      )
      .get(id, householdId);
    if (!row) throw new Error('This pending MoMo item is no longer available.');
    const item = decode(row);
    if (!Number.isSafeInteger(values.amount) || values.amount <= 0) {
      throw new Error('Enter a positive whole amount.');
    }
    if (values.direction === 'loan') {
      createLoan(db, householdId, {
        ...values.loanInput,
        personName:
          values.counterpartyName ??
          values.loanInput?.personName ??
          item.item.counterpartyName ??
          values.note,
        personPhone:
          values.counterpartyPhone ?? values.loanInput?.personPhone ?? item.item.counterpartyPhone,
        lentOn: values.loanInput?.lentOn ?? values.occurredAt.slice(0, 10),
        amount: values.amount,
        plan: values.loanInput?.plan ?? 'flexible',
        incomeStreamId: values.incomeStreamId ?? values.loanInput?.incomeStreamId,
        note: values.note || values.loanInput?.note,
      });
    }
    if (values.direction === 'loan_repayment') {
      if (!values.loanId) throw new Error('Choose the debt this payment repays.');
      recordLoanRepayment(db, householdId, {
        loanId: values.loanId,
        amount: values.amount,
        paidAt: new Date(values.occurredAt),
        note: values.note,
      });
    }
    const transaction = transactions.add(db, householdId, {
      occurred_at: values.occurredAt,
      amount:
        values.direction === 'income' || values.direction === 'loan_repayment'
          ? values.amount
          : values.amount + (values.fee ?? item.item.fee),
      direction:
        values.direction === 'income' || values.direction === 'loan_repayment'
          ? 'income'
          : 'expense',
      line_id:
        values.direction === 'income' || values.direction === 'loan_repayment'
          ? null
          : (values.lineId ?? null),
      income_stream_id:
        values.direction === 'income' || values.direction === 'loan_repayment'
          ? (values.incomeStreamId ?? null)
          : null,
      note: values.note.trim() || null,
      source: item.source,
      status: 'confirmed',
      override_reason: values.overrideReason?.trim() || null,
    });
    sql
      .prepare(
        `UPDATE momo_imports SET state = 'confirmed', transaction_row_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND household_id = ?;`,
      )
      .run(transaction.id, id, householdId);
    return transaction.id;
  });
}

export function confirmMomoDebtPayment(
  db: DatabaseLike,
  householdId: string,
  id: string,
  payment: {
    debtId: string;
    amount: number;
    incomeStreamId?: string | null;
    note?: string;
    paidAt: Date;
  },
): string {
  const sql = database(db);
  return runTransaction(sql, () => {
    const pending = sql
      .prepare(
        "SELECT id FROM momo_imports WHERE id = ? AND household_id = ? AND state = 'pending';",
      )
      .get(id, householdId);
    if (!pending) throw new Error('This pending MoMo item is no longer available.');

    const transactionId = recordDebtPayment(db, householdId, {
      ...payment,
      source: 'sms',
    });
    sql
      .prepare(
        `UPDATE momo_imports SET state = 'confirmed', transaction_row_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND household_id = ?;`,
      )
      .run(transactionId, id, householdId);
    return transactionId;
  });
}

export function dismissMomoImport(db: DatabaseLike, householdId: string, id: string): void {
  database(db)
    .prepare(
      `UPDATE momo_imports SET state = 'dismissed', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND household_id = ? AND state = 'pending';`,
    )
    .run(id, householdId);
}

export function getMomoDuplicateState(
  db: DatabaseLike,
  transactionId: string,
): MomoImportState | null {
  const row = database(db)
    .prepare('SELECT state FROM momo_imports WHERE transaction_id = ? LIMIT 1;')
    .get(transactionId);
  return row ? (String(row.state) as MomoImportState) : null;
}
