import { describe, expect, it } from 'vitest';

import {
  defaultThemePreference,
  isNightTime,
  normalizeClockTime,
  parseThemePreference,
  resolveScheme,
} from './themePreference';

const at = (hours: number, minutes = 0) => new Date(2026, 10, 4, hours, minutes);

describe('theme preference', () => {
  it('forces light or dark and follows the device for system mode', () => {
    expect(resolveScheme({ ...defaultThemePreference, mode: 'light' }, at(23))).toBe('light');
    expect(resolveScheme({ ...defaultThemePreference, mode: 'dark' }, at(12))).toBe('dark');
    expect(resolveScheme({ ...defaultThemePreference, mode: 'system' }, at(12))).toBeNull();
  });

  it('switches between day and night across midnight', () => {
    const schedule = { ...defaultThemePreference, mode: 'schedule' as const };
    expect(resolveScheme(schedule, at(5, 59))).toBe('dark');
    expect(resolveScheme(schedule, at(6))).toBe('light');
    expect(resolveScheme(schedule, at(18, 59))).toBe('light');
    expect(resolveScheme(schedule, at(19))).toBe('dark');
    expect(resolveScheme(schedule, at(0))).toBe('dark');
  });

  it('supports a night window that does not cross midnight', () => {
    expect(isNightTime(at(1), '00:30', '05:00')).toBe(true);
    expect(isNightTime(at(12), '00:30', '05:00')).toBe(false);
    expect(isNightTime(at(12), '08:00', '08:00')).toBe(false);
  });

  it('validates clock times and falls back on damaged stored values', () => {
    expect(normalizeClockTime('7:05')).toBe('07:05');
    expect(normalizeClockTime('24:00')).toBeNull();
    expect(normalizeClockTime('7pm')).toBeNull();
    expect(parseThemePreference('not json')).toEqual(defaultThemePreference);
    expect(parseThemePreference(JSON.stringify({ mode: 'dark', nightStart: '9:30' }))).toEqual({
      mode: 'dark',
      nightStart: '09:30',
      dayStart: '06:00',
    });
    expect(parseThemePreference(JSON.stringify({ mode: 'purple' })).mode).toBe('system');
  });
});
