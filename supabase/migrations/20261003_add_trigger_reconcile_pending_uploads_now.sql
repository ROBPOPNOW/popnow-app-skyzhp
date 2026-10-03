-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Manual trigger for reconcile-pending-uploads (testing / one-off runs).
-- Mirrors trigger_sweep_orphaned_uploads_now(): Vault-sourced URL + service-role key,
-- no hardcoded secrets. Returns the pg_net request id; read the result with:
--   SELECT status_code, content FROM net._http_response WHERE id = <request id>;
--
-- dry_run defaults to TRUE (log decisions, mutate nothing). Pass false explicitly for a
-- real run: SELECT public.trigger_reconcile_pending_uploads_now(false);
--
-- NOTE: this file only creates the trigger function. It deliberately does NOT schedule a
-- pg_cron job — that is a separate, later step, after the first dry run has been reviewed.
--
-- EXECUTE is revoked from anon/authenticated explicitly. Revoking from PUBLIC alone is not
-- enough on Supabase (those roles hold their own default grants), and unlike the sweep
-- trigger this one takes a dry_run argument, so an exposed copy would let anyone holding
-- the public anon key launch a LIVE destructive run on demand.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.trigger_reconcile_pending_uploads_now(dry_run boolean DEFAULT true)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  request_id bigint;
BEGIN
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/reconcile-pending-uploads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := jsonb_build_object('dryRun', dry_run),
    -- pg_net's default is 5000 ms. A LIVE run does real Bunny deletes and takes longer, so
    -- the default made pg_net give up waiting (response row = timeout, no body) even though
    -- the function itself finished. 120s sits above the function's own 100s run deadline.
    timeout_milliseconds := 120000
  ) INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_reconcile_pending_uploads_now(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_reconcile_pending_uploads_now(boolean) FROM anon;
REVOKE ALL ON FUNCTION public.trigger_reconcile_pending_uploads_now(boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_reconcile_pending_uploads_now(boolean) TO postgres, service_role;

COMMENT ON FUNCTION public.trigger_reconcile_pending_uploads_now(boolean) IS
'Manually trigger the reconcile-pending-uploads Edge Function. dry_run defaults to true.
Usage: SELECT public.trigger_reconcile_pending_uploads_now();      -- dry run
       SELECT public.trigger_reconcile_pending_uploads_now(false); -- LIVE';
