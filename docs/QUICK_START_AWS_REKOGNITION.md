
# AWS Rekognition - Quick Start Guide

## 🚀 Quick Setup (5 Minutes)

### Step 1: Get AWS Credentials

1. Log in to AWS Console: https://console.aws.amazon.com/
2. Navigate to **IAM** → **Users**
3. Create new user or use existing user
4. Attach policy: `AmazonRekognitionFullAccess`
5. Generate access keys
6. Copy **Access Key ID** and **Secret Access Key**

### Step 2: Set Supabase Secrets

**Using Supabase CLI:**
```bash
supabase secrets set AWS_ACCESS_KEY_ID=your_access_key_id
supabase secrets set AWS_SECRET_ACCESS_KEY=your_secret_access_key
supabase secrets set AWS_REGION=ap-southeast-2
```

**Or via Supabase Dashboard:**
1. Go to https://supabase.com/dashboard/project/spdsgmkirubngfdxxrzj
2. Navigate to **Edge Functions** → **Secrets**
3. Add three secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION` (value: `ap-southeast-2`)

### Step 3: Test

1. Upload an avatar with inappropriate content → Should be rejected
2. Upload a video with inappropriate content → Should be rejected
3. Check Edge Function logs to verify AWS Rekognition is being called

---

## 📊 How It Works

### Avatar Moderation
```
User uploads avatar
    ↓
Image sent to AWS Rekognition
    ↓
If flagged (Confidence > 80%):
    ❌ Image deleted
    ❌ Upload rejected
    🚨 User notified
    
If safe:
    ✅ Avatar updated
    🎉 Success
```

### Video Moderation
```
User uploads video
    ↓
Video uploaded to Bunny.net
    ↓
Thumbnail sent to AWS Rekognition
    ↓
If flagged (Confidence > 80%):
    ❌ is_approved = false
    ❌ Video hidden from feeds
    🚨 User notified
    
If safe:
    ✅ is_approved = true
    ✅ Video appears in feeds
    🎉 Success
```

---

## 🎯 Flagged Categories

Content is **REJECTED** if it contains:

1. **Explicit Nudity** (Confidence > 80%)
2. **Violence** (Confidence > 80%)

---

## 💰 Cost

**Current Implementation (Thumbnail Only):**
- 10,000 videos/month: **~$10/month**
- 100,000 videos/month: **~$100/month**

**With Frame Sampling (6 frames per video):**
- 10,000 videos/month: **~$60/month**
- 100,000 videos/month: **~$600/month**

---

## 🔍 Checking Logs

1. Go to Supabase Dashboard
2. Navigate to **Edge Functions**
3. Click on `moderate-avatar` or `moderate-video`
4. View **Logs** tab

**Look for:**
- ✅ "AWS Access Key ID configured: true"
- ✅ "AWS Rekognition response: {...}"
- ✅ "Image/Video approved" or "rejected"

---

## 🐛 Troubleshooting

### Issue: "Moderation service not configured"
**Solution:** Set AWS credentials as Supabase secrets (see Step 2)

### Issue: 403 Forbidden from AWS
**Solution:** 
1. Verify AWS credentials are correct
2. Check IAM user has `AmazonRekognitionFullAccess` policy
3. Ensure `AWS_REGION` is set to `ap-southeast-2`

### Issue: Videos stay in "pending" status
**Solution:**
1. Check Edge Function logs for errors
2. Verify AWS credentials are set
3. Ensure `moderate-video` function is deployed

---

## 📚 Full Documentation

For complete details, see:
- `docs/AWS_REKOGNITION_COMPLETE_SETUP.md` - Comprehensive setup guide
- `docs/MIGRATION_COMPLETE_AWS_REKOGNITION.md` - Migration summary

---

## ✅ Checklist

- [ ] AWS credentials obtained
- [ ] Supabase secrets set
- [ ] Avatar moderation tested
- [ ] Video moderation tested
- [ ] Edge Function logs checked
- [ ] Production deployment verified

---

**That's it! AWS Rekognition is now protecting your app from inappropriate content. 🎉**
