
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
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { LinearGradient } from 'expo-linear-gradient';

export interface TabBarItem {
  name: string;
  route: string;
  icon: string;
  label: string;
  isUpload?: boolean;
}

interface FloatingTabBarProps {
  tabs: TabBarItem[];
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function FloatingTabBar({ tabs }: FloatingTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleTabPress = (route: string) => {
    console.log('Tab pressed:', route);
    try {
      router.push(route as any);
    } catch (error) {
      console.error('Navigation error:', error);
    }
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
      if (tab.route === '/(tabs)/profile') {
        return pathname.includes('/profile');
      }
      return pathname.includes(tab.name);
    });
    return index >= 0 ? index : 0;
  };

  const currentIndex = getCurrentIndex();

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.tabBar} pointerEvents="box-none">
        {tabs.map((tab, index) => {
          const isActive = currentIndex === index;
          const isUpload = tab.isUpload;

          if (isUpload) {
            return (
              <TouchableOpacity
                key={tab.name}
                style={styles.uploadTab}
                onPress={() => handleTabPress(tab.route)}
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
              onPress={() => handleTabPress(tab.route)}
              activeOpacity={0.7}
            >
              <View style={styles.tabContent}>
                <IconSymbol
                  name={tab.icon as any}
                  size={24}
                  color={isActive ? colors.primary : colors.text}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    { color: isActive ? colors.primary : colors.text },
                  ]}
                >
                  {tab.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <SafeAreaView edges={['bottom']} style={styles.safeArea} />
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
  tabBar: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: colors.card,
    alignItems: 'center',
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
    boxShadow: '0px 4px 16px rgba(255, 107, 107, 0.4)',
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
});
