import React, { useEffect, useRef } from 'react';
import { Stack, usePathname } from 'expo-router';
import { View, StyleSheet } from 'react-native';

export default function TabLayout() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    console.log('Navigation changed from:', previousPathname.current, 'to:', pathname);
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});