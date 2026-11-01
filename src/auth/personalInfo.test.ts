import { describe, expect, it } from 'vitest';

import {
  ageOn,
  buildMonthGrid,
  daysInMonth,
  isProfileComplete,
  normalizePhone,
  parseDateKey,
  personalInfoToMetadata,
  validateBirthDate,
  validatePersonalInfo,
  validatePhone,
} from './personalInfo';

const today = new Date(2026, 10, 1);

describe('calendar helpers', () => {
  it('knows month lengths including leap years', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 11)).toBe(30);
  });

  it('builds Monday-first weeks', () => {
    // 1 Nov 2026 is a Sunday: six leading blanks.
    const grid = buildMonthGrid(2026, 11);
    expect(grid[0]).toEqual([null, null, null, null, null, null, 1]);
    expect(grid.every((row) => row.length === 7)).toBe(true);
    expect(grid.flat().filter((day) => day !== null)).toHaveLength(30);
  });

  it('parses only real dates', () => {
    expect(parseDateKey('1995-02-28')).toEqual({ year: 1995, month: 2, day: 28 });
    expect(parseDateKey('1995-02-30')).toBeNull();
    expect(parseDateKey('95-2-3')).toBeNull();
  });
});

describe('age and birth date', () => {
  it('computes age around the birthday', () => {
    expect(ageOn('2000-11-01', today)).toBe(26);
    expect(ageOn('2000-11-02', today)).toBe(25);
  });

  it('rejects missing, future, too young and absurd dates', () => {
    expect(validateBirthDate('', today)).not.toBeNull();
    expect(validateBirthDate('2027-01-01', today)).toContain('future');
    expect(validateBirthDate('2020-01-01', today)).toContain('at least');
    expect(validateBirthDate('1800-01-01', today)).not.toBeNull();
    expect(validateBirthDate('1995-06-15', today)).toBeNull();
  });
});

describe('phone', () => {
  it('accepts common formats and normalizes them', () => {
    expect(validatePhone('+237 6 70 12 34 56')).toBeNull();
    expect(validatePhone('670123456')).toBeNull();
    expect(normalizePhone('+237 6 70-12-34-56')).toBe('+237670123456');
  });

  it('rejects letters and wrong lengths', () => {
    expect(validatePhone('')).not.toBeNull();
    expect(validatePhone('abc12345')).not.toBeNull();
    expect(validatePhone('1234')).not.toBeNull();
  });
});

describe('personal info', () => {
  const valid = {
    name: 'Ada Nkabeh',
    phone: '670123456',
    birthDate: '1995-06-15',
    profession: 'Engineer',
  };

  it('reports an error per invalid field', () => {
    expect(validatePersonalInfo(valid, today)).toEqual({});
    expect(
      Object.keys(validatePersonalInfo({ ...valid, name: '', profession: ' ' }, today)),
    ).toEqual(['name', 'profession']);
  });

  it('marks the profile complete in metadata', () => {
    const metadata = personalInfoToMetadata(valid);
    expect(metadata).toMatchObject({ display_name: 'Ada Nkabeh', profile_complete: true });
    expect(isProfileComplete({ user_metadata: metadata } as never)).toBe(true);
    expect(isProfileComplete({ user_metadata: {} } as never)).toBe(false);
    expect(isProfileComplete(null)).toBe(false);
  });
});
