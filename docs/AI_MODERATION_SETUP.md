
# AI Moderation Setup Guide

## Overview

POPNOW includes AI-powered content moderation to ensure a safe and positive community. All uploaded videos are automatically scanned before being published.

## Current Implementation

The app includes a Supabase Edge Function (`moderate-video`) that handles content moderation. Currently, it uses a mock implementation for testing purposes.

## Integration Options

To enable real AI moderation, you can integrate one of the following services:

### 1. Hive AI (Recommended)
- **Website**: https://thehive.ai/
- **Features**: Video/image moderation, NSFW detection, violence detection
- **Pricing**: Pay-as-you-go, free tier available
- **Setup**:
  1. Sign up at https://thehive.ai/
  2. Get your API key
  3. Add to Supabase Edge Function secrets: `HIVE_API_KEY`
  4. Update the `moderateContent` function in `supabase/functions/moderate-video/index.ts`

```typescript
async function moderateContent(videoUrl: string): Promise<ModerationResult> {
  const response = await fetch('https://api.thehive.ai/api/v2/task/sync', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${Deno.env.get('HIVE_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: videoUrl,
      classes: ['adult', 'violence', 'hate_symbols', 'spam'],
    }),
  });

  const data = await response.json();
  
  return {
    safe: data.status[0].response.output.every(o => o.score < 0.7),
    categories: {
      adult: data.status[0].response.output.find(o => o.class === 'adult')?.score || 0,
      violence: data.status[0].response.output.find(o => o.class === 'violence')?.score || 0,
      hate: data.status[0].response.output.find(o => o.class === 'hate_symbols')?.score || 0,
      spam: data.status[0].response.output.find(o => o.class === 'spam')?.score || 0,
    },
    flagged: data.status[0].response.output
      .filter(o => o.score > 0.7)
      .map(o => o.class),
  };
}
```

### 2. WebPurify
- **Website**: https://www.webpurify.com/
- **Features**: Video moderation, profanity filtering
- **Pricing**: Subscription-based
- **Setup**: Similar to Hive AI, add `WEBPURIFY_API_KEY` to secrets

### 3. GetStream
- **Website**: https://getstream.io/
- **Features**: Comprehensive moderation, chat moderation
- **Pricing**: Free tier available
- **Setup**: Add `GETSTREAM_API_KEY` to secrets

### 4. OpenAI Moderation API
- **Website**: https://platform.openai.com/docs/guides/moderation
- **Features**: Text and image moderation
- **Pricing**: Free for now
- **Note**: Does not support video directly, but can moderate thumbnails and captions

## How It Works

1. **Upload**: User uploads a video with location and caption
2. **Storage**: Video is stored in Supabase Storage
3. **Database**: Video record is created with `moderation_status: 'pending'`
4. **Moderation**: Edge Function is called to analyze the video
5. **Decision**:
   - **Safe**: Status changed to `approved`, video appears in feeds
   - **Flagged**: Status changed to `flagged`, sent to admin review queue
6. **Notification**: User is notified of the result

## Database Schema

Videos table includes:
- `moderation_status`: 'pending' | 'approved' | 'rejected' | 'flagged'
- `moderation_result`: JSON object with scores and flagged categories

## Admin Dashboard

To review flagged content, you can:
1. Query videos with `moderation_status = 'flagged'`
2. Build an admin panel to review and approve/reject
3. Use Supabase Dashboard to manually update status

## Testing

The current mock implementation randomly flags content for testing. To test:
1. Upload a video
2. Check the database for `moderation_status`
3. Videos with status 'approved' will appear in feeds

## Next Steps

1. Choose a moderation service
2. Sign up and get API key
3. Add API key to Supabase Edge Function secrets
4. Update the `moderateContent` function
5. Test with real content
6. Build admin dashboard for reviewing flagged content

## Environment Variables

Add these to your Supabase project:
- `HIVE_API_KEY` (or your chosen service)
- `MODERATION_THRESHOLD` (optional, default 0.7)

## Support

For questions about AI moderation integration, refer to:
- Supabase Edge Functions docs: https://supabase.com/docs/guides/functions
- Your chosen moderation service documentation
