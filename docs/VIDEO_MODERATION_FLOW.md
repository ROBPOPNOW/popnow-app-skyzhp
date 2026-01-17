
# Video Moderation Flow in POPNOW

## Overview
This document explains how video moderation works in POPNOW, from upload to approval/rejection.

## Flow Diagram

```
User Uploads Video
       ↓
Video Saved to Bunny.net
       ↓
Video Record Created in Database (status: 'pending')
       ↓
moderate-video Edge Function Called
       ↓
Hive AI API Called (or Mock if no API key)
       ↓
Moderation Result Returned
       ↓
Database Updated (status: 'approved' or 'flagged')
       ↓
User Sees Video in Feed (if approved) or Pending Tab (if flagged)
```

## Detailed Steps

### 1. Video Upload (`app/upload.tsx`)

When a user uploads a video:

```typescript
// Step 1: Create video in Bunny Stream
const streamVideo = await createStreamVideo(description);

// Step 2: Upload video file
await uploadToStream(streamVideo.guid, videoUri);

// Step 3: Save to database with status 'pending'
const { data: videoRecord } = await supabase
  .from('videos')
  .insert({
    user_id: user.id,
    video_url: streamVideo.guid,
    caption: description,
    moderation_status: 'pending', // ← Initial status
    // ... other fields
  });

// Step 4: Call moderation function
await supabase.functions.invoke('moderate-video', {
  body: {
    videoId: videoRecord.id,
    videoUrl: playbackUrl,
    thumbnailUrl: thumbnailUrl,
  },
});
```

### 2. Moderation Function (`moderate-video` Edge Function)

The edge function processes the video:

```typescript
// Check if Hive AI API key is set
const hiveApiKey = Deno.env.get('HIVE_API_KEY');

if (hiveApiKey) {
  // Call Hive AI API
  const response = await fetch('https://api.thehive.ai/api/v2/task/sync', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${hiveApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: thumbnailUrl || videoUrl,
      classes: [
        'general_nsfw',
        'general_suggestive',
        'yes_sexual_activity',
        // ... more classes
      ]
    })
  });
  
  // Parse response and determine if safe
  const moderationResult = parseHiveAIResponse(response);
} else {
  // Use mock moderation (auto-approve)
  const moderationResult = mockModeration();
}

// Update database
await supabase
  .from('videos')
  .update({
    moderation_status: moderationResult.safe ? 'approved' : 'flagged',
    moderation_result: moderationResult
  })
  .eq('id', videoId);
```

### 3. Video Display

Videos are displayed based on their moderation status:

#### Home Feed (`app/(tabs)/(home)/index.tsx`)
```typescript
// Only show approved videos
const { data: videos } = await supabase
  .from('videos')
  .select('*')
  .eq('moderation_status', 'approved')
  .order('created_at', { ascending: false });
```

#### Profile - Videos Tab (`app/(tabs)/profile.tsx`)
```typescript
// Show user's approved videos
const { data: videos } = await supabase
  .from('videos')
  .select('*')
  .eq('user_id', currentUser.id)
  .eq('moderation_status', 'approved')
  .order('created_at', { ascending: false });
```

#### Profile - Pending Tab (`app/(tabs)/profile.tsx`)
```typescript
// Show user's pending/flagged videos
const { data: pendingVideos } = await supabase
  .from('videos')
  .select('*')
  .eq('user_id', currentUser.id)
  .in('moderation_status', ['pending', 'flagged'])
  .order('created_at', { ascending: false });
```

## Moderation Statuses

### `pending`
- **When**: Video just uploaded, awaiting moderation
- **Visible**: Only in user's Pending tab
- **Action**: Waiting for Hive AI to process

### `approved`
- **When**: Hive AI determined content is safe
- **Visible**: In home feed and user's Videos tab
- **Action**: None, video is live

### `flagged`
- **When**: Hive AI detected potentially inappropriate content
- **Visible**: Only in user's Pending tab
- **Action**: Requires admin review (future feature)

### `rejected`
- **When**: Admin manually rejects video (future feature)
- **Visible**: Nowhere (hidden from all users)
- **Action**: User notified of rejection

## Hive AI Classes Checked

The moderation checks for these content types:

1. **general_nsfw** - General not-safe-for-work content
2. **general_suggestive** - Suggestive content
3. **yes_sexual_activity** - Sexual activity
4. **yes_realistic_nsfw** - Realistic NSFW content
5. **general_hate_symbols** - Hate symbols
6. **yes_self_harm** - Self-harm content
7. **yes_violence_gore** - Violence and gore
8. **yes_weapons** - Weapons
9. **yes_drugs** - Drug-related content
10. **yes_spam** - Spam content

### Threshold
- **Default**: 0.7 (70% confidence)
- If any class scores above 0.7, the video is flagged

## Mock Moderation (Fallback)

When Hive AI API key is not set:

```typescript
function mockModeration() {
  // Generate random scores (all below threshold)
  const mockScores = {
    adult: Math.random() * 0.3,      // Max 30%
    violence: Math.random() * 0.2,   // Max 20%
    hate: Math.random() * 0.1,       // Max 10%
    spam: Math.random() * 0.15       // Max 15%
  };
  
  // All scores are below 70% threshold
  // So all videos are auto-approved
  return {
    safe: true,
    categories: mockScores,
    flagged: [],
    provider: 'mock'
  };
}
```

**Important**: Mock moderation always approves videos. This is for testing only!

## Database Schema

### `videos` Table

```sql
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT NOT NULL,
  tags TEXT[],
  location_latitude DOUBLE PRECISION,
  location_longitude DOUBLE PRECISION,
  location_name TEXT,
  location_privacy TEXT DEFAULT 'exact',
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  duration INTEGER,
  moderation_status TEXT DEFAULT 'pending',  -- ← Status field
  moderation_result JSONB,                   -- ← Hive AI result
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `moderation_result` Structure

```json
{
  "safe": true,
  "categories": {
    "general_nsfw": 0.12,
    "general_suggestive": 0.08,
    "yes_sexual_activity": 0.03,
    "yes_realistic_nsfw": 0.05,
    "general_hate_symbols": 0.02,
    "yes_self_harm": 0.01,
    "yes_violence_gore": 0.04,
    "yes_weapons": 0.03,
    "yes_drugs": 0.02,
    "yes_spam": 0.06
  },
  "flagged": [],
  "provider": "hive_ai",
  "timestamp": "2025-01-30T12:34:56.789Z"
}
```

## Troubleshooting

### Videos Not Appearing in Feed

**Check**:
1. Is the video status 'approved'?
   ```sql
   SELECT id, caption, moderation_status FROM videos WHERE id = 'video-id';
   ```

2. Was the moderation function called?
   - Check Edge Function logs in Supabase Dashboard

3. Is Hive AI configured?
   - Look for "API Key present: YES" in logs

### Videos Stuck in Pending

**Check**:
1. Edge Function logs for errors
2. Hive AI API key is set correctly
3. Video URL is accessible by Hive AI
4. Hive AI account has credits

### All Videos Auto-Approved

**Cause**: Using mock moderation (no Hive AI API key)

**Solution**: Set the API key:
```bash
supabase secrets set HIVE_API_KEY=your_key --project-ref spdsgmkirubngfdxxrzj
```

## Performance Considerations

### Why Use Thumbnail Instead of Full Video?

The moderation function uses the thumbnail URL when available:

```typescript
const response = await fetch('https://api.thehive.ai/api/v2/task/sync', {
  body: JSON.stringify({
    url: thumbnailUrl || videoUrl,  // ← Prefer thumbnail
    // ...
  })
});
```

**Benefits**:
- ✅ Faster processing (smaller file)
- ✅ Lower API costs
- ✅ Quicker user feedback
- ✅ Still effective for most content

**Trade-off**:
- ⚠️ May miss issues only visible in video motion
- ⚠️ For critical apps, consider full video analysis

### Async Processing

The moderation happens asynchronously:

1. User uploads video → Gets immediate confirmation
2. Video marked as 'pending'
3. Moderation runs in background
4. Status updated when complete
5. User sees video in feed (if approved)

This provides a better user experience than blocking the upload.

## Future Enhancements

### Admin Dashboard (Planned)
- Review flagged videos
- Manually approve/reject
- Ban users
- View moderation statistics

### Notifications (Planned)
- Notify user when video is approved
- Notify user if video is rejected
- Explain rejection reason

### Appeal System (Planned)
- Users can appeal rejected videos
- Admins review appeals
- Re-run moderation if needed

## Summary

The video moderation system:
- ✅ Automatically moderates all uploaded videos
- ✅ Uses Hive AI for real content analysis
- ✅ Falls back to mock moderation if not configured
- ✅ Provides user visibility into pending videos
- ✅ Keeps inappropriate content out of the feed
- ✅ Processes asynchronously for better UX

**Key Requirement**: Set your Hive AI API key to enable real moderation!
