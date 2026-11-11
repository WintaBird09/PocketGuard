import { describe, expect, it } from 'vitest';

import { groupTransactionCategories } from './transactionCategories';

describe('groupTransactionCategories', () => {
  it('shows repeated category names once and retains every underlying line id', () => {
    expect(
      groupTransactionCategories([
        { id: 'misc-old', name: 'Miscellaneous' },
        { id: 'fuel', name: 'Fuel' },
        { id: 'misc-new', name: ' miscellaneous ' },
      ]),
    ).toEqual([
      {
        key: 'category:miscellaneous',
        name: 'Miscellaneous',
        lineIds: ['misc-old', 'misc-new'],
        preferredLineId: 'misc-old',
      },
      {
        key: 'category:fuel',
        name: 'Fuel',
        lineIds: ['fuel'],
        preferredLineId: 'fuel',
      },
    ]);
  });
});
