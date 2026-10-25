import type { DatabaseLike } from './db';
import { assertWholeAmount, inTransaction, requirePrepared } from './household';
import { settings } from './repos';

// Optional monthly cap on new lending (E4). Stored as an app setting; absent or empty means off.
export const lendingCapKey = 'lending_cap_monthly';

export type LendingCheck = {
  status: 'OK' | 'BLOCKED';
  cap: number | null;
  lentThisMonth: number;
  remaining: number | null;
  reason: string;
};

export function getLendingCap(db: DatabaseLike, householdId: string): number | null {
  const raw = settings.get(db as never, householdId, lendingCapKey);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

// null (or 0) turns the cap off.
export function setLendingCap(db: DatabaseLike, householdId: string, cap: number | null): void {
  if (cap !== null && cap !== 0) assertWholeAmount(cap);
  if (cap !== null && cap < 0) throw new Error('The lending cap cannot be negative.');
  inTransaction(db, () => {
    settings.set(db as never, householdId, lendingCapKey, cap ? String(cap) : '');
  });
}

export function lentInMonth(
  db: DatabaseLike,
  householdId: string,
  month: string,
  excludeLoanId?: string | null,
): number {
  const row = requirePrepared(db)(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM loans
      WHERE household_id = ? AND deleted_at IS NULL AND substr(lent_on, 1, 7) = ? AND id <> ?;`,
  ).get(householdId, month, excludeLoanId ?? '');
  return Number(row?.total ?? 0);
}

export function checkLendingCap(
  db: DatabaseLike,
  householdId: string,
  input: { amount: number; lentOn: string; excludeLoanId?: string | null },
): LendingCheck {
  const cap = getLendingCap(db, householdId);
  const lent = lentInMonth(db, householdId, input.lentOn.slice(0, 7), input.excludeLoanId);
  if (cap === null) {
    return { status: 'OK', cap: null, lentThisMonth: lent, remaining: null, reason: '' };
  }
  const remaining = cap - lent;
  if (input.amount > remaining) {
    return {
      status: 'BLOCKED',
      cap,
      lentThisMonth: lent,
      remaining: Math.max(0, remaining),
      reason: `This would exceed your monthly lending cap of ${cap} XAF (${Math.max(0, remaining)} XAF left for that month).`,
    };
  }
  return { status: 'OK', cap, lentThisMonth: lent, remaining, reason: '' };
}
