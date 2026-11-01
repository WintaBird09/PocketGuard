import type { User } from '@supabase/supabase-js';

export const maxDisplayNameLength = 50;

export function getDisplayName(user: User | null | undefined): string {
  const name = user?.user_metadata?.display_name;
  return typeof name === 'string' ? name.trim() : '';
}

// Falls back to the email's local part so the profile is never anonymous.
export function getDisplayLabel(user: User | null | undefined): string {
  return getDisplayName(user) || user?.email?.split('@')[0] || 'Your profile';
}

export function getInitials(label: string): string {
  const parts = label
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0];
  return letters.toUpperCase();
}

export function validateDisplayName(value: string): string | null {
  const name = value.trim();
  if (name.length === 0) return 'Enter a name.';
  if (name.length > maxDisplayNameLength) {
    return `Use at most ${maxDisplayNameLength} characters.`;
  }
  return null;
}

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (password !== confirm) return 'Passwords do not match.';
  return null;
}
