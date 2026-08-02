-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SWEEP ORPHANED UPLOADS CRON JOB
-- Catches pending_uploads rows stuck in 'uploading'/'processing' when the app
-- is hard-killed mid-upload (no client code runs to clean up the Bunny orphan).
--
-- REQUIRES a one-time manual step before this migration works: store the
-- project URL and service_role key in Supabase Vault via the SQL Editor:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url', '...');
--   select vault.create_secret('<service_role_key>', 'service_role_key', '...');
--
-- Do NOT put the actual key in this file or in any commit.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- NOTE: on this project (spdsgmkirubngfdxxrzj) all three extensions below are already
-- installed. Re-running "CREATE EXTENSION IF NOT EXISTS pg_cron" here triggers Supabase's
-- managed post-install hook (/etc/postgresql-custom/extension-custom-scripts/pg_cron/after-create.sql),
-- which tries to revoke/re-grant privileges on cron.job and fails with
-- "2BP01: dependent privileges exist" because of grants already layered on by prior
-- migrations/dashboard changes. These three lines were skipped when this migration was
-- actually applied (2026-08-02) — applied directly via `supabase db query -f`, statements
-- below only. Kept here commented for a fresh database where the extensions don't exist yet.
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
-- CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Remove any existing sweep job of this exact name (idempotent re-run only;
-- does not touch any other cron job in this project)
DO $$
DECLARE
  job_record RECORD;
BEGIN
  FOR job_record IN
    SELECT jobid, jobname
    FROM cron.job
    WHERE jobname = 'sweep-orphaned-uploads-10min'
  LOOP
    RAISE NOTICE 'Deleting old cron job: % (ID: %)', job_record.jobname, job_record.jobid;
    PERFORM cron.unschedule(job_record.jobid);
  END LOOP;
END $$;

-- Sanity check: warn (don't fail) if the Vault secrets aren't set up yet
DO $$
DECLARE
  has_url boolean;
  has_key boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_url') INTO has_url;
  SELECT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key') INTO has_key;

  IF NOT has_url OR NOT has_key THEN
    RAISE WARNING '⚠️ Vault secrets "project_url" and/or "service_role_key" not found. The sweep cron will fail every run until you create them via vault.create_secret() in the SQL Editor.';
  ELSE
    RAISE NOTICE '✅ Vault secrets found — sweep cron is ready.';
  END IF;
END $$;

-- Create the cron job: runs every 10 minutes, pulls URL + key from Vault at call time
SELECT cron.schedule(
  'sweep-orphaned-uploads-10min',
  '*/10 * * * *',
  $$
  SELECT
    net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/sweep-orphaned-uploads',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

DO $$
DECLARE
  job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO job_count FROM cron.job WHERE jobname = 'sweep-orphaned-uploads-10min';
  IF job_count > 0 THEN
    RAISE NOTICE '✅ Cron job "sweep-orphaned-uploads-10min" created successfully';
    RAISE NOTICE 'ℹ️ Runs every 10 minutes';
  ELSE
    RAISE WARNING '⚠️ Failed to create cron job';
  END IF;
END $$;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Manual trigger for testing — also Vault-sourced, no hardcoded key
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
    body := '{}'::jsonb
  ) INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.trigger_sweep_orphaned_uploads_now() IS
'Manually trigger the sweep-orphaned-uploads Edge Function for testing.
Usage: SELECT public.trigger_sweep_orphaned_uploads_now();';

DO $$
BEGIN
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ SWEEP ORPHANED UPLOADS CRON CONFIGURED (Vault-backed)';
  RAISE NOTICE 'ℹ️ Cron job: sweep-orphaned-uploads-10min (every 10 minutes)';
  RAISE NOTICE 'ℹ️ Manual trigger: SELECT public.trigger_sweep_orphaned_uploads_now();';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;
