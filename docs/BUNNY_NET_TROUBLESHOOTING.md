
# Bunny.net Integration Troubleshooting Guide

## Current Issue

You're experiencing error **-1102 (NSURLErrorDomain)** which indicates that the video URLs cannot be reached. This is typically caused by:

1. Incorrect CDN hostname configuration
2. Missing or incorrect environment variables
3. CORS or SSL issues with Bunny.net

## Step 1: Verify Your Bunny.net Configuration

### Check Your Environment Variables

Open your `.env` file and verify you have these variables set:

```env
# Bunny.net Stream Configuration
EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=your-library-id
EXPO_PUBLIC_BUNNY_STREAM_API_KEY=your-api-key
EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=vz-xxxxx-xxx.b-cdn.net
```

### Find Your Correct Values

1. **Go to Bunny.net Dashboard** → Stream → Your Library

2. **Library ID**: Found in the URL or library settings
   - Example: `123456`

3. **API Key**: Found in Library Settings → API Key
   - Example: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

4. **CDN Hostname**: Found in Library Settings → Video CDN Hostname
   - Example: `vz-60af4a59-0b4.b-cdn.net`
   - **IMPORTANT**: Do NOT include `https://` - just the hostname

## Step 2: Verify Video URLs in Database

Based on your database, videos are stored as GUIDs like:
- `3d54bbaa-abd2-4991-a95b-c47ba3e1235b`
- `f798b002-fb4a-4bd0-8642-72c7b8d3a00d`

These should be converted to playback URLs like:
```
https://vz-60af4a59-0b4.b-cdn.net/3d54bbaa-abd2-4991-a95b-c47ba3e1235b/playlist.m3u8
```

## Step 3: Test Video Playback Manually

1. **Get a video GUID from your database**:
   ```sql
   SELECT id, video_url FROM videos LIMIT 1;
   ```

2. **Construct the playback URL**:
   ```
   https://YOUR_CDN_HOSTNAME/VIDEO_GUID/playlist.m3u8
   ```

3. **Test in browser or VLC**:
   - Open the URL in a browser
   - Or use VLC Media Player to test the HLS stream
   - If it doesn't work, the CDN hostname is incorrect

## Step 4: Check Bunny.net Stream Settings

1. **Go to Bunny.net Dashboard** → Stream → Your Library → Settings

2. **Verify these settings**:
   - ✅ **Player Token Authentication**: Should be **DISABLED** for public playback
   - ✅ **Allowed Referrer Domains**: Should include your domain or be empty for testing
   - ✅ **CORS Headers**: Should be enabled

3. **Security Settings**:
   - If you have token authentication enabled, you'll need to generate signed URLs
   - For testing, disable token authentication first

## Step 5: Update Environment Variables

1. **Stop your Expo dev server** (Ctrl+C)

2. **Update your `.env` file** with correct values:
   ```env
   EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=vz-60af4a59-0b4.b-cdn.net
   ```

3. **Clear Expo cache and restart**:
   ```bash
   npx expo start --clear
   ```

## Step 6: Check App Logs

When you run the app, check the console for these log messages:

```
Bunny.net Configuration: {
  hasStreamLibraryId: true,
  hasStreamKey: true,
  hasStreamCDN: true,
  streamCDN: 'vz-60af4a59-0b4.b-cdn.net'
}
```

If `hasStreamCDN` is `false` or `streamCDN` is 'NOT SET', your environment variable is not loaded correctly.

## Step 7: Verify Video Upload Process

When uploading a video, you should see these logs:

```
Creating video in Bunny Stream: [title]
Video created in Stream: [guid]
Uploading video to Stream for transcoding: [guid]
Video uploaded to Stream successfully
```

## Step 8: Check Video Status

After uploading, check if the video is processed:

1. **Go to Bunny.net Dashboard** → Stream → Videos
2. **Find your video** and check its status:
   - ✅ **Finished** (status 3 or 4): Ready to play
   - ⏳ **Processing** (status 1 or 2): Wait for encoding
   - ❌ **Failed** (status 5): Re-upload required

## Common Issues and Solutions

### Issue 1: "BUNNY_STREAM_CDN_HOSTNAME is not configured"

**Solution**: 
- Add `EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME` to your `.env` file
- Restart Expo dev server with `--clear` flag

### Issue 2: Videos show "constantly loading"

**Solution**:
- Check if CDN hostname is correct
- Verify video is fully processed in Bunny.net dashboard
- Test the playback URL manually in a browser

### Issue 3: No thumbnails showing

**Solution**:
- Thumbnails are generated after video processing completes
- Check if `thumbnail_url` is stored in database
- Verify thumbnail URL format: `https://CDN_HOSTNAME/GUID/thumbnail.jpg`

### Issue 4: View counts not showing in Bunny.net

**Solution**:
- View counts in your app database are separate from Bunny.net statistics
- Bunny.net tracks views when videos are actually played
- Your app tracks views when users land on a video (different metric)

## Testing Checklist

- [ ] Environment variables are set correctly
- [ ] CDN hostname does NOT include `https://`
- [ ] Video GUIDs are stored correctly in database
- [ ] Playback URLs are generated correctly (check console logs)
- [ ] Videos are fully processed in Bunny.net dashboard
- [ ] Token authentication is disabled (for testing)
- [ ] CORS is enabled in Bunny.net settings
- [ ] App can access the CDN (no firewall/network issues)

## Example Working Configuration

```env
# .env file
EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=123456
EXPO_PUBLIC_BUNNY_STREAM_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=vz-60af4a59-0b4.b-cdn.net
```

**Generated Playback URL**:
```
https://vz-60af4a59-0b4.b-cdn.net/3d54bbaa-abd2-4991-a95b-c47ba3e1235b/playlist.m3u8
```

**Generated Thumbnail URL**:
```
https://vz-60af4a59-0b4.b-cdn.net/3d54bbaa-abd2-4991-a95b-c47ba3e1235b/thumbnail.jpg
```

## Need More Help?

1. **Check console logs** for detailed error messages
2. **Test playback URL** in browser or VLC
3. **Verify Bunny.net dashboard** shows videos as "Finished"
4. **Check network tab** in browser dev tools for failed requests
5. **Contact Bunny.net support** if videos won't process

## Updated Files

The following files have been updated with better error handling and logging:

- ✅ `utils/bunnynet.ts` - Enhanced configuration logging and error messages
- ✅ `components/VideoPlayer.tsx` - Better error handling and retry logic
- ✅ `app/(tabs)/profile.tsx` - Proper thumbnail display with fallbacks

After updating your `.env` file, restart the app and check the console logs for configuration status.
