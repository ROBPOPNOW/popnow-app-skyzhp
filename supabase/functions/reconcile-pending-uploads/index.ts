import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { finalizePendingUpload } from '../_shared/finalizePendingUpload.ts';
import { isServiceRoleRequest, unauthorizedResponse } from '../_shared/requireServiceRole.ts';
import { UPLOAD_WINDOW_MS } from '../_shared/uploadWindow.ts';

// Reconciles pre-upload rows (USE_PREUPLOAD flow) that the client never resolved. Cron-invoked.
// Owns caption-null rows plus 'posted'/'interrupted'; the legacy sweep-orphaned-uploads owns
// caption-bearing uploading/processing/failed rows. The two never overlap.
//
// Per-row rules (see the Part A design):
//   posted  + Bunny 4 (Finished)            -> finalize now via the shared finalizePendingUpload
//   posted  + Bunny 5/6, or not in EITHER library -> 'interrupted'
//   posted  + Bunny 0/1, Post time > 45 min ago   -> 'interrupted' (bytes never made it)
//   posted  + Bunny 2/3/7/8                 -> leave alone at any age (always finalizes, even if slow)
//   posted  + Bunny lookup error            -> skip, change nothing
//   uploading/ready + caption null, created > 3h ago -> ABANDON (delete row + Bunny object)
//   failed  + caption null, updated > 1h ago         -> delete (junk left by the old sweep)
//   interrupted                             -> never touched (the user retries/deletes via the UI)
//
// dryRun defaults to TRUE: only an explicit {"dryRun": false} body mutates anything.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const BUNNY_STREAM_LIBRARY_ID = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID');
const BUNNY_STREAM_API_KEY = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_API_KEY');
const BUNNY_PREMIUM_LIBRARY_ID = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_LIBRARY_ID');
const BUNNY_PREMIUM_API_KEY = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_API_KEY');
const BUNNY_STREAM_CDN_HOSTNAME = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME') ?? '';
const BUNNY_PREMIUM_CDN_HOSTNAME = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_CDN_HOSTNAME') ?? '';

const ABANDON_UNPOSTED_AFTER_MS = UPLOAD_WINDOW_MS; // 3h, from _shared/uploadWindow.ts
const DELETE_FAILED_CAPTIONLESS_AFTER_MS = 60 * 60 * 1000; // 1h
const POSTED_BYTES_STUCK_AFTER_MS = 45 * 60 * 1000; // measured from Post time (updated_at)
const POSTED_STILL_ENCODING_WARN_AFTER_MS = 24 * 60 * 60 * 1000; // warn-only, never acts
const MAX_ROWS_PER_PHASE = 50;
const RUN_DEADLINE_MS = 100_000; // stop starting new rows past this; edge wall-clock limit is 150s
const BUNNY_FETCH_TIMEOUT_MS = 10_000;

// Get Video API status enum (NOT the webhook's separate enum, where 3 = Finished):
// 0 Created, 1 Uploaded, 2 Processing, 3 Transcoding, 4 Finished, 5 Error, 6 UploadFailed,
// 7 JitSegmenting, 8 JitPlaylistsCreated.
const BUNNY_FINISHED = 4;
const BUNNY_FAILED = [5, 6];
const BUNNY_NO_BYTES_YET = [0, 1];
const BUNNY_IN_PROGRESS = [2, 3, 7, 8];

interface Decision {
  phase: 'posted' | 'abandon-unposted' | 'delete-failed-captionless';
  id: string; // first 8 chars only
  status: string;
  ageMin: number;
  action: string;
  reason: string;
}

interface Ctx {
  supabase: any;
  dryRun: boolean;
  decisions: Decision[];
  timeUp: () => boolean;
  deadlineHit: boolean;
  bunnyDeleteFailures: number;
}

function credsFor(isPremium: boolean) {
  return isPremium
    ? { libraryId: BUNNY_PREMIUM_LIBRARY_ID, apiKey: BUNNY_PREMIUM_API_KEY }
    : { libraryId: BUNNY_STREAM_LIBRARY_ID, apiKey: BUNNY_STREAM_API_KEY };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BUNNY_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// users.is_premium is only a hint for which library to try FIRST — it can be stale (a
// subscription can flip between pre-upload and now), so every Bunny call below falls back to
// the other library on a 404 rather than trusting it.
type LookupResult =
  | { kind: 'found'; isPremium: boolean; video: any }
  | { kind: 'notFound' }
  | { kind: 'error'; reason: string };

async function lookupBunnyVideo(guid: string, userIsPremium: boolean): Promise<LookupResult> {
  for (const premium of [userIsPremium, !userIsPremium]) {
    const { libraryId, apiKey } = credsFor(premium);
    if (!libraryId || !apiKey) {
      // Can't rule this library out, so we must NOT conclude "not found".
      return { kind: 'error', reason: `missing ${premium ? 'premium' : 'free'} library credentials` };
    }

    let res: Response;
    try {
      res = await fetchWithTimeout(`https://video.bunnycdn.com/library/${libraryId}/videos/${guid}`, {
        method: 'GET',
        headers: { AccessKey: apiKey },
      });
    } catch {
      return { kind: 'error', reason: 'Bunny request failed or timed out' };
    }

    if (res.status === 404) continue; // not in this library — try the other one
    if (!res.ok) return { kind: 'error', reason: `Bunny returned ${res.status}` };
    return { kind: 'found', isPremium: premium, video: await res.json() };
  }
  return { kind: 'notFound' };
}

// 'gone' = 404 in both libraries (already deleted); 'failed' = couldn't confirm deletion.
async function deleteFromBunny(guid: string, userIsPremium: boolean): Promise<'deleted' | 'gone' | 'failed'> {
  for (const premium of [userIsPremium, !userIsPremium]) {
    const { libraryId, apiKey } = credsFor(premium);
    if (!libraryId || !apiKey) return 'failed';

    let res: Response;
    try {
      res = await fetchWithTimeout(`https://video.bunnycdn.com/library/${libraryId}/videos/${guid}`, {
        method: 'DELETE',
        headers: { AccessKey: apiKey },
      });
    } catch {
      return 'failed';
    }

    if (res.ok) return 'deleted';
    if (res.status === 404) continue;
    return 'failed';
  }
  return 'gone';
}

async function loadPremiumMap(supabase: any, userIds: string[]): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return map;
  const { data, error } = await supabase.from('users').select('id, is_premium').in('id', unique);
  if (error) throw error;
  for (const u of data ?? []) map.set(u.id, !!u.is_premium);
  return map;
}

function minutesSince(ts: string): number {
  return Math.round((Date.now() - Date.parse(ts)) / 60_000);
}

function makeRecorder(ctx: Ctx, phase: Decision['phase'], row: any, ageAnchor: string) {
  return (action: string, reason: string) => {
    ctx.decisions.push({
      phase,
      id: String(row.id).slice(0, 8),
      status: row.status,
      ageMin: minutesSince(ageAnchor),
      action,
      reason,
    });
  };
}

// ── Phase: 'posted' rows (committed — never abandoned, only finalized or interrupted) ─────
async function reconcilePosted(ctx: Ctx) {
  const { supabase, dryRun } = ctx;
  const would = (a: string) => (dryRun ? `would-${a}` : a);

  const { data: rows, error } = await supabase
    .from('pending_uploads')
    .select('*')
    .eq('status', 'posted')
    .order('updated_at', { ascending: true })
    .limit(MAX_ROWS_PER_PHASE);
  if (error) throw error;
  if (!rows?.length) return;

  const premiumMap = await loadPremiumMap(supabase, rows.map((r: any) => r.user_id));

  for (const row of rows) {
    if (ctx.timeUp()) { ctx.deadlineHit = true; break; }
    const record = makeRecorder(ctx, 'posted', row, row.updated_at);
    const ageMs = Date.now() - Date.parse(row.updated_at);

    const interrupt = async (reason: string) => {
      if (dryRun) { record(would('interrupt'), reason); return; }
      // Conditional on still being 'posted' so a concurrent finalize/Post can't be clobbered.
      const { data: updated, error: updateError } = await supabase
        .from('pending_uploads')
        .update({
          status: 'interrupted',
          error_message: 'Upload did not complete. Tap retry to try again.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('status', 'posted')
        .select('id');
      if (updateError) throw updateError;
      record(updated?.length ? 'interrupted' : 'skipped-raced', reason);
    };

    try {
      if (!row.bunny_video_id) {
        record('skip', "posted row has no bunny_video_id — can't check Bunny");
        continue;
      }

      const lookup = await lookupBunnyVideo(row.bunny_video_id, premiumMap.get(row.user_id) ?? false);

      if (lookup.kind === 'error') {
        record('skip', `Bunny lookup failed (${lookup.reason}) — leaving untouched`);
        continue;
      }
      if (lookup.kind === 'notFound') {
        await interrupt('video not found in either Bunny library');
        continue;
      }

      const bunnyStatus = lookup.video?.status;

      if (bunnyStatus === BUNNY_FINISHED) {
        if (dryRun) { record(would('finalize'), 'Bunny reports Finished'); continue; }
        // library id + CDN host come from the library that actually answered, same
        // computation as bunny-webhook-finalize, so videos.library_id/thumbnail_url match.
        const libraryId = Number(lookup.isPremium ? BUNNY_PREMIUM_LIBRARY_ID : BUNNY_STREAM_LIBRARY_ID);
        const cdnHostname = lookup.isPremium ? BUNNY_PREMIUM_CDN_HOSTNAME : BUNNY_STREAM_CDN_HOSTNAME;
        const thumbnailUrl = cdnHostname ? `https://${cdnHostname}/${row.bunny_video_id}/thumbnail.jpg` : null;
        const result = await finalizePendingUpload(supabase, row, libraryId, thumbnailUrl);
        record(result.ok ? 'finalized' : 'error', result.ok ? `video ${String(result.videoId).slice(0, 8)}` : String(result.error));
      } else if (BUNNY_FAILED.includes(bunnyStatus)) {
        await interrupt(`Bunny reports failure (status ${bunnyStatus})`);
      } else if (BUNNY_NO_BYTES_YET.includes(bunnyStatus)) {
        if (ageMs > POSTED_BYTES_STUCK_AFTER_MS) {
          await interrupt(`Bunny still at status ${bunnyStatus} ${Math.round(ageMs / 60_000)}m after Post — bytes never arrived`);
        } else {
          record('leave', `Bunny status ${bunnyStatus}, ${Math.round(ageMs / 60_000)}m after Post (< ${POSTED_BYTES_STUCK_AFTER_MS / 60_000}m) — still within upload grace`);
        }
      } else if (BUNNY_IN_PROGRESS.includes(bunnyStatus)) {
        record('leave', `Bunny status ${bunnyStatus} (encoding) — always finalizes, however slow`);
        if (ageMs > POSTED_STILL_ENCODING_WARN_AFTER_MS) {
          console.warn(`⚠️ posted row ${String(row.id).slice(0, 8)} still encoding ${Math.round(ageMs / 3_600_000)}h after Post`);
        }
      } else {
        record('leave', `unrecognized Bunny status ${bunnyStatus} — leaving untouched`);
        console.warn(`⚠️ unrecognized Bunny status ${bunnyStatus} for posted row ${String(row.id).slice(0, 8)}`);
      }
    } catch (e) {
      record('error', e instanceof Error ? e.message : String(e));
    }
  }
}

// ── Phase: un-posted pre-upload rows older than the 3h window ─────────────────────────────
async function abandonUnposted(ctx: Ctx) {
  const { supabase, dryRun } = ctx;
  const cutoff = new Date(Date.now() - ABANDON_UNPOSTED_AFTER_MS).toISOString();

  const { data: rows, error } = await supabase
    .from('pending_uploads')
    .select('id, status, user_id, bunny_video_id, created_at')
    .in('status', ['uploading', 'ready'])
    .is('caption', null)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(MAX_ROWS_PER_PHASE);
  if (error) throw error;
  if (!rows?.length) return;

  const premiumMap = await loadPremiumMap(supabase, rows.map((r: any) => r.user_id));

  for (const row of rows) {
    if (ctx.timeUp()) { ctx.deadlineHit = true; break; }
    const record = makeRecorder(ctx, 'abandon-unposted', row, row.created_at);
    const ageNote = `un-posted ${row.status}, ${Math.round((Date.now() - Date.parse(row.created_at)) / 60_000)}m old`;

    try {
      if (dryRun) {
        record('would-abandon', `${ageNote}${row.bunny_video_id ? '; row + Bunny object would be deleted' : '; row would be deleted'}`);
        continue;
      }

      // Claim the row FIRST with a conditional delete. If the user tapped Post in the
      // meantime the row is no longer uploading/ready-with-null-caption, this matches
      // nothing, and we never touch the Bunny object of a post that just committed.
      const { data: claimed, error: claimError } = await supabase
        .from('pending_uploads')
        .delete()
        .eq('id', row.id)
        .in('status', ['uploading', 'ready'])
        .is('caption', null)
        .select('id, user_id, bunny_video_id');
      if (claimError) throw claimError;
      if (!claimed?.length) { record('skipped-raced', `${ageNote} — row changed before claim`); continue; }

      const guid = claimed[0].bunny_video_id;
      if (!guid) { record('abandoned', `${ageNote}; no Bunny object`); continue; }

      const outcome = await deleteFromBunny(guid, premiumMap.get(row.user_id) ?? false);
      if (outcome === 'failed') {
        ctx.bunnyDeleteFailures++;
        console.error(`⚠️ ORPHANED Bunny video ${guid}: row ${String(row.id).slice(0, 8)} was deleted but the Bunny delete failed`);
      }
      record('abandoned', `${ageNote}; Bunny: ${outcome === 'failed' ? 'DELETE FAILED (orphan logged)' : outcome === 'gone' ? 'already gone' : 'deleted'}`);
    } catch (e) {
      record('error', e instanceof Error ? e.message : String(e));
    }
  }
}

// ── Phase: caption-null 'failed' rows (junk the old sweep left behind) ────────────────────
async function deleteFailedCaptionless(ctx: Ctx) {
  const { supabase, dryRun } = ctx;
  const cutoff = new Date(Date.now() - DELETE_FAILED_CAPTIONLESS_AFTER_MS).toISOString();

  const { data: rows, error } = await supabase
    .from('pending_uploads')
    .select('id, status, user_id, bunny_video_id, updated_at')
    .eq('status', 'failed')
    .is('caption', null)
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(MAX_ROWS_PER_PHASE);
  if (error) throw error;
  if (!rows?.length) return;

  const premiumMap = await loadPremiumMap(supabase, rows.map((r: any) => r.user_id));

  for (const row of rows) {
    if (ctx.timeUp()) { ctx.deadlineHit = true; break; }
    const record = makeRecorder(ctx, 'delete-failed-captionless', row, row.updated_at);

    try {
      if (dryRun) {
        record('would-delete', `failed row with no caption${row.bunny_video_id ? ' (still has a Bunny id — object would be deleted too)' : ''}`);
        continue;
      }

      const { data: claimed, error: claimError } = await supabase
        .from('pending_uploads')
        .delete()
        .eq('id', row.id)
        .eq('status', 'failed')
        .is('caption', null)
        .select('id, bunny_video_id');
      if (claimError) throw claimError;
      if (!claimed?.length) { record('skipped-raced', 'row changed before claim'); continue; }

      const guid = claimed[0].bunny_video_id;
      if (!guid) { record('deleted', 'failed row with no caption'); continue; }

      const outcome = await deleteFromBunny(guid, premiumMap.get(row.user_id) ?? false);
      if (outcome === 'failed') {
        ctx.bunnyDeleteFailures++;
        console.error(`⚠️ ORPHANED Bunny video ${guid}: failed row was deleted but the Bunny delete failed`);
      }
      record('deleted', `Bunny: ${outcome === 'failed' ? 'DELETE FAILED (orphan logged)' : outcome === 'gone' ? 'already gone' : 'deleted'}`);
    } catch (e) {
      record('error', e instanceof Error ? e.message : String(e));
    }
  }
}

Deno.serve(async (req) => {
  if (!isServiceRoleRequest(req)) {
    console.error('❌ reconcile-pending-uploads: caller is not the service role — rejecting');
    return unauthorizedResponse();
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // empty / non-JSON body — fall through to the safe default
  }
  // Safe by default: ONLY an explicit {"dryRun": false} is allowed to mutate anything.
  const dryRun = body?.dryRun !== false;

  const startedAt = Date.now();
  console.log(`🔄 RECONCILE PENDING UPLOADS — ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'} — ${new Date(startedAt).toISOString()}`);

  const ctx: Ctx = {
    supabase: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    dryRun,
    decisions: [],
    timeUp: () => Date.now() - startedAt > RUN_DEADLINE_MS,
    deadlineHit: false,
    bunnyDeleteFailures: 0,
  };

  try {
    // Order matters under the run deadline: committed posts (the user-facing finalize
    // backstop) go first so an abandon backlog can never starve them.
    await reconcilePosted(ctx);
    await abandonUnposted(ctx);
    await deleteFailedCaptionless(ctx);

    // Visibility only — 'interrupted' rows are never touched (the user retries/deletes via the UI).
    const { count: interruptedLeftAlone } = await ctx.supabase
      .from('pending_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'interrupted');

    const counts: Record<string, number> = {};
    for (const d of ctx.decisions) counts[d.action] = (counts[d.action] ?? 0) + 1;

    console.log(`✅ reconcile done (${dryRun ? 'dry run' : 'live'}):`, JSON.stringify(counts));

    return new Response(
      JSON.stringify({
        success: true,
        dryRun,
        durationMs: Date.now() - startedAt,
        deadlineHit: ctx.deadlineHit,
        bunnyDeleteFailures: ctx.bunnyDeleteFailures,
        interruptedLeftAlone: interruptedLeftAlone ?? 0,
        counts,
        decisions: ctx.decisions,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ reconcile-pending-uploads error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
