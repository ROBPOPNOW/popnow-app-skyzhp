
# Bunny.net Integration Guide for POPNOW

This guide will help you integrate Bunny.net for video storage, CDN delivery, and transcoding/streaming in your POPNOW app.

## Overview

Bunny.net provides three main services for video handling:

1. **Storage** - Store your video files
2. **CDN (Pull Zone)** - Deliver videos globally with low latency
3. **Stream** - Transcode and stream videos with adaptive bitrate

## Prerequisites

Before starting, you need:

- A Bunny.net account (sign up at https://bunny.net)
- Storage Zone created
- Pull Zone (CDN) created and linked to your Storage Zone
- Stream Library created (for transcoding)
- API keys from Bunny.net dashboard

## Step 1: Set Up Environment Variables

Add these to your `.env` file:

```env
# Bunny.net Configuration
EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME=your-storage-zone-name
EXPO_PUBLIC_BUNNY_STORAGE_API_KEY=your-storage-api-key
EXPO_PUBLIC_BUNNY_CDN_HOSTNAME=your-cdn-hostname.b-cdn.net
EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=your-stream-library-id
EXPO_PUBLIC_BUNNY_STREAM_API_KEY=your-stream-api-key
EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME=your-stream-cdn.b-cdn.net
```

## Step 2: Create Bunny.net Helper Utilities

The helper utilities are already created in `utils/bunnynet.ts`. Here's what each function does:

### Upload Video to Storage
```typescript
uploadVideoToBunny(videoUri: string, fileName: string)
```
Uploads a video file to Bunny.net Storage Zone.

### Create Stream Video
```typescript
createStreamVideo(title: string, collectionId?: string)
```
Creates a new video in Bunny.net Stream for transcoding.

### Upload to Stream
```typescript
uploadToStream(videoId: string, videoUri: string)
```
Uploads video content to a Stream video for transcoding.

### Get Video Status
```typescript
getVideoStatus(videoId: string)
```
Checks the transcoding status of a video.

### Get Video Playback URL
```typescript
getVideoPlaybackUrl(videoId: string)
```
Gets the CDN URL for playing a transcoded video.

## Step 3: Integration Flow

### Recommended Flow for Video Upload:

1. **User records video** → Video saved locally
2. **Upload to Bunny.net Stream** → Video transcoded automatically
3. **Save metadata to Supabase** → Store video info in database
4. **Poll for transcoding status** → Wait for video to be ready
5. **Update database** → Mark video as ready for playback

### Example Implementation:

```typescript
import { uploadToStream, createStreamVideo, getVideoStatus, getVideoPlaybackUrl } from '@/utils/bunnynet';
import { supabase } from '@/lib/supabase';

async function handleVideoUpload(videoUri: string, caption: string, location: any) {
  try {
    // 1. Create a video in Bunny Stream
    const streamVideo = await createStreamVideo(caption);
    
    // 2. Upload the video file
    await uploadToStream(streamVideo.guid, videoUri);
    
    // 3. Save to database (with pending status)
    const { data: videoRecord } = await supabase
      .from('videos')
      .insert({
        video_url: streamVideo.guid, // Store the GUID temporarily
        caption,
        location_latitude: location.latitude,
        location_longitude: location.longitude,
        location_name: location.name,
        moderation_status: 'pending',
      })
      .select()
      .single();
    
    // 4. Poll for transcoding completion
    const checkStatus = async () => {
      const status = await getVideoStatus(streamVideo.guid);
      
      if (status.status === 4) { // Transcoded
        const playbackUrl = getVideoPlaybackUrl(streamVideo.guid);
        
        // Update database with final URL
        await supabase
          .from('videos')
          .update({ video_url: playbackUrl })
          .eq('id', videoRecord.id);
          
        return true;
      }
      return false;
    };
    
    // Poll every 5 seconds
    const pollInterval = setInterval(async () => {
      const isReady = await checkStatus();
      if (isReady) {
        clearInterval(pollInterval);
        Alert.alert('Success', 'Your video is ready!');
      }
    }, 5000);
    
  } catch (error) {
    console.error('Upload error:', error);
    Alert.alert('Error', 'Failed to upload video');
  }
}
```

## Step 4: Video Playback

Use the CDN URL from Bunny.net Stream for playback:

```typescript
import { useVideoPlayer, VideoView } from 'expo-video';

function VideoPlayer({ videoUrl }: { videoUrl: string }) {
  const player = useVideoPlayer(videoUrl, (player) => {
    player.loop = true;
    player.play();
  });

  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%' }}
      nativeControls={false}
    />
  );
}
```

## Step 5: Bunny.net Dashboard Setup

### Storage Zone Setup:
1. Go to Storage → Create Storage Zone
2. Choose a region close to your users
3. Copy the Storage Zone name and API key

### Pull Zone (CDN) Setup:
1. Go to CDN → Create Pull Zone
2. Link it to your Storage Zone
3. Copy the CDN hostname (e.g., `yourzone.b-cdn.net`)

### Stream Library Setup:
1. Go to Stream → Create Library
2. Enable "Direct Upload" and "Allow Early Play"
3. Copy the Library ID and API key
4. Copy the Stream CDN hostname

## Step 6: Cost Optimization Tips

1. **Use Stream for user-uploaded videos** - Automatic transcoding and adaptive bitrate
2. **Use Storage + Pull Zone for static assets** - Cheaper for thumbnails and images
3. **Enable caching** - Set appropriate cache headers
4. **Use video collections** - Organize videos by category/location
5. **Implement video compression** - Compress videos before upload to save bandwidth

## Step 7: Advanced Features

### Thumbnail Generation
Bunny.net Stream automatically generates thumbnails:
```typescript
const thumbnailUrl = `https://${BUNNY_STREAM_CDN_HOSTNAME}/${videoId}/thumbnail.jpg`;
```

### Adaptive Bitrate Streaming
Bunny.net Stream provides HLS and DASH:
```typescript
const hlsUrl = `https://${BUNNY_STREAM_CDN_HOSTNAME}/${videoId}/playlist.m3u8`;
```

### Video Analytics
Track video views and engagement:
```typescript
async function getVideoStats(videoId: string) {
  const response = await fetch(
    `https://video.bunnycdn.com/library/${BUNNY_STREAM_LIBRARY_ID}/videos/${videoId}/statistics`,
    {
      headers: {
        'AccessKey': BUNNY_STREAM_API_KEY,
      },
    }
  );
  return response.json();
}
```

## Troubleshooting

### Upload Fails
- Check API keys are correct
- Verify Storage Zone name matches
- Ensure video file size is under limit (default 5GB)

### Video Not Playing
- Check transcoding status (should be 4)
- Verify CDN hostname is correct
- Check CORS settings in Bunny.net dashboard

### Slow Upload
- Use direct upload to nearest region
- Compress video before upload
- Check network connection

## Security Best Practices

1. **Never expose API keys in client code** - Use Supabase Edge Functions for uploads
2. **Implement signed URLs** - For private videos
3. **Rate limiting** - Prevent abuse
4. **Validate file types** - Only allow video files
5. **Scan for malware** - Before uploading to Bunny.net

## Next Steps

1. Create a Supabase Edge Function for secure uploads
2. Implement video compression before upload
3. Add progress indicators for uploads
4. Implement video caching strategy
5. Set up video analytics tracking

## Resources

- Bunny.net Documentation: https://docs.bunny.net
- Bunny.net Stream API: https://docs.bunny.net/reference/video-streaming
- Bunny.net Storage API: https://docs.bunny.net/reference/storage-api
- Support: support@bunny.net
