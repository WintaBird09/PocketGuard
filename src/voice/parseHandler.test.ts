import { describe, expect, it, vi } from 'vitest';

import { voiceParseFixtures } from './fixtures';
import {
  createParseExpenseHandler,
  type ParseExpenseEnvironment,
} from '../../supabase/functions/parse-expense/handler';

const environment: ParseExpenseEnvironment = {
  supabaseUrl: 'https://pocket-guard.example.test',
  supabaseAnonKey: 'public-anon-test-key',
  anthropicApiKey: 'server-only-test-key',
  anthropicModel: 'test-model',
};

const lines = [
  { id: 'line-fuel', name: 'Fuel' },
  { id: 'line-car-wash', name: 'Car wash' },
  { id: 'line-household-feeding', name: 'Household Feeding' },
  { id: 'line-kids-savings', name: 'Kids savings' },
  { id: 'line-electricity', name: 'Electricity' },
  { id: 'line-internet', name: 'Internet' },
  { id: 'line-health', name: 'Health' },
  { id: 'line-transport', name: 'Transport' },
];

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://local.test/functions/v1/parse-expense', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-test-token',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function input(transcript = '20k fuel') {
  return { transcript, lines, today: '2026-10-25', timezone: 'Africa/Douala' };
}

function anthropicToolResponse(items: unknown[]) {
  return Response.json({
    content: [{ type: 'tool_use', name: 'emit_parse_result', input: { items } }],
  });
}

function validItem(overrides: Record<string, unknown> = {}) {
  return {
    intent: 'log_expense',
    amount_xaf: 20000,
    line_id: 'line-fuel',
    line_guess_name: 'Fuel',
    note: 'fuel',
    date: '2026-10-25',
    confidence: 0.95,
    ...overrides,
  };
}

describe('parse-expense Edge Function handler', () => {
  it('requires authentication before parsing', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 401 }));
    const handler = createParseExpenseHandler(environment, fetcher);
    const response = await handler(request(input()));

    expect(response.status).toBe(401);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('rejects invalid and oversized request bodies before network calls', async () => {
    const fetcher = vi.fn();
    const handler = createParseExpenseHandler(environment, fetcher);
    const invalid = await handler(request({ ...input(), today: 'yesterday' }));
    const oversized = await handler(request(input(), { 'Content-Length': '16385' }));

    expect(invalid.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('enforces the daily quota before contacting Anthropic', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'user-1' }))
      .mockResolvedValueOnce(Response.json(false));
    const handler = createParseExpenseHandler(environment, fetcher);

    const response = await handler(request(input()));

    expect(response.status).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain('consume_voice_parse_quota');
  });

  it('calls Claude with temperature zero, a forced structured tool, and the configured model', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'user-1' }))
      .mockResolvedValueOnce(Response.json(true))
      .mockResolvedValueOnce(anthropicToolResponse([validItem()]));
    const handler = createParseExpenseHandler(environment, fetcher);

    const response = await handler(request(input()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [validItem()] });
    const anthropicRequest = fetcher.mock.calls[2][1] as {
      body?: string;
      signal?: AbortSignal;
    };
    const payload = JSON.parse(String(anthropicRequest.body));
    expect(payload).toMatchObject({
      model: 'test-model',
      temperature: 0,
      tool_choice: { type: 'tool', name: 'emit_parse_result' },
    });
    expect(anthropicRequest.signal).toBeInstanceOf(AbortSignal);
  });

  it('nulls model-invented budget-line IDs and rejects malformed model output', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'user-1' }))
      .mockResolvedValueOnce(Response.json(true))
      .mockResolvedValueOnce(
        anthropicToolResponse([
          validItem({ line_id: 'fuel budget line (guess)', line_guess_name: 'Imaginary' }),
        ]),
      );
    const handler = createParseExpenseHandler(environment, fetcher);
    const response = await handler(request(input()));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ items: [{ line_id: null }] });

    const malformedFetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'user-1' }))
      .mockResolvedValueOnce(Response.json(true))
      .mockResolvedValueOnce(anthropicToolResponse([{ ...validItem(), amount_xaf: -1 }]));
    const malformed = await createParseExpenseHandler(
      environment,
      malformedFetcher,
    )(request(input()));
    expect(malformed.status).toBe(502);
  });

  it.each(voiceParseFixtures)(
    'validates parser fixture: $transcript',
    async ({ transcript, expected }) => {
      const modelItems = expected.map((item) =>
        validItem({
          intent: item.intent,
          amount_xaf: item.amount_xaf,
          line_guess_name: item.line_guess_name,
          line_id:
            lines.find((line) => line.name.toLowerCase() === item.line_guess_name?.toLowerCase())
              ?.id ?? '',
          date: '2026-10-25',
          note: transcript,
          confidence: 0.9,
        }),
      );
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ id: 'user-1' }))
        .mockResolvedValueOnce(Response.json(true))
        .mockResolvedValueOnce(anthropicToolResponse(modelItems));
      const response = await createParseExpenseHandler(
        environment,
        fetcher,
      )(request(input(transcript)));
      const body = (await response.json()) as { items: Array<Record<string, unknown>> };

      expect(response.status).toBe(200);
      expect(body.items).toHaveLength(expected.length);
      expect(body.items.map(({ intent, amount_xaf }) => ({ intent, amount_xaf }))).toEqual(
        expected.map(({ intent, amount_xaf }) => ({ intent, amount_xaf })),
      );
    },
  );
});
