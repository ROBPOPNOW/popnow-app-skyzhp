// utils/request-coins.ts - Coin logic for video requests

import { supabase } from '@/lib/supabase';
import { deductCoins, awardCoins } from './coins';

/**
 * Deduct coins when creating a request
 * Returns true if successful, false if insufficient balance
 */
export async function deductRequestCoins(
  userId: string,
  requestId: string
): Promise<{ success: boolean; message?: string }> {
  try {
    console.log('💰 Deducting 100 coins for request creation...');
    
    const success = await deductCoins(
      userId,
      100,
      'request_created',
      'Created video request',
      requestId
    );

    if (!success) {
      console.log('❌ Insufficient coins');
      return {
        success: false,
        message: 'You need 100 coins to create a request. Earn more by logging in daily or fulfilling requests!',
      };
    }

    console.log('✅ 100 coins deducted');
    return { success: true };
  } catch (error) {
    console.error('Error deducting request coins:', error);
    return {
      success: false,
      message: 'Failed to process coins. Please try again.',
    };
  }
}

/**
 * Award coins to winner of a video request
 * Uses Edge Function so service role handles the cross-user coin update securely
 */
export async function awardWinnerCoins(
  winnerId: string,
  requestId: string
): Promise<boolean> {
  try {
    console.log('🏆 Awarding 100 coins to winner via Edge Function...')
    console.log('  Winner ID:', winnerId)
    console.log('  Request ID:', requestId)

    const { data, error } = await supabase.functions.invoke('award-winner-coins', {
      body: { winnerId, requestId },
    })

    if (error) {
      console.error('❌ Edge Function error:', error)
      return false
    }

    if (!data?.success) {
      console.error('❌ Edge Function returned failure:', data)
      return false
    }

    console.log('✅ 100 coins awarded to winner via Edge Function')
    return true
  } catch (error) {
    console.error('Error awarding winner coins:', error)
    return false
  }
}

/**
 * Refund coins when request expires without fulfillments
 */
export async function refundExpiredRequestCoins(
  userId: string,
  requestId: string
): Promise<boolean> {
  try {
    console.log('↩️ Refunding 100 coins for expired request...');
    
    const success = await awardCoins(
      userId,
      100,
      'request_refund',
      'Request expired - refund',
      requestId
    );

    if (success) {
      console.log('✅ 100 coins refunded');
    } else {
      console.log('❌ Failed to refund coins');
    }

    return success;
  } catch (error) {
    console.error('Error refunding request coins:', error);
    return false;
  }
}

/**
 * Check if user has enough coins to create a request
 */
export async function checkCanCreateRequest(userId: string): Promise<{
  canCreate: boolean;
  currentCoins: number;
  message?: string;
}> {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('coins')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error checking user coins:', error);
      return {
        canCreate: false,
        currentCoins: 0,
        message: 'Failed to check coin balance',
      };
    }

    const currentCoins = user.coins || 0;
    const canCreate = currentCoins >= 100;

    if (!canCreate) {
      return {
        canCreate: false,
        currentCoins,
        message: `You need 100 coins to create a request. You have ${currentCoins} coins. Earn more by logging in daily!`,
      };
    }

    return {
      canCreate: true,
      currentCoins,
    };
  } catch (error) {
    console.error('Error in checkCanCreateRequest:', error);
    return {
      canCreate: false,
      currentCoins: 0,
      message: 'Error checking balance',
    };
  }
}