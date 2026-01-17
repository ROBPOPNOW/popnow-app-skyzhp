
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Get Bunny.net configuration from environment - USING CORRECT SECRET NAMES
const BUNNY_STREAM_LIBRARY_ID = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID');
const BUNNY_STREAM_API_KEY = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_API_KEY');

/**
 * Validate Bunny.net credentials format
 * Library ID should be a 6-digit number
 * API Key should be a long hash string
 */
function validateBunnyCredentials(): { valid: boolean; error?: string } {
  if (!BUNNY_STREAM_LIBRARY_ID || !BUNNY_STREAM_API_KEY) {
    return {
      valid: false,
      error: 'Missing credentials: EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID or EXPO_PUBLIC_BUNNY_STREAM_API_KEY not set',
    };
  }

  // Library ID should be a 6-digit number (or similar short numeric string)
  const libraryIdPattern = /^\d{5,7}$/;
  if (!libraryIdPattern.test(BUNNY_STREAM_LIBRARY_ID)) {
    return {
      valid: false,
      error: `Invalid Library ID format: "${BUNNY_STREAM_LIBRARY_ID.substring(0, 20)}..." - Expected a 6-digit number, got a ${BUNNY_STREAM_LIBRARY_ID.length}-character string. You may have swapped the Library ID and API Key values.`,
    };
  }

  // API Key should be a long hash (at least 32 characters)
  if (BUNNY_STREAM_API_KEY.length < 32) {
    return {
      valid: false,
      error: `Invalid API Key format: Too short (${BUNNY_STREAM_API_KEY.length} characters). Expected a long hash string (64+ characters).`,
    };
  }

  return { valid: true };
}

/**
 * Extract video ID from Bunny.net URL
 * Handles various URL formats:
 * - https://vz-xxxxx.b-cdn.net/{video_id}/playlist.m3u8
 * - https://vz-xxxxx.b-cdn.net/{video_id}/playlist.m3u8?v=xxx
 * - Just the video_id itself
 */
function extractVideoId(videoUrl: string): string | null {
  console.log('🔍 Extracting video ID from URL:', videoUrl);
  
  // If it's already just an ID (no slashes or dots), return it
  if (!videoUrl.includes('/') && !videoUrl.includes('.')) {
    console.log('✅ Already a clean video ID:', videoUrl);
    return videoUrl;
  }
  
  // Remove protocol and domain if present
  let cleanUrl = videoUrl.replace(/^https?:\/\//, '');
  
  // Remove query parameters
  cleanUrl = cleanUrl.split('?')[0];
  
  // Remove .m3u8 extension
  cleanUrl = cleanUrl.replace(/\.m3u8$/, '');
  
  // Remove /playlist suffix
  cleanUrl = cleanUrl.replace(/\/playlist$/, '');
  
  // Extract the video ID (should be the part after the domain and before /playlist)
  const parts = cleanUrl.split('/');
  
  // Find the video ID - it's typically a UUID-like string
  // Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const videoIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  
  for (const part of parts) {
    if (videoIdPattern.test(part)) {
      console.log('✅ Extracted video ID:', part);
      return part;
    }
  }
  
  // If no UUID found, return the last meaningful part
  const lastPart = parts[parts.length - 1] || videoUrl;
  console.log('⚠️ No UUID pattern found, using last part:', lastPart);
  return lastPart;
}

/**
 * Delete video from Bunny.net Stream
 * Returns true if deletion succeeded OR if video was already deleted (404)
 * 
 * CORRECT DELETE REQUEST FORMAT:
 * URL: https://video.bunnycdn.com/library/{6-DIGIT-LIBRARY-ID}/videos/{VIDEO-ID}
 * Header: AccessKey: {LONG-API-KEY}
 */
async function deleteFromBunnyNet(videoUrl: string): Promise<boolean> {
  try {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      console.error('❌ Could not extract video ID from URL:', videoUrl);
      return false;
    }

    console.log('🗑️ Deleting video from Bunny.net:', videoId);
    console.log('📋 Using Library ID:', BUNNY_STREAM_LIBRARY_ID);
    console.log('🔑 Using API Key:', BUNNY_STREAM_API_KEY?.substring(0, 10) + '...');
    
    // Construct the correct DELETE URL
    const deleteUrl = `https://video.bunnycdn.com/library/${BUNNY_STREAM_LIBRARY_ID}/videos/${videoId}`;
    console.log('🔗 DELETE URL:', deleteUrl);

    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'AccessKey': BUNNY_STREAM_API_KEY!,
        'Content-Type': 'application/json',
      },
    });

    console.log(`📊 Bunny.net API Response: ${response.status} ${response.statusText}`);

    if (response.ok) {
      console.log('✅ Video deleted from Bunny.net successfully:', videoId);
      return true;
    } else if (response.status === 404) {
      // Video already deleted - consider this a success
      console.log('ℹ️ Video already deleted from Bunny.net (404), continuing...');
      return true;
    } else {
      const errorText = await response.text();
      console.error(`❌ Failed to delete video from Bunny.net: ${response.status} ${response.statusText}`);
      console.error('Error details:', errorText);
      
      // If we get a 400 error about invalid libraryId, provide helpful guidance
      if (response.status === 400 && errorText.includes('libraryId')) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('🚨 CONFIGURATION ERROR DETECTED 🚨');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('The Library ID appears to be invalid. This usually means:');
        console.error('1. The EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID secret contains the API KEY instead of the Library ID');
        console.error('2. The Library ID should be a 6-digit number (e.g., "123456")');
        console.error('3. The API Key should be a long hash (e.g., "3e8282108290d877...")');
        console.error('');
        console.error('Current values:');
        console.error(`  Library ID: ${BUNNY_STREAM_LIBRARY_ID} (length: ${BUNNY_STREAM_LIBRARY_ID?.length})`);
        console.error(`  API Key: ${BUNNY_STREAM_API_KEY?.substring(0, 20)}... (length: ${BUNNY_STREAM_API_KEY?.length})`);
        console.error('');
        console.error('TO FIX:');
        console.error('1. Go to Supabase Dashboard → Edge Functions → Secrets');
        console.error('2. Verify EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID contains a 6-digit number');
        console.error('3. Verify EXPO_PUBLIC_BUNNY_STREAM_API_KEY contains the long hash');
        console.error('4. Redeploy this Edge Function');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
      
      return false;
    }
  } catch (error) {
    console.error('❌ Error deleting from Bunny.net:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧹 DELETE EXPIRED VIDEOS - HOURLY JOB STARTED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⏰ Timestamp:', new Date().toISOString());

  try {
    // Validate Bunny.net configuration
    const validation = validateBunnyCredentials();
    if (!validation.valid) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ CRITICAL ERROR: Invalid Bunny.net configuration!');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error(validation.error);
      console.error('');
      console.error('Current configuration:');
      console.error('EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID:', BUNNY_STREAM_LIBRARY_ID || '❌ NOT SET');
      console.error('EXPO_PUBLIC_BUNNY_STREAM_API_KEY:', BUNNY_STREAM_API_KEY ? `${BUNNY_STREAM_API_KEY.substring(0, 20)}... (${BUNNY_STREAM_API_KEY.length} chars)` : '❌ NOT SET');
      console.error('');
      console.error('📋 EXPECTED FORMAT:');
      console.error('EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID: 6-digit number (e.g., "123456")');
      console.error('EXPO_PUBLIC_BUNNY_STREAM_API_KEY: Long hash string (e.g., "3e8282108290d877a137fbd73f2cea70f3908d616c94b028ad8a2f175d86f197")');
      console.error('');
      console.error('📋 TO FIX THIS:');
      console.error('1. Go to Supabase Dashboard → Edge Functions → Secrets');
      console.error('2. Verify these secrets have the CORRECT values:');
      console.error('   - EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID: Your 6-digit Bunny.net Stream Library ID');
      console.error('   - EXPO_PUBLIC_BUNNY_STREAM_API_KEY: Your long Bunny.net Stream API Key');
      console.error('3. Make sure you did NOT swap the Library ID and API Key values');
      console.error('4. Redeploy this Edge Function');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: validation.error,
          timestamp: new Date().toISOString(),
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Bunny.net credentials validated successfully');
    console.log(`   Library ID: ${BUNNY_STREAM_LIBRARY_ID} (${BUNNY_STREAM_LIBRARY_ID?.length} chars)`);
    console.log(`   API Key: ${BUNNY_STREAM_API_KEY?.substring(0, 10)}... (${BUNNY_STREAM_API_KEY?.length} chars)`);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Calculate 3 days ago timestamp (72 hours)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const cutoffDate = threeDaysAgo.toISOString();
    
    console.log('📅 Cutoff date (3 days ago):', cutoffDate);
    console.log('📅 Current date:', new Date().toISOString());

    // Find all videos older than 3 days
    console.log('🔍 Querying database for expired videos...');
    const { data: expiredVideos, error: fetchError } = await supabaseClient
      .from('videos')
      .select('id, video_url, thumbnail_url, caption, user_id, created_at')
      .lt('created_at', cutoffDate)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('❌ Database query error:', fetchError);
      throw fetchError;
    }

    console.log(`📊 Found ${expiredVideos?.length || 0} expired videos to delete`);

    if (!expiredVideos || expiredVideos.length === 0) {
      console.log('✅ No expired videos found. Job complete.');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No expired videos to delete',
          deletedCount: 0,
          failedCount: 0,
          timestamp: new Date().toISOString(),
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    let deletedCount = 0;
    let failedCount = 0;
    const deletionResults: any[] = [];

    // Delete each expired video
    for (const video of expiredVideos) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🎬 Processing video: ${video.id}`);
      console.log(`   Caption: ${video.caption || 'N/A'}`);
      console.log(`   Created: ${video.created_at}`);
      
      // Calculate age in hours
      const createdDate = new Date(video.created_at);
      const ageInHours = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60);
      console.log(`   Age: ${ageInHours.toFixed(1)} hours old (${(ageInHours / 24).toFixed(1)} days)`);
      
      console.log(`   Video URL: ${video.video_url}`);
      console.log(`   Thumbnail URL: ${video.thumbnail_url || 'N/A'}`);

      try {
        let bunnyDeletionSuccess = false;

        // Step 1: Delete video file from Bunny.net
        if (video.video_url) {
          console.log('🗑️ Step 1: Deleting video from Bunny.net...');
          bunnyDeletionSuccess = await deleteFromBunnyNet(video.video_url);
          
          if (bunnyDeletionSuccess) {
            console.log('✅ Video deleted from Bunny.net');
          } else {
            console.error('⚠️ Failed to delete video from Bunny.net (will still delete from database)');
          }
        } else {
          console.log('⚠️ No video URL found, skipping Bunny.net deletion');
          bunnyDeletionSuccess = true; // Consider it success if there's no URL
        }

        // Step 2: Thumbnails are auto-deleted when video is deleted
        console.log('ℹ️ Step 2: Thumbnail auto-deleted with video');

        // Step 3: Delete video record from Supabase database
        console.log('🗑️ Step 3: Deleting video record from database...');
        const { error: deleteError } = await supabaseClient
          .from('videos')
          .delete()
          .eq('id', video.id);

        if (deleteError) {
          console.error(`❌ Failed to delete video ${video.id} from database:`, deleteError);
          failedCount++;
          deletionResults.push({
            videoId: video.id,
            caption: video.caption,
            ageInHours: ageInHours.toFixed(1),
            success: false,
            error: deleteError.message,
            bunnyDeletion: bunnyDeletionSuccess,
          });
        } else {
          console.log(`✅ Video ${video.id} deleted from database successfully`);
          deletedCount++;
          deletionResults.push({
            videoId: video.id,
            caption: video.caption,
            ageInHours: ageInHours.toFixed(1),
            success: true,
            bunnyDeletion: bunnyDeletionSuccess,
          });
        }
      } catch (error: any) {
        console.error(`❌ Error processing video ${video.id}:`, error);
        failedCount++;
        deletionResults.push({
          videoId: video.id,
          caption: video.caption,
          success: false,
          error: error.message || 'Unknown error',
        });
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 CLEANUP SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Successfully deleted: ${deletedCount} videos`);
    console.log(`❌ Failed to delete: ${failedCount} videos`);
    console.log(`📋 Total processed: ${expiredVideos.length} videos`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleanup completed: ${deletedCount} videos deleted, ${failedCount} failed`,
        deletedCount,
        failedCount,
        totalProcessed: expiredVideos.length,
        details: deletionResults,
        timestamp: new Date().toISOString(),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ CLEANUP FUNCTION ERROR');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
