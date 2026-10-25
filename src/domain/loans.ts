// Pure loan rules (PRD §7.8b). Dates are `YYYY-MM-DD` strings; amounts are integer XAF.

export type LoanPlan = 'single' | 'installments' | 'flexible';
export type LoanStatus = 'PENDING' | 'PARTIAL' | 'COMPLETE' | 'OVERDUE' | 'WRITTEN_OFF';

export type Installment = { dueOn: string; amount: number };

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: string): { y: number; m: number; d: number } {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new Error(`Invalid date: ${value}`);
  }
  return { y, m, d };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

// Same day number `months` later, clamped to the month end (31 Jan + 1 month = 28/29 Feb).
export function addMonths(date: string, months: number): string {
  const { y, m, d } = parseDate(date);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(d, lastDay))}`;
}

export function generateInstallments(input: {
  amount: number;
  firstDueOn: string;
  count: number;
}): Installment[] {
  const { amount, firstDueOn, count } = input;
  if (!Number.isInteger(amount) || amount <= 0)
    throw new Error('Amount must be a positive whole number.');
  if (!Number.isInteger(count) || count < 1) throw new Error('Choose at least one installment.');
  if (count > amount) throw new Error('There cannot be more installments than XAF to repay.');
  parseDate(firstDueOn);

  const base = Math.floor(amount / count);
  const remainder = amount - base * count;
  return Array.from({ length: count }, (_, index) => ({
    dueOn: addMonths(firstDueOn, index),
    // The last installment absorbs the remainder so the schedule always sums to the loan.
    amount: index === count - 1 ? base + remainder : base,
  }));
}

export function sumPayments(payments: readonly { amount: number }[]): number {
  return payments.reduce((total, payment) => total + payment.amount, 0);
}

export function loanBalance(amount: number, payments: readonly { amount: number }[]): number {
  return Math.max(0, amount - sumPayments(payments));
}

export function assertRepayable(amount: number, repayment: number, balance: number): void {
  if (!Number.isInteger(repayment) || repayment <= 0) {
    throw new Error('Repayment must be a positive whole number.');
  }
  if (repayment > balance) {
    throw new Error(`Repayment exceeds the remaining balance of ${balance} XAF.`);
  }
  if (amount <= 0) throw new Error('Loan amount is invalid.');
}

export type LoanStatusInput = {
  amount: number;
  payments: readonly { amount: number }[];
  deadline: string | null;
  installments?: readonly Installment[];
  writtenOff?: boolean;
  today: string;
};

export type LoanState = {
  status: LoanStatus;
  paid: number;
  balance: number;
  percentPaid: number;
  // Why the loan is overdue, so the UI can say "2 installments late".
  overdueInstallments: number;
  daysOverdue: number;
  nextDueOn: string | null;
};

function daysBetween(from: string, to: string): number {
  const a = parseDate(from);
  const b = parseDate(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

export function deriveLoanState(input: LoanStatusInput): LoanState {
  const paid = sumPayments(input.payments);
  const balance = Math.max(0, input.amount - paid);
  const percentPaid = input.amount > 0 ? Math.min(100, Math.round((paid / input.amount) * 100)) : 0;
  const installments = [...(input.installments ?? [])].sort((x, y) =>
    x.dueOn.localeCompare(y.dueOn),
  );

  let running = 0;
  let overdueInstallments = 0;
  let earliestOverdue: string | null = null;
  let nextDueOn: string | null = null;
  for (const installment of installments) {
    running += installment.amount;
    const covered = paid >= running;
    if (!covered && installment.dueOn < input.today) {
      overdueInstallments += 1;
      earliestOverdue ??= installment.dueOn;
    } else if (!covered && nextDueOn === null) {
      nextDueOn = installment.dueOn;
    }
  }

  const deadlinePassed = input.deadline !== null && input.deadline < input.today;
  if (deadlinePassed && earliestOverdue === null) earliestOverdue = input.deadline;
  if (installments.length === 0 && input.deadline && !deadlinePassed) nextDueOn = input.deadline;

  const lateSince = balance > 0 ? earliestOverdue : null;
  const base = { paid, balance, percentPaid, nextDueOn };
  const overdue = {
    overdueInstallments,
    daysOverdue: lateSince ? daysBetween(lateSince, input.today) : 0,
  };

  // Fully repaid always wins, even if the owner had written the loan off.
  if (balance === 0) {
    return {
      ...base,
      ...overdue,
      overdueInstallments: 0,
      daysOverdue: 0,
      nextDueOn: null,
      status: 'COMPLETE',
    };
  }
  if (input.writtenOff) {
    return {
      ...base,
      ...overdue,
      overdueInstallments: 0,
      daysOverdue: 0,
      nextDueOn: null,
      status: 'WRITTEN_OFF',
    };
  }
  if (lateSince) return { ...base, ...overdue, status: 'OVERDUE' };
  return { ...base, ...overdue, status: paid > 0 ? 'PARTIAL' : 'PENDING' };
}

export function deriveLoanStatus(input: LoanStatusInput): LoanStatus {
  return deriveLoanState(input).status;
}

export const loanStatusLabel: Record<LoanStatus, string> = {
  PENDING: 'Pending',
  PARTIAL: 'Partial payment',
  COMPLETE: 'Complete',
  OVERDUE: 'Overdue',
  WRITTEN_OFF: 'Written off',
};
