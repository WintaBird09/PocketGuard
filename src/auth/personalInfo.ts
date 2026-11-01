import type { User } from '@supabase/supabase-js';

import { validateDisplayName } from './profile';

export const maxProfessionLength = 60;
export const minAge = 13;
export const maxAge = 120;

export type PersonalInfo = {
  name: string;
  phone: string;
  birthDate: string;
  profession: string;
};

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function parseDateKey(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Rows of 7 cells (Monday first); null cells pad the first and last week.
export function buildMonthGrid(year: number, month: number): (number | null)[][] {
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth(year, month) }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) rows.push(cells.slice(index, index + 7));
  return rows;
}

export function ageOn(birthDate: string, today: Date): number | null {
  const parsed = parseDateKey(birthDate);
  if (!parsed) return null;
  let age = today.getFullYear() - parsed.year;
  const hadBirthday =
    today.getMonth() + 1 > parsed.month ||
    (today.getMonth() + 1 === parsed.month && today.getDate() >= parsed.day);
  if (!hadBirthday) age -= 1;
  return age;
}

export function validatePhone(value: string): string | null {
  const phone = value.trim();
  if (!phone) return 'Enter your phone number.';
  if (!/^\+?[\d\s().-]+$/.test(phone)) return 'Use digits only, with an optional + at the start.';
  const digits = phone.replace(/\D/g, '').length;
  if (digits < 8 || digits > 15) return 'Enter a valid phone number (8 to 15 digits).';
  return null;
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  return (trimmed.startsWith('+') ? '+' : '') + trimmed.replace(/\D/g, '');
}

export function validateBirthDate(value: string, today = new Date()): string | null {
  if (!value) return 'Pick your date of birth.';
  const age = ageOn(value, today);
  if (age === null) return 'Pick a valid date.';
  if (age < 0) return 'Date of birth cannot be in the future.';
  if (age < minAge) return `You must be at least ${minAge} years old.`;
  if (age > maxAge) return 'Pick a valid date of birth.';
  return null;
}

export function validateProfession(value: string): string | null {
  const profession = value.trim();
  if (!profession) return 'Enter your profession.';
  if (profession.length > maxProfessionLength) {
    return `Use at most ${maxProfessionLength} characters.`;
  }
  return null;
}

export function validatePersonalInfo(
  info: PersonalInfo,
  today = new Date(),
): Partial<Record<keyof PersonalInfo, string>> {
  const errors: Partial<Record<keyof PersonalInfo, string>> = {};
  const name = validateDisplayName(info.name);
  if (name) errors.name = name;
  const phone = validatePhone(info.phone);
  if (phone) errors.phone = phone;
  const birthDate = validateBirthDate(info.birthDate, today);
  if (birthDate) errors.birthDate = birthDate;
  const profession = validateProfession(info.profession);
  if (profession) errors.profession = profession;
  return errors;
}

function metadataString(user: User | null | undefined, key: string): string {
  const value = user?.user_metadata?.[key];
  return typeof value === 'string' ? value : '';
}

export function getPersonalInfo(user: User | null | undefined): PersonalInfo {
  return {
    name: metadataString(user, 'display_name'),
    phone: metadataString(user, 'phone_number'),
    birthDate: metadataString(user, 'birth_date'),
    profession: metadataString(user, 'profession'),
  };
}

export function isProfileComplete(user: User | null | undefined): boolean {
  return user?.user_metadata?.profile_complete === true;
}

export function personalInfoToMetadata(info: PersonalInfo): Record<string, unknown> {
  return {
    display_name: info.name.trim(),
    phone_number: normalizePhone(info.phone),
    birth_date: info.birthDate,
    profession: info.profession.trim(),
    profile_complete: true,
  };
}
