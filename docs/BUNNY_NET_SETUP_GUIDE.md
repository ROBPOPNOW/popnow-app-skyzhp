
# Bunny.net Setup Guide for POPNOW

This comprehensive guide will walk you through setting up Bunny.net for video storage, CDN delivery, and transcoding/streaming in your POPNOW app.

## Table of Contents

1. [Overview](#overview)
2. [Create Bunny.net Account](#create-bunnynet-account)
3. [Create Storage Zone](#create-storage-zone)
4. [Create Pull Zone (CDN)](#create-pull-zone-cdn)
5. [Create Stream Library](#create-stream-library)
6. [Copy API Keys to .env](#copy-api-keys-to-env)
7. [Test Your Setup](#test-your-setup)
8. [Troubleshooting](#troubleshooting)

## Overview

Bunny.net provides three main services for POPNOW:

- **Storage Zone**: Store your video files securely
- **Pull Zone (CDN)**: Deliver videos globally with low latency
- **Stream Library**: Transcode videos and provide adaptive bitrate streaming

## Create Bunny.net Account

1. Go to https://bunny.net
2. Click "Sign Up" in the top right corner
3. Fill in your details:
   - Email address
   - Password
   - Company name (optional)
4. Verify your email address
5. Log in to your Bunny.net dashboard

## Create Storage Zone

A Storage Zone is where your video files will be stored.

### Steps:

1. **Navigate to Storage**
   - In the Bunny.net dashboard, click "Storage" in the left sidebar
   - Click "Add Storage Zone"

2. **Configure Storage Zone**
   - **Name**: Choose a unique name (e.g., `popnow-videos`)
   - **Region**: Select the region closest to your users
     - US East (New York)
     - US West (Los Angeles)
     - Europe (London, Frankfurt)
     - Asia (Singapore, Sydney)
   - **Replication**: Enable if you want geo-replication (optional, costs more)
   - Click "Add Storage Zone"

3. **Copy Storage Zone Details**
   - After creation, click on your Storage Zone
   - Copy the following:
     - **Storage Zone Name**: (e.g., `popnow-videos`)
     - **Password/API Key**: Click "Manage" → "FTP & API Access" → Copy the password

4. **Add to .env file**
   ```env
   EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME=popnow-videos
   EXPO_PUBLIC_BUNNY_STORAGE_API_KEY=your-storage-api-key-here
   ```

## Create Pull Zone (CDN)

A Pull Zone is your CDN that delivers videos to users globally.

### Steps:

1. **Navigate to CDN**
   - In the Bunny.net dashboard, click "CDN" in the left sidebar
   - Click "Add Pull Zone"

2. **Configure Pull Zone**
   - **Name**: Choose a name (e.g., `popnow-cdn`)
   - **Origin Type**: Select "Storage Zone"
   - **Storage Zone**: Select the Storage Zone you created earlier
   - **Pricing Zone**: Choose based on your target audience
     - Standard: Global coverage
     - Volume: High traffic, lower cost
   - Click "Add Pull Zone"

3. **Configure CDN Settings** (Optional but recommended)
   - Click on your Pull Zone
   - **Caching**:
     - Cache Expiration: 1 day (86400 seconds)
     - Browser Cache Expiration: 1 hour (3600 seconds)
   - **Security**:
     - Enable "Token Authentication" for private videos (optional)
     - Enable "Hotlink Protection" to prevent unauthorized embedding
   - **Performance**:
     - Enable "Vary Cache" for better performance
     - Enable "Query String Sort" for consistent caching

4. **Copy Pull Zone Hostname**
   - In your Pull Zone settings, find the "CDN Hostname"
   - It will look like: `popnow-cdn.b-cdn.net`

5. **Add to .env file**
   ```env
   EXPO_PUBLIC_BUNNY_CDN_HOSTNAME=popnow-cdn.b-cdn.net
   ```

## Create Stream Library

A Stream Library handles video transcoding and adaptive bitrate streaming.

### Steps:

1. **Navigate to Stream**
   - In the Bunny.net dashboard, click "Stream" in the left sidebar
   - Click "Add Library"

2. **Configure Stream Library**
   - **Name**: Choose a name (e.g., `popnow-stream`)
   - **Replication Regions**: Select regions where you want videos replicated
     - Choose regions closest to your users
     - More regions = better performance but higher cost
   - **Player Settings**:
     - Enable "Direct Upload" (allows uploading directly from your app)
     - Enable "Allow Early Play" (users can start watching while transcoding)
   - **Watermark**: Add a watermark if desired (optional)
   - Click "Add Library"

3. **Configure Stream Settings**
   - Click on your Stream Library
   - **Security**:
     - Enable "Token Authentication" for private videos (optional)
     - Set "Allowed Referrers" to your app domains (optional)
   - **Encoding**:
     - Enable "MP4 Fallback" for better compatibility
     - Enable "Generate Thumbnails" (automatic thumbnail generation)
   - **Player**:
     - Customize player colors to match your brand (optional)

4. **Copy Stream Library Details**
   - In your Stream Library settings:
     - **Library ID**: Copy the numeric ID (e.g., `12345`)
     - **API Key**: Click "API" tab → Copy the API key
     - **CDN Hostname**: Copy the Stream CDN hostname (e.g., `vz-abc123.b-cdn.net`)

5. **Add to .env file**
   ```env
   EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=12345
   EXPO_PUBLIC_BUNNY_STREAM_API_KEY=your-stream-api-key-here
   EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=vz-abc123.b-cdn.net
   ```

## Copy API Keys to .env

Create a `.env` file in your project root (if it doesn't exist) and add all the values:

```env
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Bunny.net Storage Zone
EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME=popnow-videos
EXPO_PUBLIC_BUNNY_STORAGE_API_KEY=your-storage-api-key-here

# Bunny.net Pull Zone (CDN)
EXPO_PUBLIC_BUNNY_CDN_HOSTNAME=popnow-cdn.b-cdn.net

# Bunny.net Stream Library
EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=12345
EXPO_PUBLIC_BUNNY_STREAM_API_KEY=your-stream-api-key-here
EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=vz-abc123.b-cdn.net
```

**Important**: 
- Never commit your `.env` file to Git
- The `.env.example` file is provided as a template
- Make sure `.env` is in your `.gitignore` file

## Test Your Setup

### Test Storage Upload

You can test uploading a file to your Storage Zone:

```typescript
import { uploadVideoToBunny } from '@/utils/bunnynet';

// Test upload
const testUpload = async () => {
  try {
    const cdnUrl = await uploadVideoToBunny(
      'file:///path/to/test-video.mp4',
      'test-video.mp4'
    );
    console.log('Upload successful! CDN URL:', cdnUrl);
  } catch (error) {
    console.error('Upload failed:', error);
  }
};
```

### Test Stream Upload

Test creating and uploading to a Stream video:

```typescript
import { createStreamVideo, uploadToStream, getVideoStatus } from '@/utils/bunnynet';

const testStream = async () => {
  try {
    // Create video
    const video = await createStreamVideo('Test Video');
    console.log('Video created:', video.guid);

    // Upload video
    await uploadToStream(video.guid, 'file:///path/to/test-video.mp4');
    console.log('Video uploaded');

    // Check status
    const status = await getVideoStatus(video.guid);
    console.log('Video status:', status);
  } catch (error) {
    console.error('Stream test failed:', error);
  }
};
```

## Troubleshooting

### Upload Fails

**Problem**: Upload returns 401 Unauthorized

**Solution**:
- Check that your API keys are correct
- Make sure you copied the full API key without extra spaces
- Verify the Storage Zone name matches exactly

**Problem**: Upload returns 404 Not Found

**Solution**:
- Verify the Storage Zone name is correct
- Check that the Storage Zone exists in your Bunny.net dashboard
- Make sure you're using the correct region

### Video Not Playing

**Problem**: Video URL returns 404

**Solution**:
- Check that the video finished transcoding (status should be 4)
- Verify the Stream CDN hostname is correct
- Make sure the video GUID is correct

**Problem**: Video plays but quality is poor

**Solution**:
- Wait for transcoding to complete (can take a few minutes)
- Check that "Allow Early Play" is enabled in Stream settings
- Verify that multiple quality levels are being generated

### Slow Upload Speed

**Problem**: Uploads are taking too long

**Solution**:
- Choose a Storage Zone region closer to your users
- Enable geo-replication for better global performance
- Compress videos before upload (the app should do this automatically)
- Check your internet connection

### CORS Errors

**Problem**: Browser shows CORS errors when playing videos

**Solution**:
- In your Pull Zone settings, add your app domain to "Allowed Referrers"
- Enable CORS in your Pull Zone settings
- Make sure you're using the correct CDN hostname

## Cost Optimization Tips

1. **Choose the right region**: Select regions closest to your users to reduce bandwidth costs
2. **Enable caching**: Set appropriate cache headers to reduce origin requests
3. **Use Stream for user videos**: Automatic transcoding and adaptive bitrate
4. **Use Storage + Pull Zone for static assets**: Cheaper for thumbnails and images
5. **Monitor usage**: Check your Bunny.net dashboard regularly for usage statistics
6. **Set up billing alerts**: Get notified when you reach certain spending thresholds

## Next Steps

1. ✅ Create Storage Zone
2. ✅ Create Pull Zone
3. ✅ Create Stream Library
4. ✅ Copy API keys to .env
5. ⬜ Test upload functionality
6. ⬜ Set up Supabase Edge Function for secure uploads
7. ⬜ Integrate Hive AI for content moderation
8. ⬜ Deploy to production

## Support

- Bunny.net Documentation: https://docs.bunny.net
- Bunny.net Support: support@bunny.net
- POPNOW Documentation: See `docs/` folder

## Additional Resources

- [Bunny.net Stream API Reference](https://docs.bunny.net/reference/video-streaming)
- [Bunny.net Storage API Reference](https://docs.bunny.net/reference/storage-api)
- [Video Optimization Best Practices](https://docs.bunny.net/docs/stream-video-optimization)
