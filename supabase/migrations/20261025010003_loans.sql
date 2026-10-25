-- Loans: money lent to friends and family (PRD §7.8b). New tables only.

CREATE TABLE public.loans (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  person_name text NOT NULL,
  person_phone text,
  contact_id text,
  lent_on date NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  plan text NOT NULL DEFAULT 'flexible' CHECK (plan IN ('single', 'installments', 'flexible')),
  deadline date,
  note text,
  written_off_at timestamptz,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE public.loan_installments (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  due_on date NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE public.loan_payments (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  paid_at timestamptz NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  note text,
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX loans_household_id_idx ON public.loans (household_id);
CREATE INDEX loan_installments_household_loan_idx ON public.loan_installments (household_id, loan_id);
CREATE INDEX loan_payments_household_loan_idx ON public.loan_payments (household_id, loan_id);

CREATE TRIGGER loans_set_updated_at
  BEFORE INSERT OR UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER loan_installments_set_updated_at
  BEFORE INSERT OR UPDATE ON public.loan_installments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER loan_payments_set_updated_at
  BEFORE INSERT OR UPDATE ON public.loan_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY loans_member_access ON public.loans
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

CREATE POLICY loan_installments_member_access ON public.loan_installments
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

CREATE POLICY loan_payments_member_access ON public.loan_payments
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

REVOKE ALL ON public.loans, public.loan_installments, public.loan_payments FROM anon;
REVOKE ALL ON public.loans, public.loan_installments, public.loan_payments FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.loans, public.loan_installments, public.loan_payments
  TO authenticated;
