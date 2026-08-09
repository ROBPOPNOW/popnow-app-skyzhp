import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REVENUECAT_WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')!;

// Manual constant-time compare: Deno's std lib has no timingSafeEqual, and
// this runs on every request before we know the caller is legitimate, so a
// length-dependent early-return (`a === b`) would leak timing information
// about how much of the secret an attacker has guessed correctly.
function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

async function sendPush(
  supabase: any,
  userId: string,
  title: string,
  body: string,
  type: string
) {
  try {
    const { data: userData } = await supabase
      .from('users')
      .select('push_token')
      .eq('id', userId)
      .single();

    if (!userData?.push_token) return;

    await supabase.functions.invoke('send-push-notification', {
      body: { pushToken: userData.push_token, title, body, data: { type } },
    });
  } catch (error) {
    // Best-effort only — a missed push must never fail the webhook response
    // or cause RevenueCat to retry an already-fully-processed event.
    console.error('⚠️ Push notification failed:', error);
  }
}

Deno.serve(async (req) => {
  // ── AUTH ──────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!timingSafeEqual(authHeader, REVENUECAT_WEBHOOK_SECRET)) {
    console.error('❌ Unauthorized webhook call — Authorization header mismatch');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const eventType: string | undefined = body?.type;
  const rcEvent = body?.event ?? {};
  const eventId: string | undefined = rcEvent.id;
  const appUserId: string | undefined = rcEvent.app_user_id;

  console.log('🔔 RevenueCat webhook:', eventType, 'event_id:', eventId, 'user:', appUserId);

  if (!eventId || !appUserId) {
    console.error('❌ Missing event.id or event.app_user_id');
    return new Response(JSON.stringify({ error: 'Missing event.id or app_user_id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    switch (eventType) {
      case 'TEST': {
        // Dashboard "send test event" — just confirm the endpoint is
        // reachable and auth passes. Its app_user_id won't map to a real
        // user, so don't attempt a real activation (would just raise).
        console.log('✅ TEST event acknowledged');
        return ok();
      }

      case 'INITIAL_PURCHASE': {
        const { data: claimed, error } = await supabase.rpc('revenuecat_process_activation', {
          p_event_id: eventId,
          p_event_type: eventType,
          p_app_user_id: appUserId,
          p_expires_at: rcEvent.expiration_at_ms ? new Date(rcEvent.expiration_at_ms).toISOString() : null,
          p_platform: rcEvent.store ?? 'unknown',
          p_product_id: rcEvent.product_id ?? 'unknown',
          p_grant_coins: true,
          p_coin_amount: 1000,
          p_coin_type: 'premium_purchase',
          p_coin_description: 'Premium subscription bonus',
          p_notification_type: 'premium_activated',
          p_notification_message: '🌟 Welcome to Premium! You now have no watermarks, ad-free experience, and unlimited requests & uploads. Plus 1000 POPCoins bonus!',
        });
        if (error) throw error;
        if (claimed) {
          await sendPush(supabase, appUserId, '🌟 Premium Activated!', 'Enjoy no watermarks, ad-free experience, unlimited requests & uploads + 1000 POPCoins!', 'premium_activated');
        } else {
          console.log('ℹ️ Duplicate INITIAL_PURCHASE event, already processed');
        }
        return ok();
      }

      case 'RENEWAL': {
        const { data: claimed, error } = await supabase.rpc('revenuecat_process_activation', {
          p_event_id: eventId,
          p_event_type: eventType,
          p_app_user_id: appUserId,
          p_expires_at: rcEvent.expiration_at_ms ? new Date(rcEvent.expiration_at_ms).toISOString() : null,
          p_platform: rcEvent.store ?? 'unknown',
          p_product_id: rcEvent.product_id ?? 'unknown',
          p_grant_coins: true,
          p_coin_amount: 1000,
          p_coin_type: 'premium_renewal',
          p_coin_description: 'Premium subscription renewal bonus',
          p_notification_type: 'premium_renewed',
          p_notification_message: '🎉 Your Premium subscription renewed! 1000 POPCoins have been added to your balance.',
        });
        if (error) throw error;
        if (claimed) {
          await sendPush(supabase, appUserId, '🎉 Premium Renewed!', 'Your subscription renewed — 1000 POPCoins added!', 'premium_renewed');
        } else {
          console.log('ℹ️ Duplicate RENEWAL event, already processed');
        }
        return ok();
      }

      case 'UNCANCELLATION': {
        const { data: claimed, error } = await supabase.rpc('revenuecat_process_activation', {
          p_event_id: eventId,
          p_event_type: eventType,
          p_app_user_id: appUserId,
          p_expires_at: rcEvent.expiration_at_ms ? new Date(rcEvent.expiration_at_ms).toISOString() : null,
          p_platform: rcEvent.store ?? 'unknown',
          p_product_id: rcEvent.product_id ?? 'unknown',
          p_grant_coins: false,
          p_coin_amount: 0,
          p_coin_type: 'premium_purchase',
          p_coin_description: null,
          p_notification_type: 'premium_activated',
          p_notification_message: '🌟 Your Premium subscription has been reactivated!',
        });
        if (error) throw error;
        if (claimed) {
          await sendPush(supabase, appUserId, '🌟 Premium Reactivated', 'Your subscription is active again!', 'premium_activated');
        }
        return ok();
      }

      case 'CANCELLATION': {
        const cancelReason = rcEvent.cancel_reason;

        if (cancelReason === 'CUSTOMER_SUPPORT') {
          // RevenueCat's refund signal — revoke immediately, coins are NOT
          // clawed back (per confirmed decision).
          const { data: claimed, error } = await supabase.rpc('revenuecat_process_deactivation', {
            p_event_id: eventId,
            p_event_type: eventType,
            p_app_user_id: appUserId,
            p_notification_type: 'premium_expired',
            p_notification_message: '⏰ Your Premium subscription was refunded and access has ended.',
          });
          if (error) throw error;
          if (claimed) {
            await sendPush(supabase, appUserId, '⏰ Premium Access Ended', 'Your Premium subscription was refunded.', 'premium_expired');
          }
          return ok();
        }

        // Voluntary cancel / billing error / price increase / etc: the
        // user paid through the current period — do NOT revoke yet. Access
        // ends when EXPIRATION actually arrives. Just record we saw it.
        console.log(`ℹ️ CANCELLATION (reason: ${cancelReason}) — access continues until EXPIRATION`);
        const { error: logError } = await supabase
          .from('revenuecat_webhook_events')
          .insert({ event_id: eventId, event_type: eventType, app_user_id: appUserId });
        if (logError && logError.code !== '23505') {
          console.error('⚠️ Failed to log CANCELLATION event:', logError);
        }
        return ok();
      }

      case 'EXPIRATION': {
        const { data: claimed, error } = await supabase.rpc('revenuecat_process_deactivation', {
          p_event_id: eventId,
          p_event_type: eventType,
          p_app_user_id: appUserId,
          p_notification_type: 'premium_expired',
          p_notification_message: '⏰ Your Premium subscription has expired. Renew now to get back no watermarks, ad-free experience, and unlimited requests & uploads!',
        });
        if (error) throw error;
        if (claimed) {
          await sendPush(supabase, appUserId, '⏰ Premium Expired', 'Renew now to get back no watermarks, ad-free, and unlimited uploads!', 'premium_expired');
        }
        return ok();
      }

      default: {
        console.log('ℹ️ Ignoring unhandled event type:', eventType);
        return ok();
      }
    }
  } catch (error) {
    // Non-2xx so RevenueCat retries. Because the dedup claim lives inside
    // the same transaction as the mutation it protects, a retry after a
    // genuine failure here will NOT be blocked — see
    // revenuecat_process_activation/_deactivation in
    // supabase/migrations/20260809_add_revenuecat_process_functions.sql.
    console.error('❌ revenuecat-webhook error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

function ok() {
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
