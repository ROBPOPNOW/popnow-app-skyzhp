import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { RekognitionClient, DetectModerationLabelsCommand } from "npm:@aws-sdk/client-rekognition@3";

Deno.serve(async (req) => {
  console.log('🖼️ AVATAR MODERATION STARTED');

  try {
    const { userId, avatarUrl, previousAvatarUrl } = await req.json();
    console.log('User ID:', userId);
    console.log('Avatar URL:', avatarUrl);
    console.log('Previous Avatar URL:', previousAvatarUrl || 'None');

    if (!userId || !avatarUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing userId or avatarUrl' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const awsAccessKey = Deno.env.get('AWS_ACCESS_KEY_ID');
    const awsSecretKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const awsRegion = Deno.env.get('AWS_REGION') || 'ap-southeast-2';

    if (!awsAccessKey || !awsSecretKey) {
      console.error('❌ AWS credentials not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'AWS credentials not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Initialize AWS Rekognition
    const rekognitionClient = new RekognitionClient({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKey,
        secretAccessKey: awsSecretKey,
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

    // Send to AWS Rekognition
    console.log('🤖 Sending to AWS Rekognition...');
    const command = new DetectModerationLabelsCommand({
      Image: { Bytes: new Uint8Array(imageBuffer) },
      MinConfidence: 80,
    });

    const moderationResult = await rekognitionClient.send(command);
    const moderationLabels = moderationResult.ModerationLabels || [];
    console.log(`📊 Found ${moderationLabels.length} moderation labels`);

    let isRejected = false;
    const rejectionReasons: string[] = [];

    const flaggedCategories = [
      'Explicit Nudity',
      'Violence',
      'Graphic Gore',
      'Visually Disturbing',
      'Hate Symbols',
    ];

    for (const label of moderationLabels) {
      const parentName = label.ParentName || '';
      const labelName = label.Name || '';
      const confidence = label.Confidence || 0;
      console.log(`  🏷️ Label: ${labelName} (parent: ${parentName}), confidence: ${confidence.toFixed(2)}%`);

      if (confidence > 80) {
        if (flaggedCategories.includes(parentName) || flaggedCategories.includes(labelName)) {
          isRejected = true;
          rejectionReasons.push(`${labelName} (${confidence.toFixed(2)}% confidence)`);
          console.log(`  ❌ FLAGGED: ${labelName}`);
        }
      }
    }

    if (isRejected) {
      console.log('❌ AVATAR REJECTED:', rejectionReasons.join(', '));

      // Step 1: Delete rejected avatar from Supabase Storage
      try {
        const url = new URL(avatarUrl);
        const pathParts = url.pathname.split('/');
        const bucketIndex = pathParts.indexOf('avatars');
        if (bucketIndex !== -1) {
          const filePath = pathParts.slice(bucketIndex + 1).join('/');
          console.log('🗑️ Deleting from Supabase Storage:', filePath);
          const { error: deleteError } = await supabaseClient.storage
            .from('avatars')
            .remove([filePath]);
          if (deleteError) {
            console.error('⚠️ Storage deletion error:', deleteError);
          } else {
            console.log('✅ Rejected avatar deleted from Supabase Storage');
          }
        }
      } catch (deleteErr) {
        console.error('⚠️ Could not delete avatar file:', deleteErr);
      }

      // Step 2: Restore previous avatar in database
      console.log('🔄 Restoring previous avatar...');
      const { error: updateError } = await supabaseClient
        .from('users')
        .update({ avatar_url: previousAvatarUrl || null })
        .eq('id', userId);

      if (updateError) {
        console.error('❌ Failed to restore avatar:', updateError);
      } else {
        console.log('✅ Avatar restored to:', previousAvatarUrl || 'null');
      }

      // Step 3: Send rejection notification
      await supabaseClient.from('notifications').insert({
        user_id: userId,
        actor_id: userId,
        type: 'avatar_rejected',
        message: "⚠️ Your profile picture was rejected because it didn't meet our community guidelines. Please upload a different image.",
        is_read: false,
      });
      console.log('✅ Rejection notification sent');

      return new Response(
        JSON.stringify({
          success: true,
          approved: false,
          reasons: rejectionReasons,
          restoredTo: previousAvatarUrl || null,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );

    } else {
      console.log('✅ Avatar approved - no inappropriate content detected');
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