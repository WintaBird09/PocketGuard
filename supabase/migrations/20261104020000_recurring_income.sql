ALTER TABLE public.income_streams
  ADD COLUMN recurring_amount integer,
  ADD COLUMN recurring_day smallint,
  ADD COLUMN recurring_start_month text;

ALTER TABLE public.income_streams
  ADD CONSTRAINT income_streams_recurring_plan_valid
  CHECK (
    (recurring_amount IS NULL AND recurring_day IS NULL AND recurring_start_month IS NULL)
    OR
    (recurring_amount IS NOT NULL AND recurring_amount > 0
      AND recurring_day IS NOT NULL AND recurring_day BETWEEN 1 AND 31
      AND recurring_start_month IS NOT NULL
      AND recurring_start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
  );

ALTER TABLE public.transactions
  ADD COLUMN recurring_income_month text
  CHECK (recurring_income_month IS NULL
    OR recurring_income_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

CREATE UNIQUE INDEX transactions_recurring_income_month_unique
  ON public.transactions (household_id, income_stream_id, recurring_income_month)
  WHERE recurring_income_month IS NOT NULL AND deleted_at IS NULL;
