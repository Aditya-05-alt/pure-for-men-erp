-- Pure for Men user activity log: signups, logins (incl. failures), logouts,
-- sessions and page views, with IP / browser / device context.
-- Insert-only for app roles; read it with the service role or the SQL editor.

CREATE TABLE IF NOT EXISTS public.pfm_user_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  user_name text,
  event_type text NOT NULL,
  event_action text,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  ip_address text,
  forwarded_for text,
  country text,
  region text,
  city text,
  user_agent text,
  browser text,
  browser_version text,
  os text,
  os_version text,
  device_type text,
  screen_resolution text,
  viewport text,
  timezone text,
  locale text,
  accept_language text,
  referrer text,
  page_path text,
  page_url text,
  session_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS pfm_user_activity_user_idx
  ON public.pfm_user_activity (auth_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pfm_user_activity_created_idx
  ON public.pfm_user_activity (created_at DESC);
CREATE INDEX IF NOT EXISTS pfm_user_activity_event_idx
  ON public.pfm_user_activity (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS pfm_user_activity_email_idx
  ON public.pfm_user_activity (lower(user_email));

ALTER TABLE public.pfm_user_activity ENABLE ROW LEVEL SECURITY;

-- Anonymous rows (failed logins, unconfirmed signups) carry no user id;
-- signed-in rows may only be written for the caller's own id.
DROP POLICY IF EXISTS pfm_user_activity_insert ON public.pfm_user_activity;
CREATE POLICY pfm_user_activity_insert ON public.pfm_user_activity
  FOR INSERT TO anon, authenticated
  WITH CHECK (auth_user_id IS NULL OR auth_user_id = (SELECT auth.uid()));

REVOKE ALL ON public.pfm_user_activity FROM anon, authenticated;
GRANT INSERT ON public.pfm_user_activity TO anon, authenticated;
