import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { initializeLocalApp } from './bootstrap';
import {
  canSendReminder,
  reminderMessage,
  whatsappNumber,
  whatsappReminderUrl,
} from './loanReminder';
import { createLoan, getLoan, recordLoanRepayment, writeOffLoan } from './loans';

function make(phone: string | null) {
  const db = new Database(':memory:');
  const hh = initializeLocalApp(db as never).householdId;
  const id = createLoan(db as never, hh, {
    personName: 'Desmond Ngu',
    personPhone: phone,
    lentOn: '2026-10-01',
    amount: 20000,
    plan: 'single',
    deadline: '2026-12-01',
  });
  return { db, hh, id, loan: () => getLoan(db as never, hh, id, '2026-10-25')! };
}

describe('whatsappNumber', () => {
  it('normalises international, 00-prefixed and national Cameroon numbers', () => {
    expect(whatsappNumber('+237 670 000 111')).toBe('237670000111');
    expect(whatsappNumber('00237670000111')).toBe('237670000111');
    expect(whatsappNumber('670 000 111')).toBe('237670000111');
    expect(whatsappNumber('+44 7700 900123')).toBe('447700900123');
  });

  it('refuses numbers it cannot place in a country', () => {
    expect(whatsappNumber(null)).toBeNull();
    expect(whatsappNumber('abc')).toBeNull();
    expect(whatsappNumber('12345')).toBeNull();
    expect(whatsappNumber('0770 123 45')).toBeNull();
  });
});

describe('reminder', () => {
  it('writes a polite message with the outstanding balance and due date', () => {
    const { loan, db, hh, id } = make('+237670000111');
    recordLoanRepayment(db as never, hh, { loanId: id, amount: 5000 });
    const text = reminderMessage(loan());
    expect(text).toContain('Hello Desmond');
    expect(text).toContain('15,000 XAF');
    expect(text).toContain('2026-12-01');
    expect(text).toContain('Thank you');
  });

  it('builds a chat link with the number, or the generic link without one', () => {
    const withNumber = whatsappReminderUrl(make('670 000 111').loan());
    expect(withNumber.startsWith('https://wa.me/237670000111?text=')).toBe(true);
    expect(withNumber).not.toContain(' ');
    expect(whatsappReminderUrl(make(null).loan()).startsWith('https://wa.me/?text=')).toBe(true);
  });

  it('is offered only while money is still expected', () => {
    const { loan, db, hh, id } = make(null);
    expect(canSendReminder(loan())).toBe(true);
    writeOffLoan(db as never, hh, id);
    expect(canSendReminder(loan())).toBe(false);
  });

  it('is not offered once fully repaid', () => {
    const { loan, db, hh, id } = make(null);
    recordLoanRepayment(db as never, hh, { loanId: id, amount: 20000 });
    expect(canSendReminder(loan())).toBe(false);
  });
});
