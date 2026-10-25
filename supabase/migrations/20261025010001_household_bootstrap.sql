CREATE OR REPLACE FUNCTION public.bootstrap_household(
  p_name text,
  p_currency text,
  p_month_start_day integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requesting_user_id uuid := (SELECT auth.uid());
  created_household_id uuid;
BEGIN
  IF requesting_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to bootstrap a household.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requesting_user_id::text, 0)
  );

  SELECT member.household_id
  INTO created_household_id
  FROM public.household_members AS member
  JOIN public.households AS household ON household.id = member.household_id
  WHERE member.user_id = requesting_user_id
    AND member.deleted_at IS NULL
    AND household.deleted_at IS NULL
  ORDER BY member.created_at
  LIMIT 1;

  IF created_household_id IS NOT NULL THEN
    RETURN created_household_id;
  END IF;

  IF p_name IS NULL OR pg_catalog.btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Household name is required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_currency IS NULL OR pg_catalog.btrim(p_currency) = '' THEN
    RAISE EXCEPTION 'Household currency is required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_month_start_day IS NULL OR p_month_start_day NOT BETWEEN 1 AND 31 THEN
    RAISE EXCEPTION 'Month start day must be between 1 and 31.'
      USING ERRCODE = '22023';
  END IF;

  created_household_id := pg_catalog.gen_random_uuid();

  INSERT INTO public.households (
    id,
    household_id,
    name,
    month_start_day,
    currency
  )
  VALUES (
    created_household_id,
    created_household_id,
    pg_catalog.btrim(p_name),
    p_month_start_day,
    pg_catalog.btrim(p_currency)
  );

  INSERT INTO public.household_members (
    id,
    household_id,
    user_id,
    role
  )
  VALUES (
    pg_catalog.gen_random_uuid(),
    created_household_id,
    requesting_user_id,
    'owner'
  );

  RETURN created_household_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_household(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_household(text, text, integer) TO authenticated;
