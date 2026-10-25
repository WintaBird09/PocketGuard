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
  SELECT name INTO existing_name
  FROM public.budget_lines
  WHERE id = 'e5000000-0000-4000-8000-000000000005';
  IF existing_name IS DISTINCT FROM 'Private test line' THEN
    RAISE EXCEPTION 'RLS failure: user A changed or deleted user B budget line';
  END IF;
END;
$$;

ROLLBACK;
