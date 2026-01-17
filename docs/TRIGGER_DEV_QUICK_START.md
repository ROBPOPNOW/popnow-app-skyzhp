
# Trigger.dev Video Moderation - Quick Start Guide

## 🚀 Quick Setup (5 Minutes)

### Step 1: Get Trigger.dev Credentials

1. Go to [trigger.dev](https://trigger.dev) and sign up
2. Create a new project
3. Copy your **Project ID** (starts with `proj_`)
4. Copy your **Secret Key** (starts with `tr_`)

### Step 2: Update Configuration

Edit `trigger.config.ts` and replace the project ID:

```typescript
export default defineConfig({
  project: "proj_YOUR_ACTUAL_PROJECT_ID", // Replace this!
  // ... rest of config
});
```

### Step 3: Set Trigger.dev Environment Variables

In your Trigger.dev project dashboard, add these environment variables:

```bash
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=ap-southeast-2
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Step 4: Set Supabase Edge Function Secrets

Run these commands:

```bash
supabase secrets set TRIGGER_SECRET_KEY=your_trigger_dev_secret_key
supabase secrets set TRIGGER_API_URL=https://api.trigger.dev
```

### Step 5: Deploy

Deploy the Trigger.dev task:

```bash
npm run trigger:deploy
```

Deploy the Supabase Edge Function:

```bash
supabase functions deploy trigger-video-moderation
```

### Step 6: Test

Upload a video through your app and check:

1. **Trigger.dev Dashboard**: https://cloud.trigger.dev
   - You should see a new task run
   - Check logs for frame extraction and moderation results

2. **Supabase Database**: Query the `videos` table
   ```sql
   SELECT id, is_approved, moderation_status, moderation_notes
   FROM videos
   ORDER BY created_at DESC
   LIMIT 5;
   ```

## ✅ Success Indicators

- ✅ Task appears in Trigger.dev dashboard
- ✅ Logs show "7 frames extracted"
- ✅ Logs show "All frames processed"
- ✅ Database shows `is_approved = true` or `false`
- ✅ User receives notification if rejected

## 🔧 Troubleshooting

### "AWS credentials not configured"
→ Add AWS credentials to Trigger.dev environment variables

### "Supabase credentials not configured"
→ Add Supabase URL and service role key to Trigger.dev

### "Failed to download video"
→ Check video URL is publicly accessible

### "FFmpeg error"
→ Ensure `ffmpeg()` extension is in `trigger.config.ts`

### "Task not triggering"
→ Check `TRIGGER_SECRET_KEY` in Supabase Edge Function secrets

## 📊 How to Monitor

### Real-time Logs

```bash
# Trigger.dev logs (in separate terminal)
npm run trigger:dev

# Supabase Edge Function logs
supabase functions logs trigger-video-moderation --follow
```

### Database Monitoring

```sql
-- Check moderation statistics
SELECT 
  moderation_status,
  COUNT(*) as count
FROM videos
GROUP BY moderation_status;

-- Check recent rejections
SELECT 
  id,
  created_at,
  moderation_notes
FROM videos
WHERE is_approved = false
ORDER BY created_at DESC
LIMIT 10;
```

## 💰 Cost Estimate

- **Per video**: ~$0.007 (7 frames × $0.001 per image)
- **1,000 videos/month**: $7.00
- **10,000 videos/month**: $70.00

## 🎯 Next Steps

1. ✅ Test with various video types (clean, inappropriate)
2. ✅ Monitor approval rates
3. ✅ Set up alerts for high rejection rates
4. ✅ Review rejected videos periodically
5. ✅ Adjust confidence threshold if needed (currently 80%)

## 📚 Full Documentation

See `TRIGGER_DEV_IMPLEMENTATION_COMPLETE.md` for:
- Detailed architecture
- Integration examples
- Security considerations
- Advanced configuration
- Troubleshooting guide

## 🆘 Need Help?

1. Check Trigger.dev docs: https://trigger.dev/docs
2. Check AWS Rekognition docs: https://docs.aws.amazon.com/rekognition/
3. Review Supabase Edge Functions: https://supabase.com/docs/guides/functions

---

**You're all set! 🎉**

The video moderation system is now configured and ready to use. Every video uploaded will be automatically moderated using the 5-second frame sampling rule.
