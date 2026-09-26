-- Daily property-level KPIs for Pure for Men (not page grain).
-- Does not modify chipper_pfm_ga4_data.

CREATE TABLE IF NOT EXISTS public.chipper_pfm_ga4_daily (
  client_id text NOT NULL,
  report_date date NOT NULL,
  ga4_property_id text,
  account_name text,
  total_users integer NOT NULL DEFAULT 0,
  new_users integer NOT NULL DEFAULT 0,
  conversions numeric NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_chipper_pfm_ga4_daily_date
  ON public.chipper_pfm_ga4_daily (report_date);

COMMENT ON TABLE public.chipper_pfm_ga4_daily IS
  'Daily site totals: total_users, new_users, conversions, revenue. No returning_users. Independent of page raw table.';

ALTER TABLE public.chipper_pfm_ga4_daily ENABLE ROW LEVEL SECURITY;
