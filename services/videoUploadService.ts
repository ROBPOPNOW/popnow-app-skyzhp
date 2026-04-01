import { supabase } from './supabase';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

interface UploadVideoParams {
  videoUri: string;
  userId: string;
  isPremium: boolean;
  isFulfillment?: boolean;
  requestId?: string;
}

export const uploadVideoWithWatermark = async ({
  videoUri,
  userId,
  isPremium,
  isFulfillment = false,
  requestId,
}: UploadVideoParams) => {
  try {
    let finalVideoUri = videoUri;

    // Add watermark ONLY for non-premium users
    if (!isPremium) {
      console.log('Adding watermark for free user...');
      finalVideoUri = await addWatermarkToVideo(videoUri);
    } else {
      console.log('Premium user - skipping watermark');
    }

    // Upload video to Supabase Storage
    const videoFileName = `${userId}_${Date.now()}.mp4`;
    const videoFile = await fetch(finalVideoUri);
    const videoBlob = await videoFile.blob();

    const { data: videoData, error: videoError } = await supabase.storage
      .from('videos')
      .upload(videoFileName, videoBlob, {
        contentType: 'video/mp4',
        cacheControl: '3600',
      });

    if (videoError) throw videoError;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('videos')
      .getPublicUrl(videoFileName);

    // Generate thumbnail
    const thumbnailUri = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: 1000,
    });

    // Upload thumbnail
    const thumbnailFileName = `${userId}_${Date.now()}_thumb.jpg`;
    const thumbnailFile = await fetch(thumbnailUri.uri);
    const thumbnailBlob = await thumbnailFile.blob();

    const { data: thumbnailData, error: thumbnailError } = await supabase.storage
      .from('thumbnails')
      .upload(thumbnailFileName, thumbnailBlob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
      });

    if (thumbnailError) throw thumbnailError;

    const { data: { publicUrl: thumbnailUrl } } = supabase.storage
      .from('thumbnails')
      .getPublicUrl(thumbnailFileName);

    // Insert video record into database
    const { data: videoRecord, error: insertError } = await supabase
      .from('videos')
      .insert({
        user_id: userId,
        video_url: publicUrl,
        thumbnail_url: thumbnailUrl,
        is_fulfillment: isFulfillment,
        request_id: requestId || null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return {
      success: true,
      video: videoRecord,
      hadWatermark: !isPremium,
    };
  } catch (error) {
    console.error('Error uploading video:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Add POPNOW watermark to video (for free users only)
 * Note: This is a placeholder. Full implementation requires video processing library
 * like FFmpeg or a backend service.
 */
const addWatermarkToVideo = async (videoUri: string): Promise<string> => {
  // IMPORTANT: Video watermarking requires FFmpeg or backend processing
  // This is a simplified example. You'll need to implement actual video processing.
  
  // Option 1: Use expo-av + canvas overlay (complex)
  // Option 2: Use FFmpeg via expo-ffmpeg or react-native-ffmpeg
  // Option 3: Send to backend service for processing
  
  // For now, return original video
  // TODO: Implement actual watermarking
  console.warn('Watermark implementation pending - requires FFmpeg');
  
  // Pseudocode for FFmpeg approach:
  /*
  const command = `-i ${videoUri} -vf "drawtext=text='POPNOW':fontcolor=white@0.3:fontsize=24:x=W-tw-10:y=H-th-10" -codec:a copy ${outputUri}`;
  await FFmpeg.execute(command);
  return outputUri;
  */
  
  return videoUri;
};

// Helper to check if user has premium before upload
export const checkPremiumBeforeUpload = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('users')
    .select('is_premium')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error checking premium status:', error);
    return false;
  }

  return data?.is_premium || false;
};
