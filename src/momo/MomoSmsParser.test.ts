import { describe, expect, it } from 'vitest';

import { parseMomoSmsBatch } from './MomoSmsParser';

const received =
  'You have received 2000 XAF from HOPE CHENWI NSHIOM (237674926555) on your mobile money account at 2026-11-11 07:45:54. Message from sender: . Your new balance:2911 XAF. Financial Transaction Id: 19681275786. Back-to-School is Here!';
const payment =
  'Your payment of 4000 XAF to STE SOLUTION SARL (237671313148) has been completed at 2026-11-08 22:38:54. Message: . Your new balance: 989 XAF. Fee was 0 XAF. Financial Transaction Id: 19647283217. Dial *126*6#';
const transfer =
  'You have transferred 15000 XAF to HILDA GHANDZENI KELEN (237650332566) from your mobile money account 39306538 at 2026-11-08 15:13:52 FEES 34 FCFA. Your new balance: 0 XAF. Message from sender: Ok. Message to receiver: . Financial Transaction Id: 19639779520. Promo text';

describe('parseMomoSmsBatch', () => {
  it('parses money received as income-shaped MoMo data', () => {
    const [item] = parseMomoSmsBatch(received, 'MOMO_PASTE');
    expect(item).toMatchObject({
      action: 'RECEIVED',
      amount: 2000,
      counterpartyName: 'HOPE CHENWI NSHIOM',
      counterpartyPhone: '237674926555',
      dateTime: '2026-11-11 07:45:54',
      balanceAfter: 2911,
      transactionId: '19681275786',
      userMessage: null,
      recognized: true,
    });
  });

  it('parses payments, empty message fields, and zero fees', () => {
    const [item] = parseMomoSmsBatch(payment, 'MOMO_SHARE');
    expect(item).toMatchObject({
      action: 'PAYMENT',
      amount: 4000,
      counterpartyName: 'STE SOLUTION SARL',
      counterpartyPhone: '237671313148',
      fee: 0,
      userMessage: null,
      recognized: true,
    });
  });

  it('parses transfers, fees in FCFA, and ignores promotional tails', () => {
    const [item] = parseMomoSmsBatch(transfer, 'MOMO_INBOX');
    expect(item).toMatchObject({
      action: 'TRANSFER',
      amount: 15000,
      counterpartyName: 'HILDA GHANDZENI KELEN',
      counterpartyPhone: '237650332566',
      fee: 34,
      balanceAfter: 0,
      userMessage: 'Ok',
      recognized: true,
    });
    expect(item.rawSms).not.toContain('Promo text');
  });

  it('normalizes grouped amounts and balances', () => {
    const [item] = parseMomoSmsBatch(
      'Your payment of 1,250 XAF to SHOP SARL (237612345678) has been completed at 2026-11-08 22:38:54. Your new balance: 2,911 XAF. Financial Transaction Id: 77.',
      'MOMO_PASTE',
    );
    expect(item.amount).toBe(1250);
    expect(item.balanceAfter).toBe(2911);
  });

  it('returns each message in a multi-message paste separately', () => {
    const result = parseMomoSmsBatch(`${received}\n${payment}`, 'MOMO_PASTE');
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.transactionId)).toEqual(['19681275786', '19647283217']);
  });

  it('keeps malformed transaction-shaped text for manual review', () => {
    const [item] = parseMomoSmsBatch('Your payment of money to UNKNOWN at some time', 'MOMO_PASTE');
    expect(item.recognized).toBe(false);
    expect(item.amount).toBeNull();
  });

  it('returns no items for an empty or non-transaction promotional message', () => {
    expect(parseMomoSmsBatch('', 'MOMO_PASTE')).toEqual([]);
    expect(parseMomoSmsBatch('Back-to-School is Here! Dial *126*6#', 'MOMO_PASTE')).toEqual([]);
  });
});
