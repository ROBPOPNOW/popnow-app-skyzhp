
# Video Lifecycle & Download Features Implementation

## Overview
This document describes the implementation of video expiration, automatic cleanup, download functionality, and AI rejection notifications for the POPNOW app.

## Features Implemented

### 1. 3-Day Video Lifespan with Automatic Deletion

**Database Changes:**
- Added `expires_at` column to `videos` table (already existed)
- Created trigger `set_video_expiry_trigger` that automatically sets `expires_at` to `created_at + 3 days` for all new videos
- Created function `delete_expired_videos()` to manually delete expired videos

**Edge Function:**
- Created `cleanup-expired-videos` Edge Function that:
  - Runs periodically (can be triggered via cron job or manually)
  - Finds all videos where `expires_at < NOW()`
  - Deletes expired videos from the database
  - Returns count of deleted videos

**Setup Required:**
To enable automatic cleanup, set up a cron job to call the Edge Function:
```bash
# Example: Call every hour
curl -X POST https://spdsgmkirubngfdxxrzj.supabase.co/functions/v1/cleanup-expired-videos \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### 2. Publisher Video Expiry Reminder & Countdown

**Location:** `app/(tabs)/profile.tsx` - Videos tab

**Features:**
- Added prominent reminder banner at the top of Videos tab:
  - Icon: Warning triangle
  - Text: "Save your memory! Videos expire in 3 days. Tap download to save to your phone now!"
  - Styling: Light primary color background with border

- Added expiry countdown badge on each video thumbnail:
  - Shows "3 days", "2 days", "1 day", or hours/minutes remaining
  - Orange background badge with clock icon
  - Updates every second via `updateVideoExpiryTimers()` function
  - Positioned at top-left of video thumbnail

**Implementation:**
```typescript
const updateVideoExpiryTimers = () => {
  const timers: { [key: string]: string } = {};
  const now = new Date();
  
  videos.forEach((video) => {
    if (!video.expires_at) {
      timers[video.id] = '';
      return;
    }

    const expiresAt = new Date(video.expires_at);
    const diff = expiresAt.getTime() - now.getTime();

    if (diff <= 0) {
      timers[video.id] = 'Expired';
    } else {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

      if (days >= 3) {
        timers[video.id] = '3 days';
      } else if (days === 2) {
        timers[video.id] = '2 days';
      } else if (days === 1) {
        timers[video.id] = '1 day';
      } else if (hours > 0) {
        timers[video.id] = `${hours}h`;
      } else {
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        timers[video.id] = `${minutes}m`;
      }
    }
  });

  setVideoExpiryTimes(timers);
};
```

### 3. Liked Videos Disappear After 1 Hour

**Location:** `app/(tabs)/profile.tsx` - Liked tab

**Implementation:**
- Modified `loadLikedVideos()` function to filter videos by creation time
- Videos older than 1 hour are excluded from the Liked tab
- Exception: User's own videos are always shown regardless of age
- Uses timestamp comparison: `videoCreatedAt >= oneHourAgo || isOwnVideo`

**Code:**
```typescript
const loadLikedVideos = async () => {
  // Calculate 1 hour ago timestamp
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  // Fetch liked videos
  const { data: likedData } = await supabase
    .from('likes')
    .select(`
      video_id,
      videos (
        *,
        users (...)
      )
    `)
    .eq('user_id', user.id);

  // Filter out videos older than 1 hour (unless owned by current user)
  const likedVideosData = likedData
    ?.map((like: any) => {
      if (!like.videos) return null;
      
      const videoCreatedAt = new Date(like.videos.created_at);
      const isOwnVideo = like.videos.user_id === user.id;
      
      // Show video if it's less than 1 hour old OR if it's the user's own video
      if (videoCreatedAt >= oneHourAgo || isOwnVideo) {
        return { ...like.videos, isLiked: true };
      }
      return null;
    })
    .filter((video: any) => video !== null) || [];
  
  setLikedVideos(likedVideosData);
};
```

### 4. Downloadable Fulfilment Videos

**Location:** `app/fulfillment-videos.tsx`

**Features:**
- Added download button overlay on each fulfillment video
- Button positioned at bottom-right with icon and "Download" text
- Uses same download logic as profile videos
- Downloads work as long as video exists in database (within 3-day lifespan)

**Implementation:**
```typescript
const handleDownloadVideo = async (videoUrl: string, videoId: string) => {
  // Request permissions
  const permissionResult = await requestMediaLibrarySavePermission();
  if (!permissionResult.granted) return;

  // Get download URL from BunnyNet
  const downloadUrl = await getVideoDownloadUrl(videoUrl);
  
  // Download to cache directory
  const downloadDir = new Directory(Paths.cache, 'downloads');
  const downloadedFile = await File.downloadFileAsync(downloadUrl, downloadDir);
  
  // Save to photo library
  await MediaLibrary.saveToLibraryAsync(downloadedFile.uri);
  
  // Add to POPNOW album
  const asset = await MediaLibrary.createAssetAsync(downloadedFile.uri);
  const album = await MediaLibrary.getAlbumAsync('POPNOW');
  if (album) {
    await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
  } else {
    await MediaLibrary.createAlbumAsync('POPNOW', asset, false);
  }
  
  Alert.alert('Success!', 'Video has been saved to your photo library.');
};
```

### 5. Request Fulfillment Warning

**Location:** `app/upload.tsx`

**Features:**
- Added warning banner when uploading a video to fulfill a request
- Shows only when `requestId` is present
- Warning text: "Please note, by taking this request, your video will be downloadable for the requester for 3 days."
- Styled with info icon and light background

**Styling:**
```typescript
warningSection: {
  backgroundColor: `${colors.primary}15`,
  borderRadius: 12,
  padding: 16,
  marginBottom: 24,
  borderWidth: 1,
  borderColor: `${colors.primary}40`,
}
```

### 6. AI Rejection Pop-up Notification

**Location:** `app/(tabs)/profile.tsx`

**Features:**
- Checks for rejected videos on profile screen load
- Shows modal pop-up when video is rejected by AI moderation
- Displays rejection reason from `moderation_notes` field
- Modal includes:
  - Warning triangle icon (red)
  - "Video Rejected" title
  - Detailed rejection reason
  - Guidance text: "Please upload a different video that complies with our community guidelines."
  - OK button to dismiss

**Implementation:**
```typescript
const checkForRejectedVideos = async () => {
  const tenMinutesAgo = new Date();
  tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10);

  const { data: rejectedVideos } = await supabase
    .from('videos')
    .select('id, caption, moderation_notes, moderation_result, updated_at')
    .eq('user_id', user.id)
    .eq('is_approved', false)
    .eq('moderation_status', 'rejected')
    .gte('updated_at', tenMinutesAgo.toISOString())
    .order('updated_at', { ascending: false })
    .limit(1);

  if (rejectedVideos && rejectedVideos.length > 0) {
    const video = rejectedVideos[0];
    
    // Parse moderation notes to get detailed reason
    let reason = 'Your video contains inappropriate content';
    if (video.moderation_notes) {
      const match = video.moderation_notes.match(/Rejected by AWS Rekognition: (.+)/);
      if (match && match[1]) {
        reason = match[1];
      }
    }
    
    setRejectionDetails({ reason, videoId: video.id });
    setRejectionModalVisible(true);
    
    // Delete the rejected video after showing notification
    setTimeout(async () => {
      await supabase.from('videos').delete().eq('id', video.id);
    }, 1000);
  }
};
```

**Modal UI:**
```tsx
<Modal visible={rejectionModalVisible} animationType="fade" transparent={true}>
  <View style={styles.rejectionModalOverlay}>
    <View style={styles.rejectionModalContent}>
      <View style={styles.rejectionModalHeader}>
        <IconSymbol name="exclamationmark.triangle.fill" size={48} color="#FF3B5C" />
        <Text style={styles.rejectionModalTitle}>Video Rejected</Text>
      </View>
      <Text style={styles.rejectionModalMessage}>
        {rejectionDetails?.reason}
      </Text>
      <Text style={styles.rejectionModalSubtext}>
        Please upload a different video that complies with our community guidelines.
      </Text>
      <Pressable style={styles.rejectionModalButton} onPress={() => setRejectionModalVisible(false)}>
        <Text style={styles.rejectionModalButtonText}>OK</Text>
      </Pressable>
    </View>
  </View>
</Modal>
```

## Database Schema

### Videos Table
```sql
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  location_latitude DOUBLE PRECISION,
  location_longitude DOUBLE PRECISION,
  location_name TEXT,
  location_privacy TEXT DEFAULT 'exact' CHECK (location_privacy IN ('exact', '3km', '10km')),
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  duration INTEGER,
  moderation_status TEXT DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'flagged')),
  moderation_result JSONB,
  moderation_notes TEXT,
  is_approved BOOLEAN, -- true=approved, false=rejected, null=pending
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ -- Videos expire 3 days after creation
);
```

### Trigger Function
```sql
CREATE OR REPLACE FUNCTION set_video_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.created_at + INTERVAL '3 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_video_expiry_trigger
  BEFORE INSERT ON videos
  FOR EACH ROW
  EXECUTE FUNCTION set_video_expiry();
```

## Testing Checklist

### Video Expiry
- [ ] New videos automatically get `expires_at` set to 3 days from creation
- [ ] Expiry countdown shows correctly on publisher's Videos tab
- [ ] Countdown updates every second
- [ ] Videos are deleted after 3 days (test with manual Edge Function call)

### Liked Videos
- [ ] Liked videos older than 1 hour disappear from Liked tab
- [ ] User's own videos always show in Liked tab regardless of age
- [ ] Videos reappear if liked again within 1 hour window

### Download Functionality
- [ ] Download button appears on fulfillment videos
- [ ] Download works for videos within 3-day lifespan
- [ ] Videos save to photo library successfully
- [ ] Videos are added to POPNOW album
- [ ] Permission errors are handled gracefully

### Request Fulfillment
- [ ] Warning message shows when taking a request
- [ ] Warning text is clear and visible
- [ ] Download button works for requester on fulfillment videos

### AI Rejection
- [ ] Pop-up appears when video is rejected
- [ ] Rejection reason is displayed clearly
- [ ] Rejected video is deleted after notification
- [ ] Modal can be dismissed with OK button

## Future Enhancements

1. **Scheduled Cleanup**: Set up a cron job to call `cleanup-expired-videos` Edge Function hourly
2. **Storage Cleanup**: Extend cleanup to also delete video files from BunnyNet storage
3. **Expiry Notifications**: Send push notification 24 hours before video expires
4. **Batch Download**: Allow users to download multiple videos at once
5. **Download History**: Track which videos have been downloaded by requesters

## API Endpoints

### Cleanup Expired Videos
```
POST https://spdsgmkirubngfdxxrzj.supabase.co/functions/v1/cleanup-expired-videos
Authorization: Bearer YOUR_ANON_KEY

Response:
{
  "success": true,
  "message": "Deleted 5 expired videos",
  "deletedCount": 5,
  "deletedVideoIds": ["uuid1", "uuid2", ...]
}
```

## Notes

- All videos now have a 3-day lifespan from creation
- The 1-hour visibility rule for other users is separate from the 3-day deletion rule
- Publishers have 3 days to download their videos before automatic deletion
- Requesters can download fulfillment videos for 3 days (same as publisher)
- AI rejection notifications appear within 10 minutes of video upload
- Rejected videos are automatically deleted after notification is shown
