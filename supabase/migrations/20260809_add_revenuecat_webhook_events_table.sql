-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- REVENUECAT WEBHOOK EVENTS — idempotency table (Step 1 of the
-- RevenueCat webhook build)
--
-- Purpose: the new revenuecat-webhook edge function (built in a later
-- step) will INSERT ... ON CONFLICT (event_id) DO NOTHING against this
-- table as the very first thing it does for every incoming request.
-- RevenueCat guarantees event.event.id is stable across webhook retries,
-- so a successful insert means "first time we've seen this event" and a
-- no-op conflict means "already processed, ack and stop" — this is what
-- makes the coin grant (premium_purchase / premium_renewal) safe from
-- double-firing on retry, and keeps is_premium sync + notifications from
-- duplicating too.
--
-- Only ever written/read by the webhook function via
-- SUPABASE_SERVICE_ROLE_KEY. RLS is enabled with no policies at all:
-- service_role has rolbypassrls = true (verified live), so the webhook
-- is unaffected; anon/authenticated do not, so this table is fully
-- inaccessible to the client app by default.
--
-- NOTE: applied directly against the live database on 2026-08-09 (via
-- `supabase db query --linked`, not `db push`), same as the follower-
-- count fix migration. This file documents that change in version
-- control; CREATE TABLE IF NOT EXISTS / a guarded index make it
-- safe to re-run.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.revenuecat_webhook_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  app_user_id  text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenuecat_webhook_events_app_user_id
  ON public.revenuecat_webhook_events (app_user_id);

ALTER TABLE public.revenuecat_webhook_events ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated on purpose — service_role bypasses
-- RLS and is the only role that ever touches this table.

DO $$
BEGIN
  RAISE NOTICE '✅ revenuecat_webhook_events table created (RLS enabled, no client-facing policies)';
END $$;
