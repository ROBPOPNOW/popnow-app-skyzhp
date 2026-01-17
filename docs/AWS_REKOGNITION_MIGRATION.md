
# AWS Rekognition Migration Guide

## Overview

POPNOW has successfully migrated from Hive AI to AWS Rekognition for all content moderation. This document outlines the changes made and how the new system works.

## What Changed

### 1. Cleanup Phase ✅
- **Removed all Hive AI code** from both Edge Functions (`moderate-avatar` and `moderate-video`)
- **Removed Hive AI authentication headers** (`Authorization: Token` format)
- **Removed Hive AI API calls** to `https://api.thehive.ai/api/v2/task/sync`
- **Removed Hive AI-specific error handling** and troubleshooting code

### 2. Authentication Setup ✅
The backend now authenticates with AWS using environment variables:
- `AWS_ACCESS_KEY_ID` - Your AWS access key ID
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret access key
- `AWS_REGION` - Set to `ap-southeast-2` (Sydney, Australia)

**Important:** You need to set these environment variables in your Supabase Edge Functions secrets:
```bash
supabase secrets set AWS_ACCESS_KEY_ID=your_access_key_id
supabase secrets set AWS_SECRET_ACCESS_KEY=your_secret_access_key
supabase secrets set AWS_REGION=ap-southeast-2
```

### 3. Avatar Moderation Logic ✅

**File:** `supabase/functions/moderate-avatar/index.ts`

**Flow:**
1. User uploads a profile picture
2. Image is sent to AWS Rekognition `DetectModerationLabels` API
3. AWS analyzes the image and returns moderation labels with confidence scores
4. If any labels in the **'Explicit Nudity'** or **'Violence'** categories have a **Confidence Score > 80%**:
   - Upload is stopped
   - User is alerted with a clear message
   - Image is **immediately deleted** from the database/storage
5. If the image passes moderation:
   - Avatar is saved to the user's profile
   - User receives success confirmation

**Key Features:**
- Minimum confidence threshold: 80%
- Categories checked: Explicit Nudity, Violence
- Automatic deletion of rejected content
- Clear user feedback

### 4. Video Moderation Logic ✅

**File:** `supabase/functions/moderate-video/index.ts`

**Current Implementation:**
- Videos are moderated using their **thumbnail image** as a proxy
- Thumbnail is sent to AWS Rekognition `DetectModerationLabels`
- Same 80% confidence threshold applies
- If flagged, the `is_approved` column is set to `false`

**Database Updates:**
- Added `is_approved` column to `videos` table:
  - `true` = approved by moderation
  - `false` = rejected by moderation
  - `null` = pending moderation or error occurred
- Added `moderation_notes` column for tracking moderation details

**Future Enhancement - Periodic Frame Sampling:**
The code includes a placeholder function `extractFramesFromVideo()` for future implementation:
```typescript
// Logic: Extract 1 frame every 5 seconds (approx. 6-7 frames for a 30s video)
// Submit each frame as an individual image to AWS Rekognition moderation
// If any single frame is flagged with Confidence Score > 80%, set is_approved to false
```

**Note:** Full frame sampling requires:
1. Video download capability
2. FFmpeg or similar video processing library
3. Frame extraction at 5-second intervals
4. Individual moderation of each frame

### 5. Database Schema Changes ✅

**Migration Applied:** `add_is_approved_column_to_videos`

```sql
-- Add is_approved column to videos table
ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN videos.is_approved IS 'AWS Rekognition moderation result: true=approved, false=rejected, null=pending';

-- Add moderation_notes column if it doesn't exist
ALTER TABLE videos ADD COLUMN IF NOT EXISTS moderation_notes TEXT;
```

## AWS Rekognition Categories

AWS Rekognition DetectModerationLabels returns labels in these categories:
- **Explicit Nudity** (checked ✅)
- **Violence** (checked ✅)
- Suggestive
- Visually Disturbing
- Rude Gestures
- Drugs
- Tobacco
- Alcohol
- Gambling
- Hate Symbols

Currently, POPNOW only flags content in the **Explicit Nudity** and **Violence** categories with confidence > 80%.

## Error Handling

### Avatar Moderation
- If AWS credentials are missing: Returns error, user notified
- If image download fails: Returns error, user notified
- If AWS Rekognition fails: Returns error, user notified
- If content is flagged: Image deleted, user notified with specific reasons

### Video Moderation
- If AWS credentials are missing: Video marked as pending, requires manual review
- If thumbnail download fails: Video marked as pending, requires manual review
- If AWS Rekognition fails: Video marked as pending, requires manual review
- If content is flagged: `is_approved` set to `false`, user notified

## Testing

### Test Avatar Moderation
```bash
curl -X POST https://your-project.supabase.co/functions/v1/moderate-avatar \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-uuid",
    "imageUrl": "https://example.com/image.jpg"
  }'
```

### Test Video Moderation
```bash
curl -X POST https://your-project.supabase.co/functions/v1/moderate-video \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "video-uuid",
    "videoUrl": "https://example.com/video.mp4",
    "thumbnailUrl": "https://example.com/thumbnail.jpg"
  }'
```

## Monitoring

Check Edge Function logs to monitor moderation:
```bash
supabase functions logs moderate-avatar
supabase functions logs moderate-video
```

Look for:
- ✅ Successful moderation (approved)
- ❌ Flagged content (rejected)
- ⚠️ Errors or pending reviews

## Cost Considerations

AWS Rekognition pricing (as of 2024):
- First 1 million images/month: $1.00 per 1,000 images
- Over 1 million images/month: $0.80 per 1,000 images

For POPNOW:
- Each avatar upload = 1 API call
- Each video upload = 1 API call (thumbnail only, currently)
- Future frame sampling = 6-7 API calls per video (when implemented)

## Next Steps

### Immediate
1. ✅ Set AWS environment variables in Supabase secrets
2. ✅ Test avatar moderation with sample images
3. ✅ Test video moderation with sample videos
4. Monitor logs for any issues

### Future Enhancements
1. **Implement full video frame sampling:**
   - Extract frames every 5 seconds
   - Moderate each frame individually
   - Reject video if any frame is flagged
2. **Add more moderation categories** (optional):
   - Drugs, Tobacco, Alcohol
   - Hate Symbols
   - Rude Gestures
3. **Implement retry logic** for transient AWS errors
4. **Add moderation dashboard** for manual review of pending content

## Troubleshooting

### "AWS credentials not configured"
- Ensure `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set in Supabase secrets
- Verify the secrets are set for the correct project

### "Failed to download image"
- Check that the image URL is publicly accessible
- Verify the URL is not expired (for signed URLs)
- Ensure the image format is supported (JPEG, PNG)

### "AWS Rekognition error"
- Check AWS credentials are valid
- Verify AWS region is correct (`ap-southeast-2`)
- Ensure AWS account has Rekognition permissions
- Check AWS service status

### High false positive rate
- Consider adjusting the confidence threshold (currently 80%)
- Review AWS Rekognition documentation for category definitions
- Implement manual review queue for borderline cases

## Support

For issues or questions:
1. Check Edge Function logs: `supabase functions logs moderate-avatar` or `moderate-video`
2. Review AWS CloudWatch logs for Rekognition API calls
3. Check AWS IAM permissions for the credentials being used
4. Verify environment variables are set correctly

## References

- [AWS Rekognition Documentation](https://docs.aws.amazon.com/rekognition/)
- [DetectModerationLabels API](https://docs.aws.amazon.com/rekognition/latest/dg/moderation.html)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
