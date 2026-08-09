-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- REVENUECAT PROCESS FUNCTIONS — atomic dedup+mutation RPCs
-- (Step 2a of the RevenueCat webhook build)
--
-- Purpose: the revenuecat-webhook edge function (built in the next step)
-- calls exactly one of these per event instead of doing a bare dedup
-- INSERT followed by separate mutation calls. Folding the dedup claim
-- into the same transaction as the state mutation closes a real gap: if
-- the dedup insert and the mutation were separate statements, a crash
-- between them would leave an orphaned dedup row that permanently blocks
-- every retry from ever completing the grant, while RevenueCat believes
-- delivery succeeded. Here, either the whole thing commits (dedup claim +
-- is_premium sync + coin grant + coin_transactions + notification) or
-- none of it does, so a retry after a genuine failure always reprocesses
-- correctly, and a retry after a real success always no-ops correctly.
--
-- revenuecat_process_activation: INITIAL_PURCHASE, RENEWAL (with coins),
--   and UNCANCELLATION (p_grant_coins = false — refresh expiry only, no
--   coins, since the user never actually lost the subscription).
-- revenuecat_process_deactivation: EXPIRATION, and CANCELLATION when
--   cancel_reason = 'CUSTOMER_SUPPORT' (RevenueCat's refund signal).
--   Coins are never clawed back here (confirmed decision).
--
-- Both are SECURITY DEFINER (narrow, fixed-purpose, no dynamic SQL, no
-- user-supplied identifiers beyond values the webhook itself controls —
-- same reasoning as the update_following_count() trigger fix) with
-- search_path pinned, and explicitly locked to service_role only via
-- REVOKE/GRANT — SECURITY DEFINER bypasses RLS, so leaving default
-- execute permissions in place would let any client call these directly
-- and grant themselves premium + coins.
--
-- IMPORTANT: `REVOKE ALL ... FROM PUBLIC` alone is NOT enough here.
-- Supabase configures ALTER DEFAULT PRIVILEGES on the public schema so
-- newly created functions get EXECUTE auto-granted directly to anon and
-- authenticated (independent of the PUBLIC pseudo-role) — verified live
-- immediately after the first apply of this migration: anon/authenticated
-- could both still call these functions despite the PUBLIC revoke. Every
-- REVOKE below explicitly lists anon and authenticated, not just PUBLIC.
--
-- NOTE: applied directly against the live database on 2026-08-09 (via
-- `supabase db query --linked`, not `db push`), same as the other recent
-- migrations. CREATE OR REPLACE makes it idempotent/safe to re-run.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.revenuecat_process_activation(
  p_event_id text,
  p_event_type text,
  p_app_user_id text,
  p_expires_at timestamptz,
  p_platform text,
  p_product_id text,
  p_grant_coins boolean,
  p_coin_amount integer,
  p_coin_type text,
  p_coin_description text,
  p_notification_type text,
  p_notification_message text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rowcount int;
BEGIN
  INSERT INTO revenuecat_webhook_events (event_id, event_type, app_user_id)
  VALUES (p_event_id, p_event_type, p_app_user_id)
  ON CONFLICT (event_id) DO NOTHING;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RETURN false; -- already processed, nothing else to do
  END IF;

  UPDATE users
  SET is_premium = true,
      premium_expires_at = p_expires_at,
      premium_platform = p_platform,
      premium_product_id = p_product_id,
      revenuecat_user_id = p_app_user_id
  WHERE id = p_app_user_id::uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No user found for RevenueCat app_user_id %', p_app_user_id;
  END IF;

  IF p_grant_coins THEN
    UPDATE users SET coins = coins + p_coin_amount WHERE id = p_app_user_id::uuid;

    INSERT INTO coin_transactions (user_id, amount, type, description)
    VALUES (p_app_user_id::uuid, p_coin_amount, p_coin_type, p_coin_description);
  END IF;

  INSERT INTO notifications (user_id, type, message)
  VALUES (p_app_user_id::uuid, p_notification_type, p_notification_message);

  RETURN true; -- newly processed
END;
$$;

REVOKE ALL ON FUNCTION public.revenuecat_process_activation(
  text, text, text, timestamptz, text, text, boolean, integer, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revenuecat_process_activation(
  text, text, text, timestamptz, text, text, boolean, integer, text, text, text, text
) TO service_role;


CREATE OR REPLACE FUNCTION public.revenuecat_process_deactivation(
  p_event_id text,
  p_event_type text,
  p_app_user_id text,
  p_notification_type text,
  p_notification_message text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rowcount int;
BEGIN
  INSERT INTO revenuecat_webhook_events (event_id, event_type, app_user_id)
  VALUES (p_event_id, p_event_type, p_app_user_id)
  ON CONFLICT (event_id) DO NOTHING;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  IF v_rowcount = 0 THEN
    RETURN false;
  END IF;

  UPDATE users
  SET is_premium = false,
      premium_expires_at = null
  WHERE id = p_app_user_id::uuid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No user found for RevenueCat app_user_id %', p_app_user_id;
  END IF;

  INSERT INTO notifications (user_id, type, message)
  VALUES (p_app_user_id::uuid, p_notification_type, p_notification_message);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.revenuecat_process_deactivation(
  text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revenuecat_process_deactivation(
  text, text, text, text, text
) TO service_role;

DO $$
BEGIN
  RAISE NOTICE '✅ revenuecat_process_activation / revenuecat_process_deactivation created (SECURITY DEFINER, service_role-only)';
END $$;
