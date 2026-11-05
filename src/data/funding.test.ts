import { describe, expect, it } from 'vitest';

import { buildFundingBreakdown, planAutoAssign, projectSourceBalance } from './funding';
import type { IncomeMonth, IncomeStream } from './income';
import type { PlanLine } from './plan';

const stream = (id: string, name: string): IncomeStream => ({
  id,
  name,
  kind: 'salary',
  recurringAmount: null,
  recurringDay: null,
  recurringStartMonth: null,
});
const line = (
  id: string,
  planned: number,
  spent: number,
  incomeStreamId: string | null,
  archived = false,
): PlanLine => ({
  id,
  name: id,
  kind: 'running',
  hardCap: false,
  archived,
  planned,
  spent,
  incomeStreamId,
});

describe('funding breakdown', () => {
  const salary = stream('s1', 'Salary');
  const rental = stream('s2', 'Rental');
  const income: IncomeMonth = {
    streams: [salary, rental],
    monthStreams: [salary],
    entries: [],
    monthTotal: 350_000,
    entryCount: 2,
    streamTotals: new Map([
      ['s1', 300_000],
      ['s2', 0],
    ]),
    plannedIncome: [{ stream: rental, amount: 100_000, day: 1, confirmed: false }],
  };

  it('deducts linked budgets from each source and counts unconfirmed fixed income', () => {
    const result = buildFundingBreakdown(
      [
        line('rent', 120_000, 100_000, 's1'),
        line('food', 90_000, 40_000, 's1'),
        line('fun', 30_000, 0, 's2'),
      ],
      income,
    );
    const salaryRow = result.find((item) => item.streamId === 's1');
    expect(salaryRow).toMatchObject({
      available: 300_000,
      budgeted: 210_000,
      spent: 140_000,
      left: 90_000,
    });
    const rentalRow = result.find((item) => item.streamId === 's2');
    expect(rentalRow).toMatchObject({ received: 0, expected: 100_000, left: 70_000 });
  });

  it('puts unlinked lines and unattributed income in an Unassigned bucket, ignoring archived lines', () => {
    const result = buildFundingBreakdown(
      [line('misc', 20_000, 5_000, null), line('old', 999, 0, 's1', true)],
      income,
    );
    const unassigned = result.find((item) => item.streamId === null);
    expect(unassigned).toMatchObject({
      available: 50_000,
      budgeted: 20_000,
      left: 30_000,
      lineCount: 1,
    });
    expect(result.find((item) => item.streamId === 's1')?.budgeted).toBe(0);
  });

  it('shows a negative balance when a source is over-allocated', () => {
    const result = buildFundingBreakdown([line('big', 400_000, 0, 's1')], income);
    expect(result.find((item) => item.streamId === 's1')?.left).toBe(-100_000);
  });

  it('projects the balance after a new or changed line without double counting', () => {
    const sources = buildFundingBreakdown([line('rent', 120_000, 0, 's1')], income);
    expect(
      projectSourceBalance(sources, null, { planned: 200_000, incomeStreamId: 's1' })?.left,
    ).toBe(-20_000);
    const saved = { planned: 120_000, incomeStreamId: 's1' };
    expect(
      projectSourceBalance(sources, saved, { planned: 150_000, incomeStreamId: 's1' })?.left,
    ).toBe(150_000);
    expect(projectSourceBalance(sources, null, { planned: 5, incomeStreamId: null })).toBeNull();
  });

  it('auto-assigns unlinked lines first-fit and reports the ones that do not fit', () => {
    const sources = buildFundingBreakdown([line('linked', 250_000, 0, 's1')], income);
    const result = planAutoAssign(
      [
        line('linked', 250_000, 0, 's1'),
        line('a', 40_000, 0, null),
        line('b', 80_000, 0, null),
        line('huge', 900_000, 0, null),
        line('zero', 0, 0, null),
      ],
      sources,
    );
    expect(result.assignments).toEqual([
      { lineId: 'a', streamId: 's1' },
      { lineId: 'b', streamId: 's2' },
    ]);
    expect(result.unfunded.map((item) => item.id)).toEqual(['huge']);
  });
});
