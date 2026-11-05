import { afterEach, describe, expect, it } from 'vitest';

import {
  currencyForLocale,
  formatMoney,
  isSupportedCurrency,
  searchCurrencies,
  setActiveCurrency,
} from './currency';

describe('currency', () => {
  afterEach(() => setActiveCurrency('XAF'));

  it('maps a locale region to a currency', () => {
    expect(currencyForLocale('en-CM')).toBe('XAF');
    expect(currencyForLocale('fr_FR')).toBe('EUR');
    expect(currencyForLocale('en-US')).toBe('USD');
    expect(currencyForLocale('en')).toBeNull();
    expect(currencyForLocale(undefined)).toBeNull();
  });

  it('formats with the active currency and ignores unsupported codes', () => {
    expect(formatMoney(1234567)).toBe('1,234,567 XAF');
    setActiveCurrency('USD');
    expect(formatMoney(50)).toBe('50 USD');
    setActiveCurrency('NOPE');
    expect(formatMoney(1)).toBe('1 USD');
    expect(isSupportedCurrency('NOPE')).toBe(false);
  });

  it('searches by code or name', () => {
    expect(searchCurrencies('naira').map((item) => item.code)).toEqual(['NGN']);
    expect(searchCurrencies('eur')[0].code).toBe('EUR');
    expect(searchCurrencies('').length).toBeGreaterThan(80);
  });
});
