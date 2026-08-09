-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FIX: users.followers_count silently stuck at stale values
--
-- Root cause: update_following_count() (trigger on public.follows,
-- AFTER INSERT/DELETE) runs two UPDATEs per follow/unfollow — one on the
-- follower's own users row (following_count) and one on the *other* user's
-- row (followers_count). The function was not SECURITY DEFINER, so it ran
-- as the calling (authenticated) role and was subject to the users table's
-- RLS UPDATE policy ("Users can update their own profile", id = auth.uid()).
-- The self-row update passed; the other-row update matched zero rows under
-- RLS and silently no-opped (no error). Result: following_count stayed
-- accurate, but followers_count for the *followed* user was never
-- incremented/decremented — verified live as 78/100 users mismatched vs.
-- only 1/100 for following_count.
--
-- The followers-list screen (app/followers-list.tsx) was unaffected because
-- it queries public.follows directly rather than the denormalized column,
-- which is why the count and the list disagreed.
--
-- Fix: mark the function SECURITY DEFINER (owned by `postgres`, which has
-- rolbypassrls) so both counter updates bypass RLS, and pin search_path to
-- prevent search_path hijacking now that it runs with elevated privilege.
-- The function is narrow and fixed-purpose (no dynamic SQL, no user-supplied
-- identifiers, only NEW/OLD-driven +1/-1 on two known columns), so
-- SECURITY DEFINER is safe here.
--
-- NOTE: This migration was already applied directly against the live
-- database on 2026-08-09 (via `supabase db query --linked`, not `db push`).
-- This file documents that change in version control; CREATE OR REPLACE
-- makes it idempotent/safe to re-run. The backfill below is a one-time
-- correction — safe to re-run (it just recomputes the same ground-truth
-- values again) but has no further effect after the first run.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.update_following_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users
    SET following_count = following_count + 1
    WHERE id = NEW.follower_id;

    UPDATE users
    SET followers_count = followers_count + 1
    WHERE id = NEW.following_id;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE users
    SET following_count = GREATEST(following_count - 1, 0)
    WHERE id = OLD.follower_id;

    UPDATE users
    SET followers_count = GREATEST(followers_count - 1, 0)
    WHERE id = OLD.following_id;
  END IF;

  RETURN NULL;
END;
$function$;

-- One-time backfill: recompute both counters for every user from
-- public.follows (ground truth), correcting the drift the RLS bug caused.
-- Users with zero rows in either direction are reset to 0 via LEFT JOIN.
UPDATE users u
SET
  followers_count = COALESCE(fc.cnt, 0),
  following_count = COALESCE(gc.cnt, 0)
FROM users u2
LEFT JOIN (
  SELECT following_id, COUNT(*) AS cnt
  FROM follows
  GROUP BY following_id
) fc ON fc.following_id = u2.id
LEFT JOIN (
  SELECT follower_id, COUNT(*) AS cnt
  FROM follows
  GROUP BY follower_id
) gc ON gc.follower_id = u2.id
WHERE u.id = u2.id;

DO $$
BEGIN
  RAISE NOTICE '✅ update_following_count() is now SECURITY DEFINER with search_path=public; followers_count/following_count backfilled from public.follows';
END $$;
