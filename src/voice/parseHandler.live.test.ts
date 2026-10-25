import { describe, it } from 'vitest';

import { voiceParseFixtures } from './fixtures';

const endpoint = process.env.VOICE_PARSE_URL;
const apiKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const accessToken = process.env.VOICE_TEST_JWT;
const enabled = Boolean(endpoint && apiKey && accessToken);

describe.skipIf(!enabled)('deployed voice parser fixture accuracy', () => {
  it('parses at least 90% of the 25 acceptance fixtures and leaves ambiguous lines unassigned', async () => {
    let total = 0;
    let correct = 0;

    for (const fixture of voiceParseFixtures) {
      const response = await fetch(endpoint as string, {
        method: 'POST',
        headers: {
          apikey: apiKey as string,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: fixture.transcript,
          lines: [
            { id: 'line-fuel', name: 'Fuel' },
            { id: 'line-car-wash', name: 'Car wash' },
            { id: 'line-household-feeding', name: 'Household Feeding' },
            { id: 'line-kids-savings', name: 'Kids savings' },
            { id: 'line-electricity', name: 'Electricity' },
            { id: 'line-internet', name: 'Internet' },
            { id: 'line-health', name: 'Health' },
            { id: 'line-transport', name: 'Transport' },
          ],
          today: '2026-10-25',
          timezone: 'Africa/Douala',
        }),
      });
      const body = (await response.json()) as {
        items?: Array<{
          intent?: string;
          amount_xaf?: number;
          line_id?: string | null;
        }>;
      };
      if (!response.ok || !Array.isArray(body.items)) {
        throw new Error(`Fixture failed with HTTP ${response.status}: ${fixture.transcript}`);
      }

      for (let index = 0; index < fixture.expected.length; index += 1) {
        total += 1;
        const expected = fixture.expected[index];
        const actual = body.items[index];
        if (
          actual?.intent === expected.intent &&
          actual.amount_xaf === expected.amount_xaf &&
          (expected.line_guess_name !== null || actual.line_id === null)
        ) {
          correct += 1;
        }
      }
    }

    const accuracy = total === 0 ? 0 : correct / total;
    if (accuracy < 0.9) {
      throw new Error(
        `Voice parser accuracy was ${(accuracy * 100).toFixed(1)}% (${correct}/${total}).`,
      );
    }
  }, 300_000);
});
