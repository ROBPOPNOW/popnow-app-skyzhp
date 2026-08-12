import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import * as Location from 'expo-location';

export interface TabBarItem {
  name: string;
  route: string;
  icon: string;
  label: string;
  isUpload?: boolean;
}

interface FloatingTabBarProps {
  tabs: TabBarItem[];
  isTransparent?: boolean;
  unreadCount?: number;
}

export default function FloatingTabBar({ tabs, isTransparent = false, unreadCount = 0 }: FloatingTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const handleTabPress = (route: string, isCurrentTab: boolean) => {
    if (isCurrentTab) return;
    try {
      router.push(route as any);
    } catch (error) {
      console.error('Navigation error:', error);
    }
  };

  const handleUploadPress = async (route: string) => {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Location Access Required',
        'POPNOW requires location access to upload videos. Your location is needed to pin your video on the map so people can discover it.\n\nWithout location, you can still browse, watch, like, comment, and follow users.',
        [
          { text: 'Go Back', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }
    handleTabPress(route, false);
  };

  const getCurrentIndex = () => {
    const index = tabs.findIndex((tab) => {
      if (tab.route === '/(tabs)/(home)/') {
        return pathname === '/' || pathname.startsWith('/(tabs)/(home)') || pathname === '/(tabs)/(home)/';
      }
      if (tab.route === '/(tabs)/search') return pathname.includes('/search');
      if (tab.route === '/(tabs)/map') return pathname.includes('/map');
      if (tab.route === '/(tabs)/request') return pathname.includes('/request');
      if (tab.route === '/(tabs)/profile') return pathname.includes('/profile');
      return pathname.includes(tab.name);
    });
    return index >= 0 ? index : 0;
  };

  const currentIndex = getCurrentIndex();

  return (
    <View style={[
      styles.container,
      isTransparent && styles.containerTransparent,
      { paddingBottom: insets.bottom },
    ]}>
      <View style={styles.tabBar}>
        {tabs.map((tab, index) => {
          const isActive = currentIndex === index;
          const isUpload = tab.isUpload;

          if (isUpload) {
            return (
              <TouchableOpacity
                key={tab.name}
                style={styles.tab}
                onPress={() => handleUploadPress(tab.route)}
                activeOpacity={0.7}
              >
                <View style={styles.uploadButton}>
                  <IconSymbol
                    ios_icon_name="plus"
                    android_material_icon_name="add"
                    size={16}
                    color="#FFFFFF"
                  />
                </View>
              </TouchableOpacity>
            );
          }

          const isProfile = tab.name === 'profile';
          const showBadge = isProfile && unreadCount > 0;

          return (
            <TouchableOpacity
              key={tab.name}
              style={styles.tab}
              onPress={() => handleTabPress(tab.route, isActive)}
              activeOpacity={0.7}
            >
              <View style={{ position: 'relative' }}>
                <IconSymbol
                  ios_icon_name={tab.icon}
                  android_material_icon_name={
                    tab.icon === 'binoculars.fill' ? 'travel-explore' :
                    tab.icon === 'map.fill' ? 'map' :
                    tab.icon === 'hand.raised.fill' ? 'pan-tool' :
                    tab.icon === 'person.fill' ? 'person' :
                    'help'
                  }
                  size={20}
                  color={isActive ? '#FFFFFF' : 'rgba(255,255,255,0.45)'}
                />
                {showBadge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[
                styles.tabLabel,
                { color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.45)' },
              ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000000',
    zIndex: 9999,
    elevation: 100,
  },
  containerTransparent: {
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 2,
  },
  uploadButton: {
    width: 30,
    height: 22,
    borderRadius: 6,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#F44336',
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
});