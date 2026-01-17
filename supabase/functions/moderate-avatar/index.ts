
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { RekognitionClient, DetectModerationLabelsCommand } from "npm:@aws-sdk/client-rekognition@3";

// Get Bunny.net configuration from environment - USING CORRECT SECRET NAMES
const BUNNY_STORAGE_ZONE_NAME = Deno.env.get('EXPO_PUBLIC_BUNNY_STORAGE_ZONE_NAME');
const BUNNY_STORAGE_API_KEY = Deno.env.get('EXPO_PUBLIC_BUNNY_STORAGE_API_KEY');
const STORAGE_API_BASE = 'https://storage.bunnycdn.com';

/**
 * Extract file path from Bunny.net CDN URL
 * Example: https://cdn.example.com/avatars/filename.jpg -> avatars/filename.jpg
 */
function extractFilePath(cdnUrl: string): string | null {
  try {
    const url = new URL(cdnUrl);
    // Remove leading slash from pathname
    const path = url.pathname.substring(1);
    console.log('Extracted file path:', path);
    return path;
  } catch (error) {
    console.error('Error extracting file path:', error);
    return null;
  }
}

/**
 * Delete file from Bunny.net Storage
 */
async function deleteFromBunnyStorage(fileUrl: string): Promise<boolean> {
  try {
    if (!BUNNY_STORAGE_ZONE_NAME || !BUNNY_STORAGE_API_KEY) {
      console.error('❌ Bunny.net Storage configuration missing');
      return false;
    }

    const filePath = extractFilePath(fileUrl);
    if (!filePath) {
      console.error('❌ Could not extract file path from URL:', fileUrl);
      return false;
    }

    console.log('🗑️ Deleting file from Bunny.net Storage:', filePath);
    const deleteUrl = `${STORAGE_API_BASE}/${BUNNY_STORAGE_ZONE_NAME}/${filePath}`;
    console.log('DELETE URL:', deleteUrl);

    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'AccessKey': BUNNY_STORAGE_API_KEY,
      },
    });

    console.log(`📊 Bunny.net Storage API Response: ${response.status} ${response.statusText}`);

    if (response.ok) {
      console.log('✅ File deleted from Bunny.net Storage successfully');
      return true;
    } else if (response.status === 404) {
      console.log('ℹ️ File already deleted from Bunny.net Storage (404)');
      return true;
    } else {
      const errorText = await response.text();
      console.error(`❌ Failed to delete file: ${response.status} ${response.statusText}`);
      console.error('Error details:', errorText);
      return false;
    }
  } catch (error) {
    console.error('❌ Error deleting from Bunny.net Storage:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🖼️ AVATAR MODERATION STARTED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    const { userId, avatarUrl } = await req.json();
    console.log('User ID:', userId);
    console.log('Avatar URL:', avatarUrl);

    if (!userId || !avatarUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing userId or avatarUrl' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize AWS Rekognition
    const rekognitionClient = new RekognitionClient({
      region: Deno.env.get('AWS_REGION') || 'us-east-1',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      },
    });

    // Download and analyze the avatar image
    console.log('📥 Downloading avatar image...');
    const imageResponse = await fetch(avatarUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download avatar: ${imageResponse.statusText}`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    console.log('✅ Avatar downloaded, size:', imageBuffer.byteLength, 'bytes');

    // Send to AWS Rekognition for moderation
    console.log('🤖 Sending to AWS Rekognition for moderation...');
    const command = new DetectModerationLabelsCommand({
      Image: { Bytes: new Uint8Array(imageBuffer) },
      MinConfidence: 80,
    });

    const moderationResult = await rekognitionClient.send(command);
    const moderationLabels = moderationResult.ModerationLabels || [];
    console.log(`📊 Found ${moderationLabels.length} moderation labels`);

    let isRejected = false;
    const rejectionReasons: string[] = [];

    // Check for inappropriate content
    for (const label of moderationLabels) {
      const parentName = label.ParentName || '';
      const labelName = label.Name || '';
      const confidence = label.Confidence || 0;

      console.log(`  🏷️ Label: ${labelName} (parent: ${parentName}), confidence: ${confidence.toFixed(2)}%`);

      if (confidence > 80) {
        const flaggedCategories = ['Explicit Nudity', 'Violence', 'Graphic Gore'];
        
        if (flaggedCategories.includes(parentName) || flaggedCategories.includes(labelName)) {
          isRejected = true;
          rejectionReasons.push(`${labelName} (${confidence.toFixed(2)}% confidence)`);
          console.log(`  ❌ FLAGGED: ${labelName}`);
        }
      }
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (isRejected) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('❌ AVATAR REJECTED - INITIATING IMMEDIATE DELETION');
      console.log('Reasons:', rejectionReasons.join(', '));
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Step 1: Delete avatar from Bunny.net Storage
      console.log('🗑️ Step 1: Deleting avatar from Bunny.net Storage...');
      const bunnyDeletionSuccess = await deleteFromBunnyStorage(avatarUrl);
      
      if (bunnyDeletionSuccess) {
        console.log('✅ Avatar deleted from Bunny.net Storage');
      } else {
        console.error('⚠️ Failed to delete avatar from Bunny.net Storage');
      }

      // Step 2: Revert user's avatar to null in database
      console.log('🗑️ Step 2: Reverting user avatar to null in database...');
      const { error: updateError } = await supabaseClient
        .from('users')
        .update({ avatar_url: null })
        .eq('id', userId);

      if (updateError) {
        console.error('❌ Failed to update user avatar:', updateError);
      } else {
        console.log('✅ User avatar reverted to null');
      }

      // Step 3: Send rejection notification to user
      console.log('📧 Step 3: Sending rejection notification...');
      const { error: notificationError } = await supabaseClient
        .from('notifications')
        .insert({
          user_id: userId,
          actor_id: userId,
          type: 'avatar_rejected',
          message: `Your avatar was rejected due to: ${rejectionReasons.join(', ')}`,
          is_read: false,
        });

      if (notificationError) {
        console.error('⚠️ Failed to create rejection notification:', notificationError);
      } else {
        console.log('✅ Rejection notification sent');
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ REJECTED AVATAR COMPLETELY DELETED');
      console.log('   - Bunny.net Storage: Deleted');
      console.log('   - Database: Reverted to null');
      console.log('   - Notification: Sent to user');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return new Response(
        JSON.stringify({
          success: true,
          approved: false,
          reasons: rejectionReasons,
          deleted: bunnyDeletionSuccess,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      console.log('✅ Avatar approved');
      
      return new Response(
        JSON.stringify({
          success: true,
          approved: true,
          message: 'Avatar approved successfully',
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('❌ Avatar moderation error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
