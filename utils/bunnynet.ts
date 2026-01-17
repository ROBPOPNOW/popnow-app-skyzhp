
import * as FileSystem from 'expo-file-system/legacy';

// Bunny.net Configuration
const BUNNY_STORAGE_ZONE_NAME = process.env.EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME || '';
const BUNNY_STORAGE_API_KEY = process.env.EXPO_PUBLIC_BUNNY_STORAGE_API_KEY || '';
const BUNNY_CDN_HOSTNAME = process.env.EXPO_PUBLIC_BUNNY_CDN_HOSTNAME || '';
const BUNNY_STREAM_LIBRARY_ID = process.env.EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID || '';
const BUNNY_STREAM_API_KEY = process.env.EXPO_PUBLIC_BUNNY_STREAM_API_KEY || '';
const BUNNY_STREAM_CDN_HOSTNAME = process.env.EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME || '';

// Optional: Token authentication key (if enabled in Bunny.net Stream)
const BUNNY_STREAM_TOKEN_AUTH_KEY = process.env.EXPO_PUBLIC_BUNNY_STREAM_TOKEN_AUTH_KEY || '';

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
 * Upload a video file to Bunny.net Storage Zone
 * @param videoUri - Local URI of the video file
 * @param fileName - Name for the file in storage
 * @returns CDN URL of the uploaded video
 */
export async function uploadVideoToBunny(
  videoUri: string,
  fileName: string
): Promise<string> {
  try {
    console.log('Uploading video to Bunny.net Storage:', fileName);

    // Read the file as base64
    const fileContent = await FileSystem.readAsStringAsync(videoUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Convert base64 to binary
    const binaryContent = atob(fileContent);
    const bytes = new Uint8Array(binaryContent.length);
    for (let i = 0; i < binaryContent.length; i++) {
      bytes[i] = binaryContent.charCodeAt(i);
    }

    // Upload to Bunny Storage
    const uploadUrl = `${STORAGE_API_BASE}/${BUNNY_STORAGE_ZONE_NAME}/videos/${fileName}`;
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': BUNNY_STORAGE_API_KEY,
        'Content-Type': 'application/octet-stream',
      },
      body: bytes,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    // Return CDN URL
    const cdnUrl = `https://${BUNNY_CDN_HOSTNAME}/videos/${fileName}`;
    console.log('Video uploaded successfully:', cdnUrl);
    return cdnUrl;
  } catch (error) {
    console.error('Error uploading to Bunny.net:', error);
    throw error;
  }
}

/**
 * Create a new video in Bunny.net Stream (for transcoding)
 * @param title - Title of the video
 * @param collectionId - Optional collection ID to organize videos
 * @returns Video object with GUID
 */
export async function createStreamVideo(
  title: string,
  collectionId?: string
): Promise<{ guid: string; libraryId: number }> {
  try {
    console.log('Creating video in Bunny Stream:', title);

    if (!BUNNY_STREAM_LIBRARY_ID || !BUNNY_STREAM_API_KEY) {
      throw new Error('Bunny Stream configuration is missing. Please check EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID and EXPO_PUBLIC_BUNNY_STREAM_API_KEY');
    }

    const response = await fetch(
      `${STREAM_API_BASE}/${BUNNY_STREAM_LIBRARY_ID}/videos`,
      {
        method: 'POST',
        headers: {
          'AccessKey': BUNNY_STREAM_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          collectionId,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Bunny Stream API Error:', errorText);
      throw new Error(`Failed to create video: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Video created in Stream:', data.guid);
    return {
      guid: data.guid,
      libraryId: parseInt(BUNNY_STREAM_LIBRARY_ID),
    };
  } catch (error) {
    console.error('Error creating Stream video:', error);
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
  videoUri: string
): Promise<void> {
  try {
    console.log('Uploading video to Stream for transcoding:', videoId);

    if (!BUNNY_STREAM_LIBRARY_ID || !BUNNY_STREAM_API_KEY) {
      throw new Error('Bunny Stream configuration is missing');
    }

    // Read the file
    const fileInfo = await FileSystem.getInfoAsync(videoUri);
    if (!fileInfo.exists) {
      throw new Error('Video file not found');
    }

    // Upload using direct upload
    const uploadUrl = `${STREAM_API_BASE}/${BUNNY_STREAM_LIBRARY_ID}/videos/${videoId}`;
    
    const uploadResult = await FileSystem.uploadAsync(uploadUrl, videoUri, {
      httpMethod: 'PUT',
      headers: {
        'AccessKey': BUNNY_STREAM_API_KEY,
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });

    if (uploadResult.status !== 200) {
      throw new Error(`Upload failed with status: ${uploadResult.status}`);
    }

    console.log('Video uploaded to Stream successfully');
  } catch (error) {
    console.error('Error uploading to Stream:', error);
    throw error;
  }
}

/**
 * Get the status of a video in Bunny.net Stream
 * @param videoId - GUID of the video
 * @returns Video status object
 */
export async function getVideoStatus(videoId: string): Promise<{
  status: number;
  title: string;
  length: number;
  thumbnailFileName: string;
}> {
  try {
    if (!BUNNY_STREAM_LIBRARY_ID || !BUNNY_STREAM_API_KEY) {
      throw new Error('Bunny Stream configuration is missing');
    }

    const response = await fetch(
      `${STREAM_API_BASE}/${BUNNY_STREAM_LIBRARY_ID}/videos/${videoId}`,
      {
        headers: {
          'AccessKey': BUNNY_STREAM_API_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get video status: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      status: data.status, // 0=Queued, 1=Processing, 2=Encoding, 3=Finished, 4=Resolution Finished, 5=Failed
      title: data.title,
      length: data.length,
      thumbnailFileName: data.thumbnailFileName,
    };
  } catch (error) {
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
    console.log('⚠️ Token authentication key not configured, returning empty token');
    return '';
  }

  try {
    // Calculate expiration timestamp
    const expires = Math.floor(Date.now() / 1000) + expirationTime;
    
    // Create the signature base string
    const signatureBase = `${BUNNY_STREAM_TOKEN_AUTH_KEY}${videoId}${expires}`;
    
    // Generate SHA256 hash (simplified version - in production use crypto library)
    // For now, we'll use a basic implementation
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
 * @param useTokenAuth - Whether to use token authentication (default: false)
 * @returns CDN URL for video playback (HLS playlist)
 */
export function getVideoPlaybackUrl(videoId: string, useTokenAuth: boolean = false): string {
  // Ensure we have the CDN hostname configured
  if (!BUNNY_STREAM_CDN_HOSTNAME) {
    console.error('❌ BUNNY_STREAM_CDN_HOSTNAME is not configured!');
    console.error('Please set EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME in your .env file');
    console.error('Example: EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=vz-xxxxx-xxx.b-cdn.net');
    return '';
  }
  
  // Clean the videoId (remove any URL parts if present)
  const cleanVideoId = videoId.split('/').pop()?.split('?')[0] || videoId;
  
  // Base playback URL
  let playbackUrl = `https://${BUNNY_STREAM_CDN_HOSTNAME}/${cleanVideoId}/playlist.m3u8`;
  
  // Add token authentication if enabled and configured
  if (useTokenAuth && BUNNY_STREAM_TOKEN_AUTH_KEY) {
    const token = generateStreamToken(cleanVideoId);
    if (token) {
      playbackUrl += `?token=${token}`;
      console.log('🔐 Generated signed playback URL with token');
    }
  }
  
  console.log('🎬 Generated playback URL:', playbackUrl);
  return playbackUrl;
}

/**
 * Get video information from BunnyNet Stream API including available MP4 URLs
 * @param videoId - GUID of the video
 * @returns Video information including MP4 URLs if available
 */
export async function getVideoInfo(videoId: string): Promise<{
  guid: string;
  title: string;
  status: number;
  availableResolutions: string;
  mp4Urls?: { [resolution: string]: string };
}> {
  try {
    if (!BUNNY_STREAM_LIBRARY_ID || !BUNNY_STREAM_API_KEY) {
      throw new Error('Bunny Stream configuration is missing');
    }

    const cleanVideoId = videoId.split('/').pop()?.split('?')[0] || videoId;
    
    console.log('🔍 Fetching video info from BunnyNet API for:', cleanVideoId);
    
    const response = await fetch(
      `${STREAM_API_BASE}/${BUNNY_STREAM_LIBRARY_ID}/videos/${cleanVideoId}`,
      {
        headers: {
          'AccessKey': BUNNY_STREAM_API_KEY,
          'accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ BunnyNet API Error:', errorText);
      throw new Error(`Failed to get video info: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Video info retrieved:', {
      guid: data.guid,
      status: data.status,
      availableResolutions: data.availableResolutions,
    });

    return {
      guid: data.guid,
      title: data.title,
      status: data.status,
      availableResolutions: data.availableResolutions,
      mp4Urls: data.mp4Urls,
    };
  } catch (error) {
    console.error('❌ Error getting video info:', error);
    throw error;
  }
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
export async function getVideoDownloadUrl(videoUrl: string, useTokenAuth: boolean = false): Promise<string> {
  console.log('🎬 === STARTING MP4 DOWNLOAD URL GENERATION ===');
  console.log('Input videoUrl:', videoUrl);
  
  // Ensure we have the CDN hostname configured
  if (!BUNNY_STREAM_CDN_HOSTNAME) {
    console.error('❌ BUNNY_STREAM_CDN_HOSTNAME is not configured!');
    throw new Error(
      'BunnyNet CDN hostname is not configured.\n\n' +
      'Please set EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME in your .env file.\n' +
      'Example: EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=vz-xxxxx-xxx.b-cdn.net'
    );
  }
  
  // Extract clean video ID from URL
  const videoId = extractVideoId(videoUrl);
  console.log('✅ Extracted video ID:', videoId);
  
  // List of resolutions to try, in descending order
  // According to BunnyNet docs, MP4 fallbacks go up to 720p max
  const resolutionsToTry = ['720', '480', '360', '240'];
  
  console.log('🔍 Will attempt resolutions:', resolutionsToTry.join('p, ') + 'p');
  
  // Try each resolution until we find one that works
  for (const resolution of resolutionsToTry) {
    try {
      console.log(`\n📡 Attempting resolution: ${resolution}p`);
      
      // Construct MP4 URL according to BunnyNet pattern:
      // https://{pull_zone_url}.b-cdn.net/{video_id}/play_{resolution_height}p.mp4
      let mp4Url = `https://${BUNNY_STREAM_CDN_HOSTNAME}/${videoId}/play_${resolution}p.mp4`;
      
      console.log('🔗 Constructed MP4 URL:', mp4Url);
      
      // Add token authentication if enabled
      if (useTokenAuth && BUNNY_STREAM_TOKEN_AUTH_KEY) {
        const token = generateStreamToken(videoId);
        if (token) {
          mp4Url += `?token=${token}`;
          console.log('🔐 Added token authentication');
        }
      }
      
      // Test if the URL is accessible with a HEAD request
      console.log('🧪 Testing URL accessibility...');
      const testResponse = await fetch(mp4Url, { 
        method: 'HEAD',
        // Add a timeout to prevent hanging
      });
      
      console.log(`📊 Response status: ${testResponse.status}`);
      
      if (testResponse.ok) {
        console.log(`✅ SUCCESS! Found working MP4 URL at ${resolution}p`);
        console.log('🎉 Final download URL:', mp4Url);
        return mp4Url;
      } else if (testResponse.status === 403) {
        console.log('⚠️ 403 Forbidden - May need token authentication');
        
        // If we got 403 and haven't tried with token yet, try with token
        if (!useTokenAuth && BUNNY_STREAM_TOKEN_AUTH_KEY) {
          console.log('🔄 Retrying with token authentication...');
          return getVideoDownloadUrl(videoUrl, true);
        }
      } else if (testResponse.status === 404) {
        console.log(`❌ 404 Not Found - ${resolution}p MP4 not available, trying next resolution...`);
        continue;
      } else {
        console.log(`⚠️ Unexpected status ${testResponse.status}, trying next resolution...`);
        continue;
      }
      
    } catch (error: any) {
      console.log(`⚠️ Error testing ${resolution}p:`, error.message);
      // Continue to next resolution
      continue;
    }
  }
  
  // If we've tried all resolutions and none worked, provide helpful error message
  console.error('❌ === NO WORKING MP4 URL FOUND ===');
  console.error('All resolution attempts failed');
  
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

/**
 * Get the thumbnail URL for a video in Bunny.net Stream
 * @param videoId - GUID of the video
 * @param useTokenAuth - Whether to use token authentication (default: false)
 * @returns CDN URL for video thumbnail
 */
export function getVideoThumbnailUrl(videoId: string, useTokenAuth: boolean = false): string {
  // Ensure we have the CDN hostname configured
  if (!BUNNY_STREAM_CDN_HOSTNAME) {
    console.error('❌ BUNNY_STREAM_CDN_HOSTNAME is not configured!');
    return '';
  }
  
  // Clean the videoId
  const cleanVideoId = videoId.split('/').pop()?.split('?')[0] || videoId;
  
  // Base thumbnail URL
  let thumbnailUrl = `https://${BUNNY_STREAM_CDN_HOSTNAME}/${cleanVideoId}/thumbnail.jpg`;
  
  // Add token authentication if enabled and configured
  if (useTokenAuth && BUNNY_STREAM_TOKEN_AUTH_KEY) {
    const token = generateStreamToken(cleanVideoId);
    if (token) {
      thumbnailUrl += `?token=${token}`;
    }
  }
  
  console.log('🖼️ Generated thumbnail URL:', thumbnailUrl);
  return thumbnailUrl;
}

/**
 * Test if a video URL is accessible
 * @param videoId - GUID of the video
 * @returns Promise<boolean> - true if accessible, false otherwise
 */
export async function testVideoAccessibility(videoId: string): Promise<{
  accessible: boolean;
  statusCode?: number;
  error?: string;
  details?: string;
}> {
  try {
    const playbackUrl = getVideoPlaybackUrl(videoId, false);
    if (!playbackUrl) {
      return {
        accessible: false,
        error: 'CDN hostname not configured',
        details: 'EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME is missing',
      };
    }

    console.log('🔍 Testing video accessibility:', playbackUrl);
    
    const response = await fetch(playbackUrl, {
      method: 'HEAD',
    });

    console.log('📊 Video accessibility test result:', {
      url: playbackUrl,
      status: response.status,
      ok: response.ok,
    });

    // If we get a 403, try with token authentication
    if (response.status === 403 && BUNNY_STREAM_TOKEN_AUTH_KEY) {
      console.log('🔐 403 detected, retrying with token authentication...');
      const tokenUrl = getVideoPlaybackUrl(videoId, true);
      const tokenResponse = await fetch(tokenUrl, {
        method: 'HEAD',
      });
      
      console.log('📊 Token auth test result:', {
        url: tokenUrl,
        status: tokenResponse.status,
        ok: tokenResponse.ok,
      });

      return {
        accessible: tokenResponse.ok,
        statusCode: tokenResponse.status,
        details: tokenResponse.ok 
          ? 'Accessible with token authentication' 
          : 'Not accessible even with token authentication',
      };
    }

    return {
      accessible: response.ok,
      statusCode: response.status,
      details: response.ok 
        ? 'Accessible without authentication' 
        : response.status === 403 
          ? 'Access denied - check Bunny.net Stream security settings' 
          : 'Unknown error',
    };
  } catch (error: any) {
    console.error('❌ Video accessibility test failed:', error);
    return {
      accessible: false,
      error: error.message || 'Unknown error',
      details: 'Network error or invalid URL',
    };
  }
}

/**
 * Update video security settings via API
 * @param videoId - GUID of the video
 * @param enableTokenAuth - Whether to enable token authentication
 */
export async function updateVideoSecurity(
  videoId: string,
  enableTokenAuth: boolean = false
): Promise<void> {
  try {
    if (!BUNNY_STREAM_LIBRARY_ID || !BUNNY_STREAM_API_KEY) {
      throw new Error('Bunny Stream configuration is missing');
    }

    const response = await fetch(
      `${STREAM_API_BASE}/${BUNNY_STREAM_LIBRARY_ID}/videos/${videoId}`,
      {
        method: 'POST',
        headers: {
          'AccessKey': BUNNY_STREAM_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enableTokenAuthentication: enableTokenAuth,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to update video security: ${response.statusText}`);
    }

    console.log('Video security settings updated successfully');
  } catch (error) {
    console.error('Error updating video security:', error);
    throw error;
  }
}

/**
 * Delete a video from Bunny.net Stream
 * This function now properly deletes videos from Bunny.net storage
 * @param videoId - GUID of the video or full video URL
 * @returns Promise<boolean> - true if deletion was successful
 */
export async function deleteStreamVideo(videoId: string): Promise<boolean> {
  try {
    console.log('🗑️ === DELETING VIDEO FROM BUNNY.NET ===');
    console.log('Input:', videoId);
    
    if (!BUNNY_STREAM_LIBRARY_ID || !BUNNY_STREAM_API_KEY) {
      console.error('❌ Bunny Stream configuration is missing');
      throw new Error('Bunny Stream configuration is missing');
    }

    // Extract clean video ID from URL if needed
    const cleanVideoId = extractVideoId(videoId);
    console.log('Clean video ID:', cleanVideoId);

    const deleteUrl = `${STREAM_API_BASE}/${BUNNY_STREAM_LIBRARY_ID}/videos/${cleanVideoId}`;
    console.log('DELETE URL:', deleteUrl);

    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'AccessKey': BUNNY_STREAM_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to delete video: ${response.status} ${response.statusText}`);
      console.error('Error details:', errorText);
      throw new Error(`Failed to delete video: ${response.statusText}`);
    }

    console.log('✅ Video deleted successfully from Bunny.net');
    return true;
  } catch (error) {
    console.error('❌ Error deleting video from Bunny.net:', error);
    // Return false instead of throwing to allow graceful degradation
    return false;
  }
}

/**
 * Get video statistics from Bunny.net Stream
 * @param videoId - GUID of the video
 * @returns Video statistics
 */
export async function getVideoStatistics(videoId: string): Promise<{
  viewsChart: any;
  watchTimeChart: any;
  countryViewCounts: any;
}> {
  try {
    if (!BUNNY_STREAM_LIBRARY_ID || !BUNNY_STREAM_API_KEY) {
      throw new Error('Bunny Stream configuration is missing');
    }

    const response = await fetch(
      `${STREAM_API_BASE}/${BUNNY_STREAM_LIBRARY_ID}/videos/${videoId}/statistics`,
      {
        headers: {
          'AccessKey': BUNNY_STREAM_API_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get statistics: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting video statistics:', error);
    throw error;
  }
}
