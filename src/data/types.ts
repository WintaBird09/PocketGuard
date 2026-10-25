export type BudgetLineState = 'ok' | 'warn' | 'blocked';

export type BudgetLine = {
  id: string;
  name: string;
  kind: string;
  planned: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  projected: number | null;
  hardCap: boolean;
  status: BudgetLineState;
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
