import * as Linking from 'expo-linking';
import React, { useEffect, useState, useRef } from "react";
import { useFonts } from "expo-font";
import { Stack, router, useSegments, useRootNavigationState } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColorScheme, Alert, View, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { useNetworkState } from "expo-network";
import {
  DarkTheme,
  DefaultTheme,
  Theme,
  ThemeProvider,
} from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { WidgetProvider } from "@/contexts/WidgetContext";
import { supabase } from "@/lib/supabase";
import Constants from 'expo-constants';
import Purchases from 'react-native-purchases';
import * as Notifications from 'expo-notifications';
import { 
  registerForPushNotifications, 
  savePushToken,
  addNotificationResponseListener,
  addNotificationReceivedListener, 
  updateLastActive
} from '@/utils/pushNotifications';

// Hide development breadcrumbs
if (typeof document !== 'undefined' && !__DEV__) {
  const style = document.createElement('style');
  style.innerHTML = `
    [data-expo-router-development="true"] {
      display: none !important;
    }
  `;
  document.head?.appendChild(style);
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: "login",
};

function RootLayoutNav() {
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);
  const mountedRef = useRef(true);

  // 🔔 Register for push notifications
  const registerPushNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('⚠️ No user found, skipping push registration');
        return;
      }

      
      // Update last active timestamp
      updateLastActive(user.id);

      const pushToken = await registerForPushNotifications();
      if (pushToken) {
        await savePushToken(user.id, pushToken);
      }
    } catch (error) {
      console.error('❌ Error registering push notifications:', error);
    }
  };

  // Check authentication status on mount and monitor session changes
useEffect(() => {
    mountedRef.current = true;

    // Initialize RevenueCat
try {
  const apiKey = Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS,
    android: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID,
  });
  
console.log('🔑 RevenueCat API key:', apiKey ? 'present' : 'MISSING');

  if (apiKey) {
    Purchases.configure({ apiKey });
    console.log('✅ RevenueCat initialized');
  } else {
    console.warn('⚠️ RevenueCat API key not found');
  }
} catch (error) {
  console.error('❌ RevenueCat initialization failed:', error);
}

    // 🔔 Register for push notifications
    registerPushNotifications();

    // 🔔 Listen for notifications
    notificationListener.current = addNotificationReceivedListener(notification => {
      console.log('📬 Notification received:', notification);
    });

    // 🔔 Listen for notification taps
    responseListener.current = addNotificationResponseListener(response => {
      console.log('👆 Notification tapped:', response);
      handleNotificationTap(response);
    });

    checkAuth();

    // Listen for auth state changes
   const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session ? 'Session exists' : 'No session');
        
        if (event === 'PASSWORD_RECOVERY') {
          console.log('🔑 Password recovery event detected');
          setIsAuthenticated(true);
          router.replace('/reset-password' as any);
          return;
        }
        
        if (event === 'SIGNED_OUT' || !session) {
          setIsAuthenticated(false);
        } else if (event === 'SIGNED_IN' || session) {
  setIsAuthenticated(true);
  // Re-register push notifications on sign in
  registerPushNotifications();
  // Identify user with RevenueCat
  if (session?.user?.id) {
    try {
      await Purchases.logIn(session.user.id);
      console.log('✅ RevenueCat user identified:', session.user.id);
    } catch (e) {
      console.error('⚠️ RevenueCat logIn failed:', e);
    }
  }
}
      }
    );

    return () => {
      mountedRef.current = false;
      authListener.subscription.unsubscribe();
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  // 🔗 Handle deep links (universal links and custom scheme)
  useEffect(() => {
    // Handle initial URL (app opened from link)
    const handleInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        console.log('📎 Initial URL received:', initialUrl);
        handleDeepLink(initialUrl);
      }
    };

    // Handle URL when app is already open  
    const subscription = Linking.addEventListener('url', ({ url }) => {
      console.log('📎 URL received while app open:', url);
      handleDeepLink(url);
    });

    handleInitialUrl();

    return () => {
      subscription.remove();
    };
  }, []);

  // Deep link handler function
  const handleDeepLink = async (url: string) => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔗 DEEP LINK HANDLER');
    console.log('  URL:', url);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // Handle popnow:// scheme
      if (url.startsWith('popnow://')) {
        const path = url.replace('popnow://', '');
        console.log('  Custom scheme path:', path);

        if (path.startsWith('video/')) {
          const videoId = path.replace('video/', '');
          console.log('  Opening video:', videoId);
          await navigateToVideoOrProfile(videoId, undefined);
          return;
        }
      }

      // Handle https://popnow.world URLs
      if (url.includes('popnow.world')) {
        console.log('  Universal link detected');
        const urlObj = new URL(url);
        
        if (urlObj.pathname.includes('/v.html')) {
          const videoId = urlObj.searchParams.get('id');
          
          if (videoId) {
            console.log('  Opening video from web link:', videoId);
            await navigateToVideoOrProfile(videoId, undefined);
            return;
          }
        }
      }

      console.log('⚠️ URL not recognized');
    } catch (error) {
      console.error('❌ Error handling deep link:', error);
    } finally {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  };

// Helper function to check video validity and navigate
  const navigateToVideoOrProfile = async (videoId: string, actorId: string | undefined) => {
    try {
      const { data: video, error } = await supabase
        .from('videos')
        .select('created_at, moderation_status, user_id')
        .eq('id', videoId)
        .single();
      
      if (error || !video) {
        console.log('Video not found, navigating to profile');
        if (actorId) {
          router.push({
            pathname: '/user-profile',
            params: { userId: actorId },
          });
        }
        return;
      }
      
      const videoAge = Date.now() - new Date(video.created_at).getTime();
      const oneHourInMs = 60 * 60 * 1000;
      const isExpired = videoAge > oneHourInMs;
      const isRejected = video.moderation_status === 'rejected';
      
      if (isExpired || isRejected) {
        console.log(`Video ${isExpired ? 'expired' : 'rejected'}, navigating to profile`);
        router.push({
          pathname: '/user-profile',
          params: { userId: video.user_id },
        });
      } else {
        console.log('Video is valid, navigating to player');
        router.push({
          pathname: '/search-video-player',
          params: { 
            videoIds: JSON.stringify([videoId]),
            startIndex: '0'
          },
        });
      }
    } catch (err) {
      console.error('Error checking video validity:', err);
      if (actorId) {
        router.push({
          pathname: '/user-profile',
          params: { userId: actorId },
        });
      }
    }
  };

  const handleNotificationTap = async (response: Notifications.NotificationResponse) => {
  const data = response.notification.request.content.data as any;
  
  console.log('📱 Notification data:', data);

  // Ignore taps on informational notifications (just acknowledgements)
  if (data.type === 'contributor_bonus' || 
      data.type === 'premium_purchased' ||
      data.type === 'premium_renewed' ||
      data.type === 'premium_expired' ||
      data.type === 'welcome') {
    console.log('ℹ️ Informational notification - no navigation');
    return;  // Do nothing - just acknowledgement
  }

// Navigate based on notification type
if (data.type === 'nearby_request' || data.type === 'nearby_request_needs_help') {
  // Both nearby request types go to request details
  router.push({
    pathname: '/request-details',
    params: { requestId: data.requestId },
  });
  return;
} else if (data.type === 'request_first_fulfillment' ||
  data.type === 'fulfillment_milestone' ||
  data.type === 'request_expiring_soon' ||
  data.type === 'request_expired_grace_period' ||
  data.type === 'winner_selection_reminder_12h' ||
  data.type === 'winner_selection_reminder_1h' ||
  data.type === 'auto_winner_selected_requester') {
  router.push({
    pathname: '/fulfillment-videos',
    params: { requestId: data.requestId },
  });
  return;
} else if (data.type === 'auto_winner_selected_winner' ||
           data.type === 'request_winner_manual') {
  // Winner notifications - play the video directly
  if (data.videoId) {
    router.push({
      pathname: '/search-video-player',
      params: { 
        videoIds: JSON.stringify([data.videoId]),
        startIndex: '0'
      },
    });
  }
  return;
} else if (data.type === 'request_fulfilled') {
  router.push({
    pathname: '/fulfillment-videos',
    params: { 
      requestId: data.requestId,
      videoId: data.videoId 
    },
  });
  return;  // ← ADD THIS
} else if (data.type === 'follow') {
  router.push({
    pathname: '/user-profile',
    params: { userId: data.actorId },
  });
  return;  // ← ADD THIS
} else if (data.type === 'follower_milestone') {
  // Get current user ID first
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    router.push({
      pathname: '/followers-list',
      params: { 
        userId: user.id,  // ← Use authenticated user's ID
        listType: 'followers'
      },
    });
  }
  return;  // ← ADD THIS
} else if (data.type === 'like' ||
         data.type === 'comment' || 
         data.type === 'comment_reply' ||
         data.type === 'view_milestone' ||
         data.type === 'following_new_video' ||
         data.type === 'nearby_video') {
  // Check video validity before navigating
  if (data.videoId) {
    await navigateToVideoOrProfile(data.videoId, data.actorId);
  }
  return;  // ← ADD THIS
}
};

async function checkAuth() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('Initial auth check:', session ? 'Authenticated' : 'Not authenticated');
      if (!mountedRef.current) return;
      setIsAuthenticated(!!session);

// Identify user with RevenueCat
if (session?.user?.id) {
  try {
    await Purchases.logIn(session.user.id);
    console.log('✅ RevenueCat user identified:', session.user.id);
  } catch (e) {
    console.error('⚠️ RevenueCat logIn failed:', e);
  }
}
   } catch (error) {
      console.error('Auth check failed:', error);
      if (!mountedRef.current) return;
      setIsAuthenticated(false);
    }
  }

  // Handle navigation based on auth state
  useEffect(() => {
    if (!navigationState?.key || isAuthenticated === null) return;

    const inAuthGroup = segments[0] === 'login';
    const currentRoute = segments[segments.length - 1];
    
    // Allow unauthenticated access to public routes
    const publicRoutes = ['login', 'terms', 'privacy', 'reset-password', 'callback'];

    console.log('Navigation guard:', {
      isAuthenticated,
      inAuthGroup,
      currentRoute,
      segments: segments.join('/')
    });

    if (!isAuthenticated && !inAuthGroup && !publicRoutes.includes(currentRoute)) {
      // User not authenticated and not on public route, redirect to login
      console.log('🔒 Redirecting to login - user not authenticated');
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      // User authenticated, check if profile is complete
      checkProfileCompletion();
    }
  }, [isAuthenticated, segments, navigationState?.key]);

  // Check if user needs to complete profile
  async function checkProfileCompletion() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

     const { data: profile } = await supabase
  .from('users')
  .select('profile_completed, username, location')
  .eq('id', user.id)
  .single();

      if (!profile || !profile.profile_completed) {
        // First-time user - redirect to edit profile
        console.log('👤 First-time user - redirecting to profile setup');
        router.replace('/edit-profile?firstTime=true');
      } else {
        // Profile complete - go to home
        console.log('✅ Profile complete - redirecting to home');
        router.replace('/(tabs)/(home)/' as any);
      }
    } catch (error) {
      console.error('Error checking profile:', error);
      // On error, just go to home
      router.replace('/(tabs)/(home)/' as any);
    }
  }

  // Show loading while checking auth
  if (isAuthenticated === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
      <Stack.Screen name="terms" options={{ headerShown: false }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Screen name="reset-password" options={{ headerShown: false }} />
      <Stack.Screen
        name="request-details"
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="user-profile"
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="fulfillment-videos"
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="record-video"
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
        }}
      />
      <Stack.Screen
        name="upload"
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="search-video-player"
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
        }}
      />
      <Stack.Screen
  name="followers-list"
  options={{
    headerShown: false,
    presentation: "card",
  }}
/>
<Stack.Screen
  name="coin-history"
  options={{
    headerShown: false,
    presentation: "card",
  }}
/>
<Stack.Screen
  name="privacy"
  options={{
    headerShown: false,
    presentation: "card",
  }}
/>
<Stack.Screen
  name="premium-upgrade"
  options={{
    headerShown: false,
    presentation: "card",
  }}
/>
<Stack.Screen
  name="modal"
  options={{
    presentation: "modal",
    title: "Standard Modal",
  }}
/>
      <Stack.Screen
        name="formsheet"
        options={{
          presentation: "formSheet",
          title: "Form Sheet Modal",
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.5, 0.8, 1.0],
          sheetCornerRadius: 20,
        }}
      />
      <Stack.Screen
        name="transparent-modal"
        options={{
          presentation: "transparentModal",
          headerShown: false,
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const networkState = useNetworkState();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  React.useEffect(() => {
    if (
      !networkState.isConnected &&
      networkState.isInternetReachable === false
    ) {
      Alert.alert(
        "🔌 You are offline",
        "You can keep using the app! Your changes will be saved locally and synced when you are back online."
      );
    }
  }, [networkState.isConnected, networkState.isInternetReachable]);

  if (!loaded) {
    return null;
  }

  const CustomDefaultTheme: Theme = {
    ...DefaultTheme,
    dark: false,
    colors: {
      primary: "rgb(0, 122, 255)",
      background: "rgb(242, 242, 247)",
      card: "rgb(255, 255, 255)",
      text: "rgb(0, 0, 0)",
      border: "rgb(216, 216, 220)",
      notification: "rgb(255, 59, 48)",
    },
  };

  const CustomDarkTheme: Theme = {
    ...DarkTheme,
    colors: {
      primary: "rgb(10, 132, 255)",
      background: "rgb(1, 1, 1)",
      card: "rgb(28, 28, 30)",
      text: "rgb(255, 255, 255)",
      border: "rgb(44, 44, 46)",
      notification: "rgb(255, 69, 58)",
    },
  };

  return (
    <>
      <StatusBar style="auto" animated />
      <ThemeProvider
        value={colorScheme === "dark" ? CustomDarkTheme : CustomDefaultTheme}
      >
        <WidgetProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <RootLayoutNav />
            <SystemBars style={"auto"} />
          </GestureHandlerRootView>
        </WidgetProvider>
      </ThemeProvider>
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});