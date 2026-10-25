CREATE TABLE public.households (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL,
  name text NOT NULL,
  month_start_day integer NOT NULL DEFAULT 1,
  currency text NOT NULL DEFAULT 'XAF',
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT households_month_start_day_check CHECK (month_start_day BETWEEN 1 AND 31),
  CONSTRAINT households_household_id_self_check CHECK (household_id = id),
  CONSTRAINT households_household_id_fkey
    FOREIGN KEY (household_id) REFERENCES public.households(id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE public.household_members (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT household_members_role_check CHECK (role IN ('owner', 'member')),
  CONSTRAINT household_members_household_user_key UNIQUE (household_id, user_id)
);

CREATE TABLE public.budget_lines (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL,
  hard_cap boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE public.allocations (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  line_id uuid NOT NULL REFERENCES public.budget_lines(id),
  month text NOT NULL,
  planned_amount integer NOT NULL,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT allocations_month_format_check CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

CREATE UNIQUE INDEX allocations_line_month_unique
  ON public.allocations (line_id, month)
  WHERE deleted_at IS NULL;

CREATE TABLE public.debts (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  creditor text NOT NULL,
  original_amount integer NOT NULL,
  deadline date,
  note text,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  amount integer NOT NULL,
  direction text NOT NULL,
  line_id uuid REFERENCES public.budget_lines(id),
  debt_id uuid REFERENCES public.debts(id),
  note text,
  source text NOT NULL DEFAULT 'manual',
  raw_text text,
  status text NOT NULL DEFAULT 'confirmed',
  override_reason text,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT transactions_direction_check CHECK (direction IN ('expense', 'income', 'transfer')),
  CONSTRAINT transactions_source_check CHECK (source IN ('manual', 'voice', 'sms')),
  CONSTRAINT transactions_status_check CHECK (status IN ('confirmed', 'draft'))
);

CREATE TABLE public.savings_goals (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_amount integer NOT NULL,
  due_date date NOT NULL,
  include_kids_savings boolean NOT NULL DEFAULT false,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE public.savings_commitments (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.savings_goals(id),
  line_id uuid NOT NULL REFERENCES public.budget_lines(id),
  month text NOT NULL,
  planned_amount integer NOT NULL,
  saved_amount integer,
  saved_at timestamptz,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT savings_commitments_month_format_check CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

CREATE TABLE public.settings (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX household_members_user_id_idx ON public.household_members (user_id);
CREATE INDEX budget_lines_household_id_idx ON public.budget_lines (household_id);
CREATE INDEX allocations_household_month_idx ON public.allocations (household_id, month);
CREATE INDEX transactions_household_occurred_at_idx
  ON public.transactions (household_id, occurred_at DESC);
CREATE INDEX debts_household_id_idx ON public.debts (household_id);
CREATE INDEX savings_goals_household_id_idx ON public.savings_goals (household_id);
CREATE INDEX savings_commitments_household_month_idx
  ON public.savings_commitments (household_id, month);
CREATE UNIQUE INDEX settings_household_key_unique
  ON public.settings (household_id, key)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.is_household_member(target_household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members AS member
    WHERE member.household_id = target_household_id
      AND member.user_id = (SELECT auth.uid())
      AND member.deleted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_household_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_household_member(uuid) TO authenticated;

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY households_member_select ON public.households
  FOR SELECT TO authenticated
  USING (public.is_household_member(id));

CREATE POLICY households_member_update ON public.households
  FOR UPDATE TO authenticated
  USING (public.is_household_member(id))
  WITH CHECK (public.is_household_member(id));

CREATE POLICY households_owner_delete ON public.households
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.household_members AS member
      WHERE member.household_id = id
        AND member.user_id = (SELECT auth.uid())
        AND member.role = 'owner'
        AND member.deleted_at IS NULL
    )
  );

CREATE POLICY household_members_read_self ON public.household_members
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY budget_lines_member_access ON public.budget_lines
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

CREATE POLICY allocations_member_access ON public.allocations
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

CREATE POLICY transactions_member_access ON public.transactions
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

CREATE POLICY debts_member_access ON public.debts
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

CREATE POLICY savings_goals_member_access ON public.savings_goals
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

CREATE POLICY savings_commitments_member_access ON public.savings_commitments
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

CREATE POLICY settings_member_access ON public.settings
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.households,
  public.budget_lines,
  public.allocations,
  public.transactions,
  public.debts,
  public.savings_goals,
  public.savings_commitments,
  public.settings
TO authenticated;

GRANT SELECT ON public.household_members TO authenticated;

REVOKE ALL ON
  public.households,
  public.household_members,
  public.budget_lines,
  public.allocations,
  public.transactions,
  public.debts,
  public.savings_goals,
  public.savings_commitments,
  public.settings
FROM anon;

REVOKE INSERT, UPDATE, DELETE ON public.household_members FROM authenticated;
