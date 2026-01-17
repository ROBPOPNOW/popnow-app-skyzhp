
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Log configuration status (without exposing sensitive data)
console.log('Supabase Configuration:', {
  hasUrl: !!supabaseUrl,
  hasKey: !!supabaseAnonKey,
  urlPrefix: supabaseUrl ? supabaseUrl.substring(0, 20) + '...' : 'missing',
  platform: Platform.OS,
});

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️ Supabase configuration is missing! Please check your .env file.');
  console.error('Required variables: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

// Create Supabase client with proper AsyncStorage configuration
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Initialize connection check only after a delay to ensure AsyncStorage is ready
// This prevents "window is not defined" errors during module initialization
let connectionChecked = false;

export const initializeSupabase = async () => {
  if (connectionChecked) return;
  
  try {
    connectionChecked = true;
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Supabase connection error:', error.message);
    } else {
      console.log('Supabase connected successfully');
    }
  } catch (err) {
    console.error('Failed to connect to Supabase:', err);
  }
};
