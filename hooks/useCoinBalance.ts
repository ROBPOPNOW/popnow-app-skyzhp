import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getUserCoins } from '@/utils/coins';
import { AppState } from 'react-native';

export function useCoinBalance(userId: string | null | undefined) {
  const [coins, setCoins] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const channelNameRef = useRef(`coin-balance-changes-${userId}-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    mountedRef.current = true;
    if (!userId) {
      setCoins(0);
      setLoading(false);
      return;
    }

    const fetchBalance = async () => {
      if (!mountedRef.current) return;
      setLoading(true);
      const balance = await getUserCoins(userId);
      if (!mountedRef.current) return;
      setCoins(balance);
      setLoading(false);
    };

    fetchBalance();

    const channel = supabase
      .channel(channelNameRef.current)
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
          if (payload.new && 'coins' in payload.new) {
            setCoins(payload.new.coins as number);
          }
        }
      )
      .subscribe();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && mountedRef.current) {
        fetchBalance();
      }
    });

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
      subscription.remove();
    };
  }, [userId]);

  const refetch = async () => {
    if (!userId || !mountedRef.current) return;
    setLoading(true);
    const balance = await getUserCoins(userId);
    if (!mountedRef.current) return;
    setCoins(balance);
    setLoading(false);
  };

  return { coins, loading, refetch };
}