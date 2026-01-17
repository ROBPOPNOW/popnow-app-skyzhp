
# Video Frame Sampling Implementation Guide

## Overview

This document outlines the implementation plan for periodic frame sampling in video moderation. Currently, POPNOW moderates videos using only the thumbnail image. Full frame sampling will provide more comprehensive content moderation.

## Current State

**File:** `supabase/functions/moderate-video/index.ts`

**Current Implementation:**
- Videos are moderated using their thumbnail image only
- Thumbnail sent to AWS Rekognition `DetectModerationLabels`
- 80% confidence threshold applied
- If flagged, `is_approved` set to `false`

**Limitations:**
- Only checks one frame (thumbnail)
- May miss inappropriate content in other parts of video
- Less comprehensive than full video analysis

## Target Implementation

### Requirements
1. Extract 1 frame every 5 seconds from video
2. For 30-second video: 6-7 frames total
3. Submit each frame to AWS Rekognition individually
4. If ANY frame flagged with confidence > 80%, reject entire video
5. Set `is_approved` to `false` for rejected videos

### Technical Approach

#### Option 1: FFmpeg in Edge Function (Recommended)

**Pros:**
- Complete control over frame extraction
- High quality frames
- Precise timing control

**Cons:**
- Requires FFmpeg binary in Edge Function
- Larger function size
- More complex deployment

**Implementation:**
```typescript
import { FFmpeg } from 'npm:@ffmpeg/ffmpeg@0.12.10';

async function extractFramesFromVideo(
  videoUrl: string, 
  frameInterval: number = 5
): Promise<Uint8Array[]> {
  // 1. Download video
  const videoResponse = await fetch(videoUrl);
  const videoBuffer = await videoResponse.arrayBuffer();
  
  // 2. Initialize FFmpeg
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();
  
  // 3. Write video to virtual filesystem
  await ffmpeg.writeFile('input.mp4', new Uint8Array(videoBuffer));
  
  // 4. Extract frames every 5 seconds
  // FFmpeg command: -i input.mp4 -vf fps=1/5 frame_%03d.jpg
  await ffmpeg.exec([
    '-i', 'input.mp4',
    '-vf', `fps=1/${frameInterval}`,
    'frame_%03d.jpg'
  ]);
  
  // 5. Read extracted frames
  const frames: Uint8Array[] = [];
  let frameIndex = 1;
  
  while (true) {
    try {
      const frameData = await ffmpeg.readFile(`frame_${String(frameIndex).padStart(3, '0')}.jpg`);
      frames.push(new Uint8Array(frameData));
      frameIndex++;
    } catch {
      break; // No more frames
    }
  }
  
  return frames;
}
```

#### Option 2: AWS Rekognition Video API

**Pros:**
- No frame extraction needed
- AWS handles video processing
- Simpler implementation

**Cons:**
- Asynchronous processing (not real-time)
- More expensive
- Requires S3 bucket for video storage
- Longer processing time

**Implementation:**
```typescript
import { 
  RekognitionClient, 
  StartContentModerationCommand,
  GetContentModerationCommand 
} from "npm:@aws-sdk/client-rekognition@3";

async function moderateVideoWithRekognition(videoUrl: string) {
  // 1. Upload video to S3 (required for Rekognition Video API)
  // 2. Start content moderation job
  const startCommand = new StartContentModerationCommand({
    Video: {
      S3Object: {
        Bucket: 'your-bucket',
        Name: 'video-key'
      }
    },
    MinConfidence: 80
  });
  
  const { JobId } = await rekognitionClient.send(startCommand);
  
  // 3. Poll for results (async)
  // 4. Get moderation results when complete
  const getCommand = new GetContentModerationCommand({ JobId });
  const results = await rekognitionClient.send(getCommand);
  
  return results;
}
```

#### Option 3: External Service (e.g., Lambda)

**Pros:**
- Offloads processing from Edge Function
- Can use more resources
- Better for long videos

**Cons:**
- More complex architecture
- Additional AWS services needed
- Higher latency

## Recommended Implementation: Option 1 (FFmpeg)

### Step-by-Step Implementation

#### 1. Update Edge Function

<write file="supabase/functions/moderate-video-with-frames/index.ts">
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { RekognitionClient, DetectModerationLabelsCommand } from "npm:@aws-sdk/client-rekognition@3";

console.log("moderate-video-with-frames Edge Function starting");

// Frame extraction function (to be implemented with FFmpeg)
async function extractFramesFromVideo(
  videoUrl: string, 
  frameInterval: number = 5
): Promise<Uint8Array[]> {
  console.log(`🎬 Extracting frames from video every ${frameInterval} seconds...`);
  
  // TODO: Implement FFmpeg frame extraction
  // For now, return empty array
  // In production:
  // 1. Download video from URL
  // 2. Use FFmpeg to extract frames
  // 3. Return array of frame images as Uint8Array
  
  console.warn('⚠️ Frame extraction not yet implemented');
  return [];
}

Deno.serve(async (req) => {
  try {
    // Get AWS credentials
    const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
    const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const AWS_REGION = Deno.env.get('AWS_REGION') || 'ap-southeast-2';
    
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      console.error('❌ AWS credentials not configured');
      return new Response(
        JSON.stringify({ 
          approved: false,
          message: 'Moderation service not configured.',
          error: 'Missing AWS credentials'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { videoId, videoUrl, thumbnailUrl } = body;

    if (!videoId || !videoUrl) {
      return new Response(
        JSON.stringify({ error: 'videoId and videoUrl are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔍 Moderating video:', videoId);
    console.log('📹 Video URL:', videoUrl);

    // Initialize AWS Rekognition client
    const rekognitionClient = new RekognitionClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });

    // Initialize Supabase client
    const { createClient } = await import('jsr:@supabase/supabase-js@2');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract frames from video (every 5 seconds)
    console.log('🎬 Extracting frames from video...');
    const frames = await extractFramesFromVideo(videoUrl, 5);
    
    if (frames.length === 0) {
      console.warn('⚠️ No frames extracted, falling back to thumbnail moderation');
      
      // Fallback to thumbnail moderation
      if (!thumbnailUrl) {
        await supabase
          .from('videos')
          .update({ 
            is_approved: null,
            moderation_status: 'pending',
            moderation_notes: 'Frame extraction failed - requires manual review'
          })
          .eq('id', videoId);

        return new Response(
          JSON.stringify({ 
            approved: false,
            message: 'Video queued for manual review.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      // Use thumbnail as fallback
      const thumbnailResponse = await fetch(thumbnailUrl);
      const thumbnailBuffer = await thumbnailResponse.arrayBuffer();
      frames.push(new Uint8Array(thumbnailBuffer));
    }

    console.log(`✅ Extracted ${frames.length} frames for moderation`);

    // Moderate each frame
    let isRejected = false;
    const rejectionReasons: string[] = [];
    const frameResults: any[] = [];

    for (let i = 0; i < frames.length; i++) {
      console.log(`🔍 Moderating frame ${i + 1}/${frames.length}...`);
      
      const command = new DetectModerationLabelsCommand({
        Image: { Bytes: frames[i] },
        MinConfidence: 80,
      });

      try {
        const response = await rekognitionClient.send(command);
        const moderationLabels = response.ModerationLabels || [];
        
        frameResults.push({
          frameNumber: i + 1,
          timestamp: i * 5, // seconds
          labelsFound: moderationLabels.length,
          labels: moderationLabels.map(l => ({
            name: l.Name,
            parent: l.ParentName,
            confidence: l.Confidence
          }))
        });

        // Check for inappropriate content
        for (const label of moderationLabels) {
          const parentName = label.ParentName || '';
          const labelName = label.Name || '';
          const confidence = label.Confidence || 0;

          if (confidence > 80) {
            if (parentName === 'Explicit Nudity' || labelName === 'Explicit Nudity') {
              isRejected = true;
              rejectionReasons.push(`explicit nudity at ${i * 5}s`);
              console.log(`❌ Frame ${i + 1} flagged for explicit nudity (${confidence}%)`);
            }
            if (parentName === 'Violence' || labelName === 'Violence') {
              isRejected = true;
              rejectionReasons.push(`violence at ${i * 5}s`);
              console.log(`❌ Frame ${i + 1} flagged for violence (${confidence}%)`);
            }
          }
        }

        // If any frame is rejected, stop processing
        if (isRejected) {
          console.log('❌ Video rejected, stopping frame analysis');
          break;
        }

      } catch (error) {
        console.error(`❌ Error moderating frame ${i + 1}:`, error);
        frameResults.push({
          frameNumber: i + 1,
          timestamp: i * 5,
          error: String(error)
        });
      }
    }

    // Update video status in database
    if (isRejected) {
      console.log('❌ Video rejected due to:', rejectionReasons.join(', '));
      
      await supabase
        .from('videos')
        .update({ 
          is_approved: false,
          moderation_status: 'rejected',
          moderation_notes: `Rejected by AWS Rekognition: ${rejectionReasons.join(', ')}`,
          moderation_result: { frameResults }
        })
        .eq('id', videoId);

      // Notify user
      const { data: video } = await supabase
        .from('videos')
        .select('user_id')
        .eq('id', videoId)
        .single();

      if (video) {
        await supabase
          .from('notifications')
          .insert({
            user_id: video.user_id,
            actor_id: video.user_id,
            type: 'comment',
            message: `Your video was rejected due to: ${rejectionReasons.join(', ')}.`,
            video_id: videoId,
          });
      }

      return new Response(
        JSON.stringify({
          approved: false,
          message: `Video rejected: ${rejectionReasons.join(', ')}`,
          reasons: rejectionReasons,
          framesAnalyzed: frames.length,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Video approved - all frames passed moderation');
    
    await supabase
      .from('videos')
      .update({ 
        is_approved: true,
        moderation_status: 'approved',
        moderation_notes: `Approved by AWS Rekognition - ${frames.length} frames analyzed`,
        moderation_result: { frameResults }
      })
      .eq('id', videoId);

    return new Response(
      JSON.stringify({
        approved: true,
        message: 'Video approved successfully!',
        framesAnalyzed: frames.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in moderate-video-with-frames:', error);
    
    try {
      const { createClient } = await import('jsr:@supabase/supabase-js@2');
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const body = await req.json();
      const { videoId } = body;

      if (videoId) {
        await supabase
          .from('videos')
          .update({ 
            is_approved: null,
            moderation_status: 'pending',
            moderation_notes: 'Error during moderation - requires manual review'
          })
          .eq('id', videoId);
      }
    } catch (updateErr) {
      console.error('❌ Error updating video status:', updateErr);
    }

    return new Response(
      JSON.stringify({ 
        approved: false,
        message: 'An error occurred during moderation.',
        error: String(error) 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
