import type { User } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  getDisplayLabel,
  getDisplayName,
  getInitials,
  validateDisplayName,
  validateNewPassword,
} from './profile';

const user = (email: string, displayName?: unknown) =>
  ({
    email,
    user_metadata: displayName === undefined ? {} : { display_name: displayName },
  }) as User;

describe('profile helpers', () => {
  it('prefers the saved display name, then the email name', () => {
    expect(getDisplayName(user('a@b.com', '  Hope Dev '))).toBe('Hope Dev');
    expect(getDisplayLabel(user('hope.dev@b.com'))).toBe('hope.dev');
    expect(getDisplayLabel(user('a@b.com', 42))).toBe('a');
    expect(getDisplayLabel(null)).toBe('Your profile');
  });

  it('builds initials', () => {
    expect(getInitials('Hope Dev')).toBe('HD');
    expect(getInitials('hope')).toBe('HO');
    expect(getInitials('hope.dev')).toBe('HD');
    expect(getInitials('  ')).toBe('?');
  });

  it('validates the name and password', () => {
    expect(validateDisplayName('  ')).not.toBeNull();
    expect(validateDisplayName('x'.repeat(51))).not.toBeNull();
    expect(validateDisplayName('Hope')).toBeNull();
    expect(validateNewPassword('short', 'short')).not.toBeNull();
    expect(validateNewPassword('longenough', 'different1')).not.toBeNull();
    expect(validateNewPassword('longenough', 'longenough')).toBeNull();
  });
});
