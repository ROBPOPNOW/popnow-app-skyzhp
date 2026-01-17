
# Trigger.dev Video Moderation Implementation - Complete Guide

## Overview

This document provides a complete guide for the Trigger.dev video moderation system implemented for POPNOW. The system uses a cost-effective approach to moderate videos by:

1. **Extracting frames** at 5-second intervals (7 frames total for 30s videos)
2. **Parallel processing** all frames through AWS Rekognition
3. **Automatic rejection** if ANY frame has inappropriate content with >80% confidence
4. **Database sync** to update video approval status

## Architecture

```
Video Upload → Supabase Edge Function → Trigger.dev Task → AWS Rekognition → Database Update
```

### Components

1. **trigger.config.ts** - Trigger.dev configuration with FFmpeg extension
2. **trigger/moderate-pop-video.ts** - Main moderation task
3. **supabase/functions/trigger-video-moderation/index.ts** - Edge Function to trigger the task
4. **trigger/index.ts** - Task exports

## Setup Instructions

### 1. Install Dependencies

All required dependencies are already installed:
- `@trigger.dev/sdk@latest` ✅
- `@trigger.dev/build@latest` ✅
- `fluent-ffmpeg` ✅
- `@aws-sdk/client-rekognition` ✅

### 2. Configure Trigger.dev

1. Sign up at [trigger.dev](https://trigger.dev)
2. Create a new project
3. Get your project ID and secret key
4. Update `trigger.config.ts` with your project ID

### 3. Set Environment Variables

#### In Trigger.dev Dashboard:

Set these environment variables in your Trigger.dev project settings:

```bash
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=ap-southeast-2
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

#### In Supabase Edge Function Secrets:

```bash
TRIGGER_SECRET_KEY=your_trigger_dev_secret_key
TRIGGER_API_URL=https://api.trigger.dev  # Optional, defaults to this
```

### 4. Deploy Trigger.dev Task

Run the following command to deploy your task:

```bash
npm run trigger:deploy
```

### 5. Deploy Supabase Edge Function

The Edge Function `trigger-video-moderation` is already created. Deploy it using:

```bash
supabase functions deploy trigger-video-moderation
```

## How It Works

### The 5-Second Rule

The system extracts exactly 7 frames from each video:
- Frame 1: 0 seconds
- Frame 2: 5 seconds
- Frame 3: 10 seconds
- Frame 4: 15 seconds
- Frame 5: 20 seconds
- Frame 6: 25 seconds
- Frame 7: 30 seconds

This ensures comprehensive coverage of the entire video while keeping costs low.

### Parallel Processing

All 7 frames are sent to AWS Rekognition simultaneously using `Promise.all()`, which:
- Reduces total processing time by ~7x
- Provides faster feedback to users
- Maintains cost-effectiveness

### Moderation Logic

```typescript
if (ANY frame has confidence > 80% for):
  - Explicit Nudity
  - Violence
  - Graphic Gore
then:
  is_approved = false
  moderation_status = "rejected"
  Send notification to user
else:
  is_approved = true
  moderation_status = "approved"
```

## Integration with Your App

### Triggering Moderation

After a video is uploaded, call the Edge Function:

```typescript
const response = await fetch(
  `${SUPABASE_URL}/functions/v1/trigger-video-moderation`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      videoId: video.id,
      videoUrl: video.video_url,
      thumbnailUrl: video.thumbnail_url,
    }),
  }
);
```

### Checking Moderation Status

Query the `videos` table:

```typescript
const { data: video } = await supabase
  .from('videos')
  .select('is_approved, moderation_status, moderation_notes')
  .eq('id', videoId)
  .single();

if (video.is_approved === true) {
  // Video approved - show to users
} else if (video.is_approved === false) {
  // Video rejected - show error to uploader
} else {
  // Still processing - show loading state
}
```

## Database Schema

The `videos` table includes these moderation fields:

```sql
- is_approved: boolean | null
  -- true = approved, false = rejected, null = pending

- moderation_status: text
  -- 'pending' | 'approved' | 'rejected' | 'flagged'

- moderation_notes: text
  -- Human-readable explanation

- moderation_result: jsonb
  -- Full AWS Rekognition response for each frame
```

## Cost Analysis

### Per Video Cost Breakdown:

1. **Video Download**: Free (Supabase Storage)
2. **Frame Extraction**: Free (Trigger.dev compute)
3. **AWS Rekognition**: $0.001 per image × 7 frames = **$0.007 per video**
4. **Database Update**: Free (Supabase)

### Monthly Cost Estimate:

- 1,000 videos/month: **$7.00**
- 10,000 videos/month: **$70.00**
- 100,000 videos/month: **$700.00**

This is significantly cheaper than:
- Full video analysis: ~$0.10 per video
- Real-time streaming analysis: ~$0.50 per video
- Manual moderation: ~$5.00 per video

## Testing

### Local Development

Run the Trigger.dev dev server:

```bash
npm run trigger:dev
```

### Test the Task

You can test the task by calling the Edge Function with a test video:

```bash
curl -X POST \
  https://YOUR_PROJECT.supabase.co/functions/v1/trigger-video-moderation \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "videoId": "test-video-id",
    "videoUrl": "https://example.com/test-video.mp4",
    "thumbnailUrl": "https://example.com/test-thumbnail.jpg"
  }'
```

## Monitoring

### Trigger.dev Dashboard

View task runs, logs, and errors at:
https://cloud.trigger.dev/projects/YOUR_PROJECT_ID/runs

### Supabase Logs

Check Edge Function logs:
```bash
supabase functions logs trigger-video-moderation
```

### Database Queries

Monitor moderation statistics:

```sql
-- Approval rate
SELECT 
  moderation_status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM videos
GROUP BY moderation_status;

-- Recent rejections
SELECT 
  id,
  created_at,
  moderation_notes
FROM videos
WHERE is_approved = false
ORDER BY created_at DESC
LIMIT 10;
```

## Troubleshooting

### Task Not Triggering

1. Check Trigger.dev secret key in Supabase Edge Function secrets
2. Verify Trigger.dev project ID in `trigger.config.ts`
3. Check Edge Function logs for errors

### Frame Extraction Failing

1. Ensure FFmpeg extension is included in `trigger.config.ts`
2. Check video URL is accessible
3. Verify video format is supported (MP4 recommended)

### AWS Rekognition Errors

1. Verify AWS credentials are correct
2. Check AWS region is set to `ap-southeast-2`
3. Ensure AWS account has Rekognition permissions

### Database Not Updating

1. Check Supabase service role key is set
2. Verify video ID exists in database
3. Check RLS policies allow updates

## Security Considerations

1. **Service Role Key**: Only used in Trigger.dev (server-side), never exposed to client
2. **AWS Credentials**: Stored securely in Trigger.dev environment variables
3. **Video URLs**: Should be signed URLs with expiration
4. **User Notifications**: Only sent to video owner

## Future Enhancements

1. **Adaptive Frame Sampling**: Extract more frames for longer videos
2. **Custom Categories**: Add brand-specific moderation rules
3. **Appeal System**: Allow users to appeal rejections
4. **Batch Processing**: Process multiple videos in parallel
5. **ML Model Training**: Use rejection data to improve accuracy

## Support

For issues or questions:
1. Check Trigger.dev documentation: https://trigger.dev/docs
2. Review AWS Rekognition docs: https://docs.aws.amazon.com/rekognition/
3. Check Supabase Edge Functions guide: https://supabase.com/docs/guides/functions

## Summary

✅ **Cost-Effective**: ~$0.007 per video
✅ **Fast**: Parallel processing of all frames
✅ **Reliable**: Automatic retries and error handling
✅ **Scalable**: Handles high volume without performance degradation
✅ **Secure**: All credentials stored server-side
✅ **Comprehensive**: 7 frames ensure full video coverage

The system is now ready for production use! 🎉
