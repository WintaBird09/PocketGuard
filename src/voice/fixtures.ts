import type { ParseExpenseItem } from './contract';

export type VoiceParseFixture = {
  transcript: string;
  expected: Array<Pick<ParseExpenseItem, 'intent' | 'amount_xaf' | 'line_guess_name'>>;
};

export const voiceParseFixtures: VoiceParseFixture[] = [
  {
    transcript: '20k fuel',
    expected: [{ intent: 'log_expense', amount_xaf: 20000, line_guess_name: 'Fuel' }],
  },
  {
    transcript: 'Spent 20,000 on fuel in Douala',
    expected: [{ intent: 'log_expense', amount_xaf: 20000, line_guess_name: 'Fuel' }],
  },
  {
    transcript: 'Paid 5,000 car wash and 3,000 airtime',
    expected: [
      { intent: 'log_expense', amount_xaf: 5000, line_guess_name: 'Car wash' },
      { intent: 'log_expense', amount_xaf: 3000, line_guess_name: null },
    ],
  },
  {
    transcript: 'Can I spend 30,000 on fuel?',
    expected: [{ intent: 'check_spend', amount_xaf: 30000, line_guess_name: 'Fuel' }],
  },
  {
    transcript: 'I saved 92,000 to the kids account',
    expected: [{ intent: 'confirm_saving', amount_xaf: 92000, line_guess_name: 'Kids savings' }],
  },
  {
    transcript: 'Yesterday spent 13k on outing with Desmond',
    expected: [{ intent: 'log_expense', amount_xaf: 13000, line_guess_name: null }],
  },
  {
    transcript: 'Salary of 450,000 received today',
    expected: [{ intent: 'log_income', amount_xaf: 450000, line_guess_name: null }],
  },
  {
    transcript: 'Bought vegetables for 2,500',
    expected: [{ intent: 'log_expense', amount_xaf: 2500, line_guess_name: 'Household Feeding' }],
  },
  {
    transcript: 'Paid 15k for electricity yesterday',
    expected: [{ intent: 'log_expense', amount_xaf: 15000, line_guess_name: 'Electricity' }],
  },
  {
    transcript: 'Can I pay 5,000 for lunch?',
    expected: [{ intent: 'check_spend', amount_xaf: 5000, line_guess_name: 'Household Feeding' }],
  },
  {
    transcript: 'I received 80k from my salary',
    expected: [{ intent: 'log_income', amount_xaf: 80000, line_guess_name: null }],
  },
  {
    transcript: 'I put 10,000 into kids savings',
    expected: [{ intent: 'confirm_saving', amount_xaf: 10000, line_guess_name: 'Kids savings' }],
  },
  {
    transcript: 'Yesterday taxi was 1,500 francs',
    expected: [{ intent: 'log_expense', amount_xaf: 1500, line_guess_name: 'Transport' }],
  },
  {
    transcript: 'Spent 7.5k on fuel',
    expected: [{ intent: 'log_expense', amount_xaf: 7500, line_guess_name: 'Fuel' }],
  },
  {
    transcript: 'How much is left if I spend 12,000 on internet?',
    expected: [{ intent: 'check_spend', amount_xaf: 12000, line_guess_name: 'Internet' }],
  },
  {
    transcript: 'I got a bonus of 125,000',
    expected: [{ intent: 'log_income', amount_xaf: 125000, line_guess_name: null }],
  },
  {
    transcript: 'Saved 20 thousand for the children this month',
    expected: [{ intent: 'confirm_saving', amount_xaf: 20000, line_guess_name: 'Kids savings' }],
  },
  {
    transcript: 'Paid 4,000 for car wash this morning',
    expected: [{ intent: 'log_expense', amount_xaf: 4000, line_guess_name: 'Car wash' }],
  },
  {
    transcript: 'Can I spend 100,000?',
    expected: [{ intent: 'check_spend', amount_xaf: 100000, line_guess_name: null }],
  },
  {
    transcript: 'Bought medicine for 6,250',
    expected: [{ intent: 'log_expense', amount_xaf: 6250, line_guess_name: 'Health' }],
  },
  {
    transcript: 'Received 300,000 from work yesterday',
    expected: [{ intent: 'log_income', amount_xaf: 300000, line_guess_name: null }],
  },
  {
    transcript: 'I saved 5k today',
    expected: [{ intent: 'confirm_saving', amount_xaf: 5000, line_guess_name: 'Kids savings' }],
  },
  {
    transcript: 'Spent 18,000 on groceries and 2,000 on taxi',
    expected: [
      { intent: 'log_expense', amount_xaf: 18000, line_guess_name: 'Household Feeding' },
      { intent: 'log_expense', amount_xaf: 2000, line_guess_name: 'Transport' },
    ],
  },
  {
    transcript: 'Can I afford 9,000 for a car wash?',
    expected: [{ intent: 'check_spend', amount_xaf: 9000, line_guess_name: 'Car wash' }],
  },
  {
    transcript: 'I spent some money at the shop',
    expected: [{ intent: 'unknown', amount_xaf: 0, line_guess_name: null }],
  },
];
