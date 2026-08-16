-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DROP: notify_follower_milestone() + trigger_notify_follower_milestone
--
-- Root cause: this trigger fired on every follows insert, and when the
-- followed user's cached followers_count landed on 100/500/1000/5000/
-- 10000/50000/100000, it called current_setting('app.settings.supabase_url')
-- and current_setting('app.settings.service_role_key') to build a push
-- request URL/auth header. Neither GUC is configured anywhere in this
-- database (checked pg_roles.rolconfig for every role — unset at every
-- level), so the call throws 42704 "unrecognized configuration parameter".
-- The PERFORM extensions.http(...) call had no exception handling, so the
-- error propagated out of an AFTER INSERT trigger and aborted the entire
-- transaction — meaning the follows row itself, and update_following_count()'s
-- counter increments, all rolled back too. Any real user crossing a
-- milestone follower count had their follow silently fail completely, not
-- just the notification.
--
-- Discovered 2026-08-16 via a bulk INSERT into follows that crossed the
-- 100-follower threshold and hit this exact error.
--
-- Why safe to drop entirely rather than fix: check_follower_milestone()
-- (trigger follower_milestone_trigger, still enabled) already implements
-- the same feature correctly — it computes a live COUNT(*) from follows
-- (not a possibly-stale cached column), covers a superset of the broken
-- function's thresholds (10/50/100/500/1000/5000/10000/every 10K after),
-- and calls create_notification(), which creates the in-app row AND sends
-- the push (hardcoded URL/key, no GUC dependency) wrapped in
-- BEGIN...EXCEPTION WHEN OTHERS...END, so a push failure there only logs
-- a warning instead of aborting the transaction. notify_follower_milestone()
-- was a second, redundant, and strictly worse implementation of the same
-- feature. Dropping it removes dead weight, not functionality.
--
-- Trigger is dropped before the function it depends on. The other 3
-- triggers on public.follows (on_follow_change, follower_milestone_trigger,
-- trigger_notify_on_follow) are untouched.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DROP TRIGGER IF EXISTS trigger_notify_follower_milestone ON public.follows;
DROP FUNCTION IF EXISTS public.notify_follower_milestone();

DO $$
BEGIN
  RAISE NOTICE '✅ Dropped broken trigger_notify_follower_milestone + notify_follower_milestone(). Milestone notifications now handled exclusively by follower_milestone_trigger -> check_follower_milestone() -> create_notification().';
END $$;
