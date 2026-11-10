CREATE TABLE public.insights_advice_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_day date NOT NULL,
  request_count integer NOT NULL DEFAULT 0
    CHECK (request_count BETWEEN 0 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_day)
);

ALTER TABLE public.insights_advice_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.insights_advice_usage FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_insights_advice_quota()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  current_day date := (now() AT TIME ZONE 'UTC')::date;
  accepted_count integer;
BEGIN
  IF caller_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.insights_advice_usage (user_id, usage_day, request_count)
  VALUES (caller_id, current_day, 1)
  ON CONFLICT (user_id, usage_day) DO UPDATE
    SET request_count = public.insights_advice_usage.request_count + 1,
        updated_at = now()
    WHERE public.insights_advice_usage.request_count < 20
  RETURNING request_count INTO accepted_count;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_insights_advice_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_insights_advice_quota() TO authenticated;
