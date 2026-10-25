export function monthKeyForDate(input: Date | string, timeZone: string): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  return `${year}-${month}`;
}

export function daysInMonth(input: Date | string, timeZone: string): number {
  const date = typeof input === 'string' ? new Date(input) : input;
  const year = Number(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(date));
  const month = Number(
    new Intl.DateTimeFormat('en-US', { timeZone, month: 'numeric' }).format(date),
  );

  return new Date(year, month, 0).getDate();
}

export function dayOfMonth(input: Date | string, timeZone: string): number {
  const date = typeof input === 'string' ? new Date(input) : input;
  const value = Number(new Intl.DateTimeFormat('en-US', { timeZone, day: 'numeric' }).format(date));
  return value;
}

export function daysElapsedInMonth(input: Date | string, timeZone: string): number {
  return dayOfMonth(input, timeZone);
}

export function daysRemainingInMonth(input: Date | string, timeZone: string): number {
  const date = typeof input === 'string' ? new Date(input) : input;
  return Math.max(0, daysInMonth(date, timeZone) - dayOfMonth(date, timeZone));
}

// The one place that turns an instant into the user's local `YYYY-MM-DD` day.
export function localDateString(now: Date = new Date()): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}
