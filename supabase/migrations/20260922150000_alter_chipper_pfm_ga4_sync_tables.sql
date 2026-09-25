-- Applied remotely as: alter_chipper_pfm_ga4_sync_tables
-- Expands chipper_pfm_ga4_data and adds config + day_complete companions
-- for edge function chipper-pfm-ga4-data-sync.

ALTER TABLE public.chipper_pfm_ga4_data
  ADD COLUMN IF NOT EXISTS client_id text,
  ADD COLUMN IF NOT EXISTS ga4_property_id text,
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS report_date date,
  ADD COLUMN IF NOT EXISTS page_location text,
  ADD COLUMN IF NOT EXISTS page_path text,
  ADD COLUMN IF NOT EXISTS page_path_q_s text,
  ADD COLUMN IF NOT EXISTS page_title text,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS medium text,
  ADD COLUMN IF NOT EXISTS source_medium text,
  ADD COLUMN IF NOT EXISTS session_campaign text,
  ADD COLUMN IF NOT EXISTS views integer,
  ADD COLUMN IF NOT EXISTS total_users integer,
  ADD COLUMN IF NOT EXISTS new_users integer,
  ADD COLUMN IF NOT EXISTS sessions integer,
  ADD COLUMN IF NOT EXISTS ga4_page_type text,
  ADD COLUMN IF NOT EXISTS vdp_conditions boolean,
  ADD COLUMN IF NOT EXISTS vdp_vehicle_condition text,
  ADD COLUMN IF NOT EXISTS year integer,
  ADD COLUMN IF NOT EXISTS cms text;

CREATE INDEX IF NOT EXISTS idx_chipper_pfm_ga4_data_client_date
  ON public.chipper_pfm_ga4_data (client_id, report_date);

CREATE INDEX IF NOT EXISTS idx_chipper_pfm_ga4_data_date
  ON public.chipper_pfm_ga4_data (report_date);

CREATE TABLE IF NOT EXISTS public.chipper_pfm_ga4_config (
  client_id text PRIMARY KEY,
  ga4_property_id text NOT NULL,
  account_name text,
  vdp_url_pattern text,
  is_active boolean NOT NULL DEFAULT true,
  sync_group integer,
  sync_status text,
  last_fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chipper_pfm_ga4_config_active
  ON public.chipper_pfm_ga4_config (is_active);

CREATE INDEX IF NOT EXISTS idx_chipper_pfm_ga4_config_sync_group
  ON public.chipper_pfm_ga4_config (sync_group);

CREATE TABLE IF NOT EXISTS public.chipper_pfm_ga4_day_complete (
  client_id text NOT NULL,
  report_date date NOT NULL,
  row_count integer,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, report_date)
);

ALTER TABLE public.chipper_pfm_ga4_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chipper_pfm_ga4_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chipper_pfm_ga4_day_complete ENABLE ROW LEVEL SECURITY;
