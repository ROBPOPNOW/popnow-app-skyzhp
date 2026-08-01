import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const BUNNY_STREAM_LIBRARY_ID = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID');
const BUNNY_STREAM_API_KEY = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_API_KEY');
const BUNNY_PREMIUM_LIBRARY_ID = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_LIBRARY_ID');
const BUNNY_PREMIUM_API_KEY = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_API_KEY');

// Short-lived: enough time to complete a TUS upload of a phone-recorded video, not enough to be
// useful if leaked. Bunny only checks this at PATCH-time, so a slow upload just needs to finish
// before it expires - it does not need to be re-issued mid-upload.
const UPLOAD_AUTH_TTL_SECONDS = 3600;

function credsFor(isPremium: boolean) {
  return isPremium
    ? { libraryId: BUNNY_PREMIUM_LIBRARY_ID, apiKey: BUNNY_PREMIUM_API_KEY }
    : { libraryId: BUNNY_STREAM_LIBRARY_ID, apiKey: BUNNY_STREAM_API_KEY };
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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

    const { title, isPremium, collectionId } = await req.json();

    if (!title || typeof title !== 'string') {
      return new Response(JSON.stringify({ error: 'title is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { libraryId, apiKey } = credsFor(!!isPremium);

    if (!libraryId || !apiKey) {
      console.error('❌ Missing Bunny credentials for', isPremium ? 'Premium' : 'Free', 'library');
      return new Response(
        JSON.stringify({ error: 'Bunny.net credentials are not configured on the server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const createResponse = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
      method: 'POST',
      headers: {
        AccessKey: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, collectionId }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('❌ Bunny create video failed:', createResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: `Failed to create video on Bunny.net: ${createResponse.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const created = await createResponse.json();
    const videoId: string = created.guid;

    const authorizationExpire = Math.floor(Date.now() / 1000) + UPLOAD_AUTH_TTL_SECONDS;
    const authorizationSignature = await sha256Hex(`${libraryId}${apiKey}${authorizationExpire}${videoId}`);

    console.log('✅ Created Bunny video', videoId, 'for user', user.id, isPremium ? '(Premium)' : '(Free)');

    return new Response(
      JSON.stringify({
        videoId,
        libraryId: Number(libraryId),
        authorizationSignature,
        authorizationExpire,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ bunny-create-video error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
