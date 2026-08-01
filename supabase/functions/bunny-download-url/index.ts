import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const BUNNY_STREAM_LIBRARY_ID = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID');
const BUNNY_STREAM_API_KEY = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_API_KEY');
const BUNNY_STREAM_CDN_HOSTNAME = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME');
const BUNNY_PREMIUM_LIBRARY_ID = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_LIBRARY_ID');
const BUNNY_PREMIUM_API_KEY = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_API_KEY');
const BUNNY_PREMIUM_CDN_HOSTNAME = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_CDN_HOSTNAME');

function credsFor(isPremium: boolean) {
  return isPremium
    ? { libraryId: BUNNY_PREMIUM_LIBRARY_ID, apiKey: BUNNY_PREMIUM_API_KEY, cdnHostname: BUNNY_PREMIUM_CDN_HOSTNAME }
    : { libraryId: BUNNY_STREAM_LIBRARY_ID, apiKey: BUNNY_STREAM_API_KEY, cdnHostname: BUNNY_STREAM_CDN_HOSTNAME };
}

// Mirrors utils/bunnynet.ts extractVideoId() - accepts a raw GUID or a full playback URL.
function extractVideoId(videoUrl: string): string {
  if (!videoUrl.includes('/') && !videoUrl.includes('.')) {
    return videoUrl;
  }

  let cleanUrl = videoUrl.replace(/^https?:\/\//, '');
  cleanUrl = cleanUrl.split('?')[0];
  cleanUrl = cleanUrl.replace(/\.m3u8$/, '');
  cleanUrl = cleanUrl.replace(/\/playlist$/, '');

  const parts = cleanUrl.split('/');
  const videoIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

  for (const part of parts) {
    if (videoIdPattern.test(part)) {
      return part;
    }
  }

  return parts[parts.length - 1] || videoUrl;
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

    const { videoUrl, isPremium } = await req.json();

    if (!videoUrl || typeof videoUrl !== 'string') {
      return new Response(JSON.stringify({ error: 'videoUrl is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { libraryId, apiKey, cdnHostname } = credsFor(!!isPremium);

    if (!libraryId || !apiKey || !cdnHostname) {
      console.error('❌ Missing Bunny config for', isPremium ? 'Premium' : 'Free', 'library');
      return new Response(
        JSON.stringify({ error: 'Bunny.net configuration is not set up on the server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const videoId = extractVideoId(videoUrl);

    const infoResponse = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`, {
      method: 'GET',
      headers: { AccessKey: apiKey },
    });

    if (!infoResponse.ok) {
      console.error('❌ Bunny video info failed:', infoResponse.status);
      return new Response(
        JSON.stringify({ error: `Failed to get video info: ${infoResponse.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const videoData = await infoResponse.json();
    const availableResolutions: string = videoData.availableResolutions || '';

    if (!availableResolutions) {
      return new Response(JSON.stringify({ error: 'No MP4 resolutions available for this video' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resolutions = availableResolutions
      .split(',')
      .map((r: string) => r.trim().replace(/p$/i, ''))
      .sort((a: string, b: string) => parseInt(b, 10) - parseInt(a, 10));

    const bestResolution = resolutions[0];
    const downloadUrl = `https://${cdnHostname}/${videoId}/play_${bestResolution}p.mp4`;

    return new Response(JSON.stringify({ downloadUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ bunny-download-url error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
