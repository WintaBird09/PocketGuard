BEGIN;

INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
VALUES
  (
    'a1000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'voice-quota-a@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'voice-quota-b@example.test',
    '',
    now(),
    now(),
    now()
  );

INSERT INTO public.voice_parse_usage (user_id, usage_day, request_count)
VALUES
  ('a1000000-0000-4000-8000-000000000001', (now() AT TIME ZONE 'UTC')::date, 0),
  ('b2000000-0000-4000-8000-000000000002', (now() AT TIME ZONE 'UTC')::date, 0);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

DO $$
DECLARE
  calls integer;
BEGIN
  IF has_table_privilege('authenticated', 'public.voice_parse_usage', 'SELECT')
    OR has_table_privilege('authenticated', 'public.voice_parse_usage', 'INSERT')
    OR has_table_privilege('authenticated', 'public.voice_parse_usage', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.voice_parse_usage', 'DELETE') THEN
    RAISE EXCEPTION 'Quota rows must not be directly accessible to authenticated clients';
  END IF;

  BEGIN
    EXECUTE
      'SELECT request_count FROM public.voice_parse_usage WHERE user_id = $1'
      USING 'b2000000-0000-4000-8000-000000000002'::uuid;
    RAISE EXCEPTION 'Cross-user quota read unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  FOR calls IN 1..60 LOOP
    IF NOT public.consume_voice_parse_quota() THEN
      RAISE EXCEPTION 'Quota rejected allowed request %', calls;
    END IF;
  END LOOP;

  IF public.consume_voice_parse_quota() THEN
    RAISE EXCEPTION 'Quota accepted request 61';
  END IF;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  user_a_count integer;
  user_b_count integer;
BEGIN
  SELECT request_count INTO user_a_count
  FROM public.voice_parse_usage
  WHERE user_id = 'a1000000-0000-4000-8000-000000000001'
    AND usage_day = (now() AT TIME ZONE 'UTC')::date;
  SELECT request_count INTO user_b_count
  FROM public.voice_parse_usage
  WHERE user_id = 'b2000000-0000-4000-8000-000000000002'
    AND usage_day = (now() AT TIME ZONE 'UTC')::date;

  IF user_a_count <> 60 OR user_b_count <> 0 THEN
    RAISE EXCEPTION 'Quota isolation failed: user A %, user B %', user_a_count, user_b_count;
  END IF;

  IF has_table_privilege('anon', 'public.voice_parse_usage', 'SELECT')
    OR has_table_privilege('anon', 'public.voice_parse_usage', 'INSERT') THEN
    RAISE EXCEPTION 'anon can access voice_parse_usage';
  END IF;
END;
$$;

ROLLBACK;
