import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { initializeLocalApp, loadSeedPlan } from './bootstrap';
import {
  buildAllocationsCsv,
  buildBudgetLinesCsv,
  buildLoansCsv,
  buildTransactionsCsv,
  listActivity,
} from './activity';
import { createLoan, recordLoanRepayment } from './loans';
import { addIncomeStream } from './income';
import { setAllocation } from './plan';
import { transactions } from './repos';

const householdId = 'household-seed';

describe('CSV export', () => {
  let db: Database.Database | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  function createDb() {
    db = new Database(':memory:');
    initializeLocalApp(db as never, { loadPlan: false });
    loadSeedPlan(db as never, householdId);
    return db;
  }

  it('exports transactions, budget lines, allocations, and loan repayment history', () => {
    const database = createDb();
    const stream = addIncomeStream(database as never, householdId, { kind: 'salary' });
    setAllocation(database as never, householdId, 'line-fuel', '2026-10', 120000, stream.id);
    transactions.add(database as never, householdId, {
      occurred_at: '2026-10-26T12:00:00.000Z',
      amount: 2500,
      direction: 'expense',
      line_id: 'line-fuel',
      note: '=1+1',
    });
    const loanId = createLoan(database as never, householdId, {
      personName: 'Desmond, friend',
      lentOn: '2026-10-01',
      amount: 10000,
      plan: 'flexible',
    });
    recordLoanRepayment(database as never, householdId, {
      loanId,
      amount: 3000,
      paidAt: new Date('2026-10-26T12:00:00.000Z'),
      note: 'cash, today',
    });

    const transactionsCsv = buildTransactionsCsv(database as never, householdId);
    expect(listActivity(database as never, householdId, { month: '2026-10' })).toMatchObject([
      { incomeStreamId: stream.id, incomeStreamName: 'Income from Salary' },
    ]);
    expect(transactionsCsv).toContain("'=1+1");
    expect(transactionsCsv).toContain('income_stream');
    expect(transactionsCsv).toContain('Income from Salary');
    expect(buildBudgetLinesCsv(database as never, householdId)).toContain('Fuel,running,1');
    expect(buildAllocationsCsv(database as never, householdId)).toContain('Fuel,2026-10,120000');
    expect(buildAllocationsCsv(database as never, householdId)).toContain('Income from Salary');
    const loans = buildLoansCsv(database as never, householdId);
    expect(loans).toContain('"Desmond, friend"');
    expect(loans).toContain('7000,PARTIAL');
    expect(loans).toContain('"cash, today"');
  });
});
