-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- sweep-orphaned-uploads-10min (jobid 18): add timeout_milliseconds := 120000 to its
-- inline net.http_post. pg_net defaults to 5000 ms; a sweep that deletes several Bunny
-- videos can outlast that, which records a timeout with no response body (the function
-- itself keeps running, but the result is unobservable). Companion to
-- 20261003_raise_sweep_trigger_pg_net_timeout.sql (the manual trigger) and the reconciler.
--
-- ONLY the timeout changes. The new command is derived from the LIVE command by string
-- replacement (never retyped), and the block aborts unless stripping the added fragment
-- restores the original command EXACTLY. The schedule ('*/10 * * * *'), active flag, job
-- name and Vault-based auth are untouched (cron.alter_job only sets what it's given).
-- Idempotent: a no-op if the command already carries a timeout.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
DECLARE
  v_old    text;
  v_new    text;
  v_target constant text := E'body := ''{}''::jsonb';
  v_added  constant text := E',\n      timeout_milliseconds := 120000';
BEGIN
  SELECT command INTO v_old
  FROM cron.job
  WHERE jobid = 18 AND jobname = 'sweep-orphaned-uploads-10min';

  IF v_old IS NULL THEN
    RAISE EXCEPTION 'job 18 (sweep-orphaned-uploads-10min) not found — refusing to guess';
  END IF;

  IF v_old ILIKE '%timeout_milliseconds%' THEN
    RAISE NOTICE 'job 18 already passes a timeout — no change';
    RETURN;
  END IF;

  IF (length(v_old) - length(replace(v_old, v_target, ''))) <> length(v_target) THEN
    RAISE EXCEPTION 'expected exactly one occurrence of the body argument in job 18''s command — aborting';
  END IF;

  v_new := replace(v_old, v_target, v_target || v_added);

  IF replace(v_new, v_added, '') <> v_old THEN
    RAISE EXCEPTION 'new command differs from the original by more than the timeout — aborting';
  END IF;

  PERFORM cron.alter_job(18, command := v_new);
  RAISE NOTICE 'job 18 updated: only timeout_milliseconds := 120000 added';
END $$;
