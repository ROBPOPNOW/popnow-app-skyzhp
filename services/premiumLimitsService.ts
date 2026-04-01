import { supabase } from '@/lib/supabase';

export interface LimitCheckResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  message?: string;
}

/**
 * Check if user can create a request (5/day for free, unlimited for premium)
 */
export const checkRequestLimit = async (userId: string): Promise<LimitCheckResult> => {
  try {
    // Get user's premium status
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('is_premium')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    const isPremium = userData?.is_premium || false;

    // Premium users have unlimited requests
    if (isPremium) {
      return {
        allowed: true,
        currentCount: 0,
        limit: -1, // -1 means unlimited
      };
    }

    // Free users: Check daily limit (5 requests per day)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    const { count, error: countError } = await supabase
      .from('video_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`);

    if (countError) throw countError;

    const currentCount = count || 0;
    const limit = 5;
    const allowed = currentCount < limit;

    return {
      allowed,
      currentCount,
      limit,
      message: allowed
        ? `${currentCount}/${limit} requests used today`
        : `Daily limit reached (${limit}/${limit}). Upgrade to Premium for unlimited requests!`,
    };
  } catch (error) {
    console.error('Error checking request limit:', error);
    return {
      allowed: false,
      currentCount: 0,
      limit: 5,
      message: 'Error checking request limit',
    };
  }
};

/**
 * Check if user can upload a video (5/hour for free, unlimited for premium)
 */
export const checkUploadLimit = async (userId: string): Promise<LimitCheckResult> => {
  try {
    // Get user's premium status
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('is_premium')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    const isPremium = userData?.is_premium || false;

    // Premium users have unlimited uploads
    if (isPremium) {
      return {
        allowed: true,
        currentCount: 0,
        limit: -1, // -1 means unlimited
      };
    }

    // Free users: Check hourly limit (5 uploads per hour)
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const { count, error: countError } = await supabase
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', oneHourAgo.toISOString());

    if (countError) throw countError;

    const currentCount = count || 0;
    const limit = 5;
    const allowed = currentCount < limit;

    return {
      allowed,
      currentCount,
      limit,
      message: allowed
        ? `${currentCount}/${limit} uploads used in past hour`
        : `Hourly limit reached (${limit}/${limit}). Upgrade to Premium for unlimited uploads!`,
    };
  } catch (error) {
    console.error('Error checking upload limit:', error);
    return {
      allowed: false,
      currentCount: 0,
      limit: 5,
      message: 'Error checking upload limit',
    };
  }
};

/**
 * Check if user is premium
 */
export const isPremiumUser = async (userId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('is_premium, premium_expires_at')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error checking premium status:', error);
      return false;
    }

    if (!data) return false;

    // Check if user is premium
    if (!data.is_premium) return false;

    // Check if premium hasn't expired
    if (data.premium_expires_at) {
      const expiryDate = new Date(data.premium_expires_at);
      const now = new Date();
      
      if (expiryDate < now) {
        // Premium expired
        console.log('⚠️ Premium expired for user:', userId);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Error in isPremiumUser:', error);
    return false;
  }
};

/**
 * Helper hook for React components
 */
export const usePremiumLimits = () => {
  const checkCanCreateRequest = async (userId: string) => {
    const result = await checkRequestLimit(userId);
    
    if (!result.allowed) {
      // Show alert in component
      return {
        canProceed: false,
        title: 'Daily Limit Reached',
        message: result.message || 'Upgrade to Premium for unlimited requests!',
        showUpgrade: true,
      };
    }
    
    return {
      canProceed: true,
      currentCount: result.currentCount,
      limit: result.limit,
    };
  };

  const checkCanUpload = async (userId: string) => {
    const result = await checkUploadLimit(userId);
    
    if (!result.allowed) {
      return {
        canProceed: false,
        title: 'Hourly Limit Reached',
        message: result.message || 'Upgrade to Premium for unlimited uploads!',
        showUpgrade: true,
      };
    }
    
    return {
      canProceed: true,
      currentCount: result.currentCount,
      limit: result.limit,
    };
  };

  return {
    checkCanCreateRequest,
    checkCanUpload,
  };
};