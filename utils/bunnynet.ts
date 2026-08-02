import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

// Bunny.net Configuration - Read from app.json extra config
const BUNNY_STREAM_LIBRARY_ID = Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID || '';
const BUNNY_STREAM_API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_API_KEY || '';
const BUNNY_STREAM_CDN_HOSTNAME = Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME || '';

// Optional: Token authentication key (if enabled in Bunny.net Stream)
const BUNNY_STREAM_TOKEN_AUTH_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_TOKEN_AUTH_KEY || '';

const STREAM_API_BASE = 'https://video.bunnycdn.com/library';

// Log configuration on module load (without exposing sensitive keys)
console.log('Bunny.net Configuration:', {
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

// ─────────────────────────────────────────────────────────────────────────
// TUS resumable upload (key-free) — replaces createStreamVideo()+uploadToStream()
// as a single call. Uploads directly to Bunny using a short-lived signed token from
// the `bunny-create-video` Edge Function; no Bunny AccessKey ever touches the client.
// Ported 1:1 from the verified TUS spike. Left createStreamVideo()/
// uploadToStream() above untouched as a fallback until this is wired in and confirmed.
// ─────────────────────────────────────────────────────────────────────────

const TUS_CREATE_URL = 'https://video.bunnycdn.com/tusupload';
const TUS_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per PATCH — same as the proven spike

function buildTusUploadMetadata(pairs: Record<string, string>): string {
  return Object.entries(pairs)
    .map(([key, value]) => `${key} ${btoa(value)}`)
    .join(',');
}

export interface TusUploadResult {
  guid: string;
  libraryId: number;
}

export interface TusUploadOptions {
  isPremium?: boolean;
  collectionId?: string;
  mimeType?: string; // defaults to 'video/mp4'
  /** Fires right after Bunny assigns a video ID, before the byte upload starts —
   *  lets the caller persist bunny_video_id early for cancel/cleanup safety. */
  onVideoCreated?: (result: TusUploadResult) => void | Promise<void>;
  /** Fires after each confirmed chunk. */
  onProgress?: (bytesUploaded: number, totalBytes: number) => void;
}

/**
 * Uploads a video directly to Bunny Stream via the TUS resumable protocol, using a
 * short-lived signed token from the `bunny-create-video` Supabase Edge Function.
 * No Bunny AccessKey is ever present on the client.
 *
 * Ported 1:1 from the verified TUS spike — same 4 steps, same PATCH
 * headers, same File/FileHandle chunked-read approach, same correctness checks.
 */
export async function uploadVideoViaTus(
  title: string,
  videoUri: string,
  options: TusUploadOptions = {}
): Promise<TusUploadResult> {
  const { isPremium = false, collectionId, mimeType = 'video/mp4', onVideoCreated, onProgress } = options;

  // Step 1: create the video server-side and get a short-lived TUS upload token
  console.log('🎬 [TUS] Calling bunny-create-video edge function...');
  const { data: createData, error: createError } = await supabase.functions.invoke(
    'bunny-create-video',
    { body: { title, isPremium, collectionId } }
  );
  if (createError) {
    throw new Error(`bunny-create-video failed: ${createError.message}`);
  }
  const { videoId, libraryId, authorizationSignature, authorizationExpire } = createData || {};
  if (!videoId || !authorizationSignature || !authorizationExpire) {
    throw new Error(`bunny-create-video returned incomplete data: ${JSON.stringify(createData)}`);
  }
  console.log('✅ [TUS] Video created:', videoId, 'libraryId:', libraryId);

  const result: TusUploadResult = { guid: videoId, libraryId: Number(libraryId) };
  if (onVideoCreated) {
    await onVideoCreated(result);
  }

  // Step 2: create the TUS upload resource on Bunny
  const file = new File(videoUri);
  const fileSize = file.size;

  console.log('📤 [TUS] Creating TUS upload resource on Bunny...');
  const uploadMetadata = buildTusUploadMetadata({ filetype: mimeType, title });
  const createResponse = await fetch(TUS_CREATE_URL, {
    method: 'POST',
    headers: {
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(fileSize),
      'Upload-Metadata': uploadMetadata,
      'AuthorizationSignature': authorizationSignature,
      'AuthorizationExpire': String(authorizationExpire),
      'VideoId': videoId,
      'LibraryId': String(libraryId),
    },
  });

  if (createResponse.status !== 201) {
    const errText = await createResponse.text();
    throw new Error(`TUS create failed: ${createResponse.status} ${errText}`);
  }

  let location = createResponse.headers.get('Location');
  if (!location) {
    throw new Error('TUS create response missing Location header');
  }
  if (location.startsWith('/')) {
    location = new URL(location, TUS_CREATE_URL).toString();
  }
  console.log('✅ [TUS] Upload resource created:', location);

  // Step 3: chunked PATCH loop using File/FileHandle for byte-range reads
  console.log(`📤 [TUS] Starting chunked upload — ${fileSize} bytes in ~${Math.ceil(fileSize / TUS_CHUNK_SIZE)} chunks`);
  const handle = file.open();
  let offset = 0;

  try {
    while (offset < fileSize) {
      const bytesToRead = Math.min(TUS_CHUNK_SIZE, fileSize - offset);
      handle.offset = offset;
      const chunk = handle.readBytes(bytesToRead);

      console.log(`  [TUS] readBytes(${bytesToRead}) at offset ${offset} → got ${chunk.byteLength} bytes (chunk.length=${chunk.length})`);

      if (chunk.byteLength === 0) {
        throw new Error(`readBytes returned 0 bytes at offset ${offset} — aborting to avoid a silent empty-body PATCH`);
      }

      // Sending `chunk` (Uint8Array) directly, not chunk.buffer — verified against the
      // installed RN source (Libraries/Network/convertRequestBody.js and
      // Libraries/Utilities/binaryToBase64.js): a Uint8Array is base64-encoded respecting
      // its own byteOffset/length, a raw ArrayBuffer is encoded whole with no trimming.
      // Uint8Array is the byte-exact option here.
      const patchResponse = await fetch(location, {
        method: 'PATCH',
        headers: {
          'Tus-Resumable': '1.0.0',
          'Upload-Offset': String(offset),
          'Content-Type': 'application/offset+octet-stream',
          'LibraryId': String(libraryId),
          'VideoId': videoId,
          'AuthorizationSignature': authorizationSignature,
          'AuthorizationExpire': String(authorizationExpire),
        },
        body: chunk,
      });

      if (!patchResponse.ok) {
        const errText = await patchResponse.text();
        throw new Error(`PATCH failed at offset ${offset}: ${patchResponse.status} ${errText}`);
      }

      const rawOffsetHeader = patchResponse.headers.get('Upload-Offset');
      console.log(`  [TUS] PATCH response — status ${patchResponse.status}, raw Upload-Offset header: "${rawOffsetHeader}"`);

      const newOffset = rawOffsetHeader ? parseInt(rawOffsetHeader, 10) : NaN;
      if (!rawOffsetHeader || Number.isNaN(newOffset)) {
        throw new Error(`Server response missing/invalid Upload-Offset header (got "${rawOffsetHeader}") — cannot confirm bytes were received`);
      }

      const expectedOffset = offset + chunk.byteLength;
      if (newOffset !== expectedOffset) {
        console.warn(`  [TUS] ⚠️ Offset mismatch — expected ${expectedOffset} (sent ${chunk.byteLength} bytes), server reports ${newOffset}`);
      }
      if (newOffset <= offset) {
        throw new Error(`Server did not advance offset (stuck at ${offset}) — likely an empty or rejected body, aborting`);
      }

      offset = newOffset;
      console.log(`  [TUS] ✅ Upload-Offset confirmed: ${offset} / ${fileSize} (${((offset / fileSize) * 100).toFixed(1)}%)`);
      onProgress?.(offset, fileSize);
    }
  } finally {
    handle.close();
  }

  console.log('✅ [TUS] Upload complete:', videoId);
  return result;
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
 * Get the status of a video via the `bunny-video-status` Edge Function — key-free
 * equivalent of getVideoStatus() above. Returns the same raw Bunny status JSON shape
 * (e.g. `status.status === 4` for finished), since the edge function is a pass-through.
 * Added alongside getVideoStatus(), which is left untouched as a fallback.
 */
export async function getVideoStatusViaEdgeFunction(videoId: string, isPremium: boolean = false): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke('bunny-video-status', {
      body: { videoId, isPremium },
    });

    if (error) {
      throw new Error(`bunny-video-status failed: ${error.message}`);
    }

    return data;
  } catch (error: any) {
    console.error('Error getting video status via edge function:', error);
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
 * Get the direct MP4 download URL via the `bunny-download-url` Edge Function — key-free
 * equivalent of getVideoDownloadUrl() above. Returns the same CDN mp4 URL shape
 * (`https://{cdnHostname}/{videoId}/play_{bestResolution}p.mp4`), since the edge function
 * mirrors the same resolution-selection logic. Note: unlike getVideoDownloadUrl(), this has
 * no useTokenAuth support — acceptable because neither current caller passes useTokenAuth,
 * so both paths already produce token-less URLs. Error messages are shorter/plainer here than
 * getVideoDownloadUrl()'s MP4-Fallback-setup instructions; that's an accepted UX downgrade on
 * the failure path only, not a functional gap.
 * Added alongside getVideoDownloadUrl(), which is left untouched as a fallback.
 */
export async function getDownloadUrlViaEdgeFunction(videoUrl: string, isPremium: boolean = false): Promise<string> {
  const { data, error } = await supabase.functions.invoke('bunny-download-url', {
    body: { videoUrl, isPremium },
  });

  if (error) {
    throw new Error(`bunny-download-url failed: ${error.message}`);
  }
  if (data?.error) {
    throw new Error(`bunny-download-url failed: ${data.error}`);
  }

  return data.downloadUrl;
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

/**
 * Delete a video from Bunny.net Stream via the `bunny-delete-video` Edge Function — key-free
 * equivalent of deleteStreamVideo() above. The edge function verifies the caller owns the
 * video (via pending_uploads/videos rows) before deleting, and treats a 404 from Bunny as
 * success, same as deleteStreamVideo() does.
 * Added alongside deleteStreamVideo(), which is left untouched as a fallback.
 */
export async function getDeleteVideoViaEdgeFunction(videoId: string, isPremium: boolean = false): Promise<void> {
  const { data, error } = await supabase.functions.invoke('bunny-delete-video', {
    body: { videoId, isPremium },
  });

  if (error) {
    throw new Error(`bunny-delete-video failed: ${error.message}`);
  }
  if (data?.error) {
    throw new Error(`bunny-delete-video failed: ${data.error}`);
  }
}