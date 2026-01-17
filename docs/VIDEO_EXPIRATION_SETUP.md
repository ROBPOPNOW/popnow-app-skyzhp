
# Video Expiration and Cleanup Setup

## Overview

POPNOW implements a 3-day video expiration system where all videos are automatically deleted after 3 days from their creation date. This document explains how the system works and how to ensure it runs properly.

## How It Works

### 1. Video Expiration Tracking

When a video is uploaded, the `expires_at` field is automatically set to 3 days from the creation time:

```sql
-- In the videos table
expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '3 days')
```

### 2. Cleanup Edge Function

The `cleanup-expired-videos` Edge Function is responsible for:

- Finding all videos where `expires_at < NOW()`
- Deleting each video from Bunny.net Stream
- Deleting the video record from the database

Location: `supabase/functions/cleanup-expired-videos/index.ts`

### 3. User-Triggered Deletion

When users delete videos from their profile:

- The video is deleted from Bunny.net Stream immediately
- The video record is deleted from the database
- All related data (likes, comments) are cascade deleted

## Setup Instructions

### Option 1: Manual Trigger (Testing)

You can manually trigger the cleanup function for testing:

```bash
curl -X POST https://spdsgmkirubngfdxxrzj.supabase.co/functions/v1/cleanup-expired-videos \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### Option 2: Scheduled Execution (Recommended)

#### Using External Cron Service (e.g., cron-job.org, EasyCron)

1. Sign up for a free cron service like [cron-job.org](https://cron-job.org)
2. Create a new cron job with:
   - **URL**: `https://spdsgmkirubngfdxxrzj.supabase.co/functions/v1/cleanup-expired-videos`
   - **Method**: POST
   - **Schedule**: Every hour (or every 6 hours)
   - **Headers**: 
     ```
     Authorization: Bearer YOUR_ANON_KEY
     ```

3. Save and enable the cron job

#### Using GitHub Actions (Free)

Create `.github/workflows/cleanup-videos.yml`:

```yaml
name: Cleanup Expired Videos

on:
  schedule:
    # Run every hour
    - cron: '0 * * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Call Cleanup Function
        run: |
          curl -X POST https://spdsgmkirubngfdxxrzj.supabase.co/functions/v1/cleanup-expired-videos \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

Add `SUPABASE_ANON_KEY` to your GitHub repository secrets.

#### Using Supabase Database Webhooks (Paid Plan)

If you have a Supabase paid plan, you can use pg_cron:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup to run every hour
SELECT cron.schedule(
  'cleanup-expired-videos',
  '0 * * * *', -- Every hour
  $$
  SELECT net.http_post(
    url := 'https://spdsgmkirubngfdxxrzj.supabase.co/functions/v1/cleanup-expired-videos',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

### Option 3: Client-Side Trigger (Fallback)

As a fallback, the app can trigger cleanup when users open the app:

```typescript
// In app/_layout.tsx or similar
useEffect(() => {
  const triggerCleanup = async () => {
    try {
      await supabase.functions.invoke('cleanup-expired-videos');
    } catch (error) {
      console.error('Cleanup trigger failed:', error);
    }
  };

  // Trigger on app start
  triggerCleanup();

  // Trigger every 6 hours while app is open
  const interval = setInterval(triggerCleanup, 6 * 60 * 60 * 1000);
  
  return () => clearInterval(interval);
}, []);
```

## Monitoring

### Check Cleanup Logs

View Edge Function logs in Supabase Dashboard:

1. Go to Edge Functions
2. Select `cleanup-expired-videos`
3. View Logs tab

### Verify Deletion

Check if videos are being deleted:

```sql
-- Count expired videos that haven't been deleted yet
SELECT COUNT(*) 
FROM videos 
WHERE expires_at < NOW();

-- Should return 0 if cleanup is working properly
```

## Troubleshooting

### Videos Not Being Deleted

1. **Check if cleanup function is being called**:
   - View Edge Function logs
   - Look for "CLEANUP EXPIRED VIDEOS EDGE FUNCTION" messages

2. **Check Bunny.net API credentials**:
   - Verify `BUNNY_STREAM_LIBRARY_ID` is set
   - Verify `BUNNY_STREAM_API_KEY` is set
   - Test credentials manually

3. **Check video expiration dates**:
   ```sql
   SELECT id, created_at, expires_at, 
          NOW() - expires_at AS overdue
   FROM videos 
   WHERE expires_at < NOW()
   ORDER BY expires_at DESC;
   ```

### Bunny.net Deletion Failures

If videos are deleted from database but not from Bunny.net:

1. Check Bunny.net API key permissions
2. Verify video IDs are being extracted correctly
3. Check Bunny.net dashboard for orphaned videos
4. Manually delete orphaned videos if needed

### User Deletion Not Working

If user-triggered deletion fails:

1. Check browser console for errors
2. Verify Bunny.net API credentials in environment variables
3. Check that `deleteVideoFromBunnyNet` function is being called
4. Verify video URL format is correct

## Best Practices

1. **Run cleanup frequently**: Every 1-6 hours is recommended
2. **Monitor logs**: Check Edge Function logs weekly
3. **Test regularly**: Manually trigger cleanup to ensure it works
4. **Backup important videos**: Users should download videos they want to keep
5. **Clear communication**: Remind users about the 3-day expiration

## Environment Variables Required

```env
BUNNY_STREAM_LIBRARY_ID=your_library_id
BUNNY_STREAM_API_KEY=your_api_key
EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID=your_library_id
EXPO_PUBLIC_BUNNY_STREAM_API_KEY=your_api_key
```

## Summary

- ✅ Videos automatically expire 3 days after creation
- ✅ Cleanup function deletes expired videos from Bunny.net and database
- ✅ Users can manually delete videos anytime
- ✅ Manual deletion removes videos from both Bunny.net and database
- ✅ Expiry countdown is always visible on video cards
- ✅ System is fully automated once scheduled task is set up

## Next Steps

1. Choose a scheduling method (GitHub Actions recommended for free tier)
2. Set up the scheduled task
3. Test the cleanup function manually
4. Monitor logs for the first few days
5. Verify videos are being deleted as expected
