-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- pending_uploads_status_check: add 'interrupted'
--
-- Part of the Tier 1 pre-upload rebuild's Option C recovery UX (gated
-- behind USE_PREUPLOAD in config/uploadFlags.ts, currently false).
--
-- 'interrupted' is reachable ONLY from 'posted' — never from 'uploading'
-- or 'ready'. Per the state model:
--   - A failure BEFORE the user taps Post (still 'uploading'/'ready',
--     caption still null) is a silent abandon — nothing was ever
--     committed, so there's nothing to recover. Cleaned up either by the
--     user backing out (cancel the upload, delete the Bunny object,
--     delete the row) or, if they never return, by the 3-hour abandon
--     cron. Never surfaced to the user.
--   - A failure AFTER Post (status was 'posted', caption/tags/location
--     already attached) means the user's intent and metadata already
--     exist — specifically, the byte-upload itself never reached Bunny
--     (detected via a rejected upload-task promise while the app is
--     still alive, or by reconciliation finding a 'posted' row whose
--     Bunny video never received bytes). That case flips to
--     'interrupted' and becomes visible on the pending tab with
--     retry/delete (Option C), the same UX today's 'failed' status gives
--     the legacy flow — silently deleting a row the user already
--     committed to posting would be a worse experience than showing
--     them a retry option.
--   - A 'posted' row that DID receive its bytes and is just waiting on a
--     slow transcode is never touched by this — it always finalizes,
--     however long that takes; 'interrupted' is specifically for the
--     byte-upload having failed outright, not for slow encoding.
--
-- Same drop-and-recreate pattern as the 'ready'/'posted' migration
-- (Postgres has no ALTER CHECK), wrapped in BEGIN/COMMIT so there's no
-- window without a status constraint. All existing rows already satisfy
-- the wider 7-value set.
--
-- Already applied directly against the live database on 2026-09-12 via
-- `supabase db query --linked` (verified: constraint def now includes
-- all 7 values); this file is the repo record only, per this project's
-- convention that migrations don't reliably reflect live DB state.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BEGIN;

ALTER TABLE pending_uploads DROP CONSTRAINT pending_uploads_status_check;

ALTER TABLE pending_uploads ADD CONSTRAINT pending_uploads_status_check
  CHECK (status = ANY (ARRAY['uploading'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'ready'::text, 'posted'::text, 'interrupted'::text]));

COMMIT;
