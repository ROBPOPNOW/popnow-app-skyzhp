import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';

// Bunny.net Configuration - Read from app.json extra config
const BUNNY_STORAGE_ZONE_NAME = Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME || '';
const BUNNY_STORAGE_API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STORAGE_API_KEY || '';
const BUNNY_CDN_HOSTNAME = Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_CDN_HOSTNAME || '';
const BUNNY_STREAM_LIBRARY_ID = Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID || '';
const BUNNY_STREAM_API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_API_KEY || '';
const BUNNY_STREAM_CDN_HOSTNAME = Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME || '';

// Optional: Token authentication key (if enabled in Bunny.net Stream)
const BUNNY_STREAM_TOKEN_AUTH_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_TOKEN_AUTH_KEY || '';

// Storage API Base URL
const STORAGE_API_BASE = 'https://storage.bunnycdn.com';
const STREAM_API_BASE = 'https://video.bunnycdn.com/library';

// Log configuration on module load (without exposing sensitive keys)
console.log('Bunny.net Configuration:', {
  hasStorageZone: !!BUNNY_STORAGE_ZONE_NAME,
  hasStorageKey: !!BUNNY_STORAGE_API_KEY,
  hasCDNHostname: !!BUNNY_CDN_HOSTNAME,
  hasStreamLibraryId: !!BUNNY_STREAM_LIBRARY_ID,
  hasStreamKey: !!BUNNY_STREAM_API_KEY,
  hasStreamCDN: !!BUNNY_STREAM_CDN_HOSTNAME,
  hasTokenAuthKey: !!BUNNY_STREAM_TOKEN_AUTH_KEY,
  streamCDN: BUNNY_STREAM_CDN_HOSTNAME || 'NOT SET',
});

/**
 * Create a new video in Bunny.net Stream (for transcoding)
 * @param title - Title of the video
 * @param isPremium - Whether the user is premium (disables watermark for premium users)
 * @param collectionId - Optional collection ID to organize videos
 * @returns Video object with GUID
 */
export async function createStreamVideo(
  title: string,
  isPremium: boolean = false,
  collectionId?: string
): Promise<{ guid: string; libraryId: number }> {
  try {
    // SELECT LIBRARY AND API KEY BASED ON PREMIUM STATUS
    const libraryId = isPremium 
      ? Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_PREMIUM_LIBRARY_ID 
      : Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID;
    
    const apiKey = isPremium
      ? Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_PREMIUM_API_KEY 
      : Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_API_KEY;

    // Validate credentials BEFORE attempting upload
    if (!apiKey) {
      const errorMsg = isPremium
        ? 'Premium API key is missing. Please check EXPO_PUBLIC_BUNNY_PREMIUM_API_KEY in your .env file'
        : 'Free API key is missing. Please check EXPO_PUBLIC_BUNNY_STREAM_API_KEY in your .env file';
      console.error('❌', errorMsg);
      throw new Error(errorMsg);
    }

    if (!libraryId) {
      const errorMsg = isPremium 
        ? 'Premium library ID is missing. Please check EXPO_PUBLIC_BUNNY_PREMIUM_LIBRARY_ID in your .env file'
        : 'Free library ID is missing. Please check EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID in your .env file';
      console.error('❌', errorMsg);
      throw new Error(errorMsg);
    }

    if (apiKey.length < 20) {
      const errorMsg = 'Bunny.net API key appears invalid (too short)';
      console.error('❌', errorMsg);
      throw new Error(errorMsg);
    }

    // Construct API URL with selected library ID
    const uploadUrl = `https://video.bunnycdn.com/library/${libraryId}/videos`;

    const requestBody = {
      title,
      collectionId,
    };

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'AccessKey': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Upload failed');
      console.error('  - Status:', response.status);
      console.error('  - Response:', errorText);
      
      if (response.status === 404) {
        throw new Error(`Bunny.net endpoint not found (404). Verify library ID is correct: ${libraryId}`);
      } else if (response.status === 401 || response.status === 403) {
        throw new Error(`Authentication failed for ${isPremium ? 'Premium' : 'Free'} library. Verify your ${isPremium ? 'EXPO_PUBLIC_BUNNY_PREMIUM_API_KEY' : 'EXPO_PUBLIC_BUNNY_STREAM_API_KEY'} is correct.`);
      } else {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }
    }

    const data = await response.json();
    
    return {
      guid: data.guid,
      libraryId: parseInt(libraryId),
    };
  } catch (error: any) {
    console.error('❌ Error creating stream video:', error.message);
    throw error;
  }
}

/**
 * Upload video content to Bunny.net Stream for transcoding
 * @param videoId - GUID of the video from createStreamVideo
 * @param videoUri - Local URI of the video file
 */
export async function uploadToStream(
  videoId: string,
  videoUri: string,
  isPremium: boolean = false
): Promise<void> {
  try {
    const libraryId = isPremium 
      ? Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_PREMIUM_LIBRARY_ID 
      : Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID;
    
    const apiKey = isPremium
      ? Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_PREMIUM_API_KEY 
      : Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_API_KEY;

    if (!apiKey) {
      throw new Error(isPremium ? 'Premium API key is missing' : 'Free API key is missing');
    }

    if (!libraryId) {
      throw new Error(isPremium ? 'Premium library ID is missing' : 'Free library ID is missing');
    }

    const fileInfo = await FileSystem.getInfoAsync(videoUri);
    if (!fileInfo.exists) {
      throw new Error('Video file not found');
    }

    console.log('📤 Upload starting:', {
      videoId,
      fileSize: fileInfo.size,
      uri: videoUri,
      isPremium,
      libraryId,
    });

    const uploadUrl = `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`;

    // Read file as base64 and upload via fetch with proper binary body
    const base64 = await FileSystem.readAsStringAsync(videoUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Convert base64 to Uint8Array
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    console.log('📤 Uploading', bytes.length, 'bytes to Bunny.net...');

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': apiKey,
        'Content-Type': 'application/octet-stream',
      },
      body: bytes,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Upload failed');
      console.error('  - Status:', response.status);
      console.error('  - Body:', errorText);
      
      if (response.status === 404) {
        throw new Error('Video not found on Bunny.net (404). The video may not have been created properly.');
      } else if (response.status === 401 || response.status === 403) {
        throw new Error('Authentication failed. Verify your API key has upload permissions.');
      } else {
        throw new Error(`Upload failed with status: ${response.status}`);
      }
    }

    console.log('✅ Upload complete, status:', response.status);
  } catch (error: any) {
    console.error('❌ Error uploading to stream:', error.message);
    throw error;
  }
}

/**
 * Get the status of a video in Bunny.net Stream
 * @param videoId - GUID of the video
 * @returns Video status object
 */
export async function getVideoStatus(videoId: string, isPremium: boolean = false): Promise<any> {
  try {
    // SELECT LIBRARY AND API KEY BASED ON PREMIUM STATUS
    const libraryId = isPremium 
      ? Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_PREMIUM_LIBRARY_ID 
      : Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID;
    
    const apiKey = isPremium
      ? Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_PREMIUM_API_KEY 
      : Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_API_KEY;

    if (!apiKey || !libraryId) {
      throw new Error('Missing API credentials for video status check');
    }

    const cleanVideoId = videoId.split('/').pop()?.split('?')[0] || videoId;
    const statusUrl = `https://video.bunnycdn.com/library/${libraryId}/videos/${cleanVideoId}`;

    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'AccessKey': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get video status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error('Error getting video status:', error);
    throw error;
  }
}

/**
 * Generate a signed token for Bunny.net Stream video access
 * @param videoId - GUID of the video
 * @param expirationTime - Expiration time in seconds (default: 1 hour)
 * @returns Signed token
 */
function generateStreamToken(videoId: string, expirationTime: number = 3600): string {
  if (!BUNNY_STREAM_TOKEN_AUTH_KEY) {
    return '';
  }

  try {
    // Calculate expiration timestamp
    const expires = Math.floor(Date.now() / 1000) + expirationTime;
    
    // Create the signature base string
    const signatureBase = `${BUNNY_STREAM_TOKEN_AUTH_KEY}${videoId}${expires}`;
    
    // Generate SHA256 hash (simplified version - in production use crypto library)
    const hash = simpleHash(signatureBase);
    
    return `${hash}-${expires}`;
  } catch (error) {
    console.error('Error generating stream token:', error);
    return '';
  }
}

/**
 * Simple hash function (for demonstration - use proper crypto in production)
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get the playback URL for a video in Bunny.net Stream
 * @param videoId - GUID of the video
 * @param libraryId - Library ID (517995=Free, 597832=Premium) - optional, defaults to Free
 * @param useTokenAuth - Whether to use token authentication (default: false)
 * @returns CDN URL for video playback (HLS playlist)
 */
export function getVideoPlaybackUrl(videoId: string, libraryId?: number, useTokenAuth: boolean = false): string {
  // Determine if this is premium based on library ID
  const isPremium = libraryId === 597832;
  // SELECT CDN HOSTNAME BASED ON LIBRARY ID
  const cdnHostname = isPremium
    ? Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_PREMIUM_CDN_HOSTNAME
    : Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME;
  
  // Ensure we have the CDN hostname configured
  if (!cdnHostname) {
    console.error('❌ CDN hostname is not configured!');
    console.error(isPremium 
      ? 'Please set EXPO_PUBLIC_BUNNY_PREMIUM_CDN_HOSTNAME in your .env file'
      : 'Please set EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME in your .env file'
    );
    return '';
  }
  
  // Clean the videoId (remove any URL parts if present)
  const cleanVideoId = videoId.split('/').pop()?.split('?')[0] || videoId;
  
  // Base playback URL
  let playbackUrl = `https://${cdnHostname}/${cleanVideoId}/playlist.m3u8`;
  
  // Add token authentication if enabled and configured
  if (useTokenAuth && BUNNY_STREAM_TOKEN_AUTH_KEY) {
    const token = generateStreamToken(cleanVideoId);
    if (token) {
      playbackUrl += `?token=${token}`;
    }
  }
  
  return playbackUrl;
}

/**
 * Extract video ID from various URL formats
 * Handles:
 * - https://vz-xxxxx.b-cdn.net/{video_id}/playlist.m3u8
 * - https://vz-xxxxx.b-cdn.net/{video_id}/playlist.m3u8?v=Version_ID
 * - Just the video_id itself
 * @param videoUrl - Video URL or ID
 * @returns Clean video ID
 */
export function extractVideoId(videoUrl: string): string {
  // If it's already just an ID (no slashes or dots), return it
  if (!videoUrl.includes('/') && !videoUrl.includes('.')) {
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
      return part;
    }
  }
  
  // If no UUID found, return the last meaningful part
  return parts[parts.length - 1] || videoUrl;
}

/**
 * Get the direct MP4 download URL for a video in Bunny.net Stream
 * 
 * IMPORTANT: This requires MP4 Fallback to be enabled in your BunnyNet Stream library settings.
 * 
 * According to BunnyNet documentation:
 * - MP4 fallback must be enabled in the encoding tab of your video library
 * - Only videos uploaded AFTER enabling MP4 fallback will have MP4 files
 * - MP4 fallbacks go up to a maximum of 720p quality
 * - Videos are not upscaled (e.g., a 480p video won't have a 720p fallback)
 * 
 * URL Pattern: https://{pull_zone_url}.b-cdn.net/{video_id}/play_{resolution_height}p.mp4
 * 
 * @param videoUrl - Video URL (HLS playlist URL) or video ID
 * @param useTokenAuth - Whether to use token authentication (default: false)
 * @returns CDN URL for direct MP4 download
 * @throws Error if MP4 fallback is not available or not configured
 */
export async function getVideoDownloadUrl(videoUrl: string, libraryId?: number, useTokenAuth: boolean = false): Promise<string> {
  // Determine CDN based on library ID
  const isPremium = libraryId === 597832;
  const cdnHostname = isPremium
    ? Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_PREMIUM_CDN_HOSTNAME
    : Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME;

  // Ensure we have the CDN hostname configured
  if (!cdnHostname) {
    console.error('❌ CDN hostname is not configured!');
    throw new Error(
      isPremium
        ? 'Premium CDN hostname is not configured.\n\nPlease set EXPO_PUBLIC_BUNNY_PREMIUM_CDN_HOSTNAME in your .env file.'
        : 'Free CDN hostname is not configured.\n\nPlease set EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME in your .env file.'
    );
  }
  
  // Extract clean video ID from URL
  const videoId = extractVideoId(videoUrl);
  console.log(`📥 Getting download URL for video: ${videoId}`);
  
  // Get video info from BunnyNet API to find available MP4 resolutions
  try {
    const apiKey = isPremium
      ? Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_PREMIUM_API_KEY
      : Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_API_KEY;
    
    const libId = isPremium
      ? Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_PREMIUM_LIBRARY_ID
      : Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID;

    if (!apiKey || !libId) {
      throw new Error('Missing API credentials');
    }

    // Fetch video details from BunnyNet API
    const videoInfoUrl = `https://video.bunnycdn.com/library/${libId}/videos/${videoId}`;
    const response = await fetch(videoInfoUrl, {
      method: 'GET',
      headers: {
        'AccessKey': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get video info: ${response.status}`);
    }

    const videoData = await response.json();
    
    // Check available MP4 resolutions from API response
    const availableResolutions = videoData.availableResolutions || '';
    console.log(`📊 Available resolutions: ${availableResolutions}`);
    
    if (!availableResolutions) {
      throw new Error('No MP4 resolutions available');
    }

   // Parse available resolutions (format: "240p,360p,480p,720p,1080p" or "240,360,480,720,1080")
const resolutions = availableResolutions.split(',').map((r: string) => {
  const trimmed = r.trim();
  // Remove 'p' suffix if present
  return trimmed.replace(/p$/i, '');
});

// Sort in descending order to get highest quality first
resolutions.sort((a: string, b: string) => parseInt(b) - parseInt(a));

// Use the highest available resolution
const bestResolution = resolutions[0];
console.log(`✅ Using resolution: ${bestResolution}p`);

// Construct MP4 URL
let mp4Url = `https://${cdnHostname}/${videoId}/play_${bestResolution}p.mp4`;
    
    // Add token authentication if enabled
    if (useTokenAuth && BUNNY_STREAM_TOKEN_AUTH_KEY) {
      const token = generateStreamToken(videoId);
      if (token) {
        mp4Url += `?token=${token}`;
      }
    }
    
    return mp4Url;
    
  } catch (error: any) {
    console.error('❌ Error getting download URL:', error);
    throw new Error(
      'Unable to download video: No MP4 file available for this video.\n\n' +
      '⚠️ IMPORTANT: MP4 Fallback Configuration Required\n\n' +
      'To enable video downloads, you must:\n\n' +
      '1. Log in to your BunnyNet account\n' +
      '2. Go to Stream → Your Video Library\n' +
      '3. Click on the "Encoding" tab\n' +
      '4. Enable "MP4 Fallback"\n' +
      '5. Re-upload your videos (only videos uploaded AFTER enabling MP4 fallback will have MP4 files)\n\n' +
      'Note: MP4 fallbacks are generated up to 720p maximum quality.\n\n' +
      'For more information, visit:\n' +
      'https://support.bunny.net/hc/en-us/articles/4413839729170-How-to-retrieve-an-MP4-URL-from-Stream'
    );
  }
}

/**
 * Get the thumbnail URL for a video in Bunny.net Stream
 * @param videoId - GUID of the video
 * @param libraryId - Library ID (517995=Free, 597832=Premium) - optional, defaults to Free
 * @param useTokenAuth - Whether to use token authentication (default: false)
 * @returns CDN URL for video thumbnail
 */
export function getVideoThumbnailUrl(videoId: string, libraryId?: number, useTokenAuth: boolean = false): string {
  const cleanVideoId = extractVideoId(videoId);
  if (!cleanVideoId) {
    console.error('Invalid video ID for thumbnail:', videoId);
    return '';
  }

  // Determine CDN based on library ID
  const isPremium = libraryId === 597832;
  const cdnHostname = isPremium
    ? Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_PREMIUM_CDN_HOSTNAME
    : Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME;

  // Base thumbnail URL
  let thumbnailUrl = `https://${cdnHostname}/${cleanVideoId}/thumbnail.jpg`;

  if (useTokenAuth) {
    const token = generateStreamToken(cleanVideoId);
    if (token) {
      thumbnailUrl += `?token=${token}`;
    }
  }
  
  return thumbnailUrl;
}

/**
 * Delete a video from Bunny.net Stream
 * This function now properly deletes videos from Bunny.net storage
 * @param videoId - GUID of the video or full video URL
 * @returns Promise<boolean> - true if deletion was successful
 */
export async function deleteStreamVideo(videoId: string, isPremium: boolean = false): Promise<void> {
  try {
    // SELECT LIBRARY AND API KEY BASED ON PREMIUM STATUS
    const libraryId = isPremium 
      ? Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_PREMIUM_LIBRARY_ID 
      : Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID;
    
    const apiKey = isPremium
      ? Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_PREMIUM_API_KEY 
      : Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_API_KEY;

    if (!apiKey || !libraryId) {
      throw new Error('Missing API credentials for video deletion');
    }

    // Clean the videoId
    const cleanVideoId = videoId.split('/').pop()?.split('?')[0] || videoId;

    const deleteUrl = `https://video.bunnycdn.com/library/${libraryId}/videos/${cleanVideoId}`;

    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'AccessKey': apiKey,
      },
    });

    if (!response.ok && response.status !== 404) {
      const errorData = await response.json();
      console.error('❌ Failed to delete video:', response.status);
      console.error('Error details:', errorData);
      throw new Error(`Failed to delete video: ${response.status}`);
    }
  } catch (error: any) {
    console.error('❌ Error deleting video from Bunny.net:', error);
    throw error;
  }
}