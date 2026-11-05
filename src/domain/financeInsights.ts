import { formatMoney } from './currency';
import { topSpending } from './spendingInsights';
import type { InsightLine } from './spendingInsights';

export type FinanceFacts = {
  today: string; // YYYY-MM-DD
  daysElapsed: number;
  monthLength: number;
  daysLeft: number;
  /** Confirmed income received this month. */
  income: number;
  /** Fixed income not yet confirmed this month. */
  expectedIncome: number;
  /** All confirmed expenses this month (including savings lines). */
  spent: number;
  lines: InsightLine[];
  previous: InsightLine[];
  savedThisMonth: number;
  totalSaved: number;
  goals: {
    name: string;
    target: number;
    saved: number;
    dueDate: string;
    monthlyAmount: number;
    overdueMonths: number;
  }[];
  /** Average monthly spending over earlier months; null when there is no history. */
  avgMonthlyExpense: number | null;
  debts: {
    creditor: string;
    original: number;
    paid: number;
    balance: number;
    deadline: string | null;
  }[];
  sources: { name: string; received: number; budgeted: number; left: number }[];
  unfundedBudget: number;
  expenses: {
    id: string;
    amount: number;
    occurredAt: string;
    lineId: string | null;
    note: string;
  }[];
};

export type FinanceInsight = {
  id: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
  icon: string;
  title: string;
  summary: string;
  working: { label: string; value: string }[];
  advice: string;
  href?: string;
};

const fmt = formatMoney;
const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;
const toneRank = { danger: 0, warning: 1, info: 2, success: 3 } as const;

const spendable = (lines: readonly InsightLine[]) =>
  lines.filter((line) => line.kind !== 'savings');

function monthsUntil(today: string, due: string): number {
  const [ty, tm] = today.split('-').map(Number);
  const [dy, dm] = due.split('-').map(Number);
  return (dy - ty) * 12 + (dm - tm);
}

export function savingsRateInsight(facts: FinanceFacts): FinanceInsight | null {
  const basis = facts.income > 0 ? facts.income : facts.expectedIncome;
  if (basis <= 0) return null;
  const by = (kinds: string[]) =>
    facts.lines.filter((line) => kinds.includes(line.kind)).reduce((n, line) => n + line.spent, 0);
  const needs = by(['fixed', 'debt', 'running']);
  const wants = by(['misc']);
  const saved = Math.max(facts.savedThisMonth, by(['savings']));
  const rate = saved / basis;
  const tone = rate >= 0.2 ? 'success' : rate >= 0.1 ? 'info' : 'warning';
  return {
    id: 'savings-rate',
    tone,
    icon: 'trending-up',
    title: `Savings rate ${pct(rate)}`,
    summary:
      rate >= 0.2
        ? 'You are saving at or above the 20% guideline.'
        : `Aim for 20% of income, about ${fmt(Math.round(basis * 0.2))} a month.`,
    working: [
      { label: 'Income used', value: fmt(basis) },
      { label: 'Saved', value: `${fmt(saved)} (${pct(rate)}, target 20%)` },
      {
        label: 'Needs: bills & essentials',
        value: `${fmt(needs)} (${pct(needs / basis)}, target 50%)`,
      },
      {
        label: 'Wants: everything else',
        value: `${fmt(wants)} (${pct(wants / basis)}, target 30%)`,
      },
    ],
    advice:
      'The 50/30/20 rule splits income into needs, wants and savings. Needs are fixed, debt and running lines; wants are miscellaneous lines.',
    href: '/savings',
  };
}

export function forecastInsight(facts: FinanceFacts): FinanceInsight | null {
  const lines = spendable(facts.lines);
  const planned = lines.reduce((n, line) => n + line.planned, 0);
  const spent = lines.reduce((n, line) => n + line.spent, 0);
  if (facts.daysElapsed < 3 || planned <= 0) return null;
  const projected = Math.round((spent / facts.daysElapsed) * facts.monthLength);
  const gap = projected - planned;
  const tone = gap > 0 ? (gap > planned * 0.1 ? 'danger' : 'warning') : 'success';
  return {
    id: 'forecast',
    tone,
    icon: 'speedometer',
    title: gap > 0 ? `On course to overspend by ${fmt(gap)}` : 'Month-end spending on plan',
    summary: `Forecast ${fmt(projected)} against a ${fmt(planned)} budget.`,
    working: [
      { label: 'Spent so far', value: `${fmt(spent)} in ${facts.daysElapsed} days` },
      { label: 'Daily pace', value: fmt(Math.round(spent / facts.daysElapsed)) },
      { label: `Forecast for ${facts.monthLength} days`, value: fmt(projected) },
      { label: 'Budget', value: fmt(planned) },
    ],
    advice:
      gap > 0
        ? `Hold spending to about ${fmt(Math.max(0, Math.floor((planned - spent) / Math.max(1, facts.daysLeft))))} a day for the rest of the month to stay on budget.`
        : 'Keep this pace and you will finish within budget.',
    href: '/budget',
  };
}

export function topCategoriesInsight(facts: FinanceFacts): FinanceInsight | null {
  const top = topSpending(spendable(facts.lines), spendable(facts.previous), 3);
  if (top.length === 0) return null;
  const biggest = top[0];
  const rising = top.find((item) => item.change !== null && item.change > 0.2);
  return {
    id: 'top-categories',
    tone: rising ? 'warning' : 'info',
    icon: 'pie-chart',
    title: `${biggest.name} leads at ${pct(biggest.share)} of spending`,
    summary: rising
      ? `${rising.name} is up ${pct(rising.change ?? 0)} on last month.`
      : 'Your three biggest categories this month.',
    working: top.map((item) => ({
      label: item.name,
      value: `${fmt(item.spent)} · ${pct(item.share)}${
        item.change === null
          ? ''
          : ` · ${item.change >= 0 ? '▲' : '▼'} ${pct(Math.abs(item.change))} vs last month`
      }`,
    })),
    advice: 'Large or rising categories are where a small cut frees the most money.',
    href: '/budget',
  };
}

export function incomeDependencyInsight(facts: FinanceFacts): FinanceInsight | null {
  const totalReceived = facts.sources.reduce((n, source) => n + source.received, 0);
  if (facts.sources.length === 0) return null;
  const gaps = facts.sources.filter((source) => source.left < 0);
  const largest = [...facts.sources].sort((a, b) => b.received - a.received)[0];
  const share = totalReceived > 0 ? largest.received / totalReceived : 0;
  const concentrated = facts.sources.length > 1 ? share >= 0.8 : false;
  const tone =
    gaps.length > 0 ? 'danger' : concentrated || facts.unfundedBudget > 0 ? 'warning' : 'success';
  return {
    id: 'income-dependency',
    tone,
    icon: 'git-network',
    title:
      gaps.length > 0
        ? `${gaps[0].name} is over-allocated`
        : concentrated
          ? `${pct(share)} of income comes from ${largest.name}`
          : 'Budget funding looks balanced',
    summary:
      gaps.length > 0
        ? `Budgets drawn from ${gaps.map((gap) => gap.name).join(', ')} exceed what it brings in.`
        : facts.unfundedBudget > 0
          ? `${fmt(facts.unfundedBudget)} of budget is not linked to an income source.`
          : 'Every budgeted line is backed by an income source.',
    working: [
      ...facts.sources.map((source) => ({
        label: source.name,
        value: `received ${fmt(source.received)} · budgeted ${fmt(source.budgeted)} · ${
          source.left < 0 ? `short ${fmt(-source.left)}` : `${fmt(source.left)} left`
        }`,
      })),
      { label: 'Not linked to a source', value: fmt(facts.unfundedBudget) },
    ],
    advice: concentrated
      ? 'Relying on one source is risky. A second stream, even a small one, cushions you if it stops.'
      : 'Link every budget line to the source that pays for it so shortfalls show up early.',
    href: '/income',
  };
}

export function runwayInsight(facts: FinanceFacts): FinanceInsight | null {
  const monthly =
    facts.avgMonthlyExpense ??
    (facts.daysElapsed >= 3 ? (facts.spent / facts.daysElapsed) * facts.monthLength : null);
  if (!monthly || monthly <= 0) return null;
  const months = facts.totalSaved / monthly;
  const tone = months >= 3 ? 'success' : months >= 1 ? 'warning' : 'danger';
  return {
    id: 'runway',
    tone,
    icon: 'shield-checkmark',
    title: `Emergency runway ${months.toFixed(1)} months`,
    summary:
      months >= 3
        ? 'Your savings cover at least three months of spending.'
        : `Build towards 3 to 6 months, about ${fmt(Math.round(monthly * 3))}.`,
    working: [
      { label: 'Total savings', value: fmt(facts.totalSaved) },
      {
        label:
          facts.avgMonthlyExpense === null
            ? 'Monthly spending (estimated)'
            : 'Average monthly spending',
        value: fmt(Math.round(monthly)),
      },
      { label: 'Months covered', value: months.toFixed(1) },
      {
        label: 'Gap to 3 months',
        value: fmt(Math.max(0, Math.round(monthly * 3 - facts.totalSaved))),
      },
    ],
    advice:
      'An emergency fund of 3 to 6 months of spending protects you from job loss or surprise bills.',
    href: '/savings',
  };
}

export function debtInsight(facts: FinanceFacts): FinanceInsight | null {
  const open = facts.debts.filter((debt) => debt.balance > 0);
  if (open.length === 0) return null;
  const original = open.reduce((n, debt) => n + debt.original, 0);
  const balance = open.reduce((n, debt) => n + debt.balance, 0);
  const paidRatio = original > 0 ? 1 - balance / original : 0;
  const dated = open
    .filter((debt) => debt.deadline)
    .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''));
  const next = dated[0];
  const overdue = dated.filter((debt) => (debt.deadline ?? '') < facts.today);
  const months = next?.deadline ? Math.max(1, monthsUntil(facts.today, next.deadline)) : null;
  return {
    id: 'debt',
    tone: overdue.length > 0 ? 'danger' : 'info',
    icon: 'card',
    title: `Debt ${pct(paidRatio)} repaid`,
    summary:
      overdue.length > 0
        ? `${overdue[0].creditor} is past its deadline.`
        : `${fmt(balance)} still owed across ${open.length} ${open.length === 1 ? 'debt' : 'debts'}.`,
    working: [
      { label: 'Original total', value: fmt(original) },
      { label: 'Repaid so far', value: fmt(original - balance) },
      { label: 'Still owed', value: fmt(balance) },
      ...(next && months
        ? [
            {
              label: `Next deadline: ${next.creditor}`,
              value: `${next.deadline} · ${fmt(Math.ceil(next.balance / months))} a month to clear`,
            },
          ]
        : []),
      { label: 'Interest cost', value: 'Not tracked: no interest rate is stored for debts' },
    ],
    advice:
      'Clear the debt with the nearest deadline first, and keep making at least the monthly amount.',
    href: '/debts',
  };
}

export function safeToSpendInsight(facts: FinanceFacts): FinanceInsight | null {
  const lines = spendable(facts.lines).filter((line) => line.planned > 0);
  if (lines.length === 0) return null;
  const remaining = lines.reduce((n, line) => n + Math.max(0, line.planned - line.spent), 0);
  const daysIncludingToday = Math.max(1, facts.daysLeft + 1);
  const perDay = Math.floor(remaining / daysIncludingToday);
  const spent = lines.reduce((n, line) => n + line.spent, 0);
  const pace = facts.daysElapsed > 0 ? Math.round(spent / facts.daysElapsed) : 0;
  return {
    id: 'safe-to-spend',
    tone:
      remaining <= 0 ? 'danger' : pace > perDay && facts.daysElapsed >= 3 ? 'warning' : 'success',
    icon: 'wallet',
    title: remaining <= 0 ? 'No budget left to spend' : `Safe to spend ${fmt(perDay)} a day`,
    summary: `${fmt(remaining)} left across ${lines.length} lines for ${daysIncludingToday} ${daysIncludingToday === 1 ? 'day' : 'days'}.`,
    working: [
      { label: 'Budget left (unspent lines)', value: fmt(remaining) },
      { label: 'Days left including today', value: String(daysIncludingToday) },
      { label: 'Safe daily amount', value: fmt(perDay) },
      { label: 'Your daily pace so far', value: fmt(pace) },
    ],
    advice: 'Stay under the safe daily amount and the month finishes within budget.',
    href: '/can-i-spend',
  };
}

export function anomalyInsight(facts: FinanceFacts): FinanceInsight | null {
  const expenses = facts.expenses.filter((item) => item.amount > 0);
  if (expenses.length < 3) return null;
  const found: { label: string; value: string }[] = [];
  const day = (item: { occurredAt: string }) => item.occurredAt.slice(0, 10);
  const seen = new Map<string, typeof expenses>();
  for (const item of expenses) {
    const key = `${item.lineId ?? ''}|${item.amount}|${day(item)}`;
    seen.set(key, [...(seen.get(key) ?? []), item]);
  }
  for (const group of seen.values()) {
    if (group.length > 1) {
      found.push({
        label: `Possible duplicate on ${day(group[0])}`,
        value: `${group.length} × ${fmt(group[0].amount)}${group[0].note ? ` (${group[0].note})` : ''}`,
      });
    }
  }
  const sorted = expenses.map((item) => item.amount).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  for (const item of expenses) {
    if (median > 0 && item.amount >= median * 4) {
      found.push({
        label: `Unusually large on ${day(item)}`,
        value: `${fmt(item.amount)}${item.note ? ` (${item.note})` : ''} vs typical ${fmt(median)}`,
      });
    }
  }
  const limited = found.slice(0, 5);
  return {
    id: 'anomalies',
    tone: limited.length > 0 ? 'warning' : 'success',
    icon: 'alert-circle',
    title:
      limited.length > 0
        ? `${limited.length} unusual ${limited.length === 1 ? 'entry' : 'entries'} to check`
        : 'No unusual spending',
    summary:
      limited.length > 0
        ? 'Duplicates or unusually large purchases were found this month.'
        : 'No duplicates or outsized purchases this month.',
    working: limited.length > 0 ? limited : [{ label: 'Typical purchase', value: fmt(median) }],
    advice:
      'Open the transaction to correct or delete a mistake. Large one-off purchases are fine if planned.',
    href: '/add-transaction',
  };
}

export function goalsInsight(facts: FinanceFacts): FinanceInsight | null {
  if (facts.goals.length === 0) return null;
  const rows = facts.goals.map((goal) => {
    const months = Math.max(1, monthsUntil(facts.today, goal.dueDate));
    const remaining = Math.max(0, goal.target - goal.saved);
    const needed = Math.ceil(remaining / months);
    const behind = goal.overdueMonths > 0 || (remaining > 0 && goal.monthlyAmount < needed);
    return { goal, remaining, needed, behind, done: remaining === 0 };
  });
  const behind = rows.filter((row) => row.behind && !row.done);
  return {
    id: 'goals',
    tone: behind.length > 0 ? 'warning' : 'success',
    icon: 'flag',
    title:
      behind.length > 0
        ? `${behind.length} of ${rows.length} ${rows.length === 1 ? 'goal is' : 'goals are'} behind`
        : 'All savings goals on track',
    summary:
      behind.length > 0
        ? `${behind[0].goal.name} needs ${fmt(behind[0].needed)} a month to finish by ${behind[0].goal.dueDate}.`
        : 'Your monthly amounts reach every target by its date.',
    working: rows.map((row) => ({
      label: row.goal.name,
      value: row.done
        ? 'Target reached'
        : `${pct(row.goal.saved / Math.max(1, row.goal.target))} saved · needs ${fmt(row.needed)}/mo · plan ${fmt(row.goal.monthlyAmount)}/mo${row.behind ? ' · behind' : ''}`,
    })),
    advice: 'Raise the monthly amount or move the target date for goals marked behind.',
    href: '/savings',
  };
}

export function buildFinanceInsights(facts: FinanceFacts): FinanceInsight[] {
  const all = [
    forecastInsight,
    incomeDependencyInsight,
    safeToSpendInsight,
    anomalyInsight,
    goalsInsight,
    debtInsight,
    runwayInsight,
    savingsRateInsight,
    topCategoriesInsight,
  ]
    .map((build) => build(facts))
    .filter((item): item is FinanceInsight => item !== null);
  return all
    .map((item, index) => ({ item, index }))
    .sort((a, b) => toneRank[a.item.tone] - toneRank[b.item.tone] || a.index - b.index)
    .map(({ item }) => item);
}
