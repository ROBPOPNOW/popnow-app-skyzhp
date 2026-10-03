-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- trigger_sweep_orphaned_uploads_now(): raise the pg_net timeout.
--
-- net.http_post defaults to timeout_milliseconds := 5000. The sweep does real Bunny
-- deletes per stale row, so a multi-row sweep can outlast 5s; pg_net then records a
-- timeout with no response body even though the edge function keeps working, which makes
-- the result unobservable. Same fix as trigger_reconcile_pending_uploads_now().
--
-- Body is the LIVE definition (verified via pg_get_functiondef, identical to
-- 20260802_sweep_orphaned_uploads_cron.sql) plus the timeout argument — nothing else
-- changes. CREATE OR REPLACE preserves the existing grants/owner, so this does not touch
-- who can execute it.
--
-- NOT changed here: the scheduled job 'sweep-orphaned-uploads-10min' (jobid 18) has its own
-- inline net.http_post with the same 5000 ms default. Changing a live cron's command is a
-- separate step (cron.alter_job) and is deliberately not bundled into this file.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.trigger_sweep_orphaned_uploads_now()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/sweep-orphaned-uploads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO result;

  RETURN result;
END;
$$;
