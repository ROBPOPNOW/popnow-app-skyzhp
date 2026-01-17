
import { task } from "@trigger.dev/sdk/v3";
import { RekognitionClient, DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";
import ffmpeg from "fluent-ffmpeg";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Define the payload type for the task
type ModerateVideoPayload = {
  videoId: string;
  videoUrl: string;
  thumbnailUrl?: string;
};

// Define the result type
type ModerationResult = {
  approved: boolean;
  reasons?: string[];
  framesChecked: number;
  message: string;
  deleted?: boolean;
  notificationSent?: boolean;
};

/**
 * Validate Bunny.net credentials format
 * Library ID should be a 6-digit number
 * API Key should be a long hash string
 */
function validateBunnyCredentials(): { valid: boolean; error?: string } {
  const BUNNY_STREAM_LIBRARY_ID = process.env.EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID;
  const BUNNY_STREAM_API_KEY = process.env.EXPO_PUBLIC_BUNNY_STREAM_API_KEY;

  if (!BUNNY_STREAM_LIBRARY_ID || !BUNNY_STREAM_API_KEY) {
    return {
      valid: false,
      error: 'Missing credentials: EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID or EXPO_PUBLIC_BUNNY_STREAM_API_KEY not set',
    };
  }

  // Library ID should be a 6-digit number (or similar short numeric string)
  const libraryIdPattern = /^\d{5,7}$/;
  if (!libraryIdPattern.test(BUNNY_STREAM_LIBRARY_ID)) {
    return {
      valid: false,
      error: `Invalid Library ID format: "${BUNNY_STREAM_LIBRARY_ID.substring(0, 20)}..." - Expected a 6-digit number, got a ${BUNNY_STREAM_LIBRARY_ID.length}-character string. You may have swapped the Library ID and API Key values.`,
    };
  }

  // API Key should be a long hash (at least 32 characters)
  if (BUNNY_STREAM_API_KEY.length < 32) {
    return {
      valid: false,
      error: `Invalid API Key format: Too short (${BUNNY_STREAM_API_KEY.length} characters). Expected a long hash string (64+ characters).`,
    };
  }

  return { valid: true };
}

/**
 * Extract video ID from Bunny.net URL
 * Handles various URL formats:
 * - https://vz-xxxxx.b-cdn.net/{video_id}/playlist.m3u8
 * - https://vz-xxxxx.b-cdn.net/{video_id}/playlist.m3u8?v=xxx
 * - Just the video_id itself
 */
function extractVideoId(videoUrl: string): string | null {
  console.log('🔍 Extracting video ID from URL:', videoUrl);
  
  // If it's already just an ID (no slashes or dots), return it
  if (!videoUrl.includes('/') && !videoUrl.includes('.')) {
    console.log('✅ Already a clean video ID:', videoUrl);
    return videoUrl;
  }
  
  // Remove protocol and domain if present
  let cleanUrl = videoUrl.replace(/^https?:\/\//, '');
  
  // Remove query parameters
  cleanUrl = cleanUrl.split('?')[0];
  
  // Remove .m3u8 extension
  cleanUrl = cleanUrl.replace(/\.m3u8$/, '');
  
  // Remove /playlist suffix
  cleanUrl = cleanUrl.replace(/\/playlist$/, '');
  
  // Extract the video ID (should be the part after the domain and before /playlist)
  const parts = cleanUrl.split('/');
  
  // Find the video ID - it's typically a UUID-like string
  // Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const videoIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  
  for (const part of parts) {
    if (videoIdPattern.test(part)) {
      console.log('✅ Extracted video ID:', part);
      return part;
    }
  }
  
  // If no UUID found, return the last meaningful part
  const lastPart = parts[parts.length - 1] || videoUrl;
  console.log('⚠️ No UUID pattern found, using last part:', lastPart);
  return lastPart;
}

/**
 * Delete video from Bunny.net Stream
 * Returns true if deletion succeeded OR if video was already deleted (404)
 * 
 * CORRECT DELETE REQUEST FORMAT:
 * URL: https://video.bunnycdn.com/library/{6-DIGIT-LIBRARY-ID}/videos/{VIDEO-ID}
 * Header: AccessKey: {LONG-API-KEY}
 * 
 * NOTE: Trigger.dev uses its own environment variables set in the Trigger.dev dashboard.
 * These should match your Supabase secret names for consistency:
 * - EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID (6-digit number)
 * - EXPO_PUBLIC_BUNNY_STREAM_API_KEY (long hash)
 */
async function deleteFromBunnyNet(videoUrl: string): Promise<boolean> {
  try {
    // Use the correct environment variable names that match Supabase secrets
    const BUNNY_STREAM_LIBRARY_ID = process.env.EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID;
    const BUNNY_STREAM_API_KEY = process.env.EXPO_PUBLIC_BUNNY_STREAM_API_KEY;

    if (!BUNNY_STREAM_LIBRARY_ID || !BUNNY_STREAM_API_KEY) {
      console.error('❌ Bunny.net credentials not configured');
      console.error('EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID:', BUNNY_STREAM_LIBRARY_ID ? 'SET' : '❌ MISSING');
      console.error('EXPO_PUBLIC_BUNNY_STREAM_API_KEY:', BUNNY_STREAM_API_KEY ? 'SET' : '❌ MISSING');
      return false;
    }

    // Validate credentials format
    const validation = validateBunnyCredentials();
    if (!validation.valid) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ INVALID BUNNY.NET CREDENTIALS');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error(validation.error);
      console.error('');
      console.error('Current configuration:');
      console.error(`  Library ID: ${BUNNY_STREAM_LIBRARY_ID} (${BUNNY_STREAM_LIBRARY_ID.length} chars)`);
      console.error(`  API Key: ${BUNNY_STREAM_API_KEY.substring(0, 20)}... (${BUNNY_STREAM_API_KEY.length} chars)`);
      console.error('');
      console.error('EXPECTED FORMAT:');
      console.error('  Library ID: 6-digit number (e.g., "123456")');
      console.error('  API Key: Long hash (e.g., "3e8282108290d877a137fbd73f2cea70...")');
      console.error('');
      console.error('TO FIX:');
      console.error('1. Go to Trigger.dev Dashboard → Environment Variables');
      console.error('2. Verify EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID contains a 6-digit number');
      console.error('3. Verify EXPO_PUBLIC_BUNNY_STREAM_API_KEY contains the long hash');
      console.error('4. Make sure you did NOT swap the Library ID and API Key values');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return false;
    }

    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      console.error('❌ Could not extract video ID from URL:', videoUrl);
      return false;
    }

    console.log('🗑️ Deleting video from Bunny.net:', videoId);
    console.log('📋 Using Library ID:', BUNNY_STREAM_LIBRARY_ID);
    console.log('🔑 Using API Key:', BUNNY_STREAM_API_KEY.substring(0, 10) + '...');
    
    // Construct the correct DELETE URL
    const deleteUrl = `https://video.bunnycdn.com/library/${BUNNY_STREAM_LIBRARY_ID}/videos/${videoId}`;
    console.log('🔗 DELETE URL:', deleteUrl);

    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'AccessKey': BUNNY_STREAM_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    console.log(`📊 Bunny.net API Response: ${response.status} ${response.statusText}`);

    if (response.ok) {
      console.log('✅ Video deleted from Bunny.net successfully:', videoId);
      return true;
    } else if (response.status === 404) {
      // Video already deleted - consider this a success
      console.log('ℹ️ Video already deleted from Bunny.net (404)');
      return true;
    } else {
      const errorText = await response.text();
      console.error(`❌ Failed to delete video from Bunny.net: ${response.status} ${response.statusText}`);
      console.error('Error details:', errorText);
      
      // If we get a 400 error about invalid libraryId, provide helpful guidance
      if (response.status === 400 && errorText.includes('libraryId')) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('🚨 CONFIGURATION ERROR DETECTED 🚨');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('The Library ID appears to be invalid. This usually means:');
        console.error('1. The EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID contains the API KEY instead of the Library ID');
        console.error('2. The Library ID should be a 6-digit number (e.g., "123456")');
        console.error('3. The API Key should be a long hash (e.g., "3e8282108290d877...")');
        console.error('');
        console.error('Current values:');
        console.error(`  Library ID: ${BUNNY_STREAM_LIBRARY_ID} (length: ${BUNNY_STREAM_LIBRARY_ID.length})`);
        console.error(`  API Key: ${BUNNY_STREAM_API_KEY.substring(0, 20)}... (length: ${BUNNY_STREAM_API_KEY.length})`);
        console.error('');
        console.error('TO FIX:');
        console.error('1. Go to Trigger.dev Dashboard → Environment Variables');
        console.error('2. Verify EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID contains a 6-digit number');
        console.error('3. Verify EXPO_PUBLIC_BUNNY_STREAM_API_KEY contains the long hash');
        console.error('4. Make sure you did NOT swap the values');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
      
      return false;
    }
  } catch (error) {
    console.error('❌ Error deleting from Bunny.net:', error);
    return false;
  }
}

/**
 * Trigger.dev V3 Task: Moderate POP Video
 * 
 * This task is triggered when a new video is uploaded to the Supabase videos table.
 * It downloads the video, extracts 7 frames at 5-second intervals (0s, 5s, 10s, 15s, 20s, 25s, 30s),
 * sends them to AWS Rekognition for moderation in parallel, and updates the database.
 * 
 * If ANY frame is flagged with Confidence > 80%, the video is rejected (is_approved = false).
 * If all frames are clean, the video is approved (is_approved = true).
 * 
 * NEW: If rejected, the video is IMMEDIATELY DELETED from Bunny.net and Supabase to save storage costs.
 * A notification is sent to the user explaining the rejection.
 */
export const moderatePopVideo = task({
  id: "moderate-pop-video",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    randomize: true,
  },
  run: async (payload: ModerateVideoPayload): Promise<ModerationResult> => {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🎬 TRIGGER.DEV VIDEO MODERATION TASK STARTED");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📹 Video ID:", payload.videoId);
    console.log("🔗 Video URL:", payload.videoUrl);
    console.log("🖼️  Thumbnail URL:", payload.thumbnailUrl || "N/A");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Validate Bunny.net credentials at the start
    const bunnyValidation = validateBunnyCredentials();
    if (!bunnyValidation.valid) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('⚠️ WARNING: Invalid Bunny.net credentials');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error(bunnyValidation.error);
      console.error('Video deletion from Bunny.net will FAIL if video is rejected.');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } else {
      console.log('✅ Bunny.net credentials validated successfully');
    }

    // Step 1: Initialize AWS Rekognition client
    const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
    const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
    const AWS_REGION = process.env.AWS_REGION || "ap-southeast-2";

    console.log("🔐 AWS Configuration:");
    console.log("  - Access Key ID configured:", !!AWS_ACCESS_KEY_ID);
    console.log("  - Secret Access Key configured:", !!AWS_SECRET_ACCESS_KEY);
    console.log("  - Region:", AWS_REGION);

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error("AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.");
    }

    const rekognitionClient = new RekognitionClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });

    // Step 2: Initialize Supabase client
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log("🗄️  Supabase Configuration:");
    console.log("  - URL configured:", !!SUPABASE_URL);
    console.log("  - Service Role Key configured:", !!SUPABASE_SERVICE_ROLE_KEY);

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 3: Download video to temporary directory
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📥 STEP 1: DOWNLOADING VIDEO");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const tempDir = os.tmpdir();
    const videoFileName = `video_${payload.videoId}.mp4`;
    const videoPath = path.join(tempDir, videoFileName);

    console.log("📂 Temporary directory:", tempDir);
    console.log("📄 Video file name:", videoFileName);
    console.log("📍 Full video path:", videoPath);

    try {
      console.log("🌐 Fetching video from URL...");
      const videoResponse = await fetch(payload.videoUrl);
      
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: HTTP ${videoResponse.status} ${videoResponse.statusText}`);
      }

      console.log("✅ Video fetched successfully");
      console.log("📊 Content-Type:", videoResponse.headers.get("content-type"));
      console.log("📊 Content-Length:", videoResponse.headers.get("content-length"));

      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
      console.log("💾 Video buffer size:", videoBuffer.length, "bytes");

      fs.writeFileSync(videoPath, videoBuffer);
      console.log("✅ Video saved to disk:", videoPath);
    } catch (error) {
      console.error("❌ Error downloading video:", error);
      
      // Update database to mark as pending for manual review
      await supabase
        .from("videos")
        .update({
          is_approved: null,
          moderation_status: "pending",
          moderation_notes: `Failed to download video for moderation: ${error instanceof Error ? error.message : String(error)}`,
        })
        .eq("id", payload.videoId);

      throw error;
    }

    // Step 4: Extract 7 frames at 5-second intervals using FFmpeg
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🎞️  STEP 2: EXTRACTING FRAMES (THE 5-SECOND RULE)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 Target: 7 frames at 0s, 5s, 10s, 15s, 20s, 25s, 30s");

    const frameTimestamps = [0, 5, 10, 15, 20, 25, 30]; // seconds
    const framePaths: string[] = [];

    try {
      for (const timestamp of frameTimestamps) {
        const framePath = path.join(tempDir, `frame_${payload.videoId}_${timestamp}s.jpg`);
        framePaths.push(framePath);

        console.log(`⏱️  Extracting frame at ${timestamp}s...`);

        await new Promise<void>((resolve, reject) => {
          ffmpeg(videoPath)
            .seekInput(timestamp)
            .frames(1)
            .output(framePath)
            .on("end", () => {
              console.log(`✅ Frame extracted: ${timestamp}s -> ${framePath}`);
              resolve();
            })
            .on("error", (err) => {
              console.error(`❌ Error extracting frame at ${timestamp}s:`, err);
              reject(err);
            })
            .run();
        });
      }

      console.log(`✅ Successfully extracted ${framePaths.length} frames`);
    } catch (error) {
      console.error("❌ Error during frame extraction:", error);
      
      // Clean up downloaded video
      if (fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
        console.log("🧹 Cleaned up video file");
      }

      // Update database to mark as pending for manual review
      await supabase
        .from("videos")
        .update({
          is_approved: null,
          moderation_status: "pending",
          moderation_notes: `Failed to extract frames for moderation: ${error instanceof Error ? error.message : String(error)}`,
        })
        .eq("id", payload.videoId);

      throw error;
    }

    // Step 5: Send all frames to AWS Rekognition in parallel
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🤖 STEP 3: AI MODERATION (PARALLEL PROCESSING)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🚀 Sending all 7 frames to AWS Rekognition in parallel...");

    let isRejected = false;
    const rejectionReasons: string[] = [];
    const allModerationResults: any[] = [];

    try {
      // Process all frames in parallel for maximum speed
      const moderationPromises = framePaths.map(async (framePath, index) => {
        const timestamp = frameTimestamps[index];
        console.log(`📤 [Frame ${timestamp}s] Sending to AWS Rekognition...`);

        try {
          // Read frame as buffer
          const frameBuffer = fs.readFileSync(framePath);
          console.log(`📊 [Frame ${timestamp}s] Buffer size: ${frameBuffer.length} bytes`);

          // Call AWS Rekognition DetectModerationLabels
          const command = new DetectModerationLabelsCommand({
            Image: {
              Bytes: frameBuffer,
            },
            MinConfidence: 80, // Only return labels with confidence >= 80%
          });

          const response = await rekognitionClient.send(command);
          console.log(`✅ [Frame ${timestamp}s] Rekognition response received`);

          const moderationLabels = response.ModerationLabels || [];
          console.log(`📊 [Frame ${timestamp}s] Found ${moderationLabels.length} moderation labels`);

          const frameResult = {
            timestamp,
            framePath,
            labels: moderationLabels,
            flagged: false,
            reasons: [] as string[],
          };

          // Check for inappropriate content
          for (const label of moderationLabels) {
            const parentName = label.ParentName || "";
            const labelName = label.Name || "";
            const confidence = label.Confidence || 0;

            console.log(`  🏷️  [Frame ${timestamp}s] Label: ${labelName} (parent: ${parentName}), confidence: ${confidence.toFixed(2)}%`);

            // Check for Explicit Nudity, Violence, or Graphic Gore with confidence > 80%
            if (confidence > 80) {
              const flaggedCategories = ["Explicit Nudity", "Violence", "Graphic Gore"];
              
              if (
                flaggedCategories.includes(parentName) ||
                flaggedCategories.includes(labelName)
              ) {
                frameResult.flagged = true;
                const reason = `${labelName} at ${timestamp}s (${confidence.toFixed(2)}% confidence)`;
                frameResult.reasons.push(reason);
                console.log(`  ❌ [Frame ${timestamp}s] FLAGGED: ${reason}`);
              }
            }
          }

          if (!frameResult.flagged) {
            console.log(`  ✅ [Frame ${timestamp}s] CLEAN - No violations detected`);
          }

          return frameResult;
        } catch (error) {
          console.error(`❌ [Frame ${timestamp}s] Rekognition error:`, error);
          throw error;
        }
      });

      // Wait for all moderation checks to complete
      const results = await Promise.all(moderationPromises);
      console.log("✅ All frames processed");

      // Analyze results
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📊 MODERATION RESULTS ANALYSIS");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      for (const result of results) {
        allModerationResults.push(result);
        
        if (result.flagged) {
          isRejected = true;
          rejectionReasons.push(...result.reasons);
          console.log(`❌ Frame ${result.timestamp}s: FLAGGED - ${result.reasons.join(", ")}`);
        } else {
          console.log(`✅ Frame ${result.timestamp}s: CLEAN`);
        }
      }

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📊 FINAL VERDICT:");
      console.log(`  - Frames checked: ${results.length}`);
      console.log(`  - Status: ${isRejected ? "❌ REJECTED" : "✅ APPROVED"}`);
      if (isRejected) {
        console.log(`  - Reasons: ${rejectionReasons.join(", ")}`);
      }
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    } catch (error) {
      console.error("❌ Error during moderation:", error);
      
      // Clean up files
      if (fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      for (const framePath of framePaths) {
        if (fs.existsSync(framePath)) {
          fs.unlinkSync(framePath);
        }
      }

      // Update database to mark as pending for manual review
      await supabase
        .from("videos")
        .update({
          is_approved: null,
          moderation_status: "pending",
          moderation_notes: `Error during AWS Rekognition moderation: ${error instanceof Error ? error.message : String(error)}`,
        })
        .eq("id", payload.videoId);

      throw error;
    }

    // Step 6: Update database based on moderation results
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💾 STEP 4: UPDATING DATABASE & HANDLING REJECTION");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    let videoDeleted = false;
    let notificationSent = false;

    try {
      if (isRejected) {
        console.log("❌ VIDEO REJECTED - INITIATING IMMEDIATE DELETION");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        // Get user info and video caption BEFORE deleting the video
        const { data: video } = await supabase
          .from("videos")
          .select("user_id, caption")
          .eq("id", payload.videoId)
          .single();

        if (video) {
          console.log("📧 Creating rejection notification for user:", video.user_id);
          
          // Create a notification for the user about the rejection
          const notificationMessage = `Your video "${video.caption || 'Untitled'}" was removed because it didn't meet our community guidelines. Reason: ${rejectionReasons.join(", ")}`;
          
          const { error: notificationError } = await supabase
            .from("notifications")
            .insert({
              user_id: video.user_id,
              actor_id: video.user_id, // Self-notification
              type: "video_rejected",
              message: notificationMessage,
              is_read: false,
            });

          if (notificationError) {
            console.error("⚠️ Failed to create rejection notification:", notificationError);
          } else {
            console.log("✅ Rejection notification created");
            notificationSent = true;
          }
        }

        // Step 1: Delete video from Bunny.net
        console.log("🗑️ Step 1: Deleting video from Bunny.net...");
        const bunnyDeletionSuccess = await deleteFromBunnyNet(payload.videoUrl);
        
        if (bunnyDeletionSuccess) {
          console.log("✅ Video deleted from Bunny.net successfully");
        } else {
          console.error("⚠️ Failed to delete video from Bunny.net (will still delete from database)");
        }

        // Step 2: Thumbnails are auto-deleted when video is deleted
        console.log("ℹ️ Step 2: Thumbnail auto-deleted with video");

        // Step 3: Delete video record from Supabase database
        console.log("🗑️ Step 3: Deleting video record from database...");
        const { error: deleteError } = await supabase
          .from("videos")
          .delete()
          .eq("id", payload.videoId);

        if (deleteError) {
          console.error("❌ Failed to delete video from database:", deleteError);
          throw deleteError;
        } else {
          console.log("✅ Video record deleted from database");
          videoDeleted = true;
        }

        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("✅ REJECTED VIDEO COMPLETELY DELETED");
        console.log("   - Bunny.net: " + (bunnyDeletionSuccess ? "Deleted ✅" : "Failed ❌"));
        console.log("   - Database: Deleted ✅");
        console.log("   - Notification: " + (notificationSent ? "Sent to user ✅" : "Failed ❌"));
        console.log("   - Storage cost: " + (bunnyDeletionSuccess ? "SAVED ✅" : "NOT SAVED ❌"));
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      } else {
        console.log("✅ Setting is_approved = true (APPROVED)");
        
        // Update video as approved
        await supabase
          .from("videos")
          .update({
            is_approved: true,
            moderation_status: "approved",
            moderation_notes: "Approved by AWS Rekognition via Trigger.dev",
            moderation_result: { results: allModerationResults },
          })
          .eq("id", payload.videoId);

        console.log("✅ Database updated: is_approved = true");
      }
    } catch (error) {
      console.error("❌ Error updating database:", error);
      throw error;
    } finally {
      // Step 7: Clean up temporary files
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🧹 STEP 5: CLEANUP");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      if (fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
        console.log("✅ Deleted video file:", videoPath);
      }

      for (const framePath of framePaths) {
        if (fs.existsSync(framePath)) {
          fs.unlinkSync(framePath);
          console.log("✅ Deleted frame file:", framePath);
        }
      }

      console.log("✅ Cleanup complete");
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🎉 TASK COMPLETED SUCCESSFULLY");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return {
      approved: !isRejected,
      reasons: isRejected ? rejectionReasons : undefined,
      framesChecked: framePaths.length,
      message: isRejected
        ? `Video rejected and deleted: ${rejectionReasons.join(", ")}`
        : "Video approved successfully",
      deleted: videoDeleted,
      notificationSent: notificationSent,
    };
  },
});
