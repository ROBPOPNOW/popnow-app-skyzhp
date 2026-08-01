import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function credsFor(isPremium: boolean) {
  return isPremium
    ? { libraryId: BUNNY_PREMIUM_LIBRARY_ID, apiKey: BUNNY_PREMIUM_API_KEY }
    : { libraryId: BUNNY_STREAM_LIBRARY_ID, apiKey: BUNNY_STREAM_API_KEY };
}

// The client only ever knows about its own pending_uploads/videos rows, so ownership of one of
// those rows referencing this Bunny video ID stands in for "this caller is allowed to delete it".
async function callerOwnsVideo(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  videoId: string
): Promise<boolean> {
  const { data: pending } = await serviceClient
    .from('pending_uploads')
    .select('id')
    .eq('bunny_video_id', videoId)
    .eq('user_id', userId)
    .maybeSingle();

  if (pending) return true;

  const { data: video } = await serviceClient
    .from('videos')
    .select('id')
    .eq('video_url', videoId)
    .eq('user_id', userId)
    .maybeSingle();

  return !!video;
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

    const { videoId, isPremium } = await req.json();

    if (!videoId || typeof videoId !== 'string') {
      return new Response(JSON.stringify({ error: 'videoId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const owns = await callerOwnsVideo(serviceClient, user.id, videoId);
    if (!owns) {
      console.warn('⚠️ User', user.id, 'attempted to delete video they do not own:', videoId);
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
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

    const deleteResponse = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
      { method: 'DELETE', headers: { AccessKey: apiKey } }
    );

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      console.error('❌ Bunny delete failed:', deleteResponse.status);
      return new Response(
        JSON.stringify({ error: `Failed to delete video: ${deleteResponse.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Deleted Bunny video', videoId, 'for user', user.id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ bunny-delete-video error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
