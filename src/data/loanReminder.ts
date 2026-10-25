import { formatXAF } from '../ui/theme';

import type { LoanSummary } from './loans';

const CAMEROON_CODE = '237';

// wa.me needs digits with a country code. Returns null when the number can't be trusted.
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (trimmed.startsWith('+')) {
    // international as typed
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.length === 9 && /^[62]/.test(digits)) {
    // 9-digit national Cameroon mobile (6…) or landline (2…) numbers
    digits = CAMEROON_CODE + digits;
  } else if (!digits.startsWith(CAMEROON_CODE)) {
    return null;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function reminderMessage(loan: LoanSummary): string {
  const first = loan.personName.trim().split(/\s+/)[0] ?? '';
  const balance = formatXAF(loan.balance);
  let when = '';
  if (loan.status === 'OVERDUE') when = ' It is now past the agreed date.';
  else if (loan.nextDueOn) when = ` It is due on ${loan.nextDueOn}.`;
  return `Hello ${first}, I hope you are well. A friendly reminder about the ${balance} still outstanding from ${loan.lentOn}.${when} Thank you!`;
}

// Opens a chat with the borrower, or WhatsApp's own contact chooser when no usable number exists.
export function whatsappReminderUrl(loan: LoanSummary): string {
  const text = encodeURIComponent(reminderMessage(loan));
  const number = whatsappNumber(loan.personPhone);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function canSendReminder(loan: LoanSummary): boolean {
  return loan.balance > 0 && loan.status !== 'WRITTEN_OFF' && loan.status !== 'COMPLETE';
}
