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
VALUES (
  'a1000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'bootstrap-user@example.test',
  '',
  now(),
  now(),
  now()
);

SET LOCAL ROLE authenticated;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

DO $$
DECLARE
  first_household_id uuid;
  second_household_id uuid;
  owner_memberships integer;
BEGIN
  first_household_id := public.bootstrap_household('Bootstrap Test Household', 'XAF', 1);
  second_household_id := public.bootstrap_household('Ignored On Retry', 'USD', 10);

  IF first_household_id IS DISTINCT FROM second_household_id THEN
    RAISE EXCEPTION 'Household bootstrap is not idempotent.';
  END IF;

  SELECT count(*)::integer
  INTO owner_memberships
  FROM public.household_members
  WHERE household_id = first_household_id
    AND user_id = auth.uid()
    AND role = 'owner'
    AND deleted_at IS NULL;

  IF owner_memberships <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one owner membership, found %.', owner_memberships;
  END IF;
END;
$$;

RESET ROLE;

ROLLBACK;
