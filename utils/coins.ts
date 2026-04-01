// utils/coins.ts - Coin system utilities

import { supabase } from '@/lib/supabase';

// 🔧 UPDATED TYPE DEFINITION
export type CoinTransactionType = 
  | 'signup_bonus' 
  | 'daily_login' 
  | 'request_created'
  | 'request_fulfilled'
  | 'request_refund'
  | 'contributor_bonus';  // ← ADDED

/**
 * Get user's current coin balance
 */
export async function getUserCoins(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('users')
    .select('coins')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user coins:', error);
    return 0;
  }

  return data?.coins || 0;
}

// utils/coins.ts - FIXED checkAndAwardDailyBonus function

/**
 * Check and award daily login bonus
 * Returns number of coins awarded (50 if new day, 0 if already claimed)
 */
export async function checkAndAwardDailyBonus(userId: string): Promise<number> {
  try {
    // Get user's last daily login date
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('last_daily_login, coins')
      .eq('id', userId)
      .single();

    if (fetchError) {
      console.error('Error fetching user for daily bonus:', fetchError);
      return 0;
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const lastLogin = user.last_daily_login;

    console.log('🍿 Daily Bonus Check:');
    console.log('  Today:', today);
    console.log('  Last Login:', lastLogin);

    // Check if already claimed today
    if (lastLogin === today) {
      console.log('  ❌ Already claimed today');
      return 0; // Already claimed
    }

    console.log('  ✅ Awarding 50 coins...');

    // Award 50 coins
    const { error: updateError } = await supabase
      .from('users')
      .update({
        coins: (user.coins || 0) + 50,
        last_daily_login: today,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error awarding daily bonus:', updateError);
      return 0;
    }

    // 🔧 Create transaction record with logging
    console.log('💾 Inserting daily login transaction...');
    console.log('  User ID:', userId);
    console.log('  Amount:', 50);
    console.log('  Type:', 'daily_login');

    const { data: transactionData, error: transactionError } = await supabase
      .from('coin_transactions')
      .insert({
        user_id: userId,
        amount: 50,
        type: 'daily_login',
        description: 'Daily login bonus',
      })
      .select();

    if (transactionError) {
      console.error('❌ Transaction insert error:', transactionError);
      console.error('   Code:', transactionError.code);
      console.error('   Message:', transactionError.message);
      console.error('   Details:', transactionError.details);
    } else {
      console.log('✅ Transaction created:', transactionData);
    }

    if (transactionError) {
      console.error('Error creating transaction record:', transactionError);
      // Don't return 0 here - coins were already awarded
    } else {
      console.log('  ✅ Transaction record created');
    }

    return 50; // Successfully awarded
  } catch (error) {
    console.error('Error in checkAndAwardDailyBonus:', error);
    return 0;
  }
}

/**
 * Deduct coins from user (for creating requests)
 * Returns true if successful, false if insufficient balance
 */
export async function deductCoins(
  userId: string,
  amount: number,
  type: 'request_created',
  description?: string,
  relatedRequestId?: string
): Promise<boolean> {
  try {
    // Get current balance
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('coins')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      console.error('Error fetching user for coin deduction:', fetchError);
      return false;
    }

    // Check sufficient balance
    if (user.coins < amount) {
      return false; // Insufficient balance
    }

    // Deduct coins
    const { error: updateError } = await supabase
      .from('users')
      .update({ coins: user.coins - amount })
      .eq('id', userId);

    if (updateError) {
      console.error('Error deducting coins:', updateError);
      return false;
    }

    // Create transaction record (negative amount)
    await supabase.from('coin_transactions').insert({
      user_id: userId,
      amount: -amount,
      type,
      description: description || `Spent ${amount} coins`,
      related_request_id: relatedRequestId || null,
    });

    return true;
  } catch (error) {
    console.error('Error in deductCoins:', error);
    return false;
  }
}

/**
 * Award coins to a user
 */
export async function awardCoins(
  userId: string,
  amount: number,
  type: CoinTransactionType,
  description: string,
  requestId?: string
): Promise<boolean> {
  try {
    console.log('💰 Awarding coins:');
    console.log('  User:', userId);
    console.log('  Amount:', amount);
    console.log('  Type:', type);

    // Get current coins
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('coins')
      .eq('id', userId)
      .single();

    if (fetchError) {
      console.error('Error fetching user coins:', fetchError);
      return false;
    }

    const currentCoins = user.coins || 0;
    const newCoins = currentCoins + amount;

    console.log('  Current coins:', currentCoins);
    console.log('  New coins:', newCoins);

    // Update coins
    const { error: updateError } = await supabase
      .from('users')
      .update({ coins: newCoins })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating coins:', updateError);
      return false;
    }

    // Create transaction record
    const { error: transactionError } = await supabase
      .from('coin_transactions')
      .insert({
        user_id: userId,
        amount: amount,
        type: type,
        description: description,
        related_request_id: requestId,
      });

    if (transactionError) {
      console.error('Error creating transaction:', transactionError);
      return false;
    }

    console.log('✅ Coins awarded successfully');
    return true;
  } catch (error) {
    console.error('Error in awardCoins:', error);
    return false;
  }
}

/**
 * Get user's coin transaction history
 */
export async function getCoinTransactions(userId: string, limit = 50) {
  const { data, error } = await supabase
    .from('coin_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching coin transactions:', error);
    return [];
  }

  return data || [];
}

/**
 * Format coin number for display
 * 500 → "500"
 * 1500 → "1.5K"
 * 10000 → "10K"
 */
export function formatCoins(coins: number): string {
  if (coins < 1000) {
    return coins.toString();
  } else if (coins < 1000000) {
    return (coins / 1000).toFixed(1).replace('.0', '') + 'K';
  } else {
    return (coins / 1000000).toFixed(1).replace('.0', '') + 'M';
  }
}