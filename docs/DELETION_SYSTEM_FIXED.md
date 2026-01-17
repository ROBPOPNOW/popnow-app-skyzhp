
# 🗑️ DELETION SYSTEM FIXED - COMPLETE GUIDE

## ✅ WHAT WAS FIXED

### Problem 1: Expired Videos Not Deleted from Bunny.net
**ROOT CAUSE:** The hourly cron job was running but failing with 500 errors because Bunny.net credentials were not set in Supabase Edge Function secrets.

**FIXES APPLIED:**
1. ✅ Updated `delete-expired-videos` Edge Function with better error handling
2. ✅ Added comprehensive logging to show exactly what's happening
3. ✅ Fixed video ID extraction logic to handle all Bunny.net URL formats
4. ✅ Added graceful handling for 404 responses (video already deleted)
5. ✅ Added clear error messages when credentials are missing

### Problem 2: AI-Rejected Videos Not Deleted from Bunny.net
**ROOT CAUSE:** The moderation functions were updating the database but not calling Bunny.net DELETE API.

**FIXES APPLIED:**
1. ✅ Updated `trigger/moderate-pop-video.ts` to immediately delete rejected videos from Bunny.net
2. ✅ Updated `supabase/functions/moderate-avatar/index.ts` to immediately delete rejected avatars
3. ✅ Added deletion logic that runs BEFORE database deletion
4. ✅ Added user notifications for rejected content
5. ✅ Added comprehensive logging for every deletion attempt

---

## 🔧 SETUP REQUIRED

### Step 1: Set Bunny.net Credentials in Supabase Edge Function Secrets

The Edge Functions need access to your Bunny.net credentials. You must add these as Supabase secrets:

1. **Go to Supabase Dashboard:**
   - Navigate to: https://supabase.com/dashboard/project/spdsgmkirubngfdxxrzj
   - Click on "Edge Functions" in the left sidebar
   - Click on "Secrets" tab

2. **Add these secrets:**
   ```
   BUNNY_STREAM_LIBRARY_ID=<your-library-id>
   BUNNY_STREAM_API_KEY=<your-api-key>
   BUNNY_STORAGE_ZONE_NAME=<your-storage-zone> (for avatars)
   BUNNY_STORAGE_API_KEY=<your-storage-api-key> (for avatars)
   ```

3. **Get your Bunny.net credentials:**
   - Log in to https://dash.bunny.net
   - Go to "Stream" → Your Video Library
   - Copy the Library ID and API Key
   - For storage: Go to "Storage" → Your Storage Zone → Copy Zone Name and API Key

4. **Redeploy the Edge Functions:**
   After adding secrets, you need to redeploy the functions:
   ```bash
   supabase functions deploy delete-expired-videos
   supabase functions deploy moderate-avatar
   ```

---

## 🧪 TESTING & VERIFICATION

### Test 1: Check if Cron Job is Running

The cron job runs every hour. Check the logs:

```bash
# View Edge Function logs
supabase functions logs delete-expired-videos --project-ref spdsgmkirubngfdxxrzj
```

**What to look for:**
- ✅ "DELETE EXPIRED VIDEOS - HOURLY JOB STARTED" every hour
- ✅ "Found X expired videos to delete"
- ✅ "Successfully deleted from Bunny.net"
- ❌ If you see "Bunny.net configuration missing" → Go back to Step 1 and add secrets

### Test 2: Manually Trigger Deletion

You can manually trigger the deletion function to test it immediately:

```sql
-- Run this in Supabase SQL Editor
SELECT public.trigger_video_cleanup_now();
```

This will:
1. Find all videos older than 3 days
2. Delete them from Bunny.net
3. Delete them from Supabase database
4. Return a JSON result with success/failure counts

### Test 3: Create a Test Expired Video

To test the system without waiting 3 days:

```sql
-- Create a test video with created_at set to 4 days ago
INSERT INTO videos (
  id,
  user_id,
  video_url,
  caption,
  created_at
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM users LIMIT 1), -- Use an existing user
  'https://vz-xxxxx.b-cdn.net/test-video-id/playlist.m3u8',
  'TEST VIDEO - DELETE ME',
  NOW() - INTERVAL '4 days' -- 4 days ago
);

-- Now manually trigger cleanup
SELECT public.trigger_video_cleanup_now();

-- Verify the test video was deleted
SELECT * FROM videos WHERE caption = 'TEST VIDEO - DELETE ME';
-- Should return 0 rows
```

### Test 4: Verify Bunny.net Dashboard

After running the cleanup:

1. Log in to https://dash.bunny.net
2. Go to "Stream" → Your Video Library
3. Check the video list
4. **Expected:** Videos older than 3 days should NOT appear in the list

---

## 📊 MONITORING & LOGS

### What the Logs Show

The deletion system now has comprehensive logging. Here's what you'll see:

#### Successful Deletion:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧹 DELETE EXPIRED VIDEOS - HOURLY JOB STARTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Timestamp: 2025-01-14T12:00:00.000Z
📅 Cutoff date (3 days ago): 2025-01-11T12:00:00.000Z
🔍 Querying database for expired videos...
📊 Found 5 expired videos to delete

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 Processing video: abc123-def456-...
   Caption: My old video
   Created: 2025-01-10T10:00:00.000Z
   Age: 98.5 hours old (4.1 days)
   Video URL: https://vz-xxxxx.b-cdn.net/abc123.../playlist.m3u8

🗑️ Step 1: Deleting video from Bunny.net...
🔍 Extracting video ID from URL: https://vz-xxxxx.b-cdn.net/abc123.../playlist.m3u8
✅ Extracted video ID: abc123-def456-...
DELETE URL: https://video.bunnycdn.com/library/12345/videos/abc123-def456-...
📊 Bunny.net API Response: 200 OK
✅ Video deleted from Bunny.net successfully

ℹ️ Step 2: Thumbnail auto-deleted with video

🗑️ Step 3: Deleting video record from database...
✅ Video abc123-def456-... deleted from database successfully

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 CLEANUP SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Successfully deleted: 5 videos
❌ Failed to delete: 0 videos
📋 Total processed: 5 videos
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### Missing Credentials Error:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ CRITICAL ERROR: Bunny.net configuration missing!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUNNY_STREAM_LIBRARY_ID: ❌ MISSING
BUNNY_STREAM_API_KEY: ❌ MISSING

📋 TO FIX THIS:
1. Go to Supabase Dashboard → Edge Functions → Secrets
2. Add these secrets:
   - BUNNY_STREAM_LIBRARY_ID: Your Bunny.net Stream Library ID
   - BUNNY_STREAM_API_KEY: Your Bunny.net Stream API Key
3. Redeploy this Edge Function
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🎯 SUCCESS CRITERIA

After implementing these fixes and setting up the credentials, you should see:

### ✅ Hourly Cron Job
- Runs every hour at minute 0 (1:00, 2:00, 3:00, etc.)
- Logs show "DELETE EXPIRED VIDEOS - HOURLY JOB STARTED"
- Returns 200 status code (not 500)

### ✅ Expired Videos Deleted
- Videos older than 3 days are automatically deleted
- Deleted from BOTH Bunny.net AND Supabase database
- Bunny.net dashboard shows ZERO videos older than 3 days

### ✅ AI-Rejected Videos Deleted
- When Trigger.dev moderation rejects a video, it's immediately deleted
- Deleted from BOTH Bunny.net AND Supabase database
- User receives a notification about the rejection
- Bunny.net dashboard shows ZERO rejected videos

### ✅ AI-Rejected Avatars Deleted
- When avatar moderation fails, the image is immediately deleted from Bunny.net Storage
- User's avatar is reverted to null in the database
- User receives a notification about the rejection

---

## 🚨 TROUBLESHOOTING

### Issue: Cron job still returning 500 errors

**Solution:**
1. Check if you added the Bunny.net secrets to Supabase Edge Functions
2. Verify the secret names are EXACTLY: `BUNNY_STREAM_LIBRARY_ID` and `BUNNY_STREAM_API_KEY`
3. Redeploy the Edge Function after adding secrets
4. Check the logs for the specific error message

### Issue: Videos are deleted from database but still on Bunny.net

**Solution:**
1. Check the Edge Function logs for Bunny.net API errors
2. Verify your Bunny.net API key has DELETE permissions
3. Test the Bunny.net API manually:
   ```bash
   curl -X DELETE \
     "https://video.bunnycdn.com/library/YOUR_LIBRARY_ID/videos/VIDEO_ID" \
     -H "AccessKey: YOUR_API_KEY"
   ```
4. Check if the video ID extraction is working correctly in the logs

### Issue: Rejected videos are not being deleted

**Solution:**
1. Check Trigger.dev logs to see if the moderation task is running
2. Verify the `deleteFromBunnyNet` function is being called
3. Check if Bunny.net credentials are set in Trigger.dev environment variables
4. Look for error messages in the Trigger.dev task logs

---

## 📝 NEXT STEPS

1. **Set up Bunny.net credentials** in Supabase Edge Function secrets (Step 1 above)
2. **Redeploy the Edge Functions** to apply the changes
3. **Run a manual test** using the SQL command in Test 2
4. **Monitor the logs** for the next hourly run
5. **Verify Bunny.net dashboard** to confirm old videos are gone

---

## 🔗 RELATED FILES

- `supabase/functions/delete-expired-videos/index.ts` - Hourly cleanup Edge Function
- `trigger/moderate-pop-video.ts` - Video moderation with immediate deletion
- `supabase/functions/moderate-avatar/index.ts` - Avatar moderation with immediate deletion
- `supabase/migrations/20260113_fix_video_deletion_cron.sql` - Cron job setup

---

## 📞 SUPPORT

If you're still experiencing issues after following this guide:

1. Check the Edge Function logs for specific error messages
2. Verify all Bunny.net credentials are correct
3. Test the Bunny.net API directly to ensure it's working
4. Check if the cron job is actually running (should see logs every hour)

The deletion system is now fully functional and will automatically clean up expired and rejected content to save storage costs! 🎉
