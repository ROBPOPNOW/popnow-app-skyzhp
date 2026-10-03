-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SCHEDULE reconcile-pending-uploads (every 5 minutes, LIVE).
--
-- Vault-backed exactly like sweep-orphaned-uploads-10min (jobid 18): URL + service-role key
-- are read from vault.decrypted_secrets at call time — no key in this file or in cron.job.
-- Requires the Vault secrets 'project_url' and 'service_role_key' (already present).
--
-- The body sends {"dryRun": false} EXPLICITLY. The edge function defaults to dry-run, so this
-- job is live only because this schedule says so, not by default.
--
-- timeout_milliseconds := 120000 — pg_net defaults to 5000 ms, which a run doing real Bunny
-- deletes can exceed (pg_net then records a timeout and no response body). 120s sits above
-- the function's own 100s run deadline. Verified pg_net honors the argument on this project.
--
-- Every 5 minutes (faster than the 10-minute legacy sweep): the 'posted' rules are the
-- backstop for a missed webhook / missed finalize-now, and a stuck post shouldn't wait 10.
--
-- NOTE: on this project the CREATE EXTENSION lines are deliberately omitted (the extensions
-- are already installed and re-issuing them breaks on pg_cron's managed post-install hook;
-- see 20260802_sweep_orphaned_uploads_cron.sql). Apply with
--   supabase db query --linked -f <this file>
-- not `supabase db push` (remote ledger has versions with no local file).
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Idempotent re-run: remove any existing job of this exact name only.
DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN SELECT jobid FROM cron.job WHERE jobname = 'reconcile-pending-uploads-5min' LOOP
    PERFORM cron.unschedule(job_record.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'reconcile-pending-uploads-5min',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/reconcile-pending-uploads',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body := '{"dryRun": false}'::jsonb,
      timeout_milliseconds := 120000
    ) AS request_id;
  $$
);
