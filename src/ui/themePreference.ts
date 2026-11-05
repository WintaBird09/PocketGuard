export type ThemeMode = 'light' | 'dark' | 'system' | 'schedule';
export type ColorSchemeName = 'light' | 'dark';

export type ThemePreference = {
  mode: ThemeMode;
  /** Local time (HH:MM) when night mode starts in schedule mode. */
  nightStart: string;
  /** Local time (HH:MM) when day mode starts in schedule mode. */
  dayStart: string;
};

export const themePreferenceKey = 'pocket-guard.theme-preference';

export const defaultThemePreference: ThemePreference = {
  mode: 'system',
  nightStart: '19:00',
  dayStart: '06:00',
};

const modes: readonly ThemeMode[] = ['light', 'dark', 'system', 'schedule'];

export function parseClockTime(value: string): number | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function normalizeClockTime(value: string): string | null {
  const minutes = parseClockTime(value);
  if (minutes === null) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function parseThemePreference(raw: string | null | undefined): ThemePreference {
  if (!raw) return defaultThemePreference;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return defaultThemePreference;
    const record = value as Record<string, unknown>;
    const mode = modes.find((candidate) => candidate === record.mode);
    const nightStart =
      typeof record.nightStart === 'string' ? normalizeClockTime(record.nightStart) : null;
    const dayStart =
      typeof record.dayStart === 'string' ? normalizeClockTime(record.dayStart) : null;
    return {
      mode: mode ?? defaultThemePreference.mode,
      nightStart: nightStart ?? defaultThemePreference.nightStart,
      dayStart: dayStart ?? defaultThemePreference.dayStart,
    };
  } catch {
    return defaultThemePreference;
  }
}

export function isNightTime(now: Date, nightStart: string, dayStart: string): boolean {
  const night = parseClockTime(nightStart);
  const day = parseClockTime(dayStart);
  if (night === null || day === null || night === day) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return night < day ? minutes >= night && minutes < day : minutes >= night || minutes < day;
}

/** Returns the scheme to force, or null when the device setting should be followed. */
export function resolveScheme(preference: ThemePreference, now: Date): ColorSchemeName | null {
  if (preference.mode === 'light' || preference.mode === 'dark') return preference.mode;
  if (preference.mode === 'schedule') {
    return isNightTime(now, preference.nightStart, preference.dayStart) ? 'dark' : 'light';
  }
  return null;
}
