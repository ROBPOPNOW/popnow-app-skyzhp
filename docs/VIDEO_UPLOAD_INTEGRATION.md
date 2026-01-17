
# Video Upload Integration with Trigger.dev Moderation

## Overview

This guide shows how to integrate the Trigger.dev video moderation system into your video upload flow.

## Upload Flow

```
1. User records/selects video
2. Upload to Supabase Storage
3. Create video record in database (is_approved = null)
4. Trigger moderation task
5. Show "Processing..." to user
6. Wait for moderation result
7. Show video in feed (if approved) or error (if rejected)
```

## Implementation

### Step 1: Upload Video

```typescript
// In your upload function (e.g., app/upload.tsx)

async function uploadVideo(videoUri: string, caption: string, tags: string[]) {
  try {
    // 1. Upload video file to Supabase Storage
    const videoFileName = `${Date.now()}_${Math.random().toString(36)}.mp4`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('videos')
      .upload(videoFileName, {
        uri: videoUri,
        type: 'video/mp4',
        name: videoFileName,
      });

    if (uploadError) throw uploadError;

    // 2. Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('videos')
      .getPublicUrl(videoFileName);

    // 3. Create video record in database
    const { data: video, error: dbError } = await supabase
      .from('videos')
      .insert({
        user_id: currentUser.id,
        video_url: publicUrl,
        caption,
        tags,
        location_latitude: location?.latitude,
        location_longitude: location?.longitude,
        location_name: location?.name,
        is_approved: null, // Pending moderation
        moderation_status: 'pending',
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // 4. Trigger moderation
    await triggerModeration(video.id, video.video_url, video.thumbnail_url);

    // 5. Navigate to feed or show processing message
    Alert.alert(
      'Video Uploaded!',
      'Your video is being reviewed. It will appear in the feed once approved.',
      [{ text: 'OK', onPress: () => router.push('/(tabs)/(home)') }]
    );

  } catch (error) {
    console.error('Upload error:', error);
    Alert.alert('Upload Failed', 'Please try again.');
  }
}
```

### Step 2: Trigger Moderation

```typescript
// Create a utility function for triggering moderation

async function triggerModeration(
  videoId: string,
  videoUrl: string,
  thumbnailUrl?: string
) {
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/trigger-video-moderation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          videoId,
          videoUrl,
          thumbnailUrl,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('Moderation trigger error:', error);
      throw new Error('Failed to trigger moderation');
    }

    const result = await response.json();
    console.log('Moderation triggered:', result);
    return result;

  } catch (error) {
    console.error('Error triggering moderation:', error);
    // Don't throw - video is already uploaded, moderation can be retried
  }
}
```

### Step 3: Display Videos in Feed

```typescript
// In your feed component (e.g., app/(tabs)/(home)/index.tsx)

// Fetch only approved videos
const { data: videos, error } = await supabase
  .from('videos')
  .select(`
    *,
    users (
      id,
      username,
      display_name,
      avatar_url
    )
  `)
  .eq('is_approved', true) // Only show approved videos
  .order('created_at', { ascending: false });

// Or fetch all videos and filter in UI
const { data: allVideos, error } = await supabase
  .from('videos')
  .select(`
    *,
    users (
      id,
      username,
      display_name,
      avatar_url
    )
  `)
  .order('created_at', { ascending: false });

// Filter and show appropriate UI
const approvedVideos = allVideos?.filter(v => v.is_approved === true) || [];
const pendingVideos = allVideos?.filter(v => v.is_approved === null) || [];
const rejectedVideos = allVideos?.filter(v => v.is_approved === false) || [];
```

### Step 4: Show Processing State

```typescript
// In your video component

function VideoItem({ video }: { video: Video }) {
  if (video.is_approved === null) {
    // Still processing
    return (
      <View style={styles.processingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text style={styles.processingText}>
          Reviewing video...
        </Text>
        <Text style={styles.processingSubtext}>
          This usually takes 5-10 seconds
        </Text>
      </View>
    );
  }

  if (video.is_approved === false) {
    // Rejected - only show to video owner
    if (video.user_id === currentUser.id) {
      return (
        <View style={styles.rejectedContainer}>
          <Text style={styles.rejectedTitle}>
            ❌ Video Not Approved
          </Text>
          <Text style={styles.rejectedReason}>
            {video.moderation_notes}
          </Text>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => deleteVideo(video.id)}
          >
            <Text style={styles.deleteButtonText}>Delete Video</Text>
          </TouchableOpacity>
        </View>
      );
    }
    // Don't show rejected videos to other users
    return null;
  }

  // Approved - show normal video
  return (
    <VideoPlayer video={video} />
  );
}
```

### Step 5: Real-time Updates (Optional)

```typescript
// Subscribe to video updates for real-time moderation results

useEffect(() => {
  const subscription = supabase
    .channel('video-moderation')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'videos',
        filter: `user_id=eq.${currentUser.id}`,
      },
      (payload) => {
        console.log('Video updated:', payload);
        
        const updatedVideo = payload.new;
        
        if (updatedVideo.is_approved === true) {
          // Video approved
          Alert.alert(
            '✅ Video Approved!',
            'Your video is now live in the feed.'
          );
        } else if (updatedVideo.is_approved === false) {
          // Video rejected
          Alert.alert(
            '❌ Video Not Approved',
            updatedVideo.moderation_notes || 'Your video did not meet our community guidelines.'
          );
        }
        
        // Refresh video list
        refetchVideos();
      }
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
}, [currentUser.id]);
```

### Step 6: User Profile - Show All Videos

```typescript
// In user profile, show all videos with status

function UserProfile({ userId }: { userId: string }) {
  const { data: videos } = await supabase
    .from('videos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return (
    <View>
      {videos?.map(video => (
        <View key={video.id} style={styles.videoItem}>
          <VideoThumbnail video={video} />
          
          {/* Show status badge */}
          {video.is_approved === null && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>⏳ Processing</Text>
            </View>
          )}
          
          {video.is_approved === false && (
            <View style={[styles.badge, styles.rejectedBadge]}>
              <Text style={styles.badgeText}>❌ Rejected</Text>
            </View>
          )}
          
          {video.is_approved === true && (
            <View style={[styles.badge, styles.approvedBadge]}>
              <Text style={styles.badgeText}>✅ Live</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
```

## Database Queries

### Get Approved Videos Only
```sql
SELECT * FROM videos
WHERE is_approved = true
ORDER BY created_at DESC;
```

### Get User's Videos with Status
```sql
SELECT 
  id,
  caption,
  is_approved,
  moderation_status,
  moderation_notes,
  created_at
FROM videos
WHERE user_id = 'user-id-here'
ORDER BY created_at DESC;
```

### Get Pending Videos (for admin dashboard)
```sql
SELECT * FROM videos
WHERE is_approved IS NULL
ORDER BY created_at ASC;
```

### Get Rejection Statistics
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) FILTER (WHERE is_approved = true) as approved,
  COUNT(*) FILTER (WHERE is_approved = false) as rejected,
  COUNT(*) FILTER (WHERE is_approved IS NULL) as pending
FROM videos
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## Error Handling

### Handle Moderation Trigger Failure

```typescript
async function uploadVideo(videoUri: string) {
  try {
    // ... upload video ...
    
    // Try to trigger moderation
    try {
      await triggerModeration(video.id, video.video_url);
    } catch (moderationError) {
      console.error('Moderation trigger failed:', moderationError);
      
      // Video is uploaded but moderation not triggered
      // Option 1: Show warning to user
      Alert.alert(
        'Video Uploaded',
        'Your video is uploaded but moderation is delayed. It will be reviewed shortly.'
      );
      
      // Option 2: Retry moderation
      setTimeout(() => {
        triggerModeration(video.id, video.video_url).catch(console.error);
      }, 5000);
    }
    
  } catch (error) {
    // Handle upload error
  }
}
```

### Handle Stuck Videos

```typescript
// Check for videos stuck in pending state (>5 minutes)
async function checkStuckVideos() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  const { data: stuckVideos } = await supabase
    .from('videos')
    .select('*')
    .is('is_approved', null)
    .lt('created_at', fiveMinutesAgo);

  // Retry moderation for stuck videos
  for (const video of stuckVideos || []) {
    console.log('Retrying moderation for stuck video:', video.id);
    await triggerModeration(video.id, video.video_url, video.thumbnail_url);
  }
}
```

## Testing

### Test with Clean Video
```typescript
// Upload a clean video and verify:
// 1. is_approved becomes true
// 2. moderation_status becomes 'approved'
// 3. Video appears in feed
```

### Test with Inappropriate Content
```typescript
// Upload a video with inappropriate content and verify:
// 1. is_approved becomes false
// 2. moderation_status becomes 'rejected'
// 3. User receives notification
// 4. Video does NOT appear in public feed
```

### Test Error Handling
```typescript
// Test with invalid video URL and verify:
// 1. is_approved stays null
// 2. moderation_status becomes 'pending'
// 3. moderation_notes contains error message
```

## Best Practices

1. ✅ Always set `is_approved = null` on initial upload
2. ✅ Only show approved videos in public feed
3. ✅ Show processing state to users
4. ✅ Send clear rejection reasons
5. ✅ Allow users to delete rejected videos
6. ✅ Implement retry logic for failed moderation
7. ✅ Monitor stuck videos (pending >5 minutes)
8. ✅ Log all moderation events
9. ✅ Use real-time subscriptions for instant updates
10. ✅ Handle offline scenarios gracefully

## Summary

✅ **Upload Flow**: Video → Storage → Database → Trigger Moderation
✅ **Display Logic**: Only show approved videos in feed
✅ **User Feedback**: Show processing/approved/rejected states
✅ **Real-time Updates**: Subscribe to moderation results
✅ **Error Handling**: Retry failed moderations
✅ **Testing**: Verify all scenarios work correctly

The integration is complete and ready for production! 🎉
