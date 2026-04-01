import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { requestId, fulfillmentId } = await req.json()

    console.log('🔔 First fulfillment notification triggered:', { requestId, fulfillmentId })

    // Get request details
    const { data: request, error: requestError } = await supabase
      .from('video_requests')
      .select('user_id, first_fulfillment_notified')
      .eq('id', requestId)
      .single()

    if (requestError) throw requestError

    // Check if this is the first fulfillment and hasn't been notified yet
    const { count } = await supabase
      .from('request_fulfillments')
      .select('*', { count: 'exact', head: true })
      .eq('request_id', requestId)

    if (count === 1 && !request.first_fulfillment_notified) {
      // Create in-app notification
      await supabase.from('notifications').insert({
        user_id: request.user_id,
        type: 'request_first_fulfillment',
        message: 'Someone fulfilled your request! Check it now and select your winner.',
        request_id: requestId,
      })

      // Mark as notified
      await supabase
        .from('video_requests')
        .update({ first_fulfillment_notified: true })
        .eq('id', requestId)

      console.log('✅ First fulfillment notification sent')
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})