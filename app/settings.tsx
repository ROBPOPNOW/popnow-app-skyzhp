import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
// 🪙 COIN IMPORTS
import CoinBalance from '@/components/CoinBalance';
import { useCoinBalance } from '@/hooks/useCoinBalance';
import { PremiumAvatar } from '@/components/PremiumAvatar';
import { removePushToken } from '@/utils/pushNotifications';

// Notification preferences interface
interface NotificationPreferences {
  engagement: boolean;
  followingVideos: boolean;
  nearbyVideos: boolean;
  nearbyDistance: number;
  nearbyRequests: boolean;
  nearbyRequestsDistance: number;
  videoRequests: boolean;
}

export default function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
  engagement: true,
  followingVideos: true,
  nearbyVideos: true,
  nearbyDistance: 10,
  nearbyRequests: true,
  nearbyRequestsDistance: 10,
  videoRequests: true,
});
  const [pushToken, setPushToken] = useState<string | null>(null);
  const { coins, loading: coinsLoading } = useCoinBalance(userId);
  const [locationStatus, setLocationStatus] = useState<string>('unknown');
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [blockedExpanded, setBlockedExpanded] = useState(false);
  const [blockedPage, setBlockedPage] = useState(1);
  const BLOCKED_PAGE_SIZE = 10;

  useEffect(() => {
    loadSettings();
    loadProfile();
    loadBlockedUsers();
    checkLocationStatus();
  }, []);

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }

      setUserId(user.id);

      // Load notification preferences from database
      const { data: userPrefs } = await supabase
  .from('users')
  .select('notify_engagement, notify_following_videos, notify_nearby_videos, notify_nearby_distance, notify_nearby_requests, notify_nearby_requests_distance, notify_video_requests')
  .eq('id', user.id)
  .single();

      if (userPrefs) {
  setPreferences({
    engagement: userPrefs.notify_engagement ?? true,
    followingVideos: userPrefs.notify_following_videos ?? true,
    nearbyVideos: userPrefs.notify_nearby_videos ?? true,
    nearbyDistance: userPrefs.notify_nearby_distance ?? 10,
    nearbyRequests: userPrefs.notify_nearby_requests ?? true,
    nearbyRequestsDistance: userPrefs.notify_nearby_requests_distance ?? 10,
    videoRequests: userPrefs.notify_video_requests ?? true,
  });
}

      // Check current push token
      const token = await AsyncStorage.getItem('push_token');
      setPushToken(token);

    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('users')
        .select('is_premium, premium_expires_at')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const checkLocationStatus = async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    setLocationStatus(status);
  };

  const loadBlockedUsers = async () => {
    try {
      setLoadingBlocked(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('blocked_users')
        .select(`
          id,
          blocked_id,
          created_at,
          users:blocked_id (
            id,
            username,
            avatar_url,
            is_premium
          )
        `)
        .eq('blocker_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading blocked users:', error);
        return;
      }

      setBlockedUsers(data || []);
    } catch (error) {
      console.error('Error in loadBlockedUsers:', error);
    } finally {
      setLoadingBlocked(false);
    }
  };

  const handleUnblock = async (blockedUserId: string, username: string) => {
    Alert.alert(
      'Unblock User',
      `Are you sure you want to unblock @${username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;

              await supabase
                .from('blocked_users')
                .delete()
                .eq('blocker_id', user.id)
                .eq('blocked_id', blockedUserId);

              setBlockedUsers(prev => prev.filter(b => b.blocked_id !== blockedUserId));
            } catch (error) {
              console.error('Error unblocking user:', error);
              Alert.alert('Error', 'Failed to unblock user');
            }
          },
        },
      ]
    );
  };

  const updatePreference = async (key: keyof NotificationPreferences, value: boolean | number) => {
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);

    // Map local key to database column
    const dbColumnMap: Record<string, string> = {
  engagement: 'notify_engagement',
  followingVideos: 'notify_following_videos',
  nearbyVideos: 'notify_nearby_videos',
  nearbyDistance: 'notify_nearby_distance',
  nearbyRequests: 'notify_nearby_requests',
  nearbyRequestsDistance: 'notify_nearby_requests_distance',
  videoRequests: 'notify_video_requests',
};

    // Save to database
    if (userId) {
      const { error } = await supabase
        .from('users')
        .update({ [dbColumnMap[key]]: value })
        .eq('id', userId);

      if (error) {
        console.error('❌ Error saving preference:', error);
      } else {
        console.log('✅ Notification preference saved to database:', key, value);
      }
    }
  };

  const handleToggleNearbyVideos = async (value: boolean) => {
    if (value && !pushToken) {
      const success = await registerForPushNotifications();
      if (!success) {
        Alert.alert(
          'Permission Required',
          'Please enable notifications in your device settings to receive alerts.'
        );
        return;
      }
    }
    await updatePreference('nearbyVideos', value);
  };

  const registerForPushNotifications = async (): Promise<boolean> => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return false;
      }

      const token = (await Notifications.getExpoPushTokenAsync()).data;
      console.log('📲 Push token obtained:', token);

      await AsyncStorage.setItem('push_token', token);
      setPushToken(token);

      if (userId) {
        await supabase
          .from('users')
          .update({ push_token: token })
          .eq('id', userId);
      }

      return true;
    } catch (error) {
      console.error('Error registering for push notifications:', error);
      return false;
    }
  };

  const handleEditProfile = () => {
    router.push('/edit-profile');
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your account? This action cannot be undone. All your videos, profile data, and coins will be permanently deleted.',
      [
        { 
          text: 'Cancel', 
          style: 'cancel' 
        },
        {
          text: 'Learn More',
          onPress: () => {
            Linking.openURL('https://popnow.world/delete-account');
          },
        },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            Alert.alert(
              'Final Confirmation',
              'This will permanently delete all your data. Are you absolutely sure?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) return;

                      const { error: deleteError } = await supabase
                        .from('users')
                        .delete()
                        .eq('id', user.id);

                      if (deleteError) throw deleteError;

                      if (user) await removePushToken(user.id);
                      await supabase.auth.signOut();

                      Alert.alert(
                        'Account Deleted',
                        'Your account has been permanently deleted.',
                        [
                          {
                            text: 'OK',
                            onPress: () => router.replace('/login'),
                          },
                        ]
                      );
                    } catch (error) {
                      console.error('Error deleting account:', error);
                      Alert.alert('Error', 'Failed to delete account. Please try again or contact support.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleLogOut = async () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) await removePushToken(user.id);
            await supabase.auth.signOut();
            router.replace('/login');
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol 
              ios_icon_name="chevron.left" 
              android_material_icon_name="chevron-left" 
              size={24} 
              color="#FFFFFF" 
            />
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 40 }} />
        </LinearGradient>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol 
            ios_icon_name="chevron.left" 
            android_material_icon_name="chevron-left" 
            size={24} 
            color="#FFFFFF" 
          />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* 1. PREMIUM STATUS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PREMIUM STATUS</Text>
          
          <Pressable
            style={styles.menuItem}
            onPress={() => {
              if (profile?.is_premium) {
                const url = Platform.select({
                  ios: 'https://apps.apple.com/account/subscriptions',
                  android: 'https://play.google.com/store/account/subscriptions',
                });
                if (url) Linking.openURL(url);
              } else {
                router.push('/premium-upgrade');
              }
            }}
          >
            <View style={styles.menuItemLeft}>
              {profile?.is_premium ? (
                <Text style={{ fontSize: 20 }}>👑</Text>
              ) : (
                <IconSymbol 
                  ios_icon_name="person.fill" 
                  android_material_icon_name="person" 
                  size={20} 
                  color={colors.primary} 
                />
              )}
              <Text style={styles.menuItemText}>
                {profile?.is_premium ? 'Premium User' : 'Free User'}
              </Text>
            </View>
            <IconSymbol 
              ios_icon_name="chevron.right" 
              android_material_icon_name="chevron-right" 
              size={20} 
              color={colors.textSecondary} 
            />
          </Pressable>
          
          {profile?.is_premium && profile.premium_expires_at && (
            <Text style={styles.premiumExpiry}>
              Active until {new Date(profile.premium_expires_at).toLocaleDateString()}
            </Text>
          )}
          
          {!profile?.is_premium && (
            <Text style={styles.premiumExpiry}>
              Tap to upgrade to Premium
            </Text>
          )}
        </View>

        {/* 2. COINS SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>COINS</Text>

          <Pressable 
            style={styles.settingRow}
            onPress={() => router.push('/coin-history')}
          >
            <View style={styles.settingInfo}>
              <View style={styles.settingHeader}>
                <Text style={{ fontSize: 20 }}>🍿</Text>
                <Text style={styles.settingTitle}>POPCoins Balance</Text>
              </View>
              <Text style={styles.settingDescription}>
                Earn 50 daily, spend 100 per request
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CoinBalance coins={coins} loading={coinsLoading} size="small" />
              <IconSymbol 
                ios_icon_name="chevron.right" 
                android_material_icon_name="chevron-right" 
                size={20} 
                color={colors.textSecondary} 
              />
            </View>
          </Pressable>
        </View>

        {/* 3. NOTIFICATIONS SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>

          {/* Engagement */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingHeader}>
                <IconSymbol 
                  ios_icon_name="heart.fill" 
                  android_material_icon_name="favorite" 
                  size={20} 
                  color={colors.primary} 
                />
                <Text style={styles.settingTitle}>Engagement</Text>
              </View>
              <Text style={styles.settingDescription}>
                Likes, comments, replies, follows, and view milestones
              </Text>
            </View>
            <Switch
              value={preferences.engagement}
              onValueChange={(value) => updatePreference('engagement', value)}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          {/* Following Videos */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingHeader}>
                <IconSymbol 
                  ios_icon_name="person.2.fill" 
                  android_material_icon_name="people" 
                  size={20} 
                  color={colors.primary} 
                />
                <Text style={styles.settingTitle}>Following Videos</Text>
              </View>
              <Text style={styles.settingDescription}>
                New videos from people you follow
              </Text>
            </View>
            <Switch
              value={preferences.followingVideos}
              onValueChange={(value) => updatePreference('followingVideos', value)}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          {/* Nearby Videos */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingHeader}>
                <IconSymbol 
                  ios_icon_name="mappin.circle.fill" 
                  android_material_icon_name="place" 
                  size={20} 
                  color={colors.primary} 
                />
                <Text style={styles.settingTitle}>Nearby Videos</Text>
              </View>
              <Text style={styles.settingDescription}>
                New videos posted near your location
              </Text>
            </View>
            <Switch
              value={preferences.nearbyVideos}
              onValueChange={handleToggleNearbyVideos}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          {/* Distance Selector (only show if nearby videos enabled) */}
{preferences.nearbyVideos && (
  <View style={styles.subSetting}>
    <Text style={styles.subSettingLabel}>Alert distance:</Text>
    <View style={styles.distanceButtons}>
      {[5, 10, 20].map((distance) => (
        <Pressable
          key={distance}
          style={[
            styles.distanceButton,
            preferences.nearbyDistance === distance && styles.distanceButtonActive,
          ]}
          onPress={() => updatePreference('nearbyDistance', distance)}
        >
          <Text
            style={[
              styles.distanceButtonText,
              preferences.nearbyDistance === distance && styles.distanceButtonTextActive,
            ]}
          >
            {distance}km
          </Text>
        </Pressable>
      ))}
    </View>
  </View>
)}

{/* Nearby Requests */}
<View style={styles.settingRow}>
  <View style={styles.settingInfo}>
    <View style={styles.settingHeader}>
      <IconSymbol 
        ios_icon_name="mappin.and.ellipse" 
        android_material_icon_name="add-location" 
        size={20} 
        color={colors.primary} 
      />
      <Text style={styles.settingTitle}>Nearby Requests</Text>
    </View>
    <Text style={styles.settingDescription}>
      New video requests posted near your location
    </Text>
  </View>
  <Switch
    value={preferences.nearbyRequests}
    onValueChange={(value) => updatePreference('nearbyRequests', value)}
    trackColor={{ false: colors.border, true: colors.primary }}
  />
</View>

{/* Nearby Requests Distance Selector */}
{preferences.nearbyRequests && (
  <View style={styles.subSetting}>
    <Text style={styles.subSettingLabel}>Alert distance:</Text>
    <View style={styles.distanceButtons}>
      {[5, 10, 20].map((distance) => (
        <Pressable
          key={distance}
          style={[
            styles.distanceButton,
            preferences.nearbyRequestsDistance === distance && styles.distanceButtonActive,
          ]}
          onPress={() => updatePreference('nearbyRequestsDistance', distance)}
        >
          <Text
            style={[
              styles.distanceButtonText,
              preferences.nearbyRequestsDistance === distance && styles.distanceButtonTextActive,
            ]}
          >
            {distance}km
          </Text>
        </Pressable>
      ))}
    </View>
  </View>
)}

{/* Video Requests */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingHeader}>
                <IconSymbol 
                  ios_icon_name="video.fill" 
                  android_material_icon_name="videocam" 
                  size={20} 
                  color={colors.primary} 
                />
                <Text style={styles.settingTitle}>Requests</Text>
              </View>
              <Text style={styles.settingDescription}>
                Fulfillments, winners, and request reminders
              </Text>
            </View>
            <Switch
              value={preferences.videoRequests}
              onValueChange={(value) => updatePreference('videoRequests', value)}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>

        {/* 4. BLOCKED USERS SECTION */}
        <View style={styles.section}>
          <Pressable
            style={styles.blockedHeader}
            onPress={() => setBlockedExpanded(!blockedExpanded)}
          >
            <Text style={styles.sectionTitle}>BLOCKED USERS ({blockedUsers.length})</Text>
            <IconSymbol
              ios_icon_name={blockedExpanded ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={blockedExpanded ? 'expand-less' : 'expand-more'}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>

          {blockedExpanded && (
            <>
              {loadingBlocked ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : blockedUsers.length === 0 ? (
                <View style={styles.emptyBlockedContainer}>
                  <Text style={styles.emptyBlockedText}>No blocked users</Text>
                </View>
              ) : (
                <>
                  {blockedUsers
                    .slice((blockedPage - 1) * BLOCKED_PAGE_SIZE, blockedPage * BLOCKED_PAGE_SIZE)
                    .map((block) => {
                      const user = Array.isArray(block.users) ? block.users[0] : block.users;
                      return (
                        <View key={block.id} style={styles.blockedUserRow}>
                          <PremiumAvatar
                            avatarUrl={user?.avatar_url}
                            size={40}
                            isPremium={user?.is_premium || false}
                          />
                          <View style={styles.blockedUserInfo}>
  <Text style={styles.blockedUserName}>
    @{user?.username || 'Unknown'}
  </Text>
</View>
                          <Pressable
                            style={styles.unblockButton}
                            onPress={() => handleUnblock(block.blocked_id, user?.username || 'this user')}
                          >
                            <Text style={styles.unblockButtonText}>Unblock</Text>
                          </Pressable>
                        </View>
                      );
                    })}

                  {blockedUsers.length > BLOCKED_PAGE_SIZE && (
                    <View style={styles.blockedPagination}>
                      <Pressable
                        style={[styles.blockedPageButton, blockedPage === 1 && styles.blockedPageButtonDisabled]}
                        onPress={() => setBlockedPage(p => Math.max(1, p - 1))}
                        disabled={blockedPage === 1}
                      >
                        <IconSymbol
                          ios_icon_name="chevron.left"
                          android_material_icon_name="chevron-left"
                          size={18}
                          color={blockedPage === 1 ? colors.textSecondary + '40' : colors.primary}
                        />
                      </Pressable>
                      <Text style={styles.blockedPageText}>
                        {blockedPage} / {Math.ceil(blockedUsers.length / BLOCKED_PAGE_SIZE)}
                      </Text>
                      <Pressable
                        style={[
                          styles.blockedPageButton,
                          blockedPage >= Math.ceil(blockedUsers.length / BLOCKED_PAGE_SIZE) && styles.blockedPageButtonDisabled,
                        ]}
                        onPress={() => setBlockedPage(p => Math.min(Math.ceil(blockedUsers.length / BLOCKED_PAGE_SIZE), p + 1))}
                        disabled={blockedPage >= Math.ceil(blockedUsers.length / BLOCKED_PAGE_SIZE)}
                      >
                        <IconSymbol
                          ios_icon_name="chevron.right"
                          android_material_icon_name="chevron-right"
                          size={18}
                          color={blockedPage >= Math.ceil(blockedUsers.length / BLOCKED_PAGE_SIZE) ? colors.textSecondary + '40' : colors.primary}
                        />
                      </Pressable>
                    </View>
                  )}
                </>
              )}
            </>
          )}
        </View>

{/* PRIVACY & ADS SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PRIVACY & ADS</Text>

          <Pressable
            style={styles.menuItem}
            onPress={async () => {
  try {
    const { AdsConsent } = await import('react-native-google-mobile-ads').then(m => m);
    const info = await AdsConsent.getConsentInfo();
    if (info.isConsentFormAvailable) {
      await AdsConsent.showForm();
    } else {
      Linking.openURL('https://popnow.world/privacy');
    }
  } catch (e) {
    Linking.openURL('https://popnow.world/privacy');
  }
}}
          >
            <View style={styles.menuItemLeft}>
              <IconSymbol
                ios_icon_name="hand.raised.fill"
                android_material_icon_name="privacy-tip"
                size={20}
                color={colors.text}
              />
              <Text style={styles.menuItemText}>Manage Ad Preferences</Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron-right"
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
          <Text style={styles.premiumExpiry}>
            Update your consent for personalised ads at any time
          </Text>
        </View>

        {/* LOCATION ACCESS SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LOCATION</Text>
          <Pressable
            style={styles.menuItem}
            onPress={() => Linking.openSettings()}
          >
            <View style={styles.menuItemLeft}>
              <IconSymbol
                ios_icon_name="location.fill"
                android_material_icon_name="location-on"
                size={20}
                color={locationStatus === 'granted' ? '#00D084' : '#FF6B6B'}
              />
              <Text style={styles.menuItemText}>Location Access</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{
                fontSize: 13,
                fontWeight: '600',
                color: locationStatus === 'granted' ? '#00D084' : '#FF6B6B',
              }}>
                {locationStatus === 'granted' ? 'Enabled' : 'Disabled'}
              </Text>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron-right"
                size={20}
                color={colors.textSecondary}
              />
            </View>
          </Pressable>
          <Text style={styles.premiumExpiry}>
            {locationStatus === 'granted'
              ? 'Location is used when uploading videos to pin them on the map'
              : 'Enable location to upload videos and fulfill requests'}
          </Text>
        </View>

        {/* 5. ACCOUNT SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>

          <Pressable style={styles.menuItem} onPress={handleEditProfile}>
            <View style={styles.menuItemLeft}>
              <IconSymbol 
                ios_icon_name="person.fill" 
                android_material_icon_name="person" 
                size={20} 
                color={colors.text} 
              />
              <Text style={styles.menuItemText}>Edit Profile</Text>
            </View>
            <IconSymbol 
              ios_icon_name="chevron.right" 
              android_material_icon_name="chevron-right" 
              size={20} 
              color={colors.textSecondary} 
            />
          </Pressable>

          <Pressable
            style={styles.menuItem}
            onPress={() => router.push('/terms')}
          >
            <View style={styles.menuItemLeft}>
              <IconSymbol 
                ios_icon_name="doc.text.fill" 
                android_material_icon_name="description" 
                size={20} 
                color={colors.text} 
              />
              <Text style={styles.menuItemText}>Terms & Conditions</Text>
            </View>
            <IconSymbol 
              ios_icon_name="chevron.right" 
              android_material_icon_name="chevron-right" 
              size={20} 
              color={colors.textSecondary} 
            />
          </Pressable>

          <Pressable
            style={styles.menuItem}
            onPress={() => router.push('/privacy')}
          >
            <View style={styles.menuItemLeft}>
              <IconSymbol 
                ios_icon_name="lock.shield.fill" 
                android_material_icon_name="privacy-tip" 
                size={20} 
                color={colors.text} 
              />
              <Text style={styles.menuItemText}>Privacy Policy</Text>
            </View>
            <IconSymbol 
              ios_icon_name="chevron.right" 
              android_material_icon_name="chevron-right" 
              size={20} 
              color={colors.textSecondary} 
            />
          </Pressable>

          <Pressable style={styles.menuItem} onPress={handleDeleteAccount}>
            <View style={styles.menuItemLeft}>
              <IconSymbol 
                ios_icon_name="trash.fill" 
                android_material_icon_name="delete" 
                size={20} 
                color="#FF3B30" 
              />
              <Text style={[styles.menuItemText, { color: '#FF3B30' }]}>Delete Account</Text>
            </View>
            <IconSymbol 
              ios_icon_name="chevron.right" 
              android_material_icon_name="chevron-right" 
              size={20} 
              color={colors.textSecondary} 
            />
          </Pressable>

          <Pressable style={styles.menuItem} onPress={handleLogOut}>
            <View style={styles.menuItemLeft}>
              <IconSymbol 
                ios_icon_name="arrow.right.square.fill" 
                android_material_icon_name="logout" 
                size={20} 
                color="#FF3B30" 
              />
              <Text style={[styles.menuItemText, { color: '#FF3B30' }]}>Log Out</Text>
            </View>
            <IconSymbol 
              ios_icon_name="chevron.right" 
              android_material_icon_name="chevron-right" 
              size={20} 
              color={colors.textSecondary} 
            />
          </Pressable>
        </View>

        {/* Push Token Debug (Optional - can remove in production) */}
        {pushToken && (
          <View style={styles.debugSection}>
            <Text style={styles.debugText}>
              Push notifications: ✅ Enabled
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 130,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  settingDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginLeft: 28,
  },
  subSetting: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    marginLeft: 12,
  },
  subSettingLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 12,
  },
  distanceButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  distanceButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.textSecondary + '30',
    alignItems: 'center',
  },
  distanceButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  distanceButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  distanceButtonTextActive: {
    color: '#FFFFFF',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  debugSection: {
    marginTop: 24,
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  debugText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  premiumExpiry: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 8,
    marginLeft: 16,
  },
  emptyBlockedContainer: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyBlockedText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  blockedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  blockedUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  blockedUserInfo: {
    flex: 1,
  },
  blockedUserName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  blockedUserUsername: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  unblockButton: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  unblockButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  blockedPagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  blockedPageButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockedPageButtonDisabled: {
    opacity: 0.4,
  },
  blockedPageText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});