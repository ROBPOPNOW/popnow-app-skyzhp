// types/coins.ts - Coin system type definitions

export interface CoinTransaction {
  id: string;
  user_id: string;
  amount: number; // Positive for earning, negative for spending
  type: 'signup_bonus' | 'daily_login' | 'request_created' | 'request_fulfilled' | 'premium_purchase' | 'request_refund' | 'contributor_bonus';
  description: string | null;
  related_request_id: string | null;
  created_at: string;
}

export interface UserCoins {
  coins: number;
  last_daily_login: string | null;
}

export type CoinTransactionType = CoinTransaction['type'];

// Helper to get user-friendly transaction type labels
export const COIN_TRANSACTION_LABELS: Record<CoinTransactionType, string> = {
  signup_bonus: 'Signup Bonus',
  daily_login: 'Daily Login',
  request_created: 'Request Created',
  request_fulfilled: 'Request Winner',
  premium_purchase: 'Premium Purchase',
  request_refund: 'Request Refund',
  contributor_bonus: 'Contributor Bonus',
};

// Helper to get transaction type icons
export const COIN_TRANSACTION_ICONS: Record<CoinTransactionType, string> = {
  signup_bonus: '🎁',
  daily_login: '📅',
  request_created: '📹',
  request_fulfilled: '🏆',
  premium_purchase: '👑',
  request_refund: '↩️',
  contributor_bonus: '🤝',
};