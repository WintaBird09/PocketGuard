import { describe, expect, it } from 'vitest';

import { momoDelayNotice } from './momoDelayNotice';

describe('momoDelayNotice', () => {
  it('warns when review happens after the transaction date', () => {
    expect(momoDelayNotice('2026-11-10', '2026-11-11')).toContain('effected on 2026-11-10');
  });

  it('does not warn for same-day or missing transaction dates', () => {
    expect(momoDelayNotice('2026-11-11', '2026-11-11')).toBeNull();
    expect(momoDelayNotice(null, '2026-11-11')).toBeNull();
  });
});
