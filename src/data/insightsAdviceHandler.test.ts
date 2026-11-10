import { describe, expect, it, vi } from 'vitest';

import {
  createInsightsAdviceHandler,
  type InsightsAdviceEnvironment,
} from '../../supabase/functions/insights-advice/handler';

const environment: InsightsAdviceEnvironment = {
  supabaseUrl: 'https://pocket-guard.example.test',
  supabaseAnonKey: 'public-anon-test-key',
  anthropicApiKey: 'server-only-test-key',
  anthropicModel: 'test-model',
};

const input = {
  question: 'How can I reduce spending?',
  snapshot: {
    period: 'month',
    start: '2026-11-01',
    through: '2026-11-10',
    current: {
      income: 500_000,
      expenses: 150_000,
      saved: 25_000,
      planned: 200_000,
      fullPeriodPlanned: 600_000,
      transactionCount: 3,
      categories: [{ name: 'Fuel', spent: 150_000, planned: 80_000 }],
      incomeSources: [{ name: 'Business', received: 500_000 }],
    },
    previous: { income: 450_000, expenses: 120_000 },
    projection: { expenses: 450_000, income: 1_500_000 },
    position: {
      saved: 100_000,
      savingsTarget: 1_000_000,
      debtRemaining: 300_000,
      loansOutstanding: 0,
      goals: 1,
    },
  },
};

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://local.test/functions/v1/insights-advice', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-user-token',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function anthropicToolResponse(inputValue: unknown) {
  return Response.json({
    content: [{ type: 'tool_use', name: 'emit_financial_guidance', input: inputValue }],
  });
}

describe('insights-advice Edge Function handler', () => {
  it('requires authentication and validates requests before making external calls', async () => {
    const fetcher = vi.fn();
    const handler = createInsightsAdviceHandler(environment, fetcher);

    const unauthenticated = await handler(request(input, { Authorization: '' }));
    const invalid = await handler(
      request({ ...input, snapshot: { ...input.snapshot, current: { income: 1.5 } } }),
    );

    expect(unauthenticated.status).toBe(401);
    expect(invalid.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('enforces a dedicated daily quota before calling Anthropic', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'user-1' }))
      .mockResolvedValueOnce(Response.json(false));
    const handler = createInsightsAdviceHandler(environment, fetcher);

    const response = await handler(request(input));

    expect(response.status).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain('consume_insights_advice_quota');
  });

  it('sends only summarized data to Anthropic and validates structured advice', async () => {
    const advice = {
      title: 'Review fuel spending',
      message: 'Fuel is above its recorded allocation for this period.',
      nextStep: 'Check the remaining trips and update the budget if needed.',
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'user-1' }))
      .mockResolvedValueOnce(Response.json(true))
      .mockResolvedValueOnce(anthropicToolResponse(advice));
    const handler = createInsightsAdviceHandler(environment, fetcher);

    const response = await handler(request(input));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(advice);
    const anthropicRequest = fetcher.mock.calls[2][1] as {
      body?: string;
      headers?: Record<string, string>;
    };
    const payload = JSON.parse(String(anthropicRequest.body));
    expect(payload).toMatchObject({
      model: 'test-model',
      tool_choice: { type: 'tool', name: 'emit_financial_guidance' },
    });
    expect(payload.messages[0].content).toContain('"name":"Fuel"');
    expect(payload.messages[0].content).not.toContain('transaction_note');
    expect(anthropicRequest.headers).toMatchObject({ 'x-api-key': 'server-only-test-key' });
  });

  it('accepts custom periods for cloud guidance', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'user-1' }))
      .mockResolvedValueOnce(Response.json(true))
      .mockResolvedValueOnce(
        anthropicToolResponse({
          title: 'Custom range',
          message: 'Here is a review of those dates.',
          nextStep: 'Compare the categories with your plan.',
        }),
      );
    const customInput = {
      ...input,
      snapshot: { ...input.snapshot, period: 'custom' },
    };

    const response = await createInsightsAdviceHandler(environment, fetcher)(request(customInput));

    expect(response.status).toBe(200);
  });

  it('rejects malformed model output', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'user-1' }))
      .mockResolvedValueOnce(Response.json(true))
      .mockResolvedValueOnce(anthropicToolResponse({ title: 'Missing fields' }));
    const handler = createInsightsAdviceHandler(environment, fetcher);

    const response = await handler(request(input));

    expect(response.status).toBe(502);
  });
});
