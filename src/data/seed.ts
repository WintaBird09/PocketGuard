export type SeedLine = {
  id: string;
  name: string;
  kind: 'running' | 'fixed' | 'debt' | 'savings' | 'misc';
  hard_cap: boolean;
  sort_order: number;
};

export type SeedAllocation = {
  line_id: string;
  month: string;
  planned_amount: number;
};

export type SeedDebt = {
  id: string;
  creditor: string;
  original_amount: number;
  deadline: string | null;
  note: string;
};

export type SeedSavingsGoal = {
  id: string;
  name: string;
  target_amount: number;
  due_date: string;
  include_kids_savings: boolean;
};

export type SeedCommitment = {
  id: string;
  goal_id: string;
  line_id: string;
  month: string;
  planned_amount: number;
  saved_amount: number | null;
  saved_at: string | null;
};

export type SeedPlan = {
  household: {
    id: string;
    name: string;
    currency: string;
    month_start_day: number;
  };
  lines: SeedLine[];
  allocations: SeedAllocation[];
  debts: SeedDebt[];
  savingsGoal: SeedSavingsGoal;
  commitments: SeedCommitment[];
};

export const SEED_MONTHS = ['2026-09', '2026-10', '2026-11', '2026-12'] as const;
export const SEED_MONTHLY_INCOME = 1092000;

type SeedLineSpec = SeedLine & { amounts: readonly [number, number, number, number] };

const same = (value: number) => [value, value, value, value] as const;

const seedLineSpecs: SeedLineSpec[] = [
  {
    id: 'line-rent',
    name: 'Rent',
    kind: 'running',
    hard_cap: false,
    sort_order: 0,
    amounts: same(107500),
  },
  {
    id: 'line-kids-feeding',
    name: 'Kids Feeding (Kayden & Liam)',
    kind: 'running',
    hard_cap: true,
    sort_order: 1,
    amounts: same(40000),
  },
  {
    id: 'line-health',
    name: 'Health',
    kind: 'running',
    hard_cap: true,
    sort_order: 2,
    amounts: same(40000),
  },
  {
    id: 'line-internet',
    name: 'Internet',
    kind: 'running',
    hard_cap: false,
    sort_order: 3,
    amounts: same(30000),
  },
  {
    id: 'line-electricity',
    name: 'Electricity',
    kind: 'running',
    hard_cap: true,
    sort_order: 4,
    amounts: same(15000),
  },
  {
    id: 'line-fuel',
    name: 'Fuel',
    kind: 'running',
    hard_cap: true,
    sort_order: 5,
    amounts: same(120000),
  },
  {
    id: 'line-household-feeding',
    name: 'Household Feeding',
    kind: 'running',
    hard_cap: true,
    sort_order: 6,
    amounts: same(80000),
  },
  {
    id: 'line-supplies',
    name: 'Supplies',
    kind: 'running',
    hard_cap: true,
    sort_order: 7,
    amounts: same(20000),
  },
  {
    id: 'line-cleaner',
    name: 'Cleaner',
    kind: 'running',
    hard_cap: false,
    sort_order: 8,
    amounts: same(25000),
  },
  {
    id: 'line-car-wash',
    name: 'Car Wash',
    kind: 'running',
    hard_cap: true,
    sort_order: 9,
    amounts: same(5000),
  },
  {
    id: 'line-misc',
    name: 'Miscellaneous',
    kind: 'misc',
    hard_cap: true,
    sort_order: 10,
    amounts: same(30000),
  },
  {
    id: 'line-mom-meeting',
    name: 'Mom Meeting (Njangi)',
    kind: 'fixed',
    hard_cap: false,
    sort_order: 11,
    amounts: same(100000),
  },
  {
    id: 'line-kids-savings',
    name: 'Kids Account Savings',
    kind: 'savings',
    hard_cap: false,
    sort_order: 12,
    amounts: same(92000),
  },
  {
    id: 'line-debt-mom',
    name: 'Debt – Mom',
    kind: 'debt',
    hard_cap: false,
    sort_order: 13,
    amounts: [150000, 150000, 0, 0],
  },
  {
    id: 'line-debt-petra',
    name: 'Debt – Petra',
    kind: 'debt',
    hard_cap: false,
    sort_order: 14,
    amounts: [0, 0, 115000, 115000],
  },
];

const baseLines: SeedLine[] = seedLineSpecs.map((spec) => {
  const line: Partial<typeof spec> = { ...spec };
  delete line.amounts;
  return line as SeedLine;
});

// Savings planned for a month = kids account line + everything not allocated to other lines.
function plannedSavingsForMonthIndex(index: number): number {
  const spend = seedLineSpecs
    .filter((line) => line.kind !== 'savings')
    .reduce((sum, line) => sum + line.amounts[index], 0);
  return SEED_MONTHLY_INCOME - spend;
}

export function loadPlanSep2026(): SeedPlan {
  const allocations: SeedAllocation[] = [];
  SEED_MONTHS.forEach((month, index) => {
    for (const line of seedLineSpecs) {
      allocations.push({ line_id: line.id, month, planned_amount: line.amounts[index] });
    }
  });

  const commitments: SeedCommitment[] = SEED_MONTHS.map((month, index) => ({
    id: `commitment-${month}`,
    goal_id: 'goal-kids-savings',
    line_id: 'line-kids-savings',
    month,
    planned_amount: plannedSavingsForMonthIndex(index),
    saved_amount: null,
    saved_at: null,
  }));

  return {
    household: {
      id: 'household-seed',
      name: 'Pocket Guard Household',
      currency: 'XAF',
      month_start_day: 1,
    },
    lines: baseLines,
    allocations,
    debts: [
      {
        id: 'debt-mom',
        creditor: 'Mom',
        original_amount: 300000,
        deadline: '2026-11-30',
        note: 'Debt balance from the family cash advance.',
      },
      {
        id: 'debt-petra',
        creditor: 'Petra',
        original_amount: 230000,
        deadline: null,
        note: 'Flexible debt repayment schedule.',
      },
    ],
    savingsGoal: {
      id: 'goal-kids-savings',
      name: 'Kids savings',
      target_amount: 2000000,
      due_date: '2026-12-31',
      include_kids_savings: true,
    },
    commitments,
  };
}

export function plannedSavingsTotalForMonths(monthsToCheck: readonly string[]): number {
  return monthsToCheck.reduce((total, month) => {
    const index = SEED_MONTHS.indexOf(month as (typeof SEED_MONTHS)[number]);
    return index < 0 ? total : total + plannedSavingsForMonthIndex(index);
  }, 0);
}

export function seedShortfall(): number {
  return 2000000 - plannedSavingsTotalForMonths(SEED_MONTHS);
}
