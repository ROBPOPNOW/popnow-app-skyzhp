
# Quick Diagnostic Steps

## 1. Check Console Logs on App Start

When you start the app, you should see:

```
Bunny.net Configuration: {
  hasStorageZone: true,
  hasStorageKey: true,
  hasCDNHostname: true,
  hasStreamLibraryId: true,
  hasStreamKey: true,
  hasStreamCDN: true,
  streamCDN: 'vz-60af4a59-0b4.b-cdn.net'
}
```

If any value is `false` or `streamCDN` is 'NOT SET', your environment variables are not loaded.

## 2. Check Video URL Processing

When a video loads, you should see:

```
🔍 Processing video URL: 3d54bbaa-abd2-4991-a95b-c47ba3e1235b
Generated playback URL: https://vz-60af4a59-0b4.b-cdn.net/3d54bbaa-abd2-4991-a95b-c47ba3e1235b/playlist.m3u8
VideoPlayer - Processing URL: {
  input: '3d54bbaa-abd2-4991-a95b-c47ba3e1235b',
  output: 'https://vz-60af4a59-0b4.b-cdn.net/3d54bbaa-abd2-4991-a95b-c47ba3e1235b/playlist.m3u8',
  isActive: true
}
⏳ Video load started: https://vz-60af4a59-0b4.b-cdn.net/3d54bbaa-abd2-4991-a95b-c47ba3e1235b/playlist.m3u8
```

## 3. Test Playback URL Manually

1. Copy a playback URL from the console logs
2. Open it in your browser
3. Or use this curl command:

```bash
curl -I "https://vz-60af4a59-0b4.b-cdn.net/3d54bbaa-abd2-4991-a95b-c47ba3e1235b/playlist.m3u8"
```

Expected response:
```
HTTP/2 200
content-type: application/vnd.apple.mpegurl
```

If you get 404 or 403, the CDN hostname or video GUID is incorrect.

## 4. Check Database Video URLs

Run this SQL query in Supabase:

```sql
SELECT 
  id,
  video_url,
  thumbnail_url,
  moderation_status,
  created_at
FROM videos
ORDER BY created_at DESC
LIMIT 5;
```

Verify:
- `video_url` contains only the GUID (36 characters with dashes)
- `thumbnail_url` is either NULL or a full CDN URL
- `moderation_status` is 'approved'

## 5. Check Bunny.net Dashboard

1. Go to https://dash.bunny.net
2. Navigate to Stream → Your Library → Videos
3. Find your uploaded videos
4. Check status:
   - ✅ **Finished**: Ready to play
   - ⏳ **Processing**: Wait a few minutes
   - ❌ **Failed**: Re-upload required

## 6. Test Thumbnail URLs

Thumbnail URL format:
```
https://vz-60af4a59-0b4.b-cdn.net/VIDEO_GUID/thumbnail.jpg
```

Test in browser - should show a video thumbnail image.

## 7. Common Error Messages

### "BUNNY_STREAM_CDN_HOSTNAME is not configured"
- **Fix**: Add to `.env` file and restart with `--clear`

### "Failed to load video - Error -1102"
- **Fix**: CDN hostname is incorrect or video not processed

### "Configuration Error"
- **Fix**: Environment variables not loaded correctly

### "constantly loading"
- **Fix**: Video still processing or URL is incorrect

## 8. Environment Variable Checklist

Create/update your `.env` file:

```env
# Supabase
EXPO_PUBLIC_SUPABASE_URL=https://spdsgmkirubngfdxxrzj.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Bunny.net Stream (REQUIRED for video playback)
EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=your-library-id
EXPO_PUBLIC_BUNNY_STREAM_API_KEY=your-api-key
EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=vz-60af4a59-0b4.b-cdn.net

# Bunny.net Storage (Optional - if using storage)
EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME=your-storage-zone
EXPO_PUBLIC_BUNNY_STORAGE_API_KEY=your-storage-key
EXPO_PUBLIC_BUNNY_CDN_HOSTNAME=your-cdn.b-cdn.net
```

## 9. Restart Checklist

After updating `.env`:

1. Stop Expo dev server (Ctrl+C)
2. Clear cache: `npx expo start --clear`
3. Check console for configuration logs
4. Try loading a video
5. Check console for playback URL logs

## 10. If Still Not Working

1. **Copy the exact playback URL** from console logs
2. **Test it in VLC Media Player** or browser
3. **If it works there but not in app**: Network/CORS issue
4. **If it doesn't work anywhere**: CDN hostname or video GUID is wrong

## Quick Fix Commands

```bash
# Clear Expo cache and restart
npx expo start --clear

# Check if .env file is being read
cat .env | grep BUNNY

# Test a video URL
curl -I "https://YOUR_CDN_HOSTNAME/VIDEO_GUID/playlist.m3u8"
```

## Expected Working Flow

1. ✅ App starts → Configuration logs show all values as `true`
2. ✅ Video loads → Playback URL is generated correctly
3. ✅ Video plays → No error messages
4. ✅ Thumbnail shows → Thumbnail URL works
5. ✅ View count increments → RPC call succeeds

If any step fails, check the corresponding section above.
