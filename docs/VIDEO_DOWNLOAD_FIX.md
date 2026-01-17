
# Video Download Fix - HLS to MP4 Conversion

## Problem Summary

Users were encountering an error when trying to download videos to their local photo album:

```
Error: This URL does not contain a valid asset type: file:///.../playlist.m3u8
Code: ERR_UNSUPPORTED_ASSET_TYPE
```

## Root Cause

The issue occurred because:

1. **BunnyNet Stream serves videos in HLS format** - The `getVideoPlaybackUrl()` function returns an HLS playlist URL (`.m3u8` file), which is designed for adaptive streaming, not local storage.

2. **Media Library doesn't support HLS** - The `expo-media-library`'s `createAssetAsync()` function only accepts standard video formats like MP4, MOV, etc. It cannot save HLS playlists (`.m3u8` files) to the device's photo library.

3. **Wrong URL was being used** - The download function was using the streaming URL instead of the direct MP4 download URL.

## Solution

### 1. Added New Function: `getVideoDownloadUrl()`

Created a new utility function in `utils/bunnynet.ts` that returns the direct MP4 download URL:

```typescript
export function getVideoDownloadUrl(videoId: string, useTokenAuth: boolean = false): string {
  const cleanVideoId = videoId.split('/').pop()?.split('?')[0] || videoId;
  
  // BunnyNet Stream provides direct MP4 access via the play.mp4 endpoint
  let downloadUrl = `https://${BUNNY_STREAM_CDN_HOSTNAME}/${cleanVideoId}/play.mp4`;
  
  if (useTokenAuth && BUNNY_STREAM_TOKEN_AUTH_KEY) {
    const token = generateStreamToken(cleanVideoId);
    if (token) {
      downloadUrl += `?token=${token}`;
    }
  }
  
  return downloadUrl;
}
```

**Key Points:**
- Uses BunnyNet's `/play.mp4` endpoint which returns the highest quality MP4 file
- Supports optional token authentication for secure access
- Returns a direct download URL compatible with `expo-media-library`

### 2. Updated Download Function

Modified `handleSaveVideo()` in `app/(tabs)/profile.tsx` to:

1. **Use the MP4 download URL** instead of the HLS playlist URL
2. **Add better error handling** for format-related issues
3. **Verify file type** after download to ensure it's a video
4. **Provide clearer error messages** to users

```typescript
// OLD (incorrect):
const playbackUrl = getVideoPlaybackUrl(videoUrl);

// NEW (correct):
const downloadUrl = getVideoDownloadUrl(videoUrl);
```

### 3. Enhanced Error Messages

Added specific error handling for format-related issues:

```typescript
if (msg.includes('valid asset type') || msg.includes('unsupported') || msg.includes('m3u8')) {
  errorTitle = 'Format Error';
  errorMessage = 'The video format is not compatible with your device\'s photo library...';
}
```

## Technical Details

### BunnyNet Stream URL Structure

BunnyNet Stream provides multiple endpoints for different use cases:

1. **HLS Playlist (Streaming):**
   ```
   https://vz-xxxxx-xxx.b-cdn.net/{videoId}/playlist.m3u8
   ```
   - Used for adaptive streaming in video players
   - Not suitable for downloading to device storage

2. **Direct MP4 (Download):**
   ```
   https://vz-xxxxx-xxx.b-cdn.net/{videoId}/play.mp4
   ```
   - Returns the original or highest quality MP4 file
   - Compatible with device photo libraries
   - Suitable for downloading and offline storage

3. **Thumbnail:**
   ```
   https://vz-xxxxx-xxx.b-cdn.net/{videoId}/thumbnail.jpg
   ```
   - Used for video previews

### File Format Compatibility

| Format | Streaming | Download | Media Library |
|--------|-----------|----------|---------------|
| HLS (.m3u8) | ✅ Yes | ❌ No | ❌ No |
| MP4 | ✅ Yes | ✅ Yes | ✅ Yes |
| MOV | ✅ Yes | ✅ Yes | ✅ Yes |

## Testing Checklist

To verify the fix works correctly:

- [ ] Video downloads successfully to photo library
- [ ] Downloaded video plays correctly in Photos app
- [ ] No "unsupported asset type" errors
- [ ] File size is reasonable (not 0 bytes)
- [ ] Video is added to POPNOW album (if supported)
- [ ] Temporary files are cleaned up after download
- [ ] Error messages are clear and helpful
- [ ] Works on both iOS and Android

## Related Files

- `utils/bunnynet.ts` - Added `getVideoDownloadUrl()` function
- `app/(tabs)/profile.tsx` - Updated `handleSaveVideo()` to use MP4 URL
- `docs/VIDEO_DOWNLOAD_FIX.md` - This documentation

## Future Improvements

1. **Progress Indicator** - Show download progress percentage
2. **Quality Selection** - Allow users to choose video quality before download
3. **Batch Download Optimization** - Improve performance for multiple downloads
4. **Offline Caching** - Cache videos for offline viewing within the app
5. **Format Conversion** - Add on-device transcoding if needed (resource-intensive)

## References

- [Expo Media Library Documentation](https://docs.expo.dev/versions/latest/sdk/media-library/)
- [Expo File System Documentation](https://docs.expo.dev/versions/latest/sdk/filesystem/)
- [BunnyNet Stream API Documentation](https://docs.bunny.net/docs/stream)
- [HLS Streaming Format](https://developer.apple.com/streaming/)

## Notes

- The fix uses BunnyNet's built-in MP4 endpoint, which provides the best quality available
- No client-side video conversion is needed, making the solution efficient
- The MP4 file is the same quality as the original upload or the highest transcode quality
- Token authentication is supported for secure video access if configured
