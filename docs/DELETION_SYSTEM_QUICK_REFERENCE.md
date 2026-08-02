
# 🚀 Deletion System Quick Reference

## ✅ System Status: FULLY OPERATIONAL

Your automated deletion system is **active and working correctly**. Here's everything you need to know:

---

## 📊 What's Happening Right Now

### Hourly Cron Job
- **Status**: ✅ ACTIVE
- **Schedule**: Every hour at minute 0 (1:00, 2:00, 3:00, etc.)
- **What it does**: Deletes videos older than 3 days from Bunny.net and Supabase
- **Current expired videos**: 9 videos (will be deleted on next hourly run)

### AI Moderation Deletion
- **Status**: ✅ ACTIVE
- **What it does**: Immediately deletes rejected videos and avatars when AWS AI moderation fails
- **Trigger**: Automatic on every upload

---

## 🔍 How to Check if It's Working

### Quick Check (SQL)
```sql
-- Check cron job status
SELECT jobname, schedule, active 
FROM cron.job 
WHERE jobname = 'delete-expired-videos-hourly';

-- Check for expired videos (should be 0 after system runs)
SELECT COUNT(*) as expired_videos
FROM videos
WHERE created_at < NOW() - INTERVAL '3 days';
```

### Check Logs
1. Go to **Supabase Dashboard** → **Edge Functions** → `delete-expired-videos` → **Logs**
2. Look for: `✅ Successfully deleted: X videos`

### Check Bunny.net
1. Go to **Bunny.net Dashboard** → **Stream** → **Videos**
2. Verify: No videos older than 3 days

---

## 🛠️ Manual Trigger (For Testing)

If you want to delete expired videos **right now** instead of waiting for the hourly run:

```sql
SELECT public.trigger_video_cleanup_now();
```

This will immediately run the cleanup function.

---

## ⚠️ Troubleshooting

### Problem: Expired videos are not being deleted

**Solution 1**: Check if cron job is active
```sql
SELECT active FROM cron.job WHERE jobname = 'delete-expired-videos-hourly';
```

If it returns `false`, activate it:
```sql
UPDATE cron.job SET active = true WHERE jobname = 'delete-expired-videos-hourly';
```

**Solution 2**: Check Edge Function secrets

Go to **Supabase Dashboard** → **Edge Functions** → **Secrets**

Verify these exist:
- `EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID`
- `EXPO_PUBLIC_BUNNY_STREAM_API_KEY`

**Solution 3**: Check logs for errors

Go to **Supabase Dashboard** → **Edge Functions** → `delete-expired-videos` → **Logs**

Look for error messages starting with `❌`

---

### Problem: AI-rejected videos are still stored

**Solution**: Check the `moderate-video` Edge Function logs

Go to **Supabase Dashboard** → **Edge Functions** → `moderate-video` → **Logs**

Look for errors from the AWS Rekognition call or the Bunny.net delete step

---

## 📋 Environment Variables

### Supabase Edge Function Secrets
✅ All configured correctly with the right names:
- `EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID`
- `EXPO_PUBLIC_BUNNY_STREAM_API_KEY`
- `EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME`
- `EXPO_PUBLIC_BUNNY_STORAGE_API_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

---

## 🎯 Success Criteria

Your system is working correctly when:

1. ✅ Cron job shows `active = true`
2. ✅ No videos older than 3 days in database
3. ✅ No videos older than 3 days in Bunny.net
4. ✅ Edge Function logs show successful deletions
5. ✅ Rejected videos are immediately deleted

---

## 📞 Need Help?

1. Check the full documentation: `docs/COMPLETE_DELETION_SYSTEM.md`
2. Review Edge Function logs in Supabase Dashboard
3. Verify all environment variables are set

---

**System Status**: ✅ FULLY OPERATIONAL
**Last Updated**: January 16, 2026
