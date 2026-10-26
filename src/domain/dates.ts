let localDateOverride: string | null = null;
let localDateOverrideRevision = 0;
const localDateOverrideListeners = new Set<() => void>();

export function setLocalDateOverride(value: string | null): void {
  if (value !== null) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new Error('Enter the simulated date as a valid YYYY-MM-DD date.');
    }
  }
  if (localDateOverride !== value) {
    localDateOverride = value;
    localDateOverrideRevision += 1;
    localDateOverrideListeners.forEach((listener) => listener());
  }
}

export function getLocalDateOverride(): string | null {
  return localDateOverride;
}

export function getLocalDateOverrideRevision(): number {
  return localDateOverrideRevision;
}

export function subscribeLocalDateOverride(listener: () => void): () => void {
  localDateOverrideListeners.add(listener);
  return () => {
    localDateOverrideListeners.delete(listener);
  };
}

export function effectiveNow(): Date {
  if (localDateOverride === null) return new Date();
  const [year, month, day] = localDateOverride.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

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
export function localDateString(now?: Date): string {
  const date = now ?? effectiveNow();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
