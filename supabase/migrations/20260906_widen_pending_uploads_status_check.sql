-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- pending_uploads_status_check: add 'ready' and 'posted'
--
-- Part of the Tier 1 upload rebuild (pre-upload while editing, gated
-- behind USE_PREUPLOAD in config/uploadFlags.ts, currently false) and
-- its server-side webhook finalizer. Two new states in the pending_uploads
-- lifecycle, both written only by the new bunny-webhook-finalize function:
--   'ready'  — Bunny finished encoding, but the user hasn't tapped "Post"
--              yet (no caption/tags/location attached), so nothing is
--              inserted into videos yet.
--   'posted' — the client has attached caption/tags/location at Post time
--              (via an UPDATE to this same row); this is the signal the
--              webhook finalizer waits for before inserting into videos,
--              creating the fulfillment, and deleting this row.
-- The original 4 values (uploading, processing, completed, failed) are
-- unchanged and remain exactly as used by the current live TUS flow —
-- this widens the constraint, it doesn't narrow or repurpose anything.
--
-- Postgres has no ALTER CHECK, so this drops and recreates the constraint.
-- Wrapped in BEGIN/COMMIT so there's no window where the table has no
-- status constraint at all. All 60 existing rows already satisfy the
-- original 4 values, so the wider constraint is satisfied immediately.
--
-- Already applied directly against the live database on 2026-09-06 via
-- `supabase db query --linked` (verified: constraint def now includes all
-- 6 values); this file is the repo record only, per this project's
-- convention that migrations don't reliably reflect live DB state.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BEGIN;

ALTER TABLE pending_uploads DROP CONSTRAINT pending_uploads_status_check;

ALTER TABLE pending_uploads ADD CONSTRAINT pending_uploads_status_check
  CHECK (status = ANY (ARRAY['uploading'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'ready'::text, 'posted'::text]));

COMMIT;
