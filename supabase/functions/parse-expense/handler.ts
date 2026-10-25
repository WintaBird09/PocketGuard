import {
  normalizeParsedLineIds,
  parseExpenseInputSchema,
  parseExpenseResponseSchema,
  type ParseExpenseInput,
} from '../../../src/voice/contract.ts';

const maxBodyBytes = 16_384;
const toolName = 'emit_parse_result';

export type ParseExpenseEnvironment = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  anthropicApiKey: string;
  anthropicModel: string;
};

type FetchLike = typeof fetch;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function readBody(request: Request): Promise<string | null> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) return null;
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBodyBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function getToolSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 10,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'intent',
            'amount_xaf',
            'line_id',
            'line_guess_name',
            'note',
            'date',
            'confidence',
          ],
          properties: {
            intent: {
              type: 'string',
              enum: ['log_expense', 'check_spend', 'log_income', 'confirm_saving', 'unknown'],
            },
            amount_xaf: { type: 'integer', minimum: 0, maximum: 2_000_000_000 },
            line_id: {
              type: 'string',
              description: 'Use an exact input line id or an empty string when no line is certain.',
            },
            line_guess_name: { type: 'string' },
            note: { type: 'string' },
            date: { type: 'string', description: 'Calendar date in YYYY-MM-DD format.' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
        },
      },
    },
  };
}

function buildSystemPrompt(input: ParseExpenseInput): string {
  const lines = input.lines.map(({ id, name }) => ({ id, name }));
  return [
    'You parse Pocket Guard voice requests into structured transaction intents.',
    'Return only the required emit_parse_result tool input.',
    'Amounts are whole XAF integers. Interpret 20k and twenty thousand as 20000.',
    'Resolve relative dates against the supplied today and timezone.',
    'For ambiguous, absent, or unknown budget lines, use an empty line_id; never invent an ID.',
    'Use log_expense for spending, check_spend for questions about whether spending is allowed,',
    'log_income for income, confirm_saving for a completed savings contribution, and unknown',
    'when the intent or amount cannot be determined. Split clearly separate items into cards.',
    'Do not invent amounts. Use 0 when no amount is stated.',
    `today=${input.today}; timezone=${input.timezone}; available_lines=${JSON.stringify(lines)}`,
  ].join(' ');
}

export function createParseExpenseHandler(
  environment: ParseExpenseEnvironment,
  fetcher: FetchLike = fetch,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' });

    const authorization = request.headers.get('authorization') ?? '';
    const tokenMatch = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!tokenMatch) return jsonResponse(401, { error: 'A valid sign-in is required.' });

    const body = await readBody(request);
    if (body === null) return jsonResponse(400, { error: 'Request body exceeds 16 KB.' });
    let rawInput: unknown;
    try {
      rawInput = JSON.parse(body);
    } catch {
      return jsonResponse(400, { error: 'Request body must be valid JSON.' });
    }
    const parsedInput = parseExpenseInputSchema.safeParse(rawInput);
    if (!parsedInput.success || !isValidTimezone(parsedInput.data?.timezone ?? '')) {
      return jsonResponse(400, { error: 'Request does not match the voice parse contract.' });
    }

    const { supabaseUrl, supabaseAnonKey, anthropicApiKey, anthropicModel } = environment;
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse(503, { error: 'Voice parsing authentication is not configured.' });
    }
    if (!anthropicApiKey || !anthropicModel) {
      return jsonResponse(503, { error: 'Voice parsing service is not configured.' });
    }

    let authResponse: Response;
    try {
      authResponse = await fetcher(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: supabaseAnonKey, Authorization: authorization },
      });
    } catch {
      return jsonResponse(503, { error: 'Unable to verify sign-in right now.' });
    }
    if (!authResponse.ok) return jsonResponse(401, { error: 'A valid sign-in is required.' });

    let quotaResponse: Response;
    try {
      quotaResponse = await fetcher(`${supabaseUrl}/rest/v1/rpc/consume_voice_parse_quota`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
    } catch {
      return jsonResponse(503, { error: 'Unable to verify voice parsing quota.' });
    }
    if (!quotaResponse.ok) {
      return jsonResponse(503, { error: 'Unable to verify voice parsing quota.' });
    }
    const quota: unknown = await quotaResponse.json();
    if (quota !== true) return jsonResponse(429, { error: 'Daily voice parsing limit reached.' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let anthropicBody: { content?: unknown };
    try {
      const anthropicResponse = await fetcher('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: anthropicModel,
          max_tokens: 2048,
          temperature: 0,
          system: buildSystemPrompt(parsedInput.data),
          tools: [
            {
              name: toolName,
              description: 'Return the parsed transaction intents.',
              input_schema: getToolSchema(),
            },
          ],
          tool_choice: { type: 'tool', name: toolName },
          messages: [{ role: 'user', content: parsedInput.data.transcript }],
        }),
      });
      if (!anthropicResponse.ok) {
        return jsonResponse(502, { error: 'Voice parser could not process this recording.' });
      }
      anthropicBody = (await anthropicResponse.json()) as { content?: unknown };
    } catch (cause) {
      const timeoutFailure =
        controller.signal.aborted || (cause instanceof Error && cause.name === 'AbortError');
      return jsonResponse(timeoutFailure ? 504 : 502, {
        error: timeoutFailure
          ? 'Voice parser timed out.'
          : 'Voice parser returned an invalid response or is unavailable.',
      });
    } finally {
      clearTimeout(timeout);
    }
    const toolResult = Array.isArray(anthropicBody.content)
      ? anthropicBody.content.find(
          (block): block is { type: string; name: string; input: unknown } =>
            typeof block === 'object' &&
            block !== null &&
            'type' in block &&
            block.type === 'tool_use' &&
            'name' in block &&
            block.name === toolName &&
            'input' in block,
        )
      : undefined;
    const validLineIds = new Set(parsedInput.data.lines.map((line) => line.id));
    const toolInput = normalizeToolInput(toolResult?.input, validLineIds);
    const parsedOutput = parseExpenseResponseSchema.safeParse(toolInput);
    if (!parsedOutput.success) {
      return jsonResponse(502, {
        error: 'Voice parser returned data outside the expected contract.',
      });
    }

    function normalizeToolInput(value: unknown, validLineIds: Set<string>): unknown {
      if (typeof value !== 'object' || value === null || !('items' in value)) return value;
      const items = (value as { items?: unknown }).items;
      if (!Array.isArray(items)) return value;
      return {
        items: items.map((item) => {
          if (typeof item !== 'object' || item === null) return item;
          const candidate = item as { line_id?: unknown; line_guess_name?: unknown };
          return {
            ...candidate,
            line_id:
              typeof candidate.line_id === 'string' &&
              (candidate.line_id === '' || !validLineIds.has(candidate.line_id))
                ? null
                : candidate.line_id,
            line_guess_name: candidate.line_guess_name === '' ? null : candidate.line_guess_name,
          };
        }),
      };
    }

    const result = normalizeParsedLineIds(parsedOutput.data, parsedInput.data.lines);
    return jsonResponse(200, result);
  };
}
