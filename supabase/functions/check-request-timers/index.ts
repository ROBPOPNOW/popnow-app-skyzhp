import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
}

// Helper function to send push notifications
async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data: any
) {
  try {
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        pushToken,
        title,
        body,
        data,
      }),
    });

    const result = await response.json();
    console.log('✅ Push notification sent:', result);
  } catch (error) {
    console.error('⚠️ Error sending push notification:', error);
  }
}

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const now = new Date()
    console.log('⏰ Running request timer checks at:', now.toISOString())

    // ========================================
    // 1. CHECK FOR EXPIRED REQUESTS (START GRACE PERIOD)
    // ========================================
    const { data: expiredRequests } = await supabase
      .from('video_requests')
      .select('id, user_id, expires_at, grace_period_ends_at')
      .eq('status', 'open')
      .lte('expires_at', now.toISOString())
      .is('grace_period_ends_at', null)

    console.log(`📋 Found ${expiredRequests?.length || 0} expired requests`)

    for (const request of expiredRequests || []) {
      // Count fulfillments
      const { count: fulfillmentCount } = await supabase
        .from('request_fulfillments')
        .select('*', { count: 'exact', head: true })
        .eq('request_id', request.id)

      if (fulfillmentCount && fulfillmentCount > 0) {
        // Has fulfillments - start 24h grace period
        const gracePeriodEnds = new Date(now.getTime() + 24 * 60 * 60 * 1000)

        await supabase
          .from('video_requests')
          .update({
            status: 'expired',
            grace_period_ends_at: gracePeriodEnds.toISOString(),
            expired_notified: true,
          })
          .eq('id', request.id)

        // Send in-app notification
        await supabase.from('notifications').insert({
          user_id: request.user_id,
          type: 'request_expired_grace_period',
          message: `Your request expired. ${fulfillmentCount} users fulfilled your request. Check them now! You have 24 hours to pick your winner, or the first user will be selected automatically.`,
          request_id: request.id,
        })

        // 🔔 Send push notification
        const { data: userData } = await supabase
          .from('users')
          .select('push_token')
          .eq('id', request.user_id)
          .single()

        if (userData?.push_token) {
          await sendPushNotification(
            userData.push_token,
            '⏰ Request Expired',
            `${fulfillmentCount} users fulfilled your request! Pick a winner within 24h.`,
            {
              type: 'request_expired_grace_period',
              requestId: request.id,
            }
          )
        }

        console.log(`✅ Grace period started for request ${request.id}`)
      } else {
        // No fulfillments - just mark as expired
        await supabase
          .from('video_requests')
          .update({ status: 'expired' })
          .eq('id', request.id)

        console.log(`📭 No fulfillments for request ${request.id}`)
      }
    }

    // ========================================
    // 2. CHECK FOR 12H REMINDERS
    // ========================================
    const twelveHoursFromNow = new Date(now.getTime() + 12 * 60 * 60 * 1000)
    const { data: reminder12h } = await supabase
      .from('video_requests')
      .select('id, user_id, grace_period_ends_at')
      .eq('status', 'expired')
      .eq('reminder_12h_sent', false)
      .not('grace_period_ends_at', 'is', null)
      .lte('grace_period_ends_at', twelveHoursFromNow.toISOString())

    console.log(`⏰ Found ${reminder12h?.length || 0} requests needing 12h reminder`)

    for (const request of reminder12h || []) {
      // Send in-app notification
      await supabase.from('notifications').insert({
        user_id: request.user_id,
        type: 'winner_selection_reminder_12h',
        message: '⏰ 12 hours left to pick your winner! First video will be auto-selected.',
        request_id: request.id,
      })

      // 🔔 Send push notification
      const { data: userData } = await supabase
        .from('users')
        .select('push_token')
        .eq('id', request.user_id)
        .single()

      if (userData?.push_token) {
        await sendPushNotification(
          userData.push_token,
          '⏰ 12 Hours Left!',
          'Pick your winner soon or the first video will be auto-selected.',
          {
            type: 'winner_selection_reminder_12h',
            requestId: request.id,
          }
        )
      }

      await supabase
        .from('video_requests')
        .update({ reminder_12h_sent: true })
        .eq('id', request.id)

      console.log(`✅ 12h reminder sent for request ${request.id}`)
    }

    // ========================================
    // 3. CHECK FOR 1H REMINDERS
    // ========================================
    const oneHourFromNow = new Date(now.getTime() + 1 * 60 * 60 * 1000)
    const { data: reminder1h } = await supabase
      .from('video_requests')
      .select('id, user_id, grace_period_ends_at')
      .eq('status', 'expired')
      .eq('reminder_1h_sent', false)
      .not('grace_period_ends_at', 'is', null)
      .lte('grace_period_ends_at', oneHourFromNow.toISOString())

    console.log(`⏰ Found ${reminder1h?.length || 0} requests needing 1h reminder`)

    for (const request of reminder1h || []) {
      // Send in-app notification
      await supabase.from('notifications').insert({
        user_id: request.user_id,
        type: 'winner_selection_reminder_1h',
        message: '⚠️ URGENT: 1 hour left to pick winner! Or first video wins automatically.',
        request_id: request.id,
      })

      // 🔔 Send push notification
      const { data: userData } = await supabase
        .from('users')
        .select('push_token')
        .eq('id', request.user_id)
        .single()

      if (userData?.push_token) {
        await sendPushNotification(
          userData.push_token,
          '⚠️ URGENT: 1 Hour Left!',
          'Pick your winner NOW or the first video wins automatically!',
          {
            type: 'winner_selection_reminder_1h',
            requestId: request.id,
          }
        )
      }

      await supabase
        .from('video_requests')
        .update({ reminder_1h_sent: true })
        .eq('id', request.id)

      console.log(`✅ 1h reminder sent for request ${request.id}`)
    }

    // ========================================
    // 4. CHECK FOR AUTO-WINNER SELECTION
    // ========================================
    const { data: autoWinnerRequests } = await supabase
      .from('video_requests')
      .select('id, user_id, grace_period_ends_at, winner_video_id')
      .eq('status', 'expired')
      .is('winner_video_id', null)
      .not('grace_period_ends_at', 'is', null)
      .lte('grace_period_ends_at', now.toISOString())

    console.log(`🏆 Found ${autoWinnerRequests?.length || 0} requests needing auto-winner`)

    for (const request of autoWinnerRequests || []) {
      // Get first fulfillment (oldest)
      const { data: firstFulfillment } = await supabase
        .from('request_fulfillments')
        .select('video_id, videos(user_id, users(username))')
        .eq('request_id', request.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      if (firstFulfillment) {
        // Mark winner
        await supabase
          .from('video_requests')
          .update({
            winner_video_id: firstFulfillment.video_id,
            status: 'completed',
          })
          .eq('id', request.id)

        // Award coins to winner
        const winnerUserId = firstFulfillment.videos.user_id
        const { data: winnerData } = await supabase
          .from('users')
          .select('coins')
          .eq('id', winnerUserId)
          .single()

        await supabase
          .from('users')
          .update({ coins: (winnerData?.coins || 0) + 100 })
          .eq('id', winnerUserId)

        await supabase.from('coin_transactions').insert({
          user_id: winnerUserId,
          amount: 100,
          type: 'request_fulfilled',
          description: 'Won video request (auto-selected)',
          related_request_id: request.id,
        })

        // Notify requester (in-app)
        await supabase.from('notifications').insert({
          user_id: request.user_id,
          type: 'auto_winner_selected_requester',
          message: `⏰ Time's up! First video (by @${firstFulfillment.videos.users.username}) was selected as winner.`,
          request_id: request.id,
          video_id: firstFulfillment.video_id,
        })

        // 🔔 Notify requester (push)
        const { data: requesterData } = await supabase
          .from('users')
          .select('push_token')
          .eq('id', request.user_id)
          .single()

        if (requesterData?.push_token) {
          await sendPushNotification(
            requesterData.push_token,
            "⏰ Time's Up!",
            `First video by @${firstFulfillment.videos.users.username} was auto-selected as winner.`,
            {
              type: 'auto_winner_selected_requester',
              requestId: request.id,
              videoId: firstFulfillment.video_id,
            }
          )
        }

        // Notify winner (in-app)
        await supabase.from('notifications').insert({
          user_id: winnerUserId,
          type: 'auto_winner_selected_winner',
          message: '🎉 You won! (Auto-selected) +100 coins',
          request_id: request.id,
          video_id: firstFulfillment.video_id,
          actor_id: request.user_id,
        })

        // 🔔 Notify winner (push)
        const { data: winnerUserData } = await supabase
          .from('users')
          .select('push_token')
          .eq('id', winnerUserId)
          .single()

        if (winnerUserData?.push_token) {
          await sendPushNotification(
            winnerUserData.push_token,
            '🎉 You Won!',
            'You were auto-selected as the winner! +100 coins',
            {
              type: 'auto_winner_selected_winner',
              requestId: request.id,
              videoId: firstFulfillment.video_id,
            }
          )
        }

        console.log(`✅ Auto-winner selected for request ${request.id}`)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        expired: expiredRequests?.length || 0,
        reminder12h: reminder12h?.length || 0,
        reminder1h: reminder1h?.length || 0,
        autoWinners: autoWinnerRequests?.length || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})