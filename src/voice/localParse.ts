import type { ParseExpenseItem } from './contract';

export type LocalVoiceResult = { amount: number | null; lineId: string | null };
export type LocalVoiceTransaction = LocalVoiceResult & {
  direction: 'expense' | 'income';
  description: string;
  occurredOn: string;
};

const multipliers: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  m: 1_000_000,
  million: 1_000_000,
};

// Finds the first amount such as "20000", "20,000", "20k" or "1.5 million".
export function extractAmount(transcript: string): number | null {
  const match = transcript
    .toLowerCase()
    .replace(/(\d)[\s,](?=\d{3}\b)/g, '$1')
    .match(/(\d+(?:\.\d+)?)\s*(k|thousand|million|m)?\b/);
  if (!match) return null;
  const value = Math.round(Number(match[1]) * (match[2] ? multipliers[match[2]] : 1));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

const stem = (word: string) => word.replace(/(ing|es|s)$/, '');
const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3)
    .map(stem);

// Picks the budget line whose name shares the most words with what was said.
export function matchLine(
  transcript: string,
  lines: readonly { id: string; name: string }[],
): string | null {
  const spoken = new Set(words(transcript));
  let best: { id: string; score: number } | null = null;
  for (const line of lines) {
    const score = words(line.name).filter((word) => spoken.has(word)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: line.id, score };
  }
  return best?.id ?? null;
}

export function parseLocally(
  transcript: string,
  lines: readonly { id: string; name: string }[],
): LocalVoiceResult {
  return { amount: extractAmount(transcript), lineId: matchLine(transcript, lines) };
}

export function parseVoiceTransaction(
  transcript: string,
  lines: readonly { id: string; name: string }[],
  today: string,
): LocalVoiceTransaction {
  const parsed = parseLocally(transcript, lines);
  const yesterday = /\byesterday\b/i.test(transcript);
  let occurredOn = today;
  if (yesterday) {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    occurredOn = date.toISOString().slice(0, 10);
  }
  const capture = transcript.match(/\b(?:on|for|from|to)\s+([^,.;]+)/i)?.[1] ?? '';
  const description = capture
    .replace(/\b(?:today|yesterday|tomorrow)\b.*$/i, '')
    .replace(/\s+at\s+\d{1,2}(?::\d{2})?.*$/i, '')
    .trim();

  return {
    ...parsed,
    direction: /\b(received|got|earned|salary|income)\b/i.test(transcript) ? 'income' : 'expense',
    description,
    occurredOn,
  };
}

// Builds a reviewable item when the online parser is unavailable. Returns null without an amount.
export function localExpenseItem(
  transcript: string,
  lines: readonly { id: string; name: string }[],
  today: string,
): ParseExpenseItem | null {
  const { amount, lineId } = parseLocally(transcript, lines);
  if (amount === null) return null;
  const asking = /\b(can i|should i|may i|is it ok)\b/i.test(transcript);
  return {
    intent: asking ? 'check_spend' : 'log_expense',
    amount_xaf: amount,
    line_id: lineId,
    line_guess_name: null,
    note: '',
    date: today,
    confidence: 0.5,
  };
}
