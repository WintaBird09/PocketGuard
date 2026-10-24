import { debtBalance } from '../domain/budget';
import { evaluateSpendCheck, type SpendCheckResult } from '../domain/spendCheck';

import { loadPlanSep2026 } from './seed';

export type BudgetLineState = 'ok' | 'warn' | 'blocked';

export type AddTransactionReview = {
  lineId: string;
  lineName: string;
  planned: number;
  spent: number;
  remaining: number;
  hardCap: boolean;
  amount: number;
  result: SpendCheckResult;
};

export type BudgetLine = {
  id: string;
  name: string;
  kind: string;
  planned: number;
  spent: number;
  remaining: number;
  hardCap: boolean;
  status: BudgetLineState;
};

export type TransactionItem = {
  id: string;
  title: string;
  line: string;
  amount: number;
  date: string;
  source: string;
  debtId?: string;
};

export type DebtPayment = {
  id: string;
  title: string;
  amount: number;
  date: string;
  source: string;
};

export type DebtSnapshot = {
  id: string;
  name: string;
  originalAmount: number;
  balance: number;
  due: string;
  status: 'OPEN' | 'PAID' | 'OVERDUE';
  scheduledThisMonth: number;
  payments: DebtPayment[];
};

export type DashboardSummary = {
  label: string;
  income: number;
  spent: number;
  remaining: number;
  savingsTarget: number;
  savingsSaved: number;
  debtRemaining: number;
};

export type BudgetOverview = {
  totalPlanned: number;
  totalSpent: number;
  totalRemaining: number;
  unallocated: number;
  flexible: number;
};

export type SavingsSnapshot = {
  goalName: string;
  target: number;
  saved: number;
  monthlyCommitment: number;
  projectedGap: number;
};

const defaultSpentByLine: Record<string, number> = {
  'line-fuel': 86000,
  'line-mom-meeting': 62000,
  'line-kids-savings': 210000,
  'line-debt-mom': 0,
  'line-debt-petra': 0,
};

export function getHomeDashboardSnapshot(monthKey = '2026-09') {
  const plan = loadPlanSep2026();
  const monthAllocations = new Map(
    plan.allocations
      .filter((allocation) => allocation.month === monthKey)
      .map((allocation) => [allocation.line_id, allocation.planned_amount]),
  );

  const lines: BudgetLine[] = plan.lines.map((line) => {
    const planned = monthAllocations.get(line.id) ?? 0;
    const spent = defaultSpentByLine[line.id] ?? 0;
    const remaining = planned - spent;

    const result = evaluateSpendCheck({
      amount: 0,
      planned,
      spent,
      hardCap: line.hard_cap,
      threshold: 80,
      daysElapsed: 18,
      daysInMonth: 30,
      lineName: line.name,
    });

    return {
      id: line.id,
      name: line.name,
      kind: line.kind,
      planned,
      spent,
      remaining,
      hardCap: line.hard_cap,
      status: result.status.toLowerCase() as BudgetLineState,
    };
  });

  const totalSpent = lines.reduce((sum, line) => sum + line.spent, 0);
  const totalPlanned = lines.reduce((sum, line) => sum + line.planned, 0);
  const summary: DashboardSummary = {
    label: 'September 2026',
    income: 520000,
    spent: totalSpent,
    remaining: 520000 - totalSpent,
    savingsTarget: plan.savingsGoal.target_amount,
    savingsSaved: 892000,
    debtRemaining: Math.max(
      0,
      plan.debts.reduce((sum, debt) => sum + debt.original_amount, 0) - 80000,
    ),
  };

  return {
    summary,
    lines,
    totalPlanned,
  };
}

export function getAddTransactionReview(
  lineId: string,
  amount: number,
  monthKey = '2026-09',
): AddTransactionReview {
  const plan = loadPlanSep2026();
  const line = plan.lines.find((item) => item.id === lineId) ?? plan.lines[0];
  const planned =
    plan.allocations.find(
      (allocation) => allocation.line_id === line.id && allocation.month === monthKey,
    )?.planned_amount ?? 0;
  const spent = defaultSpentByLine[line.id] ?? 0;
  const remaining = planned - spent;
  const result = evaluateSpendCheck({
    amount,
    planned,
    spent,
    hardCap: line.hard_cap,
    threshold: 80,
    daysElapsed: 18,
    daysInMonth: 30,
    lineName: line.name,
  });

  return {
    lineId: line.id,
    lineName: line.name,
    planned,
    spent,
    remaining,
    hardCap: line.hard_cap,
    amount,
    result,
  };
}

export function getBudgetOverview(monthKey = '2026-09'): BudgetOverview {
  const snapshot = getHomeDashboardSnapshot(monthKey);
  const totalSpent = snapshot.lines.reduce((sum, line) => sum + line.spent, 0);
  const totalPlanned = snapshot.totalPlanned;

  return {
    totalPlanned,
    totalSpent,
    totalRemaining: totalPlanned - totalSpent,
    unallocated: Math.max(0, snapshot.summary.income - totalPlanned),
    flexible: Math.max(0, totalPlanned - totalSpent),
  };
}

export function getSavingsSnapshot(monthKey = '2026-09'): SavingsSnapshot {
  const plan = loadPlanSep2026();
  const monthlyCommitment = plan.commitments
    .filter((commitment) => commitment.month === monthKey)
    .reduce((sum, commitment) => sum + commitment.planned_amount, 0);
  const saved = getHomeDashboardSnapshot(monthKey).summary.savingsSaved;

  return {
    goalName: plan.savingsGoal.name,
    target: plan.savingsGoal.target_amount,
    saved,
    monthlyCommitment,
    projectedGap: Math.max(0, plan.savingsGoal.target_amount - saved),
  };
}

export function getDebtsSnapshot(monthKey = '2026-09', asOfDate = new Date()): DebtSnapshot[] {
  const plan = loadPlanSep2026();
  const asOfKey = [
    asOfDate.getFullYear(),
    String(asOfDate.getMonth() + 1).padStart(2, '0'),
    String(asOfDate.getDate()).padStart(2, '0'),
  ].join('-');

  return plan.debts.map((debt) => {
    const payments = recentTransactions
      .filter((transaction) => transaction.debtId === debt.id)
      .map(({ id, title, amount, date, source }) => ({ id, title, amount, date, source }));
    const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const balance = debtBalance(debt.original_amount, paidAmount);
    const scheduledThisMonth =
      plan.allocations.find(
        (allocation) => allocation.line_id === `line-${debt.id}` && allocation.month === monthKey,
      )?.planned_amount ?? 0;
    let status: DebtSnapshot['status'] = 'OPEN';
    if (balance === 0) status = 'PAID';
    else if (debt.deadline && debt.deadline < asOfKey) status = 'OVERDUE';

    return {
      id: debt.id,
      name: debt.creditor,
      originalAmount: debt.original_amount,
      balance,
      due: new Date(`${debt.deadline}T00:00:00.000Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
      }),
      status,
      scheduledThisMonth,
      payments,
    };
  });
}

export const monthSummary = getHomeDashboardSnapshot().summary;
export const budgetLines: BudgetLine[] = getHomeDashboardSnapshot().lines;
export const budgetOverview = getBudgetOverview();

export const recentTransactions: TransactionItem[] = [
  { id: 't1', title: 'Fuel top-up', line: 'Fuel', amount: 20000, date: 'Today', source: 'manual' },
  {
    id: 't2',
    title: 'School fees',
    line: 'Miscellaneous',
    amount: 35000,
    date: 'Yesterday',
    source: 'voice',
  },
  {
    id: 't3',
    title: 'Mom repayment',
    line: 'Debt – Mom',
    amount: 150000,
    date: 'Mon',
    source: 'manual',
    debtId: 'debt-mom',
  },
  {
    id: 't4',
    title: 'Kids savings',
    line: 'Kids Savings',
    amount: 92000,
    date: 'Sun',
    source: 'manual',
  },
];

export const savingsPlan = getSavingsSnapshot();

export const debts: DebtSnapshot[] = getDebtsSnapshot();

export const inboxItems = [
  { id: 'draft-1', label: '“Spent 20,000 on fuel”', status: 'Needs confirm' },
  { id: 'draft-2', label: '“I saved 92,000 to kids”', status: 'Ready' },
];

export const moreItems = [
  {
    title: 'Income & transfers',
    subtitle: 'Record salary and bank-to-MoMo transfers',
    href: '/income-transfer',
  },
  { title: 'Debts', subtitle: 'Payment tracking and balances', href: '/debts' },
  { title: 'Inbox', subtitle: 'Voice notes and draft entries', href: '/inbox' },
  { title: 'Settings', subtitle: 'Preferences and profile controls', href: '/settings' },
];
