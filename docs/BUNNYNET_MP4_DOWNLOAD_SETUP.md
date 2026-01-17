
# BunnyNet MP4 Download Setup Guide

## Overview

This guide explains how to enable MP4 downloads for videos hosted on BunnyNet Stream. By default, BunnyNet Stream serves videos as HLS playlists (.m3u8), which are great for streaming but cannot be downloaded directly to a user's device.

## Problem

When users try to download videos from the POPNOW app, they see this error:

```
Download Not Available
Unable to download video: BunnyNet Stream does not provide a direct MP4 download URL for this video.
```

This happens because BunnyNet Stream videos are served as HLS streams by default, not as downloadable MP4 files.

## Solution: Enable MP4 Fallback

BunnyNet Stream provides an "MP4 Fallback" feature that generates downloadable MP4 files alongside the HLS streams.

### Step 1: Enable MP4 Fallback in BunnyNet

1. **Log in to your BunnyNet account**
   - Go to https://dash.bunny.net/

2. **Navigate to your Video Library**
   - Click on "Stream" in the left sidebar
   - Select your video library (or create one if you haven't)

3. **Enable MP4 Fallback**
   - Click on the "Encoding" tab
   - Find the "MP4 Fallback" option
   - **Enable it** (toggle it ON)
   - Save your changes

### Step 2: Re-upload Your Videos

**IMPORTANT:** Only videos uploaded AFTER enabling MP4 Fallback will have MP4 files generated.

- You need to re-upload all existing videos for them to have MP4 download URLs
- New videos uploaded after enabling this feature will automatically have MP4 files

### Step 3: Verify Configuration

The app will automatically use the MP4 download URLs once they're available. The URL pattern is:

```
https://{pull_zone_url}.b-cdn.net/{video_id}/play_{resolution}p.mp4
```

For example:
```
https://vz-12345-678.b-cdn.net/abc123-def456/play_720p.mp4
```

## Important Notes

### Resolution Limitations

- **Maximum Resolution:** MP4 fallbacks go up to **720p maximum**
- **No Upscaling:** Videos are not upscaled
  - If your original video is 480p, only `play_480p.mp4` will be available
  - Requesting `play_720p.mp4` for a 480p video will return a 404 error

### Available Resolutions

The app will automatically try these resolutions in order:
1. 720p (highest quality)
2. 480p
3. 360p
4. 240p (lowest quality)

It will use the first available resolution.

### Single Resolution Videos

If you only have one resolution enabled (e.g., 2160p only), BunnyNet will generate an MP4 URL for that specific resolution, even if it's higher than 720p.

## How the App Handles Downloads

### Automatic Resolution Detection

The app's `getVideoDownloadUrl()` function:

1. Extracts the video ID from the HLS URL
2. Constructs MP4 URLs for different resolutions
3. Tests each URL (starting from highest quality)
4. Returns the first working MP4 URL
5. Shows a helpful error if no MP4 is available

### Error Messages

If MP4 fallback is not enabled, users will see:

```
Unable to download video: No MP4 file available for this video.

⚠️ IMPORTANT: MP4 Fallback Configuration Required

To enable video downloads, you must:

1. Log in to your BunnyNet account
2. Go to Stream → Your Video Library
3. Click on the "Encoding" tab
4. Enable "MP4 Fallback"
5. Re-upload your videos

Note: MP4 fallbacks are generated up to 720p maximum quality.
```

## Testing

### Test if MP4 Fallback is Working

You can manually test if MP4 fallback is working by constructing a URL:

1. Get your video's HLS URL:
   ```
   https://vz-12345-678.b-cdn.net/abc123-def456/playlist.m3u8
   ```

2. Replace `playlist.m3u8` with `play_720p.mp4`:
   ```
   https://vz-12345-678.b-cdn.net/abc123-def456/play_720p.mp4
   ```

3. Open this URL in your browser:
   - ✅ If it downloads/plays, MP4 fallback is working
   - ❌ If you get a 404 error, MP4 fallback is not enabled or the video was uploaded before enabling it

### Test Different Resolutions

Try these URLs (replace with your actual values):

```
https://{your-cdn}.b-cdn.net/{video-id}/play_720p.mp4
https://{your-cdn}.b-cdn.net/{video-id}/play_480p.mp4
https://{your-cdn}.b-cdn.net/{video-id}/play_360p.mp4
https://{your-cdn}.b-cdn.net/{video-id}/play_240p.mp4
```

## Troubleshooting

### "404 Not Found" Error

**Cause:** MP4 file doesn't exist for this resolution

**Solutions:**
- Enable MP4 Fallback in BunnyNet settings
- Re-upload the video
- Try a lower resolution (e.g., 480p instead of 720p)

### "403 Forbidden" Error

**Cause:** Token authentication is required

**Solution:**
- The app will automatically retry with token authentication
- Ensure `EXPO_PUBLIC_BUNNY_STREAM_TOKEN_AUTH_KEY` is set in your `.env` file

### "Download Not Available" Error

**Cause:** MP4 Fallback is not enabled or video was uploaded before enabling it

**Solution:**
1. Enable MP4 Fallback in BunnyNet (see Step 1 above)
2. Re-upload the video
3. Wait a few minutes for encoding to complete

### Video Downloads but Won't Save to Photo Library

**Cause:** Permission issue or file format issue

**Solution:**
- Check that the app has "Add Photos Only" or "All Photos" permission
- On iOS: Settings > POPNOW > Photos
- On Android: Settings > Apps > POPNOW > Permissions > Photos

## Code Implementation

The download functionality is implemented in:

### `utils/bunnynet.ts`

```typescript
export async function getVideoDownloadUrl(
  videoUrl: string, 
  useTokenAuth: boolean = false
): Promise<string>
```

This function:
- Extracts the video ID from the HLS URL
- Tries multiple resolutions (720p, 480p, 360p, 240p)
- Tests each URL for accessibility
- Returns the first working MP4 URL
- Throws a helpful error if no MP4 is available

### `app/(tabs)/profile.tsx`

```typescript
const handleSaveVideo = async (videoUrl: string, videoId: string) => {
  // ... permission checks ...
  
  const downloadUrl = await getVideoDownloadUrl(videoUrl);
  
  // ... download and save to photo library ...
}
```

## Additional Resources

- [BunnyNet Official Documentation](https://support.bunny.net/hc/en-us/articles/4413839729170-How-to-retrieve-an-MP4-URL-from-Stream)
- [BunnyNet Stream Dashboard](https://dash.bunny.net/)
- [BunnyNet Support](https://support.bunny.net/)

## Summary Checklist

- [ ] Enable MP4 Fallback in BunnyNet Stream library settings
- [ ] Re-upload existing videos (or upload new ones)
- [ ] Test MP4 URLs manually in browser
- [ ] Verify downloads work in the app
- [ ] Check that videos save to photo library correctly

## Need Help?

If you're still experiencing issues:

1. Verify MP4 Fallback is enabled in BunnyNet
2. Check that videos were uploaded AFTER enabling MP4 Fallback
3. Test the MP4 URL manually in a browser
4. Check the app logs for detailed error messages
5. Contact BunnyNet support if the issue persists

---

**Last Updated:** January 2025
