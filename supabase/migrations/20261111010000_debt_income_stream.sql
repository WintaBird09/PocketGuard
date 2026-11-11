ALTER TABLE public.debts
  ADD COLUMN income_stream_id uuid REFERENCES public.income_streams(id) ON DELETE SET NULL;

CREATE INDEX debts_income_stream_id_idx ON public.debts (income_stream_id);