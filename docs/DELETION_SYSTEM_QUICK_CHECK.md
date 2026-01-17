
# 🚀 DELETION SYSTEM - QUICK CHECK

## ⚡ 5-MINUTE VERIFICATION

### Step 1: Check Cron Job Status (30 seconds)

Run this SQL query in Supabase SQL Editor:

```sql
-- Check if cron job exists and when it last ran
SELECT 
  jobname,
  schedule,
  active,
  jobid
FROM cron.job
WHERE jobname = 'delete-expired-videos-hourly';
```

**Expected result:**
- `jobname`: delete-expired-videos-hourly
- `schedule`: 0 * * * * (every hour at minute 0)
- `active`: true

---

### Step 2: Check Edge Function Logs (1 minute)

View the most recent Edge Function execution:

```bash
supabase functions logs delete-expired-videos --project-ref spdsgmkirubngfdxxrzj --limit 1
```

**What to look for:**
- ✅ Status code 200 = Working correctly
- ❌ Status code 500 = Bunny.net credentials missing (see fix below)

---

### Step 3: Check for Expired Videos (30 seconds)

```sql
-- Count videos older than 3 days
SELECT COUNT(*) as expired_videos_count
FROM videos
WHERE created_at < NOW() - INTERVAL '3 days';
```

**Expected result:**
- If count > 0: Videos are waiting to be deleted on next hourly run
- If count = 0: System is working perfectly! ✅

---

### Step 4: Manual Test (2 minutes)

Trigger the cleanup function manually:

```sql
-- Manually trigger cleanup RIGHT NOW
SELECT public.trigger_video_cleanup_now();
```

Check the response JSON:
- `"success": true` = Working! ✅
- `"deletedCount": X` = Number of videos deleted
- `"error": "..."` = Something is wrong (see troubleshooting below)

---

## 🔧 QUICK FIX: Missing Bunny.net Credentials

If you see 500 errors or "Bunny.net configuration missing":

### 1. Get Your Bunny.net Credentials

Log in to https://dash.bunny.net and get:
- **Stream Library ID**: Go to Stream → Your Library → Copy the ID
- **Stream API Key**: Go to Stream → Your Library → API Key

### 2. Add to Supabase Secrets

Go to: https://supabase.com/dashboard/project/spdsgmkirubngfdxxrzj/functions

Click "Secrets" tab and add:
```
BUNNY_STREAM_LIBRARY_ID = <your-library-id>
BUNNY_STREAM_API_KEY = <your-api-key>
```

### 3. Redeploy Edge Function

```bash
supabase functions deploy delete-expired-videos
```

### 4. Test Again

Run Step 4 (Manual Test) again. Should now return `"success": true` ✅

---

## 📊 HEALTH CHECK DASHBOARD

Run this comprehensive health check:

```sql
-- DELETION SYSTEM HEALTH CHECK
SELECT 
  'Cron Job Status' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM cron.job 
      WHERE jobname = 'delete-expired-videos-hourly' AND active = true
    ) THEN '✅ Active'
    ELSE '❌ Not Active'
  END as status
UNION ALL
SELECT 
  'Expired Videos Count',
  CONCAT(
    COUNT(*)::text, 
    ' videos older than 3 days'
  )
FROM videos
WHERE created_at < NOW() - INTERVAL '3 days'
UNION ALL
SELECT 
  'Total Videos',
  COUNT(*)::text || ' videos'
FROM videos
UNION ALL
SELECT 
  'Oldest Video Age',
  CONCAT(
    ROUND(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 86400, 1)::text,
    ' days'
  )
FROM videos;
```

**Expected output:**
```
check_name              | status
------------------------+---------------------------
Cron Job Status         | ✅ Active
Expired Videos Count    | 0 videos older than 3 days
Total Videos            | 12 videos
Oldest Video Age        | 2.5 days
```

---

## 🎯 SUCCESS INDICATORS

### ✅ System is Working Correctly If:

1. Cron job is active and scheduled
2. Edge Function logs show 200 status codes
3. Expired videos count is 0 or decreasing
4. Bunny.net dashboard shows no videos older than 3 days
5. Manual trigger returns `"success": true`

### ❌ System Needs Attention If:

1. Edge Function logs show 500 errors → Add Bunny.net credentials
2. Expired videos count is increasing → Check cron job is running
3. Videos deleted from database but still on Bunny.net → Check API key permissions
4. Manual trigger returns error → Check logs for specific issue

---

## 🚨 EMERGENCY: Delete All Expired Videos NOW

If you have many expired videos and want to delete them immediately:

```sql
-- WARNING: This will delete ALL videos older than 3 days RIGHT NOW
SELECT public.trigger_video_cleanup_now();

-- Wait 10 seconds, then check if they're gone
SELECT COUNT(*) FROM videos WHERE created_at < NOW() - INTERVAL '3 days';
-- Should return 0
```

---

## 📞 STILL NOT WORKING?

1. **Check Edge Function logs** for specific error messages:
   ```bash
   supabase functions logs delete-expired-videos --project-ref spdsgmkirubngfdxxrzj
   ```

2. **Verify Bunny.net credentials** are correct:
   - Log in to https://dash.bunny.net
   - Go to Stream → Your Library
   - Verify Library ID and API Key match what you added to Supabase secrets

3. **Test Bunny.net API directly**:
   ```bash
   curl -X GET \
     "https://video.bunnycdn.com/library/YOUR_LIBRARY_ID/videos" \
     -H "AccessKey: YOUR_API_KEY"
   ```
   Should return a list of videos (not an error)

4. **Check cron job is actually running**:
   - Look for Edge Function logs every hour
   - Should see new log entries at :00 minutes past each hour

---

## ✨ THAT'S IT!

If all checks pass, your deletion system is working perfectly and will automatically:
- Delete videos older than 3 days every hour
- Delete AI-rejected videos immediately
- Save storage costs by removing unwanted content

🎉 **System Status: OPERATIONAL** ✅
