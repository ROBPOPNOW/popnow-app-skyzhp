import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
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
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function FloatingTabBar({ tabs, isTransparent = false }: FloatingTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  console.log('🎨 FloatingTabBar - isTransparent prop:', isTransparent);
  console.log('🎨 FloatingTabBar - pathname:', pathname);

  const handleTabPress = (route: string, isCurrentTab: boolean) => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔘 Tab pressed:', route);
    console.log('Current pathname:', pathname);
    console.log('Is already on this tab:', isCurrentTab);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (isCurrentTab) {
      console.log('✋ Already on this tab - ignoring tap to prevent re-opening');
      return;
    }

    try {
      console.log('✅ Navigating to:', route);
      router.push(route as any);
    } catch (error) {
      console.error('❌ Navigation error:', error);
    }
  };

  const handleUploadPress = async (route: string) => {
    // 📍 Check location permission before allowing recording
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
      if (tab.route === '/(tabs)/search') {
        return pathname.includes('/search');
      }
      if (tab.route === '/(tabs)/map') {
        return pathname.includes('/map');
      }
      if (tab.route === '/(tabs)/request') {
        return pathname.includes('/request');
      }
      if (tab.route === '/(tabs)/profile') {
        return pathname.includes('/profile');
      }
      return pathname.includes(tab.name);
    });
    return index >= 0 ? index : 0;
  };

  const currentIndex = getCurrentIndex();

  // Dynamic styles based on isTransparent
  const containerStyle = [
    styles.container,
    isTransparent && styles.containerTransparent,
  ];

  const tabBarStyle = [
    styles.tabBar,
    isTransparent && styles.tabBarTransparent,
  ];

  const safeAreaStyle = [
    styles.safeArea,
    isTransparent && styles.safeAreaTransparent,
  ];

  return (
    <View style={containerStyle} pointerEvents="box-none">
      {/* Blur + Gradient Background (only on Explore) */}
      {isTransparent && (
        <View style={styles.backgroundContainer}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 30 : 50}
            tint="dark"
            style={styles.blurView}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0, 0, 0, 0.6)']}
            style={styles.gradientOverlay}
          />
        </View>
      )}

      <View style={tabBarStyle} pointerEvents="box-none">
        {tabs.map((tab, index) => {
          const isActive = currentIndex === index;
          const isUpload = tab.isUpload;

          if (isUpload) {
            return (
              <TouchableOpacity
                key={tab.name}
                style={styles.uploadTab}
                onPress={() => handleUploadPress(tab.route)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[colors.primary, colors.secondary]}
                  style={styles.uploadButton}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <IconSymbol
                    name={tab.icon as any}
                    size={28}
                    color={colors.card}
                  />
                </LinearGradient>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={tab.name}
              style={styles.tab}
              onPress={() => handleTabPress(tab.route, isActive)}
              activeOpacity={0.7}
            >
              <View style={styles.tabContent}>
                <IconSymbol
                  name={tab.icon as any}
                  size={24}
                  color={
                    isTransparent
                      ? isActive
                        ? '#FFFFFF'
                        : 'rgba(255, 255, 255, 0.6)'
                      : isActive
                      ? colors.primary
                      : colors.text
                  }
                />
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: isTransparent
                        ? isActive
                          ? '#FFFFFF'
                          : 'rgba(255, 255, 255, 0.6)'
                        : isActive
                        ? colors.primary
                        : colors.text,
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <SafeAreaView edges={['bottom']} style={safeAreaStyle} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.textSecondary + '20',
    zIndex: 1000,
    elevation: 10,
  },
  containerTransparent: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    borderTopColor: 'transparent',
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  blurView: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabBar: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  tabBarTransparent: {
    backgroundColor: 'transparent',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
  },
  uploadButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  safeArea: {
    backgroundColor: colors.card,
  },
  safeAreaTransparent: {
    backgroundColor: 'transparent',
  },
});