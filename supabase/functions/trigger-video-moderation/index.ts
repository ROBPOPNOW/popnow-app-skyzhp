
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

console.log("trigger-video-moderation Edge Function starting");

/**
 * Supabase Edge Function: Trigger Video Moderation
 * 
 * This function is called after a video is uploaded to trigger the Trigger.dev
 * video moderation task. It sends the video details to Trigger.dev, which will
 * then process the video asynchronously.
 * 
 * This approach is cost-effective because:
 * 1. Edge Functions are lightweight and fast
 * 2. Trigger.dev handles the heavy video processing
 * 3. We don't need to keep the Edge Function running during processing
 */

Deno.serve(async (req) => {
  try {
    // Get Trigger.dev secret key from environment
    const TRIGGER_SECRET_KEY = Deno.env.get("TRIGGER_SECRET_KEY");
    const TRIGGER_API_URL = Deno.env.get("TRIGGER_API_URL") || "https://api.trigger.dev";

    console.log("🔐 Trigger.dev Configuration:");
    console.log("  - Secret Key configured:", !!TRIGGER_SECRET_KEY);
    console.log("  - API URL:", TRIGGER_API_URL);

    if (!TRIGGER_SECRET_KEY) {
      console.error("❌ TRIGGER_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({
          error: "Trigger.dev not configured. Please set TRIGGER_SECRET_KEY environment variable.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    console.log("📥 Received request body:", JSON.stringify(body, null, 2));

    const { videoId, videoUrl, thumbnailUrl } = body;

    if (!videoId || !videoUrl) {
      console.error("❌ Missing required fields");
      return new Response(
        JSON.stringify({ error: "videoId and videoUrl are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🚀 TRIGGERING VIDEO MODERATION TASK");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📹 Video ID:", videoId);
    console.log("🔗 Video URL:", videoUrl);
    console.log("🖼️  Thumbnail URL:", thumbnailUrl || "N/A");

    // Trigger the Trigger.dev task
    // Note: Update the endpoint based on your Trigger.dev project configuration
    const triggerApiUrl = `${TRIGGER_API_URL}/api/v1/tasks/moderate-pop-video/trigger`;

    console.log("📤 Sending request to Trigger.dev...");
    console.log("🔗 API URL:", triggerApiUrl);

    const triggerResponse = await fetch(triggerApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TRIGGER_SECRET_KEY}`,
      },
      body: JSON.stringify({
        videoId,
        videoUrl,
        thumbnailUrl,
      }),
    });

    console.log("📊 Trigger.dev response status:", triggerResponse.status);

    if (!triggerResponse.ok) {
      const errorText = await triggerResponse.text();
      console.error("❌ Trigger.dev error:", errorText);
      
      return new Response(
        JSON.stringify({
          error: "Failed to trigger video moderation task",
          details: errorText,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const triggerResult = await triggerResponse.json();
    console.log("✅ Trigger.dev task triggered successfully");
    console.log("📊 Task details:", JSON.stringify(triggerResult, null, 2));

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ VIDEO MODERATION TASK QUEUED");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Video moderation task triggered successfully",
        taskId: triggerResult.id || triggerResult.taskId,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ Error in trigger-video-moderation:", error);
    console.error("❌ Error stack:", error instanceof Error ? error.stack : "No stack trace");

    return new Response(
      JSON.stringify({
        error: "An error occurred while triggering video moderation",
        details: String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
