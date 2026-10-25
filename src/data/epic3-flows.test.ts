import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildTransactionsCsv,
  deleteTransaction,
  listActivity,
  listOverrides,
  restoreTransaction,
  updateTransaction,
} from './activity';
import {
  completeOnboardingWithoutPlan,
  initializeLocalApp,
  loadSeedPlan,
  needsOnboarding,
} from './bootstrap';
import { getHomeDashboardSnapshot } from './dashboard';
import { addDebt, listDebts, recordDebtPayment } from './debts';
import { classifyInboxItem, discardInboxItem, listInbox } from './inbox';
import {
  addBudgetLine,
  copyForward,
  getMonthPlan,
  getPlannedIncome,
  setAllocation,
  setHardCap,
  setLineArchived,
} from './plan';
import { submitExpense } from './transaction-entry';

let db: Database.Database;
let hh: string;
const d = () => db as never;
const outbox = () => (db.prepare('SELECT COUNT(*) AS c FROM outbox').get() as { c: number }).c;

beforeEach(() => {
  db = new Database(':memory:');
  hh = initializeLocalApp(d()).householdId;
});

describe('plan', () => {
  it('loads all 15 PRD lines including Miscellaneous and planned income', () => {
    const plan = getMonthPlan(d(), hh, '2026-09');
    expect(plan.lines).toHaveLength(15);
    expect(plan.lines.find((l) => l.name === 'Miscellaneous')).toBeTruthy();
    expect(getPlannedIncome(d(), hh)).toBe(1092000);
  });

  it('edits allocation, toggles hard cap, archives, and records outbox rows', () => {
    const before = outbox();
    setAllocation(d(), hh, 'line-fuel', '2026-10', 130000);
    setHardCap(d(), hh, 'line-fuel', false);
    setLineArchived(d(), hh, 'line-cleaner', true);
    expect(outbox()).toBeGreaterThanOrEqual(before + 3);
    const plan = getMonthPlan(d(), hh, '2026-10');
    expect(plan.lines.find((l) => l.id === 'line-fuel')).toMatchObject({
      planned: 130000,
      hardCap: false,
    });
    expect(plan.lines.find((l) => l.id === 'line-cleaner')).toBeUndefined();
    expect(
      getMonthPlan(d(), hh, '2026-10', true).lines.find((l) => l.id === 'line-cleaner'),
    ).toBeTruthy();
  });

  it('rejects invalid amounts and duplicate lines', () => {
    expect(() => setAllocation(d(), hh, 'line-fuel', '2026-10', -1)).toThrow();
    expect(() => setAllocation(d(), hh, 'line-fuel', '2026-10', 1.5)).toThrow();
    expect(() => addBudgetLine(d(), hh, { name: 'Fuel', kind: 'running' })).toThrow();
  });

  it('adds a line and copies forward only missing allocations', () => {
    const id = addBudgetLine(d(), hh, { name: 'Pets', kind: 'running' });
    setAllocation(d(), hh, id, '2026-12', 5000);
    setAllocation(d(), hh, 'line-fuel', '2027-01', 1);
    copyForward(d(), hh, '2026-12', '2027-01');
    const plan = getMonthPlan(d(), hh, '2027-01');
    expect(plan.lines.find((l) => l.id === 'line-fuel')?.planned).toBe(1);
    expect(plan.lines.find((l) => l.id === id)?.planned).toBe(5000);
  });
});

describe('activity', () => {
  const spend = (amount: number, date = '2026-10-05') =>
    submitExpense(d(), hh, { lineId: 'line-supplies', amount, note: 'n', occurredOn: date }, true);

  it('filters, edits, soft deletes and restores with outbox rows', () => {
    const r = spend(1000);
    if (!r.saved) throw new Error('not saved');
    const id = r.transaction.id;
    expect(listActivity(d(), hh, { month: '2026-10', lineId: 'line-supplies' })).toHaveLength(1);
    expect(listActivity(d(), hh, { month: '2026-10', lineId: 'line-fuel' })).toHaveLength(0);
    updateTransaction(d(), hh, id, { amount: 2000, note: 'edited', occurredOn: '2026-10-06' });
    expect(listActivity(d(), hh, { month: '2026-10' })[0]).toMatchObject({ amount: 2000 });
    const before = outbox();
    expect(deleteTransaction(d(), hh, id)).toBe(true);
    expect(listActivity(d(), hh, { month: '2026-10' })).toHaveLength(0);
    expect(restoreTransaction(d(), hh, id)).toBe(true);
    expect(listActivity(d(), hh, { month: '2026-10' })).toHaveLength(1);
    expect(outbox()).toBe(before + 2);
  });

  it('escapes formula injection in CSV', () => {
    submitExpense(
      d(),
      hh,
      { lineId: 'line-supplies', amount: 500, note: '=HYPERLINK("x")', occurredOn: '2026-10-05' },
      true,
    );
    const csv = buildTransactionsCsv(d(), hh);
    expect(csv).not.toMatch(/(^|,)"?=HYPERLINK/m);
    expect(csv).toContain("'=HYPERLINK");
  });
});

describe('hard-stop override (FR-16)', () => {
  const draft = { lineId: 'line-fuel', amount: 500000, note: '', occurredOn: '2026-10-05' };

  it('blocks without reason or authentication', () => {
    expect(submitExpense(d(), hh, draft)).toMatchObject({ saved: false, reason: 'blocked' });
    expect(
      submitExpense(d(), hh, draft, true, { reason: 'urgent', authenticated: false }),
    ).toMatchObject({ saved: false, reason: 'blocked' });
    expect(
      submitExpense(d(), hh, draft, true, { reason: '  ', authenticated: true }),
    ).toMatchObject({ saved: false, reason: 'blocked' });
  });

  it('saves with reason and auth, and lists it in overrides', () => {
    const r = submitExpense(d(), hh, draft, true, { reason: 'Breakdown', authenticated: true });
    expect(r.saved).toBe(true);
    const list = listOverrides(d(), hh, '2026-10');
    expect(list).toHaveLength(1);
    expect(list[0].overrideReason).toBe('Breakdown');
  });
});

describe('debts', () => {
  it('derives balance, rejects overpay, tags payments and marks PAID', () => {
    const mom = listDebts(d(), hh).find((x) => x.id === 'debt-mom')!;
    expect(() =>
      recordDebtPayment(d(), hh, { debtId: 'debt-mom', amount: mom.balance + 1 }),
    ).toThrow();
    recordDebtPayment(d(), hh, { debtId: 'debt-mom', amount: 1000 });
    const after = listDebts(d(), hh).find((x) => x.id === 'debt-mom')!;
    expect(after.balance).toBe(mom.balance - 1000);
    const tx = db
      .prepare("SELECT debt_id, line_id FROM transactions WHERE debt_id = 'debt-mom'")
      .get() as {
      debt_id: string;
      line_id: string;
    };
    expect(tx.debt_id).toBe('debt-mom');
    expect(tx.line_id).toBe('line-debt-mom');
    recordDebtPayment(d(), hh, { debtId: 'debt-mom', amount: after.balance });
    expect(listDebts(d(), hh).find((x) => x.id === 'debt-mom')?.status).toBe('PAID');
  });

  it('marks overdue debts and adds new ones', () => {
    const id = addDebt(d(), hh, { creditor: 'Bob', originalAmount: 5000, deadline: '2020-01-01' });
    expect(listDebts(d(), hh).find((x) => x.id === id)?.status).toBe('OVERDUE');
  });
});

describe('inbox', () => {
  const draftRow = () =>
    db
      .prepare(
        `INSERT INTO transactions (id, household_id, occurred_at, amount, direction, source, status, note)
         VALUES ('draft-1', ?, '2026-10-05T12:00:00.000Z', 0, 'expense', 'voice', 'draft', 'raw');`,
      )
      .run(hh);

  it('lists drafts, classifies through the spend check, and discards', () => {
    draftRow();
    expect(listInbox(d(), hh).map((i) => i.id)).toContain('draft-1');
    const res = classifyInboxItem(
      d(),
      hh,
      'draft-1',
      {
        lineId: 'line-supplies',
        amount: 1000,
        occurredOn: '2026-10-05',
      },
      true,
    );
    expect(res.saved).toBe(true);
    expect(listInbox(d(), hh).find((i) => i.id === 'draft-1')).toBeUndefined();
    draftRow2();
    expect(discardInboxItem(d(), hh, 'draft-2')).toBe(true);
    expect(listInbox(d(), hh).find((i) => i.id === 'draft-2')).toBeUndefined();
  });

  function draftRow2() {
    db.prepare(
      `INSERT INTO transactions (id, household_id, occurred_at, amount, direction, source, status)
       VALUES ('draft-2', ?, '2026-10-05T12:00:00.000Z', 0, 'expense', 'voice', 'draft');`,
    ).run(hh);
  }
});

describe('onboarding and seed loading', () => {
  it('loadPlan:false starts empty and needs onboarding; loading is idempotent and keeps edits', () => {
    const empty = new Database(':memory:');
    const id = initializeLocalApp(empty as never, { loadPlan: false }).householdId;
    expect(needsOnboarding(empty as never, id)).toBe(true);
    loadSeedPlan(empty as never, id);
    expect(needsOnboarding(empty as never, id)).toBe(false);
    setAllocation(empty as never, id, 'line-fuel', '2026-10', 777);
    const n = (empty.prepare('SELECT COUNT(*) AS c FROM outbox').get() as { c: number }).c;
    loadSeedPlan(empty as never, id);
    expect((empty.prepare('SELECT COUNT(*) AS c FROM outbox').get() as { c: number }).c).toBe(n);
    expect(
      getMonthPlan(empty as never, id, '2026-10').lines.find((l) => l.id === 'line-fuel')?.planned,
    ).toBe(777);
  });

  it('start empty marks onboarding complete', () => {
    const empty = new Database(':memory:');
    const id = initializeLocalApp(empty as never, { loadPlan: false }).householdId;
    completeOnboardingWithoutPlan(empty as never, id);
    expect(needsOnboarding(empty as never, id)).toBe(false);
  });
});

describe('dashboard pace', () => {
  it('reports percent used and projection from real transactions', () => {
    submitExpense(
      d(),
      hh,
      { lineId: 'line-supplies', amount: 1000, note: '', occurredOn: '2026-10-05' },
      true,
    );
    const snap = getHomeDashboardSnapshot(d(), hh, '2026-10', new Date('2026-10-10T12:00:00'));
    const line = snap.lines.find((l) => l.id === 'line-supplies')!;
    expect(line.spent).toBe(1000);
    expect(line.percentUsed).toBeGreaterThan(0);
    expect(line.projected).toBe(Math.round((1000 / 10) * 31));
  });
});
