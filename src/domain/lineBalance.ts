export type BalanceTone = 'green' | 'orange' | 'red';

export type LineBalance = { left: number; usedRatio: number; tone: BalanceTone };

type Expense = { id: string; lineId: string | null; direction: string; amount: number };

export function toneForUsedRatio(ratio: number): BalanceTone {
  if (ratio > 0.8) return 'red';
  if (ratio >= 0.4) return 'orange';
  return 'green';
}

// `itemsNewestFirst` is the whole month's activity; each expense gets the line balance
// as it stood right after that transaction.
export function balancesAfterEachExpense(
  itemsNewestFirst: Expense[],
  planned: ReadonlyMap<string, number>,
): Map<string, LineBalance> {
  const running = new Map<string, number>();
  const result = new Map<string, LineBalance>();
  for (let index = itemsNewestFirst.length - 1; index >= 0; index -= 1) {
    const item = itemsNewestFirst[index]!;
    if (item.direction !== 'expense' || !item.lineId) continue;
    const budget = planned.get(item.lineId) ?? 0;
    const spent = (running.get(item.lineId) ?? 0) + item.amount;
    running.set(item.lineId, spent);
    if (budget <= 0) continue;
    const usedRatio = spent / budget;
    result.set(item.id, { left: budget - spent, usedRatio, tone: toneForUsedRatio(usedRatio) });
  }
  return result;
}
