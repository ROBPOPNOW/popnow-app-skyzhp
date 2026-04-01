import { Stack, router } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { View } from 'react-native';
import { supabase } from '@/lib/supabase';

export default function HomeLayout() {
  const [isChecking, setIsChecking] = useState(true);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted.current) return;
        if (!session) {
          router.replace('/login');
        }
      } catch (e) {
        if (!isMounted.current) return;
        router.replace('/login');
      } finally {
        if (isMounted.current) {
          setIsChecking(false);
        }
      }
    };

    checkAuth();

    return () => {
      isMounted.current = false;
    };
  }, []);

  if (isChecking) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}