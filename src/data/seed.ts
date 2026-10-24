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
  deadline: string;
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

const baseLines: SeedLine[] = [
  { id: 'line-fuel', name: 'Fuel', kind: 'running', hard_cap: true, sort_order: 1 },
  {
    id: 'line-mom-meeting',
    name: 'Mom Meeting (Njangi)',
    kind: 'fixed',
    hard_cap: false,
    sort_order: 2,
  },
  { id: 'line-debt-mom', name: 'Debt – Mom', kind: 'debt', hard_cap: false, sort_order: 3 },
  { id: 'line-debt-petra', name: 'Debt – Petra', kind: 'debt', hard_cap: false, sort_order: 4 },
  {
    id: 'line-kids-savings',
    name: 'Kids Savings',
    kind: 'savings',
    hard_cap: false,
    sort_order: 5,
  },
];

const months = ['2026-09', '2026-10', '2026-11', '2026-12'] as const;

const allocationByMonth = {
  '2026-09': {
    fuel: 120000,
    momMeeting: 100000,
    debtMom: 150000,
    debtPetra: 0,
    kidsSavings: 359500,
  },
  '2026-10': {
    fuel: 120000,
    momMeeting: 100000,
    debtMom: 150000,
    debtPetra: 0,
    kidsSavings: 359500,
  },
  '2026-11': {
    fuel: 120000,
    momMeeting: 100000,
    debtMom: 0,
    debtPetra: 115000,
    kidsSavings: 394500,
  },
  '2026-12': {
    fuel: 120000,
    momMeeting: 100000,
    debtMom: 0,
    debtPetra: 115000,
    kidsSavings: 394500,
  },
} as const;

export function loadPlanSep2026(): SeedPlan {
  const allocations: SeedAllocation[] = [];

  for (const month of months) {
    const plan = allocationByMonth[month];
    allocations.push(
      { line_id: 'line-fuel', month, planned_amount: plan.fuel },
      { line_id: 'line-mom-meeting', month, planned_amount: plan.momMeeting },
      { line_id: 'line-debt-mom', month, planned_amount: plan.debtMom },
      { line_id: 'line-debt-petra', month, planned_amount: plan.debtPetra },
      { line_id: 'line-kids-savings', month, planned_amount: plan.kidsSavings },
    );
  }

  const commitments: SeedCommitment[] = months.map((month) => ({
    id: `commitment-${month}`,
    goal_id: 'goal-kids-savings',
    line_id: 'line-kids-savings',
    month,
    planned_amount: allocationByMonth[month].kidsSavings,
    saved_amount: 0,
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
        deadline: '2026-12-31',
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
    const monthPlan = allocationByMonth[month as keyof typeof allocationByMonth];
    return total + monthPlan.kidsSavings;
  }, 0);
}

export function seedShortfall(): number {
  return 2000000 - plannedSavingsTotalForMonths(months);
}
