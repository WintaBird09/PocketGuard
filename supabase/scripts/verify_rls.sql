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
    'rls-user-a@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'rls-user-b@example.test',
    '',
    now(),
    now(),
    now()
  );

INSERT INTO public.households (id, household_id, name)
VALUES (
  'c3000000-0000-4000-8000-000000000003',
  'c3000000-0000-4000-8000-000000000003',
  'RLS test household B'
);

INSERT INTO public.household_members (id, household_id, user_id, role)
VALUES (
  'd4000000-0000-4000-8000-000000000004',
  'c3000000-0000-4000-8000-000000000003',
  'b2000000-0000-4000-8000-000000000002',
  'owner'
);

INSERT INTO public.budget_lines (id, household_id, name, kind)
VALUES (
  'e5000000-0000-4000-8000-000000000005',
  'c3000000-0000-4000-8000-000000000003',
  'Private test line',
  'misc'
);

INSERT INTO public.loans (id, household_id, person_name, lent_on, amount)
VALUES (
  '17000000-0000-4000-8000-000000000007',
  'c3000000-0000-4000-8000-000000000003',
  'Private test borrower',
  '2026-10-25',
  20000
);

INSERT INTO public.loan_payments (id, household_id, loan_id, paid_at, amount)
VALUES (
  '18000000-0000-4000-8000-000000000008',
  'c3000000-0000-4000-8000-000000000003',
  '17000000-0000-4000-8000-000000000007',
  now(),
  5000
);

SET LOCAL ROLE authenticated;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

DO $$
DECLARE
  visible_rows integer;
BEGIN
  SELECT count(*) INTO visible_rows
  FROM public.households
  WHERE id = 'c3000000-0000-4000-8000-000000000003';
  IF visible_rows <> 0 THEN
    RAISE EXCEPTION 'RLS failure: user A can read user B household';
  END IF;

  SELECT count(*) INTO visible_rows
  FROM public.budget_lines
  WHERE id = 'e5000000-0000-4000-8000-000000000005';
  IF visible_rows <> 0 THEN
    RAISE EXCEPTION 'RLS failure: user A can read user B budget line';
  END IF;

  SELECT count(*) INTO visible_rows FROM public.loans;
  IF visible_rows <> 0 THEN
    RAISE EXCEPTION 'RLS failure: user A can read user B loans';
  END IF;

  SELECT count(*) INTO visible_rows FROM public.loan_payments;
  IF visible_rows <> 0 THEN
    RAISE EXCEPTION 'RLS failure: user A can read user B loan payments';
  END IF;

  BEGIN
    INSERT INTO public.loans (id, household_id, person_name, lent_on, amount)
    VALUES (
      '19000000-0000-4000-8000-000000000009',
      'c3000000-0000-4000-8000-000000000003',
      'Unauthorized loan',
      '2026-10-25',
      1
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  UPDATE public.loans SET amount = 1 WHERE id = '17000000-0000-4000-8000-000000000007';
  DELETE FROM public.loans WHERE id = '17000000-0000-4000-8000-000000000007';

  BEGIN
    INSERT INTO public.budget_lines (id, household_id, name, kind)
    VALUES (
      'f6000000-0000-4000-8000-000000000006',
      'c3000000-0000-4000-8000-000000000003',
      'Unauthorized test line',
      'misc'
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  IF EXISTS (
    SELECT 1 FROM public.budget_lines
    WHERE id = 'f6000000-0000-4000-8000-000000000006'
  ) THEN
    RAISE EXCEPTION 'RLS failure: user A inserted into user B household';
  END IF;

  UPDATE public.budget_lines
  SET name = 'Modified by user A'
  WHERE id = 'e5000000-0000-4000-8000-000000000005';

  DELETE FROM public.budget_lines
  WHERE id = 'e5000000-0000-4000-8000-000000000005';
END;
$$;

RESET ROLE;

DO $$
DECLARE
  existing_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.loans
    WHERE id = '17000000-0000-4000-8000-000000000007' AND amount = 20000
  ) THEN
    RAISE EXCEPTION 'RLS failure: user A changed, deleted or inserted into user B loans';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.loans WHERE id = '19000000-0000-4000-8000-000000000009'
  ) THEN
    RAISE EXCEPTION 'RLS failure: user A inserted a loan into user B household';
  END IF;

  SELECT name INTO existing_name
  FROM public.budget_lines
  WHERE id = 'e5000000-0000-4000-8000-000000000005';
  IF existing_name IS DISTINCT FROM 'Private test line' THEN
    RAISE EXCEPTION 'RLS failure: user A changed or deleted user B budget line';
  END IF;
END;
$$;

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('loans', 'loan_installments', 'loan_payments')
    AND NOT c.relrowsecurity;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'RLS not enabled on: %', missing;
  END IF;
  IF has_table_privilege('anon', 'public.loans', 'SELECT')
    OR has_table_privilege('anon', 'public.loan_installments', 'SELECT')
    OR has_table_privilege('anon', 'public.loan_payments', 'SELECT') THEN
    RAISE EXCEPTION 'anon can access loan tables';
  END IF;
END;
$$;

ROLLBACK;
