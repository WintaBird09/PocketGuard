export type AlertKind = 'threshold' | 'pace' | 'savings_due' | 'debt_due' | 'daily_summary';

export type Alert = {
  id: string;
  title: string;
  body: string;
  kind: AlertKind;
  scheduledAt?: Date;
  immediate?: boolean;
  repeatDailyAt?: { hour: number; minute: number };
};

export type AlertStateInput = {
  lineName?: string;
  planned?: number;
  spent?: number;
  pctUsed?: number;
  daysLeft?: number;
  paceAlert?: boolean;
  savingsDue?: boolean;
  debtDue?: boolean;
  summaryText?: string;
};

const formatXAF = (value: number): string => `${Math.trunc(value).toLocaleString('en-US')} XAF`;

export function buildAlerts(input: AlertStateInput): Alert[] {
  const alerts: Alert[] = [];

  if (input.lineName && Number.isFinite(input.pctUsed)) {
    const pctUsed = Number(input.pctUsed ?? 0);
    const thresholds = [50, 80, 100] as const;

    for (const threshold of thresholds) {
      if (pctUsed >= threshold) {
        alerts.push({
          id: `${input.lineName.toLowerCase().replace(/\s+/g, '-')}-${threshold}`,
          kind: 'threshold',
          title: `${input.lineName} at ${threshold}% of monthly budget`,
          body: `${input.lineName} has used ${formatXAF(input.spent ?? 0)} of ${formatXAF(
            input.planned ?? 0,
          )}; ${input.daysLeft ?? 0} days left.`,
        });
      }
    }
  }

  if (input.paceAlert) {
    alerts.push({
      id: 'pace-alert',
      kind: 'pace',
      title: 'Budget pace is ahead of plan',
      body: 'Your current spending pace is faster than the month plan.',
    });
  }

  if (input.savingsDue) {
    alerts.push({
      id: 'savings-due',
      kind: 'savings_due',
      title: 'Savings goal due this month',
      body: 'Confirm the planned savings transfer before the month closes.',
    });
  }

  if (input.debtDue) {
    alerts.push({
      id: 'debt-due',
      kind: 'debt_due',
      title: 'Debt payment due',
      body: 'A scheduled debt payment is now due and should be reviewed.',
    });
  }

  if (input.summaryText) {
    alerts.push({
      id: 'daily-summary',
      kind: 'daily_summary',
      title: 'Daily budget summary',
      body: input.summaryText,
    });
  }

  return alerts;
}
