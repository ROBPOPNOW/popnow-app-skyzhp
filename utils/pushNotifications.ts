import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register for push notifications and get push token
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    console.log('📱 Registering for push notifications...');

    // Check if physical device
    if (!Device.isDevice) {
      console.log('⚠️ Push notifications only work on physical devices');
      return null;
    }

    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('❌ Push notification permission denied');
      return null;
    }

    // Get push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    
    if (!projectId) {
      console.error('❌ Project ID not found in app config');
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    console.log('✅ Push token obtained:', token.data);

    // Configure Android channel (required for Android 8.0+)
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF6B6B',
      });
    }

    return token.data;
  } catch (error) {
    console.error('❌ Error getting push token:', error);
    return null;
  }
}

/**
 * Save push token to user profile
 */
export async function savePushToken(userId: string, pushToken: string): Promise<boolean> {
  try {
    console.log('💾 Saving push token to database...');
    
    // Check if user already had a push token (to detect first-time registration)
    const { data: userData } = await supabase
      .from('users')
      .select('push_token, created_at')
      .eq('id', userId)
      .single();

    const isFirstToken = !userData?.push_token;

    // Clear this token from any other user first
    await supabase
      .from('users')
      .update({ push_token: null })
      .eq('push_token', pushToken)
      .neq('id', userId);

    const { error } = await supabase
      .from('users')
      .update({ push_token: pushToken })
      .eq('id', userId);

    if (error) {
      console.error('❌ Error saving push token:', error);
      return false;
    }

    console.log('✅ Push token saved successfully');

    // Send welcome push if this is the first time token is registered
    // AND user signed up within the last 5 minutes (fresh signup)
    if (isFirstToken && userData?.created_at) {
      const createdAt = new Date(userData.created_at);
      const now = new Date();
      const minutesSinceSignup = (now.getTime() - createdAt.getTime()) / (1000 * 60);

      if (minutesSinceSignup <= 5) {
        console.log('🎉 First-time token for new user — sending welcome push!');
        try {
          await supabase.functions.invoke('send-push-notification', {
            body: {
              pushToken: pushToken,
              title: '👋 Welcome to POPNOW!',
              body: 'Show the world through your window! Upload your first video or explore the map now 🌍',
              data: { type: 'welcome' },
            },
          });
          console.log('✅ Welcome push sent!');
        } catch (pushErr) {
          console.error('⚠️ Welcome push failed:', pushErr);
        }
      }
    }

    return true;
  } catch (error) {
    console.error('❌ Error in savePushToken:', error);
    return false;
  }
}

/**
 * Remove push token (on logout)
 */
export async function removePushToken(userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('users')
      .update({ push_token: null })
      .eq('id', userId);

    if (error) {
      console.error('❌ Error removing push token:', error);
      return false;
    }

    console.log('✅ Push token removed');
    return true;
  } catch (error) {
    console.error('❌ Error in removePushToken:', error);
    return false;
  }
}

/**
 * Add notification response listener (when user taps notification)
 */
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Add notification received listener (when notification arrives while app is open)
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}
/**
 * Update user's last active timestamp
 */
export async function updateLastActive(userId: string): Promise<void> {
  try {
    await supabase
      .from('users')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', userId);
  } catch (error) {
    console.error('Error updating last active:', error);
  }
}