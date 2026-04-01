import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Environment variables
const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
const AWS_REGION = Deno.env.get('AWS_REGION') || 'us-east-1';
const BUNNY_STREAM_LIBRARY_ID = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID');
const BUNNY_STREAM_API_KEY = Deno.env.get('EXPO_PUBLIC_BUNNY_STREAM_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// AWS Signature V4 signing function
async function signAwsRequest(
  method: string,
  url: string,
  body: string,
  service: string,
  region: string
) {
  const encoder = new TextEncoder();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  // Parse URL
  const urlObj = new URL(url);
  const host = urlObj.hostname;
  const canonicalUri = urlObj.pathname;
  const canonicalQuerystring = urlObj.search.substring(1);

  // Create canonical headers
  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-date';

  // Create payload hash
  const payloadHash = await crypto.subtle.digest('SHA-256', encoder.encode(body));
  const payloadHashHex = Array.from(new Uint8Array(payloadHash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Create canonical request
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHashHex}`;

  // Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = await crypto.subtle.digest('SHA-256', encoder.encode(canonicalRequest));
  const canonicalRequestHashHex = Array.from(new Uint8Array(canonicalRequestHash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHashHex}`;

  // Calculate signature
  async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
    return new Uint8Array(signature);
  }

  let kDate = await hmac(encoder.encode(`AWS4${AWS_SECRET_ACCESS_KEY}`), dateStamp);
  let kRegion = await hmac(kDate, region);
  let kService = await hmac(kRegion, service);
  let kSigning = await hmac(kService, 'aws4_request');
  let signature = await hmac(kSigning, stringToSign);

  const signatureHex = Array.from(signature)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Create authorization header
  const authorizationHeader = `${algorithm} Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;

  return {
    'Authorization': authorizationHeader,
    'X-Amz-Date': amzDate,
    'Content-Type': 'application/x-amz-json-1.1',
  };
}

// Call AWS Rekognition DetectModerationLabels
async function detectModerationLabels(imageUrl: string) {
  console.log('🔍 Calling AWS Rekognition for image:', imageUrl);

  // Download image and convert to base64
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.status}`);
  }
  const imageBuffer = await imageResponse.arrayBuffer();
  const imageBase64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

  const requestBody = JSON.stringify({
    Image: {
      Bytes: imageBase64,
    },
    MinConfidence: 80,
  });

  const endpoint = `https://rekognition.${AWS_REGION}.amazonaws.com/`;
  const headers = await signAwsRequest('POST', endpoint, requestBody, 'rekognition', AWS_REGION);
  headers['X-Amz-Target'] = 'RekognitionService.DetectModerationLabels';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: requestBody,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ AWS Rekognition error:', response.status, errorText);
    throw new Error(`AWS Rekognition failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  console.log('✅ AWS Rekognition response:', JSON.stringify(result, null, 2));
  return result;
}

// Main moderation function
async function moderateVideo(
  videoId: string,
  videoUrl: string,
  thumbnailUrl: string,
  userId: string,
  requestId?: string  // ← ADDED: Optional request ID for fulfillments
) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎬 MODERATE-VIDEO: Starting moderation');
  console.log('  - Video ID:', videoId);
  console.log('  - Thumbnail URL:', thumbnailUrl);
  console.log('  - User ID:', userId);
  console.log('  - Request ID:', requestId || 'N/A');  // ← ADDED
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // Call AWS Rekognition
    const rekognitionResult = await detectModerationLabels(thumbnailUrl);

    // Check for inappropriate content
    const rejectedLabels = ['Explicit Nudity', 'Violence', 'Visually Disturbing', 'Hate Symbols'];
    const foundInappropriateContent = rekognitionResult.ModerationLabels?.some(
      (label: any) =>
        label.Confidence > 80 &&
        rejectedLabels.includes(label.Name)
    );

    if (foundInappropriateContent) {
      console.log('❌ Video REJECTED - inappropriate content detected');
      console.log('   Labels:', rekognitionResult.ModerationLabels?.map((l: any) => `${l.Name} (${l.Confidence}%)`).join(', '));

      // Delete video from Bunny.net
      console.log('🗑️  Deleting video from Bunny.net...');
      const deleteResponse = await fetch(
        `https://video.bunnycdn.com/library/${BUNNY_STREAM_LIBRARY_ID}/videos/${videoId}`,
        {
          method: 'DELETE',
          headers: {
            AccessKey: BUNNY_STREAM_API_KEY!,
          },
        }
      );

      if (!deleteResponse.ok) {
        console.error('⚠️  Failed to delete from Bunny.net:', deleteResponse.status, await deleteResponse.text());
      } else {
        console.log('✅ Deleted from Bunny.net');
      }

      // Delete record from database
      console.log('🗑️  Deleting video record from database...');
      const { error: deleteError } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId);

      if (deleteError) {
        console.error('⚠️  Failed to delete from database:', deleteError);
      } else {
        console.log('✅ Deleted from database');
      }

      // Create notification
      console.log('📬 Creating rejection notification...');
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          actor_id: userId, // Self-notification
          type: 'video_rejected',
          message: 'Your video was removed because it contained inappropriate content.',
          is_read: false,
        });

      if (notificationError) {
        console.error('⚠️  Failed to create notification:', notificationError);
      } else {
        console.log('✅ Notification created');
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return { success: false, message: 'Video rejected and deleted' };
    } else {
      console.log('✅ Video APPROVED - no inappropriate content detected');

      // Update moderation_status to 'approved'
      console.log('📝 Updating video status to approved...');
      const { error: updateError } = await supabase
        .from('videos')
        .update({ moderation_status: 'approved' })
        .eq('id', videoId);

      if (updateError) {
        console.error('⚠️  Failed to update video status:', updateError);
        throw updateError;
      }

      console.log('✅ Video status updated to approved');

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🪙 NEW: AWARD CONTRIBUTOR BONUS FOR FULFILLMENT VIDEOS
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (requestId) {
        console.log('🤝 Video is a fulfillment - awarding Contributor Bonus...');
        
        // Get current user coins
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('coins')
          .eq('id', userId)
          .single();

        if (userError) {
          console.error('⚠️  Failed to fetch user coins:', userError);
        } else {
          const currentCoins = userData.coins || 0;
          const newCoins = currentCoins + 20;

          // Update user coins
          const { error: updateCoinsError } = await supabase
            .from('users')
            .update({ coins: newCoins })
            .eq('id', userId);

          if (updateCoinsError) {
            console.error('⚠️  Failed to update coins:', updateCoinsError);
          } else {
            console.log(`✅ Awarded 20 coins (${currentCoins} → ${newCoins})`);

            // Create transaction record
            const { error: transactionError } = await supabase
              .from('coin_transactions')
              .insert({
                user_id: userId,
                amount: 20,
                type: 'contributor_bonus',
                description: 'Contributor Bonus - Request fulfilled',
                related_request_id: requestId,
              });

            if (transactionError) {
              console.error('⚠️  Failed to create transaction:', transactionError);
            } else {
              console.log('✅ Transaction record created');
            }
          }
        }
      } else {
        console.log('ℹ️  General video upload - no Contributor Bonus awarded');
      }
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return { success: true, message: 'Video approved' };
    }
  } catch (error) {
    console.error('❌ Moderation error:', error);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    throw error;
  }
}

// Edge Function handler
serve(async (req) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 MODERATE-VIDEO EDGE FUNCTION INVOKED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // Parse request body
    const { videoId, videoUrl, thumbnailUrl, userId, requestId } = await req.json();  // ← ADDED requestId

    console.log('📋 Request payload:');
    console.log('  - Video ID:', videoId);
    console.log('  - Video URL:', videoUrl);
    console.log('  - Thumbnail URL:', thumbnailUrl);
    console.log('  - User ID:', userId);
    console.log('  - Request ID:', requestId || 'N/A');  // ← ADDED

    // Validate required parameters
    if (!videoId || !videoUrl || !thumbnailUrl || !userId) {
      console.error('❌ Missing required parameters');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required parameters: videoId, videoUrl, thumbnailUrl, and userId are required',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate AWS credentials
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      console.error('❌ AWS credentials not configured');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'AWS credentials not configured',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate Bunny.net credentials
    if (!BUNNY_STREAM_LIBRARY_ID || !BUNNY_STREAM_API_KEY) {
      console.error('❌ Bunny.net credentials not configured');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Bunny.net credentials not configured',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Run moderation (pass requestId)
    const result = await moderateVideo(videoId, videoUrl, thumbnailUrl, userId, requestId);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Edge Function error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});