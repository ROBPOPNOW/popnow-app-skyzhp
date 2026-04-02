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
  const isExplorePage = pathname === '/' || pathname.includes('/(home)');

  console.log('🔍 DEBUG - pathname:', pathname);
  console.log('🔍 DEBUG - isExplorePage:', isExplorePage);

  useEffect(() => {
    console.log('Navigation changed from:', previousPathname.current, 'to:', pathname);
    const isLeavingFeed =
      previousPathname.current.includes('/(home)') &&
      (pathname.includes('/map') || pathname.includes('/profile') || pathname.includes('/request'));
    if (isLeavingFeed) {
      console.log('🎬 User navigated away from feed to:', pathname);
      console.log('🛑 Videos will be stopped by VideoPlayer isActive=false');
    }
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
        {/* @ts-ignore */}
        <Stack.Screen name="(home)" options={{ headerShown: false, freezeOnBlur: false, detachPreviousScreen: false }} />
        <Stack.Screen name="search" options={{ headerShown: false }} />
        {/* @ts-ignore */}
        <Stack.Screen name="map" options={{ headerShown: false, freezeOnBlur: false, detachPreviousScreen: false }} />
        {/* @ts-ignore */}
        <Stack.Screen name="request" options={{ headerShown: false, freezeOnBlur: false, detachPreviousScreen: false }} />
        {/* @ts-ignore */}
        <Stack.Screen name="profile" options={{ headerShown: false, freezeOnBlur: false, detachPreviousScreen: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
      </Stack>
      <FloatingTabBar tabs={tabs} isTransparent={isExplorePage} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});