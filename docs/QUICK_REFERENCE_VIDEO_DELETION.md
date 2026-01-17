
# Quick Reference: Video Deletion System

## User Deletes Video

**Flow**:
```
User clicks delete → Confirmation → Delete from Bunny.net → Delete from DB → Update UI
```

**Code Location**: `app/(tabs)/profile.tsx` → `handleDeleteVideo()`

**Test**:
1. Go to Profile > Videos tab
2. Click delete button on any video
3. Confirm deletion
4. Video should disappear immediately
5. Check Bunny.net dashboard - video should be gone

## Automatic Expiration

**Flow**:
```
Video created → expires_at = created_at + 3 days → Cleanup function runs → Delete expired videos
```

**Code Location**: `supabase/functions/cleanup-expired-videos/index.ts`

**Test**:
```bash
# Manually trigger cleanup
curl -X POST https://spdsgmkirubngfdxxrzj.supabase.co/functions/v1/cleanup-expired-videos \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

## Expiry Countdown Display

**Location**: Video cards in Videos tab

**Format**:
- 3+ days: "Expires in 3 days"
- 2 days: "Expires in 2 days"
- 1 day: "Expires in 1 day"
- < 1 day: "Expires in 5h 30m"
- < 1 hour: "Expires in 45m"

**Styling**: Orange badge with clock icon, always visible

## Troubleshooting

### Videos not deleting from Bunny.net

**Check**:
1. Environment variables set correctly
2. Bunny.net API key has delete permissions
3. Video ID extraction working (check logs)
4. Network connectivity to Bunny.net API

**Fix**:
```typescript
// Test video ID extraction
const videoUrl = "https://vz-xxxxx.b-cdn.net/abc-123-def/playlist.m3u8";
const videoId = extractVideoId(videoUrl); // Should return "abc-123-def"
```

### Cleanup function not running

**Check**:
1. Scheduled task is set up and enabled
2. Edge Function is deployed
3. Check Edge Function logs for errors

**Manual trigger**:
```bash
curl -X POST https://spdsgmkirubngfdxxrzj.supabase.co/functions/v1/cleanup-expired-videos \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### Expiry countdown not showing

**Check**:
1. Video has `expires_at` field set
2. Timer update interval is running
3. Component is rendering correctly

**Debug**:
```typescript
console.log('Video expiry times:', videoExpiryTimes);
console.log('Video expires_at:', video.expires_at);
```

## Key Functions

### Delete from Bunny.net
```typescript
async function deleteVideoFromBunnyNet(videoUrl: string): Promise<boolean>
```

### Extract Video ID
```typescript
function extractVideoId(videoUrl: string): string | null
```

### Update Expiry Timers
```typescript
const updateVideoExpiryTimers = () => {
  // Updates every second via setInterval
}
```

## API Endpoints

### Bunny.net Delete Video
```
DELETE https://video.bunnycdn.com/library/{library_id}/videos/{video_id}
Headers: AccessKey: {api_key}
```

### Cleanup Edge Function
```
POST https://spdsgmkirubngfdxxrzj.supabase.co/functions/v1/cleanup-expired-videos
Headers: Authorization: Bearer {anon_key}
```

## Database Queries

### Find Expired Videos
```sql
SELECT * FROM videos 
WHERE expires_at < NOW() 
AND expires_at IS NOT NULL;
```

### Check Video Expiration
```sql
SELECT id, caption, created_at, expires_at,
       NOW() - expires_at AS overdue
FROM videos 
WHERE expires_at < NOW()
ORDER BY expires_at DESC;
```

### Set Video Expiration
```sql
UPDATE videos 
SET expires_at = created_at + INTERVAL '3 days'
WHERE expires_at IS NULL;
```

## Environment Variables

```env
# Required for deletion
BUNNY_STREAM_LIBRARY_ID=your_library_id
BUNNY_STREAM_API_KEY=your_api_key

# In Expo app
EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=your_library_id
EXPO_PUBLIC_BUNNY_STREAM_API_KEY=your_api_key
```

## Quick Checks

### Is cleanup working?
```sql
-- Should return 0
SELECT COUNT(*) FROM videos WHERE expires_at < NOW();
```

### Are videos expiring correctly?
```sql
-- Check expiration dates
SELECT id, caption, 
       created_at,
       expires_at,
       expires_at - created_at AS lifespan
FROM videos 
ORDER BY created_at DESC 
LIMIT 10;
```

### Are deletions logged?
```
Check Edge Function logs:
Supabase Dashboard > Edge Functions > cleanup-expired-videos > Logs
```

## Support

For issues:
1. Check Edge Function logs
2. Check browser console
3. Verify environment variables
4. Test manual deletion
5. Test cleanup function manually
