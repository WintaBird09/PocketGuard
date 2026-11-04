CREATE TABLE public.income_streams (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('salary', 'business', 'rental', 'other')),
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX income_streams_household_name_unique
  ON public.income_streams (household_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX income_streams_household_id_idx ON public.income_streams (household_id);

ALTER TABLE public.allocations
  ADD COLUMN income_stream_id uuid REFERENCES public.income_streams(id);
ALTER TABLE public.transactions
  ADD COLUMN income_stream_id uuid REFERENCES public.income_streams(id);

CREATE TRIGGER income_streams_set_updated_at
  BEFORE INSERT OR UPDATE ON public.income_streams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.income_streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY income_streams_member_access ON public.income_streams
  FOR ALL TO authenticated
  USING (public.is_household_member(household_id))
  WITH CHECK (public.is_household_member(household_id));

REVOKE ALL ON public.income_streams FROM anon;
REVOKE ALL ON public.income_streams FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_streams TO authenticated;