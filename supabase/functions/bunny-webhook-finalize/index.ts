import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { finalizePendingUpload } from '../_shared/finalizePendingUpload.ts';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION 1: Setup + raw-body read + JSON parse + payload destructure
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const BUNNY_STREAM_LIBRARY_ID = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID');
const BUNNY_PREMIUM_LIBRARY_ID = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_LIBRARY_ID');
const BUNNY_STREAM_READONLY_KEY = Deno.env.get('BUNNY_STREAM_READONLY_KEY') ?? '';
const BUNNY_PREMIUM_READONLY_KEY = Deno.env.get('BUNNY_PREMIUM_READONLY_KEY') ?? '';
const BUNNY_STREAM_CDN_HOSTNAME = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME') ?? '';
const BUNNY_PREMIUM_CDN_HOSTNAME = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_CDN_HOSTNAME') ?? '';

// Bunny's "Finished / fully available" code in the WEBHOOK payload's own Status enum.
// This is NOT the same enum as the Get Video API's status field (where 4 = Finished,
// used by bunny-video-status.ts / app/upload.tsx's polling loop) — the two are separate
// numbering schemes that happen to overlap in low integers. See Phase 0/1 design notes.
const WEBHOOK_STATUS_FINISHED = 3;

interface BunnyWebhookPayload {
  VideoLibraryId: number;
  VideoGuid: string;
  Status: number;
}

function ok(body: Record<string, unknown> = { received: true }) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  // Signature is computed over the exact raw request body — must read as text
  // BEFORE any JSON parsing, and verify against this same raw string, never a
  // re-serialized version of the parsed object (re-serialization can silently
  // change byte formatting and break verification).
  const rawBody = await req.text();

  let payload: BunnyWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { VideoLibraryId, VideoGuid, Status } = payload;

  // Unconditional for now — this is how we confirm the real payload shape and
  // Status codes against a live delivery, per the Phase 0 caveat that the enum
  // came from a doc summary, not a payload we've actually seen. Trim once confirmed.
  console.log('🔔 Bunny webhook raw payload:', rawBody);

  // Also log the signature header (and everything else Bunny sends) alongside the
  // payload — if verification fails on the first real delivery, this shows in one
  // shot whether the encoding assumption (hex, see hmacSha256Hex below) is right,
  // or whether it's actually base64/prefixed/named differently than expected.
  console.log('🔔 Bunny webhook X-BunnyStream-Signature header:', req.headers.get('X-BunnyStream-Signature'));
  console.log('🔔 Bunny webhook all headers:', JSON.stringify(Object.fromEntries(req.headers.entries())));

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 2: Signature verification
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const isPremium = String(VideoLibraryId) === String(BUNNY_PREMIUM_LIBRARY_ID);
  const isFree = String(VideoLibraryId) === String(BUNNY_STREAM_LIBRARY_ID);

  if (!isPremium && !isFree) {
    console.error('❌ Unknown VideoLibraryId in webhook payload:', VideoLibraryId);
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const readonlyKey = isPremium ? BUNNY_PREMIUM_READONLY_KEY : BUNNY_STREAM_READONLY_KEY;

  if (!readonlyKey) {
    console.error('❌ Missing read-only Bunny key for', isPremium ? 'Premium' : 'Free', 'library');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const signatureHeader = req.headers.get('X-BunnyStream-Signature') ?? '';
  const expectedSignature = await hmacSha256Hex(readonlyKey, rawBody);

  if (!timingSafeEqual(signatureHeader, expectedSignature)) {
    console.error('❌ Bunny webhook signature mismatch for library', VideoLibraryId);
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 3: Status gate — only Status 3 (Finished) proceeds
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (Status !== WEBHOOK_STATUS_FINISHED) {
    console.log(`ℹ️ Ignoring webhook Status ${Status} for ${VideoGuid} (only ${WEBHOOK_STATUS_FINISHED}/Finished triggers finalize)`);
    return ok(); // 200 so Bunny doesn't retry — this isn't an error, just nothing to do
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Hoisted here (fix A) — known once VideoGuid + library are validated, needed by
  // both the finalize-insert path below AND the moderate-video call, which are no
  // longer in the same nested scope.
  const cdnHostname = isPremium ? BUNNY_PREMIUM_CDN_HOSTNAME : BUNNY_STREAM_CDN_HOSTNAME;
  const libraryId = Number(isPremium ? BUNNY_PREMIUM_LIBRARY_ID : BUNNY_STREAM_LIBRARY_ID);
  const thumbnailUrl = cdnHostname ? `https://${cdnHostname}/${VideoGuid}/thumbnail.jpg` : null;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 4: Row lookup + state handling
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const { data: row, error: lookupError } = await supabase
    .from('pending_uploads')
    .select('*')
    .eq('bunny_video_id', VideoGuid)
    .maybeSingle();

  if (lookupError) {
    console.error('❌ Failed to look up pending_uploads for', VideoGuid, lookupError);
    return new Response(JSON.stringify({ error: 'Database error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!row) {
    // Idempotency path #1: normal for a duplicate delivery after a prior finalize
    // already deleted this row, or for a video this system never tracked.
    console.log(`ℹ️ No pending_uploads row for ${VideoGuid} — already finalized or untracked`);
    return ok();
  }

  if (row.status === 'uploading' || row.status === 'ready') {
    // Bytes + encoding done, but the user hasn't tapped "Post" yet (still editing) —
    // just record that Bunny is done. Idempotent: re-setting 'ready' on an
    // already-'ready' row is a no-op.
    const { error: updateError } = await supabase
      .from('pending_uploads')
      .update({ status: 'ready', bunny_video_id: VideoGuid, updated_at: new Date().toISOString() })
      .eq('id', row.id);

    if (updateError) {
      console.error('❌ Failed to mark pending_uploads ready:', updateError);
      return new Response(JSON.stringify({ error: 'Database error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`✅ Marked pending_upload ${row.id} as ready (awaiting Post)`);
    return ok();
  }

  if (row.status !== 'posted') {
    // Covers 'processing' (fix C — current live TUS flow: JS is already actively
    // polling this row itself, the webhook has nothing to do) and 'completed'/'failed'
    // (already terminal). Safe no-op, not an error.
    console.log(`ℹ️ pending_upload ${row.id} has status '${row.status}' — not ours to finalize, ignoring`);
    return ok();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SECTION 5: Finalize (status === 'posted') — logic lives in the shared
  // finalizePendingUpload() module (supabase/functions/_shared/), reused by
  // finalize-posted-upload for the client-triggered case. One implementation,
  // two callers, so they can't drift apart.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const result = await finalizePendingUpload(supabase, row, libraryId, thumbnailUrl);

  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: result.status ?? 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return ok();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Crypto helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Manual constant-time compare — same rationale as revenuecat-webhook: this runs
// before we know the caller is legitimate, so a length-dependent early-return would
// leak timing information about how much of the signature an attacker has guessed.
function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}
