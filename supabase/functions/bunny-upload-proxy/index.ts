import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PROTOTYPE — proves the background-upload mechanism in isolation before any
// wiring into upload.tsx. Auth here is the plain Supabase session JWT (same
// pattern as bunny-create-video's authClient.auth.getUser()) — the locked
// 3-hour scoped-token model replaces this once we build the real flow.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bunny-video-guid, x-bunny-is-premium',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const BUNNY_STREAM_LIBRARY_ID = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID');
const BUNNY_STREAM_API_KEY = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_API_KEY');
const BUNNY_PREMIUM_LIBRARY_ID = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_LIBRARY_ID');
const BUNNY_PREMIUM_API_KEY = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_API_KEY');

function credsFor(isPremium: boolean) {
  return isPremium
    ? { libraryId: BUNNY_PREMIUM_LIBRARY_ID, apiKey: BUNNY_PREMIUM_API_KEY }
    : { libraryId: BUNNY_STREAM_LIBRARY_ID, apiKey: BUNNY_STREAM_API_KEY };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── AUTH ── same pattern as bunny-create-video: verify_jwt:true already
    // gates this at the gateway, this just extracts the user for logging.
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── WHICH VIDEO / LIBRARY ── carried as headers since the body is raw
    // binary (BINARY_CONTENT upload — can't carry additional form fields).
    const videoGuid = req.headers.get('X-Bunny-Video-Guid');
    const isPremium = req.headers.get('X-Bunny-Is-Premium') === 'true';

    if (!videoGuid) {
      return new Response(JSON.stringify({ error: 'X-Bunny-Video-Guid header is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { libraryId, apiKey } = credsFor(isPremium);

    if (!libraryId || !apiKey) {
      console.error('❌ Missing Bunny credentials for', isPremium ? 'Premium' : 'Free', 'library');
      return new Response(
        JSON.stringify({ error: 'Bunny.net credentials are not configured on the server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── BUFFER THE BODY ── fine at our current few-MB video sizes; revisit
    // (stream via fetch's `duplex: 'half'`) only if file sizes grow well past
    // this. Fail fast on an empty body rather than forwarding a 0-byte
    // upload to Bunny (same instinct as this repo's own "fail fast on
    // empty/missing recording" fix for the existing TUS path).
    const bytes = await req.arrayBuffer();

    if (bytes.byteLength === 0) {
      console.error('❌ Empty request body for video', videoGuid);
      return new Response(JSON.stringify({ error: 'Empty upload body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📤 Proxying ${bytes.byteLength} bytes to Bunny for ${videoGuid} (user ${user.id}, ${isPremium ? 'Premium' : 'Free'})`);

    // ── FORWARD TO BUNNY ── mirrors utils/bunnynet.ts's proven uploadToStream
    // call exactly (same endpoint, method, headers) — just server-side now, so
    // the AccessKey never reaches the client.
    const uploadResponse = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${videoGuid}`,
      {
        method: 'PUT',
        headers: {
          AccessKey: apiKey,
          'Content-Type': 'application/octet-stream',
        },
        body: bytes,
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('❌ Bunny upload failed:', uploadResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: `Bunny upload failed: ${uploadResponse.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Upload complete for ${videoGuid}, Bunny status ${uploadResponse.status}`);

    return new Response(JSON.stringify({ success: true, videoGuid, bytesUploaded: bytes.byteLength }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ bunny-upload-proxy error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
