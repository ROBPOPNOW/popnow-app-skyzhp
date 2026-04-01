import { useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { View, ActivityIndicator, StyleSheet, Alert } from 'react-native';

export default function AuthCallback() {
  const params = useLocalSearchParams();

  useEffect(() => {
    handleCallback();
  }, []);

  async function handleCallback() {
    try {
      const url = await Linking.getInitialURL();
      console.log('🔄 Auth callback - Initial URL:', url);
      console.log('🔄 Auth callback - Params:', params);

      // Check if this is a recovery redirect with tokens as query params
      // params.type can be a string or array (if duplicated in URL)
      const isRecovery = params.type === 'recovery' || 
        (Array.isArray(params.type) && params.type.includes('recovery'));

      if (isRecovery) {
        console.log('🔑 Recovery redirect detected');
        
        const accessToken = (Array.isArray(params.access_token) 
          ? params.access_token[0] 
          : params.access_token) as string;
        const refreshToken = (Array.isArray(params.refresh_token) 
          ? params.refresh_token[0] 
          : params.refresh_token) as string;

        if (accessToken && refreshToken) {
          console.log('🔑 Setting recovery session from query params...');
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error('❌ Error setting recovery session:', error);
            Alert.alert('Error', 'Reset link has expired. Please request a new one.');
            router.replace('/login');
          } else {
            console.log('✅ Recovery session set, navigating to reset password');
            router.replace('/reset-password' as any);
          }
          return;
        }

        // No tokens in query params, try session
        await new Promise(resolve => setTimeout(resolve, 1000));
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('✅ Recovery session found');
          router.replace('/reset-password' as any);
          return;
        }

        console.log('❌ No recovery tokens found');
        Alert.alert('Error', 'Reset link has expired. Please request a new one.');
        router.replace('/login');
        return;
      }

      // For OAuth: try to extract tokens from the URL fragment
      if (url) {
        const hashPart = url.split('#')[1];
        if (hashPart) {
          const hashParams = new URLSearchParams(hashPart);
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            console.log('🔑 Setting session from OAuth tokens...');
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error('❌ Error setting session:', error);
              router.replace('/login');
            } else {
              console.log('✅ OAuth session set successfully');
            }
            return;
          }
        }
      }

      // Fallback: Check if Supabase already picked up the session
      console.log('🔍 Checking for existing session...');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        console.log('✅ Session found, auth listener will handle navigation');
        return;
      }

      console.log('⚠️ No session found, redirecting to login');
      router.replace('/login');
    } catch (error) {
      console.error('❌ Auth callback error:', error);
      router.replace('/login');
    }
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007AFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});