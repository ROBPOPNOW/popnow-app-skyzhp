
# Automated Video Deletion System - Implementation Complete

## Overview
This document describes the automated deletion system that eliminates expired videos and rejected content to save storage costs on Bunny.net.

## 🎯 Goals Achieved

### 1. Automated 3-Day Video Deletion System ✅
- **Hourly Cron Job**: Runs every hour automatically via Supabase pg_cron
- **Complete Deletion**: Removes videos from both Bunny.net storage AND Supabase database
- **No "Expired" Videos**: Users will never see expired videos in their profile
- **Storage Cost Savings**: Eliminates wasted storage on Bunny.net

### 2. Auto-Delete AI Moderation Rejected Content ✅
- **Immediate Deletion**: Rejected videos/avatars are deleted instantly upon moderation failure
- **Zero Storage Waste**: No rejected content remains in storage
- **User Notifications**: Users receive rejection notifications but cannot access deleted content
- **Complete Cleanup**: Deletes from Bunny.net, database, and reverts avatars to default

## 📋 Implementation Details

### Automated 3-Day Video Deletion

#### Cron Job Configuration
**File**: `supabase/migrations/20240115_setup_hourly_cleanup_cron.sql`

```sql
-- Runs every hour at the start of the hour (0 * * * *)
SELECT cron.schedule(
  'cleanup-expired-videos-hourly',
  '0 * * * *',
  $$ ... $$
);
```

#### Cleanup Edge Function
**File**: `supabase/functions/cleanup-expired-videos/index.ts`

**Process Flow**:
1. **Query Database**: Find all videos where `created_at < (NOW() - 3 days)`
2. **For Each Expired Video**:
   - Extract video ID from Bunny.net URL
   - DELETE video from Bunny.net using API: `DELETE /library/{library_id}/videos/{video_id}`
   - DELETE thumbnail (auto-deleted with video)
   - DELETE video record from Supabase database
3. **Logging**: Comprehensive logging of all deletions and errors
4. **Return Summary**: Reports deleted count, failed count, and details

**Key Features**:
- ✅ Extracts video ID from various URL formats
- ✅ Handles Bunny.net API errors gracefully
- ✅ Continues deletion even if Bunny.net deletion fails
- ✅ Detailed logging for monitoring and debugging
- ✅ Returns comprehensive summary of cleanup operation

**Example Log Output**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧹 CLEANUP EXPIRED VIDEOS - HOURLY JOB STARTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Timestamp: 2024-01-15T10:00:00.000Z
📅 Cutoff date (3 days ago): 2024-01-12T10:00:00.000Z
🔍 Querying database for expired videos...
📊 Found 5 expired videos to delete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 Processing video: abc123-def456-ghi789
   Caption: My awesome video
   Created: 2024-01-10T15:30:00.000Z
   Video URL: https://vz-xxxxx.b-cdn.net/abc123-def456-ghi789/playlist.m3u8
🗑️ Step 1: Deleting video from Bunny.net...
✅ Video deleted from Bunny.net
🗑️ Step 2: Deleting thumbnail from Bunny.net...
✅ Thumbnail handled
🗑️ Step 3: Deleting video record from database...
✅ Video abc123-def456-ghi789 deleted from database successfully
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 CLEANUP SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Successfully deleted: 5 videos
❌ Failed to delete: 0 videos
📋 Total processed: 5 videos
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Auto-Delete AI Moderation Rejected Content

#### Avatar Moderation with Immediate Deletion
**File**: `supabase/functions/moderate-avatar/index.ts`

**Process Flow**:
1. **Download Image**: Fetch avatar image from URL
2. **AI Moderation**: Send to AWS Rekognition
3. **If Flagged** (Confidence > 80%):
   - **Delete from Bunny.net Storage**: Remove image file
   - **Revert Avatar**: Set user's `avatar_url` to `null` (default avatar)
   - **Send Notification**: Notify user of rejection
   - **Result**: No rejected avatar remains in storage
4. **If Clean**:
   - **Update Database**: Set user's `avatar_url` to new image
   - **Avatar Goes Live**: User sees new avatar

**Key Features**:
- ✅ Immediate deletion upon rejection
- ✅ Automatic revert to default avatar
- ✅ User notification sent
- ✅ Complete cleanup from storage
- ✅ No storage waste

**Example Log Output (Rejection)**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ AVATAR REJECTED - INITIATING IMMEDIATE DELETION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Rejection reasons: explicit nudity
🗑️ Step 1: Deleting rejected image from storage: user123/avatar.jpg
✅ Rejected image deleted from Bunny.net storage
🗑️ Step 2: Reverting user avatar to default...
✅ User avatar reverted to default
📧 Step 3: Creating rejection notification...
✅ Rejection notification created
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ REJECTED AVATAR COMPLETELY DELETED
   - Bunny.net Storage: Deleted
   - User Avatar: Reverted to default
   - Notification: Sent to user
   - Storage cost: SAVED ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 🔧 Technical Implementation

### Bunny.net Video Deletion API

**Endpoint**: `DELETE https://video.bunnycdn.com/library/{library_id}/videos/{video_id}`

**Headers**:
```
AccessKey: {BUNNY_STREAM_API_KEY}
```

**Response**:
- `200 OK`: Video deleted successfully
- `404 Not Found`: Video doesn't exist (already deleted)
- `403 Forbidden`: Invalid API key

**Video ID Extraction**:
The system handles multiple URL formats:
- `https://vz-xxxxx.b-cdn.net/abc123-def456-ghi789/playlist.m3u8`
- `https://vz-xxxxx.b-cdn.net/abc123-def456-ghi789/playlist.m3u8?v=Version_ID`
- `abc123-def456-ghi789` (just the ID)

### Database Schema

**Videos Table**:
```sql
CREATE TABLE videos (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  video_url TEXT,
  thumbnail_url TEXT,
  caption TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  is_approved BOOLEAN,
  moderation_status TEXT,
  moderation_notes TEXT,
  ...
);
```

**Notifications Table**:
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  type TEXT, -- 'video_rejected', 'avatar_rejected', etc.
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 📊 Monitoring & Logging

### Cleanup Job Monitoring
- **Logs**: Check Supabase Edge Function logs for cleanup job execution
- **Frequency**: Runs every hour at the start of the hour
- **Metrics**: Tracks deleted count, failed count, and total processed

## 🚀 Deployment Checklist

### Environment Variables Required

**Supabase Edge Functions**:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
BUNNY_STREAM_LIBRARY_ID=your-library-id
BUNNY_STREAM_API_KEY=your-api-key
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=ap-southeast-2
```

### Deployment Steps

1. **Deploy Edge Functions**:
   ```bash
   supabase functions deploy cleanup-expired-videos
   supabase functions deploy moderate-avatar
   ```

2. **Apply Database Migration**:
   ```bash
   supabase db push
   ```
   This will create the hourly cron job.

3. **Verify Cron Job**:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'cleanup-expired-videos-hourly';
   ```

4. **Test Cleanup Function**:
   ```bash
   curl -X POST https://your-project.supabase.co/functions/v1/cleanup-expired-videos \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

## 💰 Storage Cost Savings

### Before Implementation
- Expired videos (3+ days old): **Stored indefinitely** ❌
- Rejected videos: **Stored indefinitely** ❌
- Rejected avatars: **Stored indefinitely** ❌
- **Result**: Wasted storage costs on Bunny.net

### After Implementation
- Expired videos (3+ days old): **Deleted automatically every hour** ✅
- Rejected videos: **Deleted immediately upon rejection** ✅
- Rejected avatars: **Deleted immediately upon rejection** ✅
- **Result**: Zero storage waste, maximum cost savings

### Estimated Savings
Assuming:
- 1000 videos uploaded per day
- 10% rejection rate (100 rejected videos/day)
- Average video size: 10 MB
- Bunny.net storage cost: $0.01/GB/month

**Monthly Savings**:
- Rejected videos: 100 videos/day × 10 MB × 30 days = 30 GB = **$0.30/month**
- Expired videos: 1000 videos/day × 10 MB × 30 days = 300 GB = **$3.00/month**
- **Total Savings**: **$3.30/month** (scales with usage)

At scale (10,000 videos/day): **$33/month savings**

## 🎉 Summary

### What Was Implemented

1. ✅ **Hourly Automated Cleanup Job**
   - Runs every hour via Supabase pg_cron
   - Deletes videos older than 3 days
   - Removes from Bunny.net AND database
   - Comprehensive logging and error handling

2. ✅ **Immediate Video Rejection Deletion**
   - Deletes rejected videos instantly upon AI moderation failure
   - Sends notification to user
   - Complete cleanup from all storage locations
   - Zero storage waste

3. ✅ **Immediate Avatar Rejection Deletion**
   - Deletes rejected avatars instantly upon AI moderation failure
   - Reverts user avatar to default
   - Sends notification to user
   - Complete cleanup from storage

### User Experience

**For Expired Videos**:
- Users will **never see** "Expired" videos in their profile
- Videos are **completely gone** after 3 days
- No manual cleanup required

**For Rejected Content**:
- Users receive a **notification** explaining the rejection
- Rejected content is **immediately deleted** (not accessible)
- Users can upload new content immediately
- No storage waste

### Storage Cost Savings
- ✅ **Zero storage waste** on Bunny.net
- ✅ **Automatic cleanup** every hour
- ✅ **Immediate deletion** of rejected content
- ✅ **Scalable** cost savings as usage grows

## 🔍 Troubleshooting

### Cleanup Job Not Running
1. Check cron job status:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'cleanup-expired-videos-hourly';
   ```
2. Check Edge Function logs in Supabase dashboard
3. Verify environment variables are set correctly

### Videos Not Being Deleted
1. Check Edge Function logs for errors
2. Verify Bunny.net API credentials
3. Test video ID extraction with sample URLs
4. Check database for expired videos:
   ```sql
   SELECT COUNT(*) FROM videos WHERE created_at < NOW() - INTERVAL '3 days';
   ```

### Moderation Not Deleting Rejected Content
1. Verify AWS Rekognition credentials
2. Check Bunny.net API credentials
3. Verify deletion function is being called

## 📚 Related Documentation
- [AWS Rekognition Setup](./AWS_REKOGNITION_COMPLETE_SETUP.md)
- [Bunny.net Integration](./BUNNY_NET_INTEGRATION.md)
- [Video Lifecycle Management](./VIDEO_LIFECYCLE_IMPLEMENTATION.md)
