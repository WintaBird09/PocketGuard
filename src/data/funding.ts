import type { IncomeMonth, IncomeKind } from './income';
import type { PlanLine } from './plan';

export type FundingSource = {
  /** null is the bucket for lines that are not linked to any income source. */
  streamId: string | null;
  name: string;
  kind: IncomeKind | null;
  received: number;
  expected: number;
  available: number;
  budgeted: number;
  spent: number;
  left: number;
  lineCount: number;
};

/**
 * Maps each budget line to the income source funding it. A source's available money is what
 * was received this month plus fixed income still waiting to be confirmed.
 */
export function buildFundingBreakdown(lines: PlanLine[], income: IncomeMonth): FundingSource[] {
  const active = lines.filter((line) => !line.archived);
  const sources: FundingSource[] = income.streams.map((stream) => {
    const received = income.streamTotals.get(stream.id) ?? 0;
    const pending = income.plannedIncome.find((item) => item.stream.id === stream.id);
    const expected = pending && !pending.confirmed ? pending.amount : 0;
    const linked = active.filter((line) => line.incomeStreamId === stream.id);
    const budgeted = linked.reduce((sum, line) => sum + line.planned, 0);
    const available = received + expected;
    return {
      streamId: stream.id,
      name: stream.name,
      kind: stream.kind,
      received,
      expected,
      available,
      budgeted,
      spent: linked.reduce((sum, line) => sum + line.spent, 0),
      left: available - budgeted,
      lineCount: linked.length,
    };
  });

  const known = new Set(income.streams.map((stream) => stream.id));
  const loose = active.filter((line) => !line.incomeStreamId || !known.has(line.incomeStreamId));
  const unassignedIncome =
    income.monthTotal - sources.reduce((sum, item) => sum + item.received, 0);
  if (loose.length > 0 || unassignedIncome > 0) {
    const budgeted = loose.reduce((sum, line) => sum + line.planned, 0);
    sources.push({
      streamId: null,
      name: 'Unassigned',
      kind: null,
      received: unassignedIncome,
      expected: 0,
      available: unassignedIncome,
      budgeted,
      spent: loose.reduce((sum, line) => sum + line.spent, 0),
      left: unassignedIncome - budgeted,
      lineCount: loose.length,
    });
  }
  return sources.filter(
    (item) => item.streamId === null || item.available > 0 || item.lineCount > 0,
  );
}

/**
 * Balance a source would have if a line took `next.planned` from `next.streamId`.
 * `current` is the line as it is saved now (null for a brand-new line), so its existing
 * amount is not counted twice.
 */
export function projectSourceBalance(
  sources: FundingSource[],
  current: { planned: number; incomeStreamId: string | null } | null,
  next: { planned: number; incomeStreamId: string | null },
): { source: FundingSource; left: number } | null {
  if (!next.incomeStreamId) return null;
  const source = sources.find((item) => item.streamId === next.incomeStreamId);
  if (!source) return null;
  const alreadyCounted =
    current && current.incomeStreamId === source.streamId ? current.planned : 0;
  return { source, left: source.left + alreadyCounted - next.planned };
}

/**
 * First-fit assignment of unlinked lines to the sources that still have money left.
 * Lines that fit nowhere are returned separately so nothing is silently over-allocated.
 */
export function planAutoAssign(
  lines: PlanLine[],
  sources: FundingSource[],
): { assignments: { lineId: string; streamId: string }[]; unfunded: PlanLine[] } {
  const remaining = new Map(
    sources.flatMap((source) =>
      source.streamId !== null && source.available > 0
        ? [[source.streamId, source.left] as const]
        : [],
    ),
  );
  const assignments: { lineId: string; streamId: string }[] = [];
  const unfunded: PlanLine[] = [];
  for (const line of lines) {
    if (line.archived || line.incomeStreamId || line.planned <= 0) continue;
    const target = [...remaining].find(([, left]) => left >= line.planned);
    if (!target) {
      unfunded.push(line);
      continue;
    }
    assignments.push({ lineId: line.id, streamId: target[0] });
    remaining.set(target[0], target[1] - line.planned);
  }
  return { assignments, unfunded };
}
