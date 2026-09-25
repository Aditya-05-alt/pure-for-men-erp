-- Daily chipper PFM GA4 page sync
-- Schedule: 4:00 AM IST = 22:30 UTC
-- Window: rolling last 5 days (days_back: 5)
-- Target: edge function chipper-pfm-ga4-data-sync

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'chipper-pfm-ga4-data-sync-daily'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'chipper-pfm-ga4-data-sync-daily',
  '30 22 * * *',
  $cmd$
SELECT net.http_post(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
         || '/functions/v1/chipper-pfm-ga4-data-sync',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || COALESCE(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    )
  ),
  body := jsonb_build_object('days_back', 5)
);
$cmd$
);
