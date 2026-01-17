
import React, { useEffect, useRef } from 'react';
import { Stack, usePathname } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';
import { View, StyleSheet } from 'react-native';

const tabs: TabBarItem[] = [
  {
    name: 'explore',
    route: '/(tabs)/(home)/',
    icon: 'binoculars.fill',
    label: 'Explore',
  },
  {
    name: 'map',
    route: '/(tabs)/map',
    icon: 'map.fill',
    label: 'Map',
  },
  {
    name: 'upload',
    route: '/record-video',
    icon: 'plus',
    label: 'Upload',
    isUpload: true,
  },
  {
    name: 'request',
    route: '/(tabs)/request',
    icon: 'hand.raised.fill',
    label: 'Request',
  },
  {
    name: 'profile',
    route: '/(tabs)/profile',
    icon: 'person.fill',
    label: 'Profile',
  },
];

export default function TabLayout() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    // Log navigation changes for debugging
    console.log('Navigation changed from:', previousPathname.current, 'to:', pathname);

    // Detect when user navigates away from home/feed to map, profile, or request
    const isLeavingFeed = 
      previousPathname.current.includes('/(home)') && 
      (pathname.includes('/map') || pathname.includes('/profile') || pathname.includes('/request'));

    if (isLeavingFeed) {
      console.log('🎬 User navigated away from feed to:', pathname);
      console.log('🛑 Videos will be stopped by VideoPlayer isActive=false');
      // Videos will be stopped automatically by VideoPlayer's isActive prop
      // which is controlled by the FlatList's viewability detection
      // The VideoPlayer now completely stops (pause + reset + mute) when isActive=false
    }

    // Also detect navigation TO feed from other tabs
    const isEnteringFeed = 
      !previousPathname.current.includes('/(home)') && 
      pathname.includes('/(home)');

    if (isEnteringFeed) {
      console.log('▶️ User navigated to feed from:', previousPathname.current);
      console.log('✅ Videos will start playing when visible');
    }

    previousPathname.current = pathname;
  }, [pathname]);

  return (
    <View style={styles.container}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(home)" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ headerShown: false }} />
        <Stack.Screen name="map" options={{ headerShown: false }} />
        <Stack.Screen name="request" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
      </Stack>
      <FloatingTabBar tabs={tabs} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
