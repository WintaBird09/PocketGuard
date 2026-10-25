import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { initializeLocalApp } from './bootstrap';
import { filterLoans, loanDueText, sortLoans } from './loanView';
import { createLoan, listLoans, recordLoanRepayment, totalOwedToYou, writeOffLoan } from './loans';

const today = '2026-12-05';
const base = { personName: 'A', lentOn: '2026-10-01', amount: 10000, plan: 'flexible' as const };

function setup() {
  const db = new Database(':memory:');
  const hh = initializeLocalApp(db as never).householdId;
  const make = (name: string, deadline: string | null, paid = 0) => {
    const id = createLoan(db as never, hh, { ...base, personName: name, deadline });
    if (paid) recordLoanRepayment(db as never, hh, { loanId: id, amount: paid });
    return id;
  };
  const late = make('Late', '2026-11-30');
  make('Soon', '2026-12-20');
  make('Later', '2027-02-01', 4000);
  make('Open', null);
  const done = make('Done', '2026-12-30', 10000);
  const off = make('Off', '2026-11-01');
  writeOffLoan(db as never, hh, off);
  return { db, hh, late, done, off };
}

describe('loan list view rules', () => {
  it('filters by status', () => {
    const { db, hh } = setup();
    const loans = listLoans(db as never, hh, today);
    expect(
      filterLoans(loans, 'ACTIVE')
        .map((l) => l.personName)
        .sort(),
    ).toEqual(['Late', 'Later', 'Open', 'Soon']);
    expect(filterLoans(loans, 'OVERDUE').map((l) => l.personName)).toEqual(['Late']);
    expect(
      filterLoans(loans, 'COMPLETE')
        .map((l) => l.personName)
        .sort(),
    ).toEqual(['Done', 'Off']);
    expect(filterLoans(loans, 'ALL')).toHaveLength(6);
  });

  it('sorts overdue first, then soonest due, repaid last', () => {
    const { db, hh } = setup();
    const names = sortLoans(listLoans(db as never, hh, today)).map((l) => l.personName);
    expect(names).toEqual(['Late', 'Soon', 'Later', 'Open', 'Off', 'Done']);
  });

  it('describes each state in plain words', () => {
    const { db, hh } = setup();
    const byName = (n: string) =>
      listLoans(db as never, hh, today).find((l) => l.personName === n)!;
    expect(loanDueText(byName('Late'))).toBe('5 days overdue');
    expect(loanDueText(byName('Soon'))).toBe('Due 2026-12-20');
    expect(loanDueText(byName('Open'))).toBe('No deadline');
    expect(loanDueText(byName('Done'))).toBe('Fully repaid');
    expect(loanDueText(byName('Off'))).toBe('Written off');
  });

  it('owed-to-you total counts balances but not repaid or written-off loans', () => {
    const { db, hh } = setup();
    expect(totalOwedToYou(db as never, hh, today)).toBe(10000 + 10000 + 6000 + 10000);
  });
});
