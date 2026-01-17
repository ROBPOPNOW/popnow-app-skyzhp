
# Video Expiration and Cleanup Implementation

## Overview
This document describes the implementation of the 3-day video expiration system with automatic deletion from both the database and BunnyNet storage.

## Features Implemented

### 1. Videos Tab - List View ✅
**Location:** `app/(tabs)/profile.tsx`

The Videos tab now displays videos in a list view with the following information:
- **Thumbnail**: Video preview image
- **Stats**: Likes, comments, and shares count
- **Expiry Time**: Shows "3 days", "2 days", "1 day", or hours/minutes remaining
- **Actions**: Delete and Download buttons
- **Select Mode**: Batch selection for multiple videos

**Key Features:**
- Expiry reminder banner at the top: "Save your memory! Videos expire in 3 days. Tap download to save to your phone now!"
- Real-time countdown timer that updates every second
- Visual indicators for expiring videos
- Batch operations (select multiple videos to download or delete)

### 2. 3-Day Expiration with BunnyNet Deletion ✅
**Location:** `supabase/functions/cleanup-expired-videos/index.ts`

The cleanup Edge Function now:
- Fetches all expired videos from the database
- Deletes each video from BunnyNet Stream using the BunnyNet API
- Deletes the video records from the Supabase database
- Returns a summary of deleted videos

**BunnyNet Deletion Logic:**
```typescript
async function deleteFromBunnyNet(videoUrl: string): Promise<boolean> {
  // Extract video ID from URL
  const videoId = extractVideoId(videoUrl);
  
  // Call BunnyNet API to delete video
  const response = await fetch(
    `${STREAM_API_BASE}/${BUNNY_STREAM_LIBRARY_ID}/videos/${videoId}`,
    {
      method: 'DELETE',
      headers: {
        'AccessKey': BUNNY_STREAM_API_KEY,
      },
    }
  );
  
  return response.ok;
}
```

### 3. Rejected Videos Deletion from BunnyNet ✅
**Location:** `supabase/functions/moderate-video/index.ts`

The moderation Edge Function now:
- Performs AI moderation using AWS Rekognition
- If a video is rejected, immediately deletes it from BunnyNet
- Marks the video as rejected in the database
- Sends a notification to the user with the rejection reason

**Rejection Flow:**
1. Video is uploaded and moderated
2. If rejected (explicit nudity, violence, etc.):
   - Delete from BunnyNet immediately
   - Mark as rejected in database
   - Send notification to user
   - User sees rejection popup with reason

## Database Schema

The `videos` table includes:
- `expires_at`: Timestamp when the video expires (3 days after creation)
- `is_approved`: Boolean indicating moderation status
- `moderation_status`: 'pending', 'approved', 'rejected', or 'flagged'
- `moderation_notes`: Detailed rejection reasons

## Environment Variables Required

### BunnyNet Configuration
```env
BUNNY_STREAM_LIBRARY_ID=your_library_id
BUNNY_STREAM_API_KEY=your_api_key
BUNNY_STREAM_CDN_HOSTNAME=vz-xxxxx-xxx.b-cdn.net
```

### AWS Rekognition (for moderation)
```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=ap-southeast-2
```

## Scheduling the Cleanup Function

The cleanup function should be scheduled to run periodically. You can use:

1. **Supabase Cron Jobs** (Recommended):
   ```sql
   SELECT cron.schedule(
     'cleanup-expired-videos',
     '0 * * * *', -- Run every hour
     $$
     SELECT net.http_post(
       url := 'https://your-project.supabase.co/functions/v1/cleanup-expired-videos',
       headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
     );
     $$
   );
   ```

2. **External Cron Service** (Alternative):
   - Use services like Cron-job.org or EasyCron
   - Schedule hourly or daily calls to the Edge Function

## Video Lifecycle

```
Upload → Moderation → Approved/Rejected
                ↓
            Approved
                ↓
        Visible for 1 hour (to other users)
                ↓
        Visible for 3 days (to publisher)
                ↓
            Expired
                ↓
    Deleted from BunnyNet + Database
```

## User Experience

### For Publishers:
1. Upload video
2. Video is moderated (if rejected, see popup with reason)
3. If approved, video is visible on their profile
4. See expiry countdown (3 days, 2 days, 1 day, etc.)
5. Can download video before expiration
6. After 3 days, video is automatically deleted

### For Viewers:
1. See videos in feed/map for 1 hour after publication
2. Can like, comment, and share
3. After 1 hour, video disappears from feed/map
4. Liked videos also disappear after 1 hour

## Testing

### Test Expired Video Cleanup:
```bash
# Manually trigger the cleanup function
curl -X POST https://your-project.supabase.co/functions/v1/cleanup-expired-videos \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

### Test Rejected Video Deletion:
1. Upload a video with inappropriate content
2. Check BunnyNet dashboard to verify video is deleted
3. Check database to verify video is marked as rejected

## Monitoring

### Check Cleanup Logs:
```sql
-- View recent cleanup operations
SELECT * FROM edge_function_logs 
WHERE function_name = 'cleanup-expired-videos' 
ORDER BY created_at DESC 
LIMIT 10;
```

### Check Expired Videos:
```sql
-- View videos that should be deleted
SELECT id, video_url, expires_at, created_at 
FROM videos 
WHERE expires_at < NOW() 
ORDER BY expires_at DESC;
```

### Check Rejected Videos:
```sql
-- View rejected videos
SELECT id, video_url, moderation_status, moderation_notes, created_at 
FROM videos 
WHERE moderation_status = 'rejected' 
ORDER BY created_at DESC;
```

## Troubleshooting

### Videos Not Being Deleted from BunnyNet:
1. Check BunnyNet API credentials in Edge Function secrets
2. Verify video ID extraction logic
3. Check Edge Function logs for errors

### Expiry Timer Not Updating:
1. Verify `expires_at` is set correctly when video is created
2. Check that the timer update interval is running
3. Ensure timezone handling is correct

### Rejected Videos Still Visible:
1. Check moderation Edge Function logs
2. Verify AWS Rekognition credentials
3. Check that BunnyNet deletion is successful

## Future Enhancements

1. **Batch Deletion**: Delete multiple expired videos in parallel
2. **Storage Analytics**: Track storage usage and cleanup statistics
3. **User Notifications**: Notify users before videos expire
4. **Extended Expiration**: Allow users to extend video lifespan (premium feature)
5. **Archive Feature**: Allow users to archive videos before deletion

## Related Files

- `app/(tabs)/profile.tsx` - Profile screen with Videos tab
- `supabase/functions/cleanup-expired-videos/index.ts` - Cleanup Edge Function
- `supabase/functions/moderate-video/index.ts` - Moderation Edge Function
- `utils/bunnynet.ts` - BunnyNet utility functions
- `types/video.ts` - Video type definitions

## Support

For issues or questions:
1. Check Edge Function logs in Supabase Dashboard
2. Review BunnyNet API documentation
3. Check AWS Rekognition documentation for moderation
