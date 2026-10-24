import { describe, expect, it } from 'vitest';

import { recentTransactions } from './epic3';

describe('Epic 3: transactions list', () => {
  it('includes the seeded recent transactions in the expected format', () => {
    expect(recentTransactions).toHaveLength(4);
    expect(recentTransactions[0]).toMatchObject({
      title: 'Fuel top-up',
      line: 'Fuel',
      amount: 20000,
      source: 'manual',
    });
  });

  it('keeps the transaction metadata consistent for filtered views', () => {
    const fuelEntries = recentTransactions.filter((item) => item.line.includes('Fuel'));
    const savingsEntries = recentTransactions.filter((item) => item.line.includes('Savings'));

    expect(fuelEntries).toHaveLength(1);
    expect(savingsEntries).toHaveLength(1);
  });
});
