# supabase

Supabase migrations, seed data, and server-side logic live here.

## Voice parsing deployment

The `parse-expense` Edge Function requires the voice quota migration and two server-side
secrets. Review and apply `migrations/20261025010004_voice_parse_usage.sql` before deploying the
function. Verify quota isolation with `scripts/verify_voice_parse_usage.sql` in the Supabase SQL
editor; the script rolls back its test data.

Set the Anthropic credentials only as Supabase function secrets (never as `EXPO_PUBLIC_*` values):

```sh
supabase secrets set ANTHROPIC_API_KEY=<Anthropic API key> ANTHROPIC_MODEL=<model name>
supabase functions deploy parse-expense
```

The function reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the Edge Function environment. It
validates the user's bearer token, consumes the per-user UTC daily quota through the authenticated
RPC, and calls Anthropic with a 10-second timeout.

After deployment, configure the app's existing `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` values and sign in. The opt-in 25-phrase live accuracy check can be
run from the app directory with:

```sh
VOICE_PARSE_URL=https://<project-ref>.supabase.co/functions/v1/parse-expense \
EXPO_PUBLIC_SUPABASE_ANON_KEY=<public-anon-key> \
VOICE_TEST_JWT=<short-lived-user-access-token> \
npx vitest run src/voice/parseHandler.live.test.ts
```

The live check requires a deployment and an authenticated test session; it is intentionally skipped
when those variables are absent.
