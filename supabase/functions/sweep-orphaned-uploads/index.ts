
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Same credential pattern as bunny-delete-video / delete-expired-videos:
// this function calls Bunny.net directly with server-held secrets, no client involved.
const BUNNY_STREAM_LIBRARY_ID = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID');
const BUNNY_STREAM_API_KEY = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_API_KEY');
const BUNNY_PREMIUM_LIBRARY_ID = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_LIBRARY_ID');
const BUNNY_PREMIUM_API_KEY = Deno.env.get('EXPO_PUBLIC_BUNNY_PREMIUM_API_KEY');

// A pending_uploads row with no updated_at newer than this is considered dead, not just slow.
// updated_at now ticks on every progress step (every ~2s during processing polls), so a live
// upload's updated_at is never more than a few seconds stale. 10 minutes gives generous headroom
// above that and above the client's own 2-minute "show as failed" UI threshold.
const STALE_THRESHOLD_MINUTES = 10;

function credsFor(isPremium: boolean) {
  return isPremium
    ? { libraryId: BUNNY_PREMIUM_LIBRARY_ID, apiKey: BUNNY_PREMIUM_API_KEY }
    : { libraryId: BUNNY_STREAM_LIBRARY_ID, apiKey: BUNNY_STREAM_API_KEY };
}

// Returns true if the video is gone from Bunny (deleted now, or already gone / 404).
async function deleteFromBunny(videoId: string, isPremium: boolean): Promise<boolean> {
  const { libraryId, apiKey } = credsFor(isPremium);

  if (!libraryId || !apiKey) {
    console.error(`❌ Missing Bunny credentials for ${isPremium ? 'Premium' : 'Free'} library`);
    return false;
  }

  try {
    const response = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`, {
      method: 'DELETE',
      headers: { AccessKey: apiKey },
    });

    if (response.ok || response.status === 404) {
      return true;
    }

    console.error(`❌ Bunny delete failed for ${videoId}: ${response.status} ${response.statusText}`);
    return false;
  } catch (error) {
    console.error(`❌ Error deleting ${videoId} from Bunny:`, error);
    return false;
  }
}

Deno.serve(async (_req) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧹 SWEEP ORPHANED UPLOADS - STARTED');
  console.log('⏰ Timestamp:', new Date().toISOString());

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000).toISOString();
    console.log(`📅 Cutoff (${STALE_THRESHOLD_MINUTES} min ago):`, cutoff);

    // Also catches 'failed' rows that still carry a bunny_video_id: the client's own
    // 2-minute staleness check can flip a stuck row to 'failed' without deleting the
    // Bunny video, racing ahead of this sweep. bunny_video_id IS NOT NULL excludes rows
    // already cleaned up (by this sweep or by client dismiss/retry), so nothing gets
    // re-processed.
    const { data: staleUploads, error: fetchError } = await supabase
      .from('pending_uploads')
      .select('id, user_id, bunny_video_id, updated_at, status')
      .lt('updated_at', cutoff)
      .or('status.in.(uploading,processing),and(status.eq.failed,bunny_video_id.not.is.null)');

    if (fetchError) throw fetchError;

    console.log(`📊 Found ${staleUploads?.length || 0} stale pending uploads`);

    if (!staleUploads || staleUploads.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No stale uploads found', sweptCount: 0, bunnyDeleteFailures: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    let sweptCount = 0;
    let bunnyDeleteFailures = 0;

    for (const upload of staleUploads) {
      console.log(`🎬 Processing stale upload: ${upload.id} (status: ${upload.status}, last updated: ${upload.updated_at})`);

      let bunnyDeleted = true;

      if (upload.bunny_video_id) {
        const { data: userData } = await supabase
          .from('users')
          .select('is_premium')
          .eq('id', upload.user_id)
          .maybeSingle();

        const isPremium = userData?.is_premium || false;
        bunnyDeleted = await deleteFromBunny(upload.bunny_video_id, isPremium);

        if (bunnyDeleted) {
          console.log(`✅ Deleted orphaned Bunny video ${upload.bunny_video_id}`);
        } else {
          bunnyDeleteFailures++;
          console.error(`⚠️ Failed to delete Bunny video ${upload.bunny_video_id}, marking row failed anyway`);
        }
      }

      const { error: updateError } = await supabase
        .from('pending_uploads')
        .update({
          status: 'failed',
          upload_progress: 0,
          error_message: 'Upload timed out and was auto-cleaned up. Tap retry to try again.',
          bunny_video_id: bunnyDeleted ? null : upload.bunny_video_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', upload.id);

      if (updateError) {
        console.error(`❌ Failed to mark upload ${upload.id} as failed:`, updateError);
        continue;
      }

      sweptCount++;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Swept: ${sweptCount}, Bunny delete failures: ${bunnyDeleteFailures}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return new Response(
      JSON.stringify({
        success: true,
        message: `Swept ${sweptCount} stale uploads (${bunnyDeleteFailures} Bunny delete failures)`,
        sweptCount,
        bunnyDeleteFailures,
        totalProcessed: staleUploads.length,
        timestamp: new Date().toISOString(),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ SWEEP FUNCTION ERROR:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
