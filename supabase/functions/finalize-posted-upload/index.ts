import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { finalizePendingUpload } from '../_shared/finalizePendingUpload.ts';

// Client-triggered finalize: called right after Post sets a pending_uploads row to
// 'posted', in case Bunny already reported Finished BEFORE Post happened (webhook
// already fired while the row was still 'uploading'/'ready', so no future webhook
// delivery is coming for this GUID). Checks Bunny's LIVE status directly rather than
// trusting our own DB's status history, which sidesteps the read-then-branch race
// that could otherwise strand a row at 'posted' forever. Safe to call unconditionally
// after every Post — a no-op when Bunny isn't done yet, since the webhook or the
// reconciliation cron still finalizes it normally in that case.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const BUNNY_STREAM_LIBRARY_ID = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID');
const BUNNY_STREAM_API_KEY = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_API_KEY');
const BUNNY_PREMIUM_LIBRARY_ID = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_LIBRARY_ID');
const BUNNY_PREMIUM_API_KEY = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_API_KEY');
const BUNNY_STREAM_CDN_HOSTNAME = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME') ?? '';
const BUNNY_PREMIUM_CDN_HOSTNAME = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_CDN_HOSTNAME') ?? '';

// Get Video API's own status enum (video.bunnycdn.com/library/{id}/videos/{guid}) —
// 0=Created,1=Uploaded,2=Processing,3=Transcoding,4=Finished,5=Error,6=UploadFailed,
// 7=JitSegmenting,8=JitPlaylistsCreated. NOT the webhook payload's separate enum
// (where 3=Finished) — see bunny-webhook-finalize's own comment on this exact mixup.
const GET_VIDEO_STATUS_FINISHED = 4;

function credsFor(isPremium: boolean) {
  return isPremium
    ? { libraryId: BUNNY_PREMIUM_LIBRARY_ID, apiKey: BUNNY_PREMIUM_API_KEY }
    : { libraryId: BUNNY_STREAM_LIBRARY_ID, apiKey: BUNNY_STREAM_API_KEY };
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── AUTH: verify the caller's real Supabase session (verify_jwt:true also gates
    // this at the platform level; this extracts the user id for the ownership check).
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();

    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { pendingUploadId } = await req.json();

    if (!pendingUploadId || typeof pendingUploadId !== 'string') {
      return json({ error: 'pendingUploadId is required' }, 400);
    }

    // Service-role client for everything past this point — same as
    // bunny-webhook-finalize, needed to write videos/request_fulfillments and
    // bypass RLS on pending_uploads regardless of row ownership quirks.
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: row, error: lookupError } = await supabaseAdmin
      .from('pending_uploads')
      .select('*')
      .eq('id', pendingUploadId)
      .maybeSingle();

    if (lookupError) {
      console.error('❌ Failed to look up pending_uploads:', lookupError);
      return json({ error: 'Database error' }, 500);
    }

    if (!row) {
      // Already finalized (and deleted) by the webhook, or never existed — harmless.
      console.log(`ℹ️ No pending_uploads row for ${pendingUploadId} — already finalized or untracked`);
      return json({ finalized: false, reason: 'not_found' });
    }

    // ── AUTHZ: the row must belong to the caller. Without this, any authenticated
    // user could finalize another user's pending upload just by guessing/observing
    // an id — this is the one hard requirement for this whole endpoint's safety.
    if (row.user_id !== user.id) {
      console.error(`❌ User ${user.id} attempted to finalize row ${pendingUploadId} owned by ${row.user_id}`);
      return json({ error: 'Forbidden' }, 403);
    }

    if (row.status !== 'posted') {
      // Not committed yet (still 'uploading'/'ready') — nothing to finalize. This
      // endpoint is only ever a no-op outside the 'posted' state.
      console.log(`ℹ️ pending_upload ${row.id} has status '${row.status}', not 'posted' — no-op`);
      return json({ finalized: false, reason: 'not_posted' });
    }

    // Row doesn't store isPremium — re-query the same way startPreupload determined
    // it originally, rather than trying to infer it from the library id.
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('is_premium')
      .eq('id', row.user_id)
      .single();

    const isPremium = userData?.is_premium || false;

    // Same three-line computation as bunny-webhook-finalize (VideoGuid -> row.bunny_video_id),
    // so both callers produce an identical library_id/thumbnail_url on the videos row.
    const cdnHostname = isPremium ? BUNNY_PREMIUM_CDN_HOSTNAME : BUNNY_STREAM_CDN_HOSTNAME;
    const libraryId = Number(isPremium ? BUNNY_PREMIUM_LIBRARY_ID : BUNNY_STREAM_LIBRARY_ID);
    const thumbnailUrl = cdnHostname ? `https://${cdnHostname}/${row.bunny_video_id}/thumbnail.jpg` : null;

    const { libraryId: bunnyLibraryId, apiKey: bunnyApiKey } = credsFor(isPremium);

    if (!bunnyLibraryId || !bunnyApiKey) {
      console.error('❌ Missing Bunny credentials for', isPremium ? 'Premium' : 'Free', 'library');
      return json({ error: 'Server misconfigured' }, 500);
    }

    // Check Bunny's LIVE status — same call bunny-video-status makes, same 10s
    // timeout so a stalled Bunny call surfaces cleanly rather than hanging.
    const BUNNY_FETCH_TIMEOUT_MS = 10_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BUNNY_FETCH_TIMEOUT_MS);
    let statusResponse: Response;
    try {
      statusResponse = await fetch(
        `https://video.bunnycdn.com/library/${bunnyLibraryId}/videos/${row.bunny_video_id}`,
        { method: 'GET', headers: { AccessKey: bunnyApiKey }, signal: controller.signal }
      );
    } catch (fetchError) {
      // Transient Bunny/network failure — not the caller's fault, and not worth
      // failing Post over. Treat as "not confirmed finished yet"; the webhook or
      // reconciliation cron still finalizes normally once Bunny is actually done.
      console.error('⚠️ Bunny status check failed (treating as not-yet-finished):', fetchError);
      return json({ finalized: false, reason: 'bunny_check_failed' });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!statusResponse.ok) {
      console.error('⚠️ Bunny status check returned', statusResponse.status, '(treating as not-yet-finished)');
      return json({ finalized: false, reason: 'bunny_check_failed' });
    }

    const bunnyData = await statusResponse.json();

    if (bunnyData?.status !== GET_VIDEO_STATUS_FINISHED) {
      console.log(`ℹ️ Bunny status for ${row.bunny_video_id} is ${bunnyData?.status} (not yet Finished) — no-op`);
      return json({ finalized: false, reason: 'not_finished_yet' });
    }

    console.log(`✅ Bunny confirms ${row.bunny_video_id} is Finished — finalizing now via shared logic`);
    const result = await finalizePendingUpload(supabaseAdmin, row, libraryId, thumbnailUrl);

    if (!result.ok) {
      return json({ error: result.error }, result.status ?? 500);
    }

    return json({ finalized: true, videoId: result.videoId });
  } catch (error) {
    console.error('❌ finalize-posted-upload error:', error);
    return json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500);
  }
});
