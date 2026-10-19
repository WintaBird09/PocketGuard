export function formatXAF(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.trunc(amount) : 0;
  return `${safe.toLocaleString('en-US')} XAF`;
}

export function parseAmountInput(input: string): number | null {
  if (typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace(/xaf/gi, '')
    .replace(/\s+/g, '')
    .replace(/,/g, '')
    .replace(/k/gi, '000');

  if (!/^[0-9]+$/.test(normalized)) {
    return null;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.trunc(value);
}
