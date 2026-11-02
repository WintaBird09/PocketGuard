export type InsightLine = {
  id: string;
  name: string;
  kind: string;
  planned: number;
  spent: number;
  projected: number | null;
  hardCap: boolean;
};

export type TopSpend = {
  id: string;
  name: string;
  kind: string;
  spent: number;
  share: number; // 0..1 of all spending this month
  usedRatio: number; // spent / planned, 0 when nothing planned
  change: number | null; // vs last month, as a ratio (0.2 = +20%); null when no history
};

export type Insight = {
  tone: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  detail: string;
};

export function topSpending(
  lines: readonly InsightLine[],
  previous: readonly InsightLine[] = [],
  limit = 5,
): TopSpend[] {
  const total = lines.reduce((n, line) => n + line.spent, 0);
  const before = new Map(previous.map((line) => [line.id, line.spent]));
  return lines
    .filter((line) => line.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, limit)
    .map((line) => {
      const last = before.get(line.id) ?? 0;
      return {
        id: line.id,
        name: line.name,
        kind: line.kind,
        spent: line.spent,
        share: total > 0 ? line.spent / total : 0,
        usedRatio: line.planned > 0 ? line.spent / line.planned : 1,
        change: last > 0 ? (line.spent - last) / last : null,
      };
    });
}

const fmt = (value: number) => `${Math.round(value).toLocaleString('en-US')} XAF`;
const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

// Plain-language pointers on where to focus, most urgent first.
export function buildInsights(
  lines: readonly InsightLine[],
  previous: readonly InsightLine[] = [],
  savings: { behind: boolean; shortfall: number } | null = null,
): Insight[] {
  const result: Insight[] = [];
  const spendable = lines.filter((line) => line.kind !== 'savings');
  const top = topSpending(spendable, previous, 1)[0];
  const total = spendable.reduce((n, line) => n + line.spent, 0);

  for (const line of spendable.filter((item) => item.planned > 0 && item.spent > item.planned)) {
    result.push({
      tone: 'danger',
      title: `${line.name} is over budget`,
      detail: `You are ${fmt(line.spent - line.planned)} above the ${fmt(line.planned)} planned.`,
    });
  }
  for (const line of spendable.filter(
    (item) =>
      item.planned > 0 &&
      item.spent <= item.planned &&
      item.projected !== null &&
      item.projected > item.planned,
  )) {
    result.push({
      tone: 'warning',
      title: `${line.name} is on course to overspend`,
      detail: `At this pace it ends the month near ${fmt(line.projected ?? 0)} against ${fmt(line.planned)} planned.`,
    });
  }
  if (top && total > 0 && top.share >= 0.3) {
    result.push({
      tone: 'info',
      title: `${top.name} takes ${pct(top.share)} of your spending`,
      detail: 'Your biggest lever: a small cut here saves more than trimming several small lines.',
    });
  }
  const rising = spendable
    .map((line) => ({ line, last: previous.find((item) => item.id === line.id)?.spent ?? 0 }))
    .filter(({ line, last }) => last > 0 && line.spent > last * 1.25 && line.spent - last >= 5000)
    .sort((a, b) => b.line.spent - b.last - (a.line.spent - a.last))[0];
  if (rising) {
    result.push({
      tone: 'warning',
      title: `${rising.line.name} is up ${pct((rising.line.spent - rising.last) / rising.last)} on last month`,
      detail: `${fmt(rising.last)} then, ${fmt(rising.line.spent)} now.`,
    });
  }
  if (savings?.behind) {
    result.push({
      tone: 'warning',
      title: 'Savings are behind plan',
      detail:
        savings.shortfall > 0
          ? `Your goals are projected ${fmt(savings.shortfall)} short. Protect savings before discretionary lines.`
          : 'Confirm what you have set aside on the Savings screen.',
    });
  }
  if (result.length === 0) {
    result.push({
      tone: 'success',
      title: 'Spending looks healthy',
      detail: 'No line is over plan or heading that way. Keep it up.',
    });
  }
  const order = { danger: 0, warning: 1, info: 2, success: 3 } as const;
  return result.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 4);
}
