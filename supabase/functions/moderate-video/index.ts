
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Deno.serve is the entry point for Supabase Edge Functions
Deno.serve(async (req) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎬 MODERATE-VIDEO EDGE FUNCTION INVOKED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // Parse request body
    const { videoId, videoUrl, thumbnailUrl, userId } = await req.json();
    
    console.log('📋 Request payload:');
    console.log('  - Video ID:', videoId);
    console.log('  - Video URL:', videoUrl);
    console.log('  - Thumbnail URL:', thumbnailUrl);
    console.log('  - User ID:', userId);

    if (!videoId || !videoUrl) {
      console.error('❌ Missing required parameters');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required parameters: videoId and videoUrl are required' 
        }),
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get Trigger.dev API key from environment
    const TRIGGER_API_KEY = Deno.env.get('TRIGGER_API_KEY');
    const TRIGGER_API_URL = Deno.env.get('TRIGGER_API_URL') || 'https://api.trigger.dev';
    
    console.log('🔐 Trigger.dev Configuration:');
    console.log('  - API Key configured:', !!TRIGGER_API_KEY);
    console.log('  - API URL:', TRIGGER_API_URL);

    if (!TRIGGER_API_KEY) {
      console.error('❌ TRIGGER_API_KEY not configured in Supabase secrets');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Trigger.dev API key not configured' 
        }),
        { 
          status: 500, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    // Trigger the Trigger.dev task
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 TRIGGERING TRIGGER.DEV TASK: moderate-pop-video');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const triggerPayload = {
      videoId,
      videoUrl,
      thumbnailUrl,
    };
    
    console.log('📤 Sending payload to Trigger.dev:', JSON.stringify(triggerPayload, null, 2));

    const triggerResponse = await fetch(`${TRIGGER_API_URL}/api/v1/tasks/moderate-pop-video/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TRIGGER_API_KEY}`,
      },
      body: JSON.stringify(triggerPayload),
    });

    console.log('📊 Trigger.dev API Response:', triggerResponse.status, triggerResponse.statusText);

    if (!triggerResponse.ok) {
      const errorText = await triggerResponse.text();
      console.error('❌ Trigger.dev API Error:', errorText);
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to trigger moderation task: ${triggerResponse.statusText}`,
          details: errorText,
        }),
        { 
          status: 500, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    const triggerResult = await triggerResponse.json();
    console.log('✅ Trigger.dev task triggered successfully');
    console.log('📋 Task details:', JSON.stringify(triggerResult, null, 2));

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ MODERATE-VIDEO EDGE FUNCTION COMPLETED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Moderation task triggered successfully',
        taskId: triggerResult.id,
        taskStatus: triggerResult.status,
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ MODERATE-VIDEO EDGE FUNCTION ERROR');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Unknown error occurred',
        stack: error.stack,
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
});
