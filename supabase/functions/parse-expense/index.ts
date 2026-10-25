import { createParseExpenseHandler } from './handler.ts';

declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (request: Request) => Promise<Response>) => void;
};

const environment = {
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  supabaseAnonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  anthropicApiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '',
  anthropicModel: Deno.env.get('ANTHROPIC_MODEL') ?? '',
};

Deno.serve(createParseExpenseHandler(environment));
