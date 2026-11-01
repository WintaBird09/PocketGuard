export type RangeMode = 'day' | 'week' | 'month' | 'custom';

export type DateRange = { from: string; to: string };

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function parse(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year!, month! - 1, day!, 12);
}

function format(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function addDays(key: string, days: number): string {
  const date = parse(key);
  date.setDate(date.getDate() + days);
  return format(date);
}

// Weeks run Monday to Sunday.
export function rangeFor(mode: Exclude<RangeMode, 'custom'>, anchor: string): DateRange {
  if (mode === 'day') return { from: anchor, to: anchor };
  if (mode === 'week') {
    const offset = (parse(anchor).getDay() + 6) % 7;
    const from = addDays(anchor, -offset);
    return { from, to: addDays(from, 6) };
  }
  const date = parse(anchor);
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
  return { from: format(first), to: format(last) };
}

export function shiftAnchor(
  mode: Exclude<RangeMode, 'custom'>,
  anchor: string,
  direction: 1 | -1,
): string {
  if (mode === 'day') return addDays(anchor, direction);
  if (mode === 'week') return addDays(anchor, 7 * direction);
  const date = parse(anchor);
  return format(new Date(date.getFullYear(), date.getMonth() + direction, 1, 12));
}

export function monthsInRange(range: DateRange): string[] {
  const months: string[] = [];
  let cursor = range.from.slice(0, 7);
  const end = range.to.slice(0, 7);
  while (cursor <= end && months.length < 60) {
    months.push(cursor);
    const [year, month] = cursor.split('-').map(Number);
    cursor = format(new Date(year!, month!, 1, 12)).slice(0, 7);
  }
  return months;
}

export function rangeLabel(mode: RangeMode, range: DateRange, today: string): string {
  const from = parse(range.from);
  const to = parse(range.to);
  const short = (date: Date) => `${date.getDate()} ${monthNames[date.getMonth()]}`;
  if (mode === 'day') {
    if (range.from === today) return 'Today';
    if (range.from === addDays(today, -1)) return 'Yesterday';
    return `${short(from)} ${from.getFullYear()}`;
  }
  if (mode === 'month') {
    return from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  const sameYear = from.getFullYear() === to.getFullYear();
  return `${short(from)}${sameYear ? '' : ` ${from.getFullYear()}`} – ${short(to)} ${to.getFullYear()}`;
}
