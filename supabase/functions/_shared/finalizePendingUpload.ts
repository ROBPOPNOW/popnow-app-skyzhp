// Shared finalize logic — reused by bunny-webhook-finalize (webhook-triggered) and
// finalize-posted-upload (client-triggered, when Post happens after Bunny already
// reported Finished). One implementation, two callers, so they can't drift apart.
//
// Moved verbatim from bunny-webhook-finalize's own Section 5, with one substitution:
// VideoGuid -> row.bunny_video_id (identical value at this point for every caller,
// since row is always looked up by bunny_video_id before this runs) — and HTTP
// Response construction replaced with a plain result object, since that belongs to
// each caller's own Deno.serve handler, not to shared business logic.

export interface FinalizeResult {
  ok: boolean;
  videoId?: string;
  error?: string;
  status?: number; // suggested HTTP status for the caller to use when ok is false
}

export async function finalizePendingUpload(
  supabase: any,
  row: any,
  libraryId: number,
  thumbnailUrl: string | null
): Promise<FinalizeResult> {
  // Idempotency path #2: defends against a prior run that inserted into videos but
  // crashed/timed out before deleting the pending_uploads row (so this row is still
  // 'posted' on a retry/redelivery even though it was already finalized once).
  const { data: existingVideo, error: existingVideoError } = await supabase
    .from('videos')
    .select('id')
    .eq('video_url', row.bunny_video_id)
    .maybeSingle();

  if (existingVideoError) {
    console.error('❌ Failed to check for existing video:', existingVideoError);
    return { ok: false, error: 'Database error', status: 500 };
  }

  let videoId: string;
  let isFreshInsert = false;

  if (existingVideo) {
    videoId = existingVideo.id;
    console.log(`ℹ️ videos row for ${row.bunny_video_id} already exists (${videoId}) — skipping insert, finishing cleanup`);
  } else {
    const { data: video, error: insertError } = await supabase
      .from('videos')
      .insert({
        user_id: row.user_id,
        video_url: row.bunny_video_id,
        thumbnail_url: thumbnailUrl,
        caption: row.caption,
        tags: row.tags,
        location_latitude: row.location_latitude,
        location_longitude: row.location_longitude,
        location_name: row.location_name,
        location_privacy: row.location_privacy,
        moderation_status: 'pending',
        is_approved: false,
        request_id: row.request_id,
        library_id: libraryId,
      })
      .select()
      .single();

    if (insertError?.code === '23505') {
      // Concurrent duplicate delivery raced us and won (protected by the
      // videos_video_url_key unique index) — re-fetch and continue as the
      // idempotent re-entry path, not a fresh insert.
      console.log(`ℹ️ Unique-violation on ${row.bunny_video_id} — another request won the race, re-fetching`);
      const { data: winner, error: refetchError } = await supabase
        .from('videos')
        .select('id')
        .eq('video_url', row.bunny_video_id)
        .single();

      if (refetchError || !winner) {
        console.error('❌ Lost the insert race but could not re-fetch the winning row:', refetchError);
        return { ok: false, error: 'Database error', status: 500 };
      }
      videoId = winner.id;
    } else if (insertError) {
      console.error('❌ Failed to insert video for', row.bunny_video_id, insertError);
      // Non-2xx so a webhook caller's Bunny retries the delivery later.
      return { ok: false, error: 'Failed to save video', status: 500 };
    } else {
      videoId = video.id;
      isFreshInsert = true;
      console.log(`✅ Finalized video ${videoId} for ${row.bunny_video_id}`);
    }
  }

  if (row.request_id) {
    const { error: fulfillmentError } = await supabase
      .from('request_fulfillments')
      .insert({ request_id: row.request_id, video_id: videoId, user_id: row.user_id });

    if (fulfillmentError) {
      // Don't fail the whole finalize over this — the video is saved either way.
      // Matches the current app flow's own tolerance for this specific failure.
      console.error('⚠️ Failed to create fulfillment for', row.request_id, fulfillmentError);
    }
  }

  const { error: deleteError } = await supabase.from('pending_uploads').delete().eq('id', row.id);
  if (deleteError) {
    // The video is safely finalized regardless; a leftover pending_uploads row here
    // will be caught by idempotency path #2 on any future redelivery, or by the
    // reconciliation cron once it exists.
    console.error('⚠️ Failed to delete pending_uploads row', row.id, deleteError);
  }

  // Fix B: only trigger moderation on an actual fresh finalize, never on the
  // idempotent re-entry path — a duplicate delivery must not re-moderate a video
  // that was already moderated after its first (real) finalize.
  if (isFreshInsert) {
    supabase.functions
      .invoke('moderate-video', {
        body: {
          videoId,
          videoUrl: row.bunny_video_id,
          thumbnailUrl,
          userId: row.user_id,
          requestId: row.request_id ?? null,
        },
      })
      .then(() => console.log('✅ Video moderation triggered for', videoId))
      .catch((error: unknown) => console.error('⚠️ Video moderation trigger failed (non-critical):', error));
  }

  return { ok: true, videoId };
}
