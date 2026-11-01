export const appName = 'Pocket Guard';

export function buildInviteMessage(inviterName: string): string {
  const who = inviterName.trim();
  return [
    `${who ? `${who} invites you` : 'You are invited'} to try ${appName}, a budgeting app that works offline and keeps each person's data private to their own account.`,
    'Track your daily spending, plan your monthly budget, and stay on top of loans and debts.',
    `Ask ${who || 'the person who invited you'} for the app, then sign up with your email.`,
  ].join('\n\n');
}
