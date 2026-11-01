import { describe, expect, it } from 'vitest';

import { buildInviteMessage } from './invite';

describe('invite message', () => {
  it('names the inviter', () => {
    expect(buildInviteMessage(' Yaya ')).toContain('Yaya invites you');
  });
  it('works without a name', () => {
    expect(buildInviteMessage('')).toContain('You are invited');
  });
});
