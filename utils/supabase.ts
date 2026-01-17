
import { supabase } from '@/lib/supabase';

// Video upload and moderation
export async function uploadVideo(
  videoUri: string,
  caption: string,
  tags: string[],
  location: {
    latitude: number;
    longitude: number;
    name: string;
    privacy: 'exact' | '3km' | '10km';
  },
  userId: string
) {
  try {
    // 1. Upload video to Supabase Storage
    const fileName = `${userId}/${Date.now()}.mp4`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('videos')
      .upload(fileName, videoUri);

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    // 2. Get public URL
    const { data: urlData } = supabase.storage
      .from('videos')
      .getPublicUrl(fileName);

    // 3. Create video record
    const { data: videoData, error: videoError } = await supabase
      .from('videos')
      .insert({
        user_id: userId,
        video_url: urlData.publicUrl,
        caption,
        tags,
        location_latitude: location.latitude,
        location_longitude: location.longitude,
        location_name: location.name,
        location_privacy: location.privacy,
        moderation_status: 'pending',
      })
      .select()
      .single();

    if (videoError) {
      console.error('Video record error:', videoError);
      throw videoError;
    }

    // 4. Call moderation Edge Function
    const { data: moderationData, error: moderationError } = await supabase.functions.invoke(
      'moderate-video',
      {
        body: {
          videoId: videoData.id,
          videoUrl: urlData.publicUrl,
        },
      }
    );

    if (moderationError) {
      console.error('Moderation error:', moderationError);
      // Don't throw - video is uploaded, moderation can be retried
    }

    return { success: true, videoId: videoData.id, moderationData };
  } catch (error) {
    console.error('Upload video error:', error);
    return { success: false, error };
  }
}

// Search functions
export async function searchVideos(query: string) {
  const { data, error } = await supabase.rpc('search_videos', {
    search_query: query,
  });

  if (error) {
    console.error('Search videos error:', error);
    return [];
  }

  return data;
}

export async function searchUsers(query: string) {
  const { data, error } = await supabase.rpc('search_users', {
    search_query: query,
  });

  if (error) {
    console.error('Search users error:', error);
    return [];
  }

  return data;
}

// Get videos for map
export async function getVideosForMap(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number
) {
  const { data, error } = await supabase
    .from('videos')
    .select('*')
    .eq('moderation_status', 'approved')
    .gte('location_latitude', minLat)
    .lte('location_latitude', maxLat)
    .gte('location_longitude', minLng)
    .lte('location_longitude', maxLng);

  if (error) {
    console.error('Get videos for map error:', error);
    return [];
  }

  return data;
}
