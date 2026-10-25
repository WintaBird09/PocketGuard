import type { LoanPlan } from '../domain/loans';

import { defaultInstallmentCount, type LoanInput, type LoanSummary } from './loans';

export type LoanFormFields = {
  personName: string;
  personPhone: string;
  contactId: string;
  lentOn: string;
  amount: string;
  plan: LoanPlan;
  deadline: string;
  firstDueOn: string;
  installmentCount: string;
  note: string;
};

export function emptyLoanForm(today: string): LoanFormFields {
  return {
    personName: '',
    personPhone: '',
    contactId: '',
    lentOn: today,
    amount: '',
    plan: 'single',
    deadline: '',
    firstDueOn: '',
    installmentCount: String(defaultInstallmentCount),
    note: '',
  };
}

export function loanToForm(loan: LoanSummary): LoanFormFields {
  return {
    personName: loan.personName,
    personPhone: loan.personPhone ?? '',
    contactId: loan.contactId ?? '',
    lentOn: loan.lentOn,
    amount: String(loan.amount),
    plan: loan.plan,
    deadline: loan.plan === 'installments' ? '' : (loan.deadline ?? ''),
    firstDueOn: loan.installments[0]?.dueOn ?? '',
    installmentCount: String(loan.installments.length || defaultInstallmentCount),
    note: loan.note,
  };
}

// Turns raw text fields into a LoanInput; throws a user-readable message when a field is unusable.
export function buildLoanInput(fields: LoanFormFields): LoanInput {
  const amountText = fields.amount.replace(/[\s,]/g, '');
  if (!/^\d+$/.test(amountText) || Number(amountText) <= 0) {
    throw new Error('Enter the amount as a whole number of XAF.');
  }
  const countText = fields.installmentCount.trim();
  const count = Number(countText);
  if (fields.plan === 'installments' && (!/^\d+$/.test(countText) || count < 2 || count > 60)) {
    throw new Error('Installments must be a whole number between 2 and 60.');
  }
  return {
    personName: fields.personName,
    personPhone: fields.personPhone || null,
    contactId: fields.contactId || null,
    lentOn: fields.lentOn.trim(),
    amount: Number(amountText),
    plan: fields.plan,
    deadline: fields.plan === 'installments' ? null : fields.deadline.trim() || null,
    firstDueOn: fields.plan === 'installments' ? fields.firstDueOn.trim() : null,
    installmentCount: fields.plan === 'installments' ? count : undefined,
    note: fields.note || null,
  };
}
