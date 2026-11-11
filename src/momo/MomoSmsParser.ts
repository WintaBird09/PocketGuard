export type MomoAction = 'RECEIVED' | 'PAYMENT' | 'TRANSFER';
export type MomoSource = 'MOMO_PASTE' | 'MOMO_SHARE' | 'MOMO_INBOX' | 'MOMO_AUTO';

export type MomoPendingTransaction = {
  action: MomoAction | null;
  amount: number | null;
  counterpartyName: string | null;
  counterpartyPhone: string | null;
  dateTime: string | null;
  fee: number;
  balanceAfter: number | null;
  transactionId: string | null;
  userMessage: string | null;
  source: MomoSource;
  rawSms: string;
  recognized: boolean;
};

const openingPattern = /You have received|Your payment of|You have transferred/gi;
const datetimePattern = /\b(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\b/;

function amountValue(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/[\s,]/g, '');
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function captureAmount(text: string, label: string): number | null {
  const match = text.match(new RegExp(`${label}\\s+([\\d,\\s]+?)\\s*(?:XAF|FCFA)\\b`, 'i'));
  return amountValue(match?.[1]);
}

function captureCounterparty(text: string, action: MomoAction | null) {
  if (!action) return { name: null, phone: null };
  const expression =
    action === 'RECEIVED'
      ? /\bfrom\s+(.+?)\s*\((\d{6,})\)\s+on\s+your\s+mobile\s+money\s+account/i
      : /\bto\s+(.+?)\s*\((\d{6,})\)\s+(?:has\s+been\s+completed|from\s+your\s+mobile\s+money\s+account)/i;
  const match = text.match(expression);
  return { name: match?.[1]?.trim() ?? null, phone: match?.[2] ?? null };
}

function captureUserMessage(text: string): string | null {
  const match =
    text.match(
      /\bMessage from sender\s*:\s*(.*?)\s*(?=\.\s*Your new balance|Your new balance|Message to receiver|Financial Transaction Id)/i,
    ) ??
    text.match(
      /\bMessage\s*:\s*(.*?)\s*(?=\.\s*Your new balance|Your new balance|Message to receiver|Financial Transaction Id)/i,
    );
  const value = match?.[1]?.trim().replace(/[.\s]+$/, '');
  return value || null;
}

function truncateAtTransactionId(text: string): string {
  const match = text.match(/Financial Transaction Id\s*:\s*[^\s.]+/i);
  return match ? text.slice(0, match.index! + match[0].length).trim() : text.trim();
}

function parseMessage(raw: string, source: MomoSource): MomoPendingTransaction {
  const action: MomoAction | null = /^You have received\b/i.test(raw)
    ? 'RECEIVED'
    : /^Your payment of\b/i.test(raw)
      ? 'PAYMENT'
      : /^You have transferred\b/i.test(raw)
        ? 'TRANSFER'
        : null;
  const transactionText = truncateAtTransactionId(raw);
  const amountLabel =
    action === 'RECEIVED'
      ? 'You have received'
      : action === 'PAYMENT'
        ? 'Your payment of'
        : 'You have transferred';
  const amount = action ? captureAmount(transactionText, amountLabel) : null;
  const counterparty = captureCounterparty(transactionText, action);
  const dateTime = transactionText.match(datetimePattern)?.[1] ?? null;
  const feeMatch = transactionText.match(/\b(?:Fee was|FEES)\s*:?\s*([\d,\s]+?)\s*(?:XAF|FCFA)\b/i);
  const balanceMatch = transactionText.match(
    /Your new balance\s*:\s*([\d,\s]+?)\s*(?:XAF|FCFA)\b/i,
  );
  const transactionId =
    transactionText.match(/Financial Transaction Id\s*:\s*([^\s.]+)/i)?.[1] ?? null;
  const requiredFieldsFound = Boolean(action && amount !== null && counterparty.name && dateTime);

  return {
    action,
    amount,
    counterpartyName: counterparty.name,
    counterpartyPhone: counterparty.phone,
    dateTime,
    fee: amountValue(feeMatch?.[1]) ?? 0,
    balanceAfter: amountValue(balanceMatch?.[1]) ?? null,
    transactionId,
    userMessage: captureUserMessage(transactionText),
    source,
    rawSms: transactionText,
    recognized: requiredFieldsFound,
  };
}

/** Parses one or more pasted/shared messages without reading or persisting any device SMS. */
export function parseMomoSmsBatch(text: string, source: MomoSource): MomoPendingTransaction[] {
  const openings = [...text.matchAll(openingPattern)];
  if (!openings.length) return [];

  return openings.map((opening, index) => {
    const start = opening.index ?? 0;
    const end = openings[index + 1]?.index ?? text.length;
    return parseMessage(text.slice(start, end).trim(), source);
  });
}
