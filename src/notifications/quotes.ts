export const financeQuotes = [
  'Give every dollar a job before it leaves your hand.',
  'A small plan beats a large guess.',
  'Track the little costs; they add up quietly.',
  'Save first, then spend what remains.',
  'A budget is a map, not a punishment.',
  'Compare the price with the value you will keep.',
  'A patient purchase is often a cheaper purchase.',
  'Know your balance before you make a promise.',
  'One saved coin is a choice made for tomorrow.',
  'Keep needs ahead of wants when money is tight.',
  'Write it down today; understand it tomorrow.',
  'A clear goal makes saving feel possible.',
  'Check the total, not only the monthly payment.',
  'Plan for school costs before the term begins.',
  'Set aside a little for the bill you know is coming.',
  'A spending limit protects your bigger priorities.',
  'Paying debt steadily is progress worth noticing.',
  'Keep emergency money separate from daily spending.',
  'Use a list to keep market spending on track.',
  'Review subscriptions and remove what you do not use.',
  'Small regular savings can grow into real options.',
  'A good deal is only good if you needed the item.',
  'Check mobile money fees before confirming a transfer.',
  'Set a safe amount for transport and stick to it.',
  'Keep receipts or notes for cash you spend.',
  'Make a plan for irregular income before spending it.',
  'Separate business money from household money.',
  'Save toward one goal at a time for clarity.',
  'A debt payment is progress when it fits your plan.',
  'Pause before borrowing for something that can wait.',
  'Compare prices at more than one stall when you can.',
  'Give your savings a name and a purpose.',
  'Know which expenses are fixed and which can change.',
  'A simple weekly review can prevent month-end surprises.',
  'Plan for repairs before they become emergencies.',
  'Spend according to your priorities, not someone else’s.',
  'Put windfalls toward a goal before making new plans.',
  'A little room in your budget gives you more choices.',
  'Check your debt balance before making another commitment.',
  'Keep a record of every income source.',
  'A realistic budget leaves room for real life.',
  'Choose useful things that last over quick replacements.',
  'Save a little on good weeks to support lean weeks.',
  'Make tomorrow easier with one thoughtful choice today.',
  'Know the difference between affordable and manageable.',
  'Review your plan when your income or costs change.',
  'Avoid spending money you have already assigned elsewhere.',
  'Build a buffer before you need to use it.',
  'A planned purchase is easier to afford than an impulse.',
  'Make progress visible by recording each payment.',
  'Your money works better when your plan is clear.',
];

export const motivationQuotes = [
  'Steady steps still move you forward.',
  'You can begin again with the next choice.',
  'Progress is built from ordinary days.',
  'A calm plan makes room for confidence.',
  'You are learning to make money decisions with care.',
  'Your effort today supports the life you are building.',
  'A thoughtful pause is a strength.',
  'Small wins deserve to be counted.',
  'You do not need to solve everything today.',
  'Consistency matters more than a perfect start.',
  'You have made it through difficult days before.',
  'Take one clear step, then the next.',
  'Your choices can reflect what matters most to you.',
  'Patience gives good plans time to work.',
  'Every honest review is useful progress.',
  'You can adjust your plan without giving up.',
  'Careful choices today can create more freedom later.',
  'Your future is built with today’s small decisions.',
  'Keep going at a pace you can sustain.',
  'There is strength in asking where your money went.',
  'You are allowed to learn as you go.',
  'A fresh day brings another chance to choose well.',
  'Notice what is working and build from there.',
  'You can make progress without rushing.',
  'Your goals are worth patient effort.',
  'One setback does not erase the steps you have taken.',
  'Make room for both responsibility and joy.',
  'You can be proud of a plan you keep improving.',
  'Choose progress over pressure.',
  'A little discipline can protect a lot of hope.',
  'You are building habits that support your future.',
  'Keep your focus on what you can do next.',
  'Your careful attention makes a difference.',
  'There is no shame in starting with a small amount.',
  'Each choice is a chance to move toward your goals.',
  'You can be kind to yourself and still stay accountable.',
  'Trust the steady work you are putting in.',
  'Today is a good day to make one useful choice.',
  'Your path does not need to look like anyone else’s.',
  'A clear mind can turn worry into a next step.',
  'Celebrate progress, then keep your plan practical.',
  'You have the ability to make a thoughtful change.',
  'Keep showing up for the future you want.',
  'Strong habits grow one decision at a time.',
  'Take pride in the care you give your priorities.',
  'You can pause, review, and choose again.',
  'A better routine starts with one repeatable action.',
  'Keep your goals close and your next step simple.',
  'Your progress counts, even when it is quiet.',
  'Be patient with the process and honest with the plan.',
  'Thoughtful choices are a form of self-respect.',
];

export type DailyQuote = { id: string; category: 'finance' | 'motivation'; text: string };

function quoteCycle(): DailyQuote[] {
  const all = [
    ...financeQuotes.map((text, index) => ({
      id: `finance-${index}`,
      category: 'finance' as const,
      text,
    })),
    ...motivationQuotes.map((text, index) => ({
      id: `motivation-${index}`,
      category: 'motivation' as const,
      text,
    })),
  ];
  let seed = 0x5eed1234;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  for (let index = all.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [all[index], all[swap]] = [all[swap]!, all[index]!];
  }
  return all;
}

const cycle = quoteCycle();
const cycleStartUtc = Date.UTC(2020, 0, 1);

export function getDailyQuote(dateKey: string): DailyQuote {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('Quote date must be YYYY-MM-DD.');
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateKey) {
    throw new Error('Quote date must be a valid calendar date.');
  }
  const day = Math.floor(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - cycleStartUtc) /
      86_400_000,
  );
  return cycle[((day % cycle.length) + cycle.length) % cycle.length]!;
}
