
# 🚀 Video Deletion System - Quick Reference

## ⚡ Quick Status Check

```sql
-- Check if system is working
SELECT 
  (SELECT COUNT(*) FROM cron.job WHERE jobname = 'delete-expired-videos-hourly' AND active = true) as cron_active,
  (SELECT COUNT(*) FROM videos WHERE created_at < NOW() - INTERVAL '3 days') as expired_videos_count;
```

**Expected:** `cron_active: 1`, `expired_videos_count: 0` (after first run)

---

## 🔧 Common Commands

### **View Cron Job:**
```sql
SELECT jobid, jobname, schedule, active 
FROM cron.job 
WHERE jobname = 'delete-expired-videos-hourly';
```

### **Count Expired Videos:**
```sql
SELECT COUNT(*) FROM videos WHERE created_at < NOW() - INTERVAL '3 days';
```

### **View Expired Videos:**
```sql
SELECT id, caption, created_at, 
  EXTRACT(EPOCH FROM (NOW() - created_at))/3600 as hours_old
FROM videos 
WHERE created_at < NOW() - INTERVAL '3 days'
ORDER BY created_at ASC;
```

### **Manual Trigger (Testing):**
```bash
curl -X POST https://spdsgmkirubngfdxxrzj.supabase.co/functions/v1/delete-expired-videos \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## 📊 Monitoring

### **Edge Function Logs:**
1. Supabase Dashboard → Edge Functions → `delete-expired-videos` → Logs
2. Look for: `🧹 DELETE EXPIRED VIDEOS - HOURLY JOB STARTED`

### **Cron Job History:**
```sql
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'delete-expired-videos-hourly')
ORDER BY start_time DESC 
LIMIT 10;
```

---

## 🚨 Emergency Actions

### **Disable Automatic Deletion:**
```sql
SELECT cron.unschedule('delete-expired-videos-hourly');
```

### **Re-enable Automatic Deletion:**
```sql
SELECT cron.schedule(
  'delete-expired-videos-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://spdsgmkirubngfdxxrzj.supabase.co/functions/v1/delete-expired-videos',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

---

## ✅ Health Check Checklist

- [ ] Cron job is active
- [ ] Edge Function is deployed
- [ ] No expired videos in database
- [ ] Video tab shows only recent videos
- [ ] Edge Function logs show successful runs

---

## 📞 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Videos not deleting | Check Edge Function logs for errors |
| Cron job not running | Verify `active = true` in cron.job table |
| Bunny.net errors | Check BUNNY_STREAM_LIBRARY_ID and BUNNY_STREAM_API_KEY secrets |
| Videos still visible | Frontend is caching - refresh the app |

---

**System:** Automated Video Deletion
**Schedule:** Every hour at minute 0
**Retention:** 3 days (72 hours)
**Status:** ✅ Operational
