import { loanStatusLabel, type LoanStatus } from '../domain/loans';

import type { LoanSummary } from './loans';

export type LoanFilter = 'ACTIVE' | 'OVERDUE' | 'COMPLETE' | 'ALL';

export const loanFilters: { key: LoanFilter; label: string }[] = [
  { key: 'ACTIVE', label: 'Active' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'COMPLETE', label: 'Complete' },
  { key: 'ALL', label: 'All' },
];

export function filterLoans(loans: readonly LoanSummary[], filter: LoanFilter): LoanSummary[] {
  switch (filter) {
    case 'ACTIVE':
      return loans.filter((loan) => ['PENDING', 'PARTIAL', 'OVERDUE'].includes(loan.status));
    case 'OVERDUE':
      return loans.filter((loan) => loan.status === 'OVERDUE');
    case 'COMPLETE':
      return loans.filter((loan) => loan.status === 'COMPLETE' || loan.status === 'WRITTEN_OFF');
    default:
      return [...loans];
  }
}

// Overdue first (longest late first), then soonest due, then the rest.
export function sortLoans(loans: readonly LoanSummary[]): LoanSummary[] {
  const rank: Record<LoanStatus, number> = {
    OVERDUE: 0,
    PARTIAL: 1,
    PENDING: 1,
    WRITTEN_OFF: 2,
    COMPLETE: 3,
  };
  return [...loans].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (a.status === 'OVERDUE') return b.daysOverdue - a.daysOverdue;
    return (a.nextDueOn ?? '9999-12-31').localeCompare(b.nextDueOn ?? '9999-12-31');
  });
}

export function loanDueText(loan: LoanSummary): string {
  switch (loan.status) {
    case 'COMPLETE':
      return 'Fully repaid';
    case 'WRITTEN_OFF':
      return 'Written off';
    case 'OVERDUE':
      return loan.overdueInstallments > 1
        ? `${loan.overdueInstallments} installments late · ${loan.daysOverdue} days`
        : `${loan.daysOverdue} ${loan.daysOverdue === 1 ? 'day' : 'days'} overdue`;
    default:
      return loan.nextDueOn ? `Due ${loan.nextDueOn}` : 'No deadline';
  }
}

export const loanBadgeStyle: Record<LoanStatus, string> = {
  PENDING: 'border-slate-400 text-slate-700',
  PARTIAL: 'border-amber-500 text-amber-700',
  COMPLETE: 'border-emerald-600 text-emerald-700',
  OVERDUE: 'border-red-600 text-red-700',
  WRITTEN_OFF: 'border-slate-300 text-slate-500',
};

export { loanStatusLabel };
