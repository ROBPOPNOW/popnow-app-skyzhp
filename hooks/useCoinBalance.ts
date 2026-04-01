import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserCoins } from '@/utils/coins';
import { AppState } from 'react-native';

export function useCoinBalance(userId: string | null | undefined) {
  const [coins, setCoins] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    if (!userId) {
      setCoins(0);
      setLoading(false);
      return;
    }

    console.log('💰 useCoinBalance: Setting up for user:', userId);

    const fetchBalance = async () => {
      if (!mountedRef.current) return;
      if (!userId) return;
      if (mountedRef.current) setLoading(true);
      const balance = await getUserCoins(userId);
      if (!mountedRef.current) return;
      console.log('💰 Fetched coin balance:', balance);
      setCoins(balance);
      setLoading(false);
    };

    fetchBalance();

    const channel = supabase
      .channel('coin-balance-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          console.log('🔔 Real-time coin update received!');
          if (payload.new && 'coins' in payload.new) {
            const newCoins = payload.new.coins as number;
            console.log('  New coins:', newCoins);
            if (mountedRef.current) setCoins(newCoins);
          }
        }
      )
      .subscribe();

    console.log('⏱️ Starting balance polling (every 3 seconds)');
    intervalRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      const latestBalance = await getUserCoins(userId);
      if (!mountedRef.current) return;
      setCoins(prev => {
        if (latestBalance !== prev) {
          console.log('🔄 Poll detected coin change:', prev, '→', latestBalance);
          return latestBalance;
        }
        return prev;
      });
    }, 3000);

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && mountedRef.current) {
        console.log('📱 App became active - refreshing balance');
        fetchBalance();
      }
    });

    return () => {
      mountedRef.current = false;
      console.log('🧹 Cleaning up useCoinBalance');
      supabase.removeChannel(channel);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        console.log('⏱️ Stopped balance polling');
      }
      subscription.remove();
    };
  }, [userId]);

  const refetch = async () => {
    if (!userId || !mountedRef.current) return;
    if (mountedRef.current) setLoading(true);
    const balance = await getUserCoins(userId);
    if (!mountedRef.current) return;
    setCoins(balance);
    setLoading(false);
  };

  return { coins, loading, refetch };
}