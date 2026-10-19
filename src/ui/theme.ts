export type AppThemeName = 'light' | 'dark';

export type AppTheme = {
  background: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  success: string;
  warning: string;
  danger: string;
  accent: string;
};

export const themeTokens = {
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },
};

export function getTheme(mode: AppThemeName): AppTheme {
  if (mode === 'dark') {
    return {
      background: '#020817',
      card: '#0f172a',
      text: '#e2e8f0',
      muted: '#94a3b8',
      border: '#1e293b',
      primary: '#14b8a6',
      success: '#22c55e',
      warning: '#f59e0b',
      danger: '#ef4444',
      accent: '#fbbf24',
    };
  }

  return {
    background: '#f8fafc',
    card: '#ffffff',
    text: '#0f172a',
    muted: '#475569',
    border: '#e2e8f0',
    primary: '#0f766e',
    success: '#16a34a',
    warning: '#f59e0b',
    danger: '#dc2626',
    accent: '#facc15',
  };
}

export function formatXAF(value: number): string {
  const formatter = new Intl.NumberFormat('en-US');
  return `${formatter.format(value)} XAF`;
}
