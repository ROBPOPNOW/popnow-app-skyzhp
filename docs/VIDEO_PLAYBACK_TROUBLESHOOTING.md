
# Video Playback Troubleshooting Guide

## Error: AVPlayerItem instance has failed with error code -1102 and domain "NSURLErrorDomain"

This error typically indicates that the video URL is not accessible. Here's how to diagnose and fix it:

### Understanding the Error

- **Error Code -1102**: This is `NSURLErrorFileDoesNotExist` in iOS, which means the requested resource cannot be found or accessed.
- **Common Causes**:
  1. Video is still encoding on Bunny.net
  2. Incorrect CDN hostname configuration
  3. Video file doesn't exist or was deleted
  4. Network connectivity issues
  5. CORS or access control issues

### Step 1: Verify Environment Variables

Check your `.env` file and ensure you have the correct Bunny.net Stream CDN hostname:

```env
EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=vz-60af4a59-0b4.b-cdn.net
```

**Important**: Use the **Stream CDN hostname**, NOT the Pull Zone CDN hostname:
- ✅ Stream CDN: `vz-xxxxx-xxx.b-cdn.net` (for video streaming)
- ❌ Pull Zone CDN: `yourname.b-cdn.net` (for static files)

### Step 2: Check Video Encoding Status

Videos uploaded to Bunny.net Stream need time to encode. The encoding process can take a few minutes depending on video length and quality.

**Video Status Codes**:
- `0` = Queued
- `1` = Processing
- `2` = Encoding
- `3` = Finished ✅
- `4` = Resolution Finished ✅
- `5` = Failed ❌

You can check the status in your Bunny.net dashboard under Stream > Videos.

### Step 3: Test Video Accessibility

Use the built-in diagnostic tool:

1. Open the app and go to the Home feed
2. Tap the 🔍 icon in the top-right corner
3. Wait for the diagnostic results
4. Check if videos are accessible

The diagnostic will show:
- ✅ Accessible: Video URL is working
- ❌ Not Accessible: Video URL is not reachable

### Step 4: Verify Video URLs

The app constructs video URLs in this format:
```
https://vz-60af4a59-0b4.b-cdn.net/{VIDEO_GUID}/playlist.m3u8
```

Example:
```
https://vz-60af4a59-0b4.b-cdn.net/3d54bbaa-abd2-4991-a95b-c47ba3e1235b/playlist.m3u8
```

You can test this URL directly in a browser or video player to verify it works.

### Step 5: Check Bunny.net Configuration

1. **Log in to Bunny.net Dashboard**
2. **Go to Stream > Libraries**
3. **Select your library**
4. **Verify Settings**:
   - Player settings are enabled
   - Direct play is enabled
   - No IP restrictions are set
   - CORS is properly configured

### Step 6: Common Fixes

#### Fix 1: Wait for Encoding
If videos were just uploaded, wait 2-5 minutes for encoding to complete.

#### Fix 2: Update Environment Variables
1. Stop the Expo dev server
2. Update `.env` file with correct Stream CDN hostname
3. Clear cache: `npx expo start -c`
4. Restart the app

#### Fix 3: Check Network Connectivity
- Ensure device has internet connection
- Try switching between WiFi and cellular data
- Check if other videos/websites load properly

#### Fix 4: Verify Bunny.net API Keys
Make sure your Bunny.net Stream API key is correct:
```env
EXPO_PUBLIC_BUNNY_STREAM_API_KEY=your-stream-api-key
EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=your-library-id
```

### Step 7: Manual URL Testing

Test a video URL manually:

1. Get a video GUID from the database:
   ```sql
   SELECT id, video_url FROM videos LIMIT 1;
   ```

2. Construct the playback URL:
   ```
   https://vz-60af4a59-0b4.b-cdn.net/{VIDEO_GUID}/playlist.m3u8
   ```

3. Test in browser or with curl:
   ```bash
   curl -I https://vz-60af4a59-0b4.b-cdn.net/{VIDEO_GUID}/playlist.m3u8
   ```

4. Expected response: `200 OK`
5. If you get `404 Not Found`: Video is still encoding or doesn't exist
6. If you get `403 Forbidden`: Check access permissions in Bunny.net

### Step 8: Check Console Logs

Look for these log messages in your Expo console:

```
✅ Good signs:
- "Video loaded successfully"
- "Generated playback URL: https://..."
- "Video accessibility test result: { ok: true }"

❌ Bad signs:
- "Video URL is not accessible"
- "CDN hostname not configured"
- "Video accessibility test failed"
```

### Step 9: Database Verification

Check that video URLs are stored correctly:

```sql
SELECT 
  id,
  video_url,
  moderation_status,
  created_at
FROM videos
ORDER BY created_at DESC
LIMIT 5;
```

The `video_url` should contain only the GUID (36 characters with dashes), not a full URL.

### Step 10: Re-upload Test Video

If all else fails, try uploading a new test video:

1. Record a short 5-second video
2. Upload through the app
3. Wait 3-5 minutes for encoding
4. Check if it plays

### Advanced Debugging

#### Enable Verbose Logging

The app already logs detailed information. Check your console for:

```
🔍 Processing video URL: {guid}
🎬 Generated playback URL: {url}
📊 Video accessibility test result: {...}
```

#### Check Bunny.net Stream Dashboard

1. Go to Stream > Videos
2. Find your video
3. Check:
   - Status (should be "Finished")
   - Preview (should play in dashboard)
   - Embed code (should be available)

#### Test with Different Video Player

Try playing the URL in:
- VLC Media Player
- Browser (Safari/Chrome)
- Another HLS player app

### Still Not Working?

If videos still won't play after trying all steps:

1. **Contact Bunny.net Support**
   - Provide your library ID
   - Share a sample video GUID
   - Ask them to verify CDN configuration

2. **Check Bunny.net Status**
   - Visit status.bunny.net
   - Check for any ongoing issues

3. **Review Bunny.net Documentation**
   - https://docs.bunny.net/docs/stream
   - https://docs.bunny.net/docs/stream-player

### Prevention Tips

1. **Always wait for encoding**: Don't expect videos to play immediately after upload
2. **Monitor encoding status**: Check video status before marking as "approved"
3. **Test in development**: Upload test videos and verify playback before going live
4. **Keep CDN hostname updated**: If you change Bunny.net settings, update your `.env` file

### Quick Reference

**Environment Variables**:
```env
EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=vz-xxxxx-xxx.b-cdn.net
EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=your-library-id
EXPO_PUBLIC_BUNNY_STREAM_API_KEY=your-api-key
```

**Video URL Format**:
```
https://{STREAM_CDN_HOSTNAME}/{VIDEO_GUID}/playlist.m3u8
```

**Diagnostic Tool**: Tap 🔍 icon in top-right of Home screen

**Console Commands**:
```bash
# Clear cache and restart
npx expo start -c

# Check environment variables
cat .env | grep BUNNY
```

---

## Summary

The -1102 error is usually caused by:
1. ⏱️ Videos still encoding (wait 2-5 minutes)
2. ⚙️ Wrong CDN hostname (use Stream CDN, not Pull Zone)
3. 🔗 Broken video URLs (check database)
4. 🌐 Network issues (check connectivity)

Use the diagnostic tool (🔍 button) to quickly identify the issue!
