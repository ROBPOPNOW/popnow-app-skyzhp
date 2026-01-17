
import React, { useState, useEffect, useRef } from 'react';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Alert,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { router } from 'expo-router';

interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'request_fulfilled' | 'video_rejected';
  actor_id: string;
  video_id?: string;
  comment_id?: string;
  request_id?: string;
  message: string;
  is_read: boolean;
  created_at: string;
  users: {
    username: string;
    avatar_url?: string;
  };
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const swipeableRefs = useRef<{ [key: string]: Swipeable | null }>({});

  useEffect(() => {
    loadNotifications();
    setupRealtimeSubscription();
  }, []);

  const setupRealtimeSubscription = () => {
    const { data: { user } } = supabase.auth.getUser();
    
    if (!user) return;

    const subscription = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('New notification received:', payload);
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  };

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          users!notifications_actor_id_fkey (
            username,
            avatar_url
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      console.log('📬 Loaded notifications:', data?.length || 0);
      setNotifications(data || []);

      // Mark all as read
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (updateError) throw updateError;
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to clear all notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;

              const { error } = await supabase
                .from('notifications')
                .delete()
                .eq('user_id', user.id);

              if (error) throw error;

              setNotifications([]);
              Alert.alert('Success', 'All notifications cleared');
            } catch (error) {
              console.error('Error clearing notifications:', error);
              Alert.alert('Error', 'Failed to clear notifications');
            }
          },
        },
      ]
    );
  };

  const handleDeleteNotification = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(notifications.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
      Alert.alert('Error', 'Failed to delete notification');
    }
  };

  const handleAvatarPress = (actorId: string) => {
    if (actorId) {
      router.push({
        pathname: '/user-profile',
        params: { userId: actorId },
      });
    }
  };

  const handleNotificationPress = async (notification: Notification) => {
    console.log('=== NOTIFICATION PRESSED ===');
    console.log('Notification type:', notification.type);
    console.log('Notification data:', JSON.stringify(notification, null, 2));

    try {
      // Handle video_rejected notifications
      if (notification.type === 'video_rejected') {
        console.log('🚫 Handling video_rejected notification');
        // Just show the message - the video is already deleted
        Alert.alert(
          'Video Rejected',
          notification.message,
          [{ text: 'OK' }]
        );
        return;
      }

      // (1) "Someone fulfilled your video request" notification
      if (notification.type === 'request_fulfilled') {
        console.log('📹 Handling request_fulfilled notification');
        console.log('video_id:', notification.video_id);
        console.log('request_id:', notification.request_id);
        
        if (!notification.video_id) {
          console.error('❌ No video_id in notification');
          Alert.alert('Error', 'Video information is missing');
          return;
        }

        if (!notification.request_id) {
          console.error('❌ No request_id in notification');
          Alert.alert('Error', 'Request information is missing');
          return;
        }

        // Verify the video exists in the database before navigating
        console.log('🔍 Verifying video exists in database...');
        const { data: videoData, error: videoError } = await supabase
          .from('videos')
          .select('id, video_url, caption')
          .eq('id', notification.video_id)
          .single();

        if (videoError || !videoData) {
          console.error('❌ Video not found in database:', videoError);
          Alert.alert('Error', 'This video is no longer available');
          return;
        }

        console.log('✅ Video found:', videoData);
        console.log('📱 Navigating to fulfillment videos...');
        
        router.push({
          pathname: '/fulfillment-videos',
          params: {
            requestId: notification.request_id,
            videoId: notification.video_id,
          },
        });
      }
      // (2) "Someone liked your video" notification
      else if (notification.type === 'like') {
        console.log('❤️ Handling like notification');
        console.log('video_id:', notification.video_id);
        
        if (!notification.video_id) {
          console.error('❌ No video_id in like notification');
          Alert.alert('Error', 'Video information is missing');
          return;
        }

        // Verify the video exists
        console.log('🔍 Verifying video exists...');
        const { data: videoData, error: videoError } = await supabase
          .from('videos')
          .select('id, video_url, caption')
          .eq('id', notification.video_id)
          .single();

        if (videoError || !videoData) {
          console.error('❌ Video not found:', videoError);
          Alert.alert('Error', 'This video is no longer available');
          return;
        }

        console.log('✅ Video found:', videoData);
        console.log('📱 Navigating to video player...');
        
        router.push({
          pathname: '/search-video-player',
          params: { videoId: notification.video_id },
        });
      }
      // (3) "Someone commented on your video" notification
      else if (notification.type === 'comment') {
        console.log('💬 Handling comment notification');
        console.log('video_id:', notification.video_id);
        
        if (!notification.video_id) {
          console.error('❌ No video_id in comment notification');
          Alert.alert('Error', 'Video information is missing');
          return;
        }

        // Verify the video exists
        console.log('🔍 Verifying video exists...');
        const { data: videoData, error: videoError } = await supabase
          .from('videos')
          .select('id, video_url, caption')
          .eq('id', notification.video_id)
          .single();

        if (videoError || !videoData) {
          console.error('❌ Video not found:', videoError);
          Alert.alert('Error', 'This video is no longer available');
          return;
        }

        console.log('✅ Video found:', videoData);
        console.log('📱 Navigating to video player...');
        
        router.push({
          pathname: '/search-video-player',
          params: { videoId: notification.video_id },
        });
      }
      // (4) "Someone started following you" notification
      else if (notification.type === 'follow') {
        console.log('👤 Handling follow notification');
        console.log('actor_id:', notification.actor_id);
        
        if (!notification.actor_id) {
          console.error('❌ No actor_id in follow notification');
          Alert.alert('Error', 'User information is missing');
          return;
        }

        console.log('📱 Navigating to user profile...');
        router.push({
          pathname: '/user-profile',
          params: { userId: notification.actor_id },
        });
      }
      // Fallback for unknown notification types
      else {
        console.warn('⚠️ Unknown notification type:', notification.type);
        Alert.alert('Error', 'Unable to handle this notification type');
      }
    } catch (error) {
      console.error('❌ Error handling notification press:', error);
      Alert.alert('Error', 'Failed to navigate to content. Please try again.');
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'like':
        return 'favorite';
      case 'comment':
        return 'chat-bubble';
      case 'follow':
        return 'person-add';
      case 'request_fulfilled':
        return 'videocam';
      case 'video_rejected':
        return 'block';
      default:
        return 'notifications';
    }
  };

  const getNotificationColor = (type: Notification['type']) => {
    switch (type) {
      case 'like':
        return '#F44336';
      case 'comment':
        return '#2196F3';
      case 'follow':
        return '#4CAF50';
      case 'request_fulfilled':
        return colors.primary;
      case 'video_rejected':
        return '#FF9800';
      default:
        return colors.text;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
    notificationId: string
  ) => {
    const trans = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [0, 100],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View
        style={[
          styles.swipeAction,
          {
            transform: [{ translateX: trans }],
          },
        ]}
      >
        <Pressable
          style={styles.deleteButton}
          onPress={() => {
            swipeableRefs.current[notificationId]?.close();
            handleDeleteNotification(notificationId);
          }}
        >
          <IconSymbol
            ios_icon_name="trash.fill"
            android_material_icon_name="delete"
            size={24}
            color="#FFF"
          />
        </Pressable>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
          <Text style={styles.headerTitle}>Notifications</Text>
        </LinearGradient>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.length > 0 && (
          <Pressable onPress={handleClearAll}>
            <Text style={styles.clearAllText}>Clear All</Text>
          </Pressable>
        )}
      </LinearGradient>

      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconSymbol
            ios_icon_name="bell.slash"
            android_material_icon_name="notifications-off"
            size={64}
            color={colors.textSecondary}
          />
          <Text style={styles.emptyText}>No notifications</Text>
          <Text style={styles.emptySubtext}>You&apos;re all caught up!</Text>
        </View>
      ) : (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ScrollView
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            {notifications.map((notification) => (
              <Swipeable
                key={notification.id}
                ref={(ref) => (swipeableRefs.current[notification.id] = ref)}
                renderRightActions={(progress, dragX) =>
                  renderRightActions(progress, dragX, notification.id)
                }
                overshootRight={false}
              >
                <Pressable
                  style={({ pressed }) => [
                    styles.notificationCard,
                    !notification.is_read && styles.notificationUnread,
                    pressed && styles.cardPressed,
                  ]}
                  onPress={() => handleNotificationPress(notification)}
                >
                  <Pressable onPress={() => handleAvatarPress(notification.actor_id)}>
                    <View style={[
                      styles.iconContainer,
                      { backgroundColor: getNotificationColor(notification.type) + '20' }
                    ]}>
                      <IconSymbol
                        ios_icon_name={getNotificationIcon(notification.type)}
                        android_material_icon_name={getNotificationIcon(notification.type)}
                        size={24}
                        color={getNotificationColor(notification.type)}
                      />
                    </View>
                  </Pressable>

                  <View style={styles.notificationContent}>
                    <Text style={styles.notificationMessage}>{notification.message}</Text>
                    <Text style={styles.notificationTime}>
                      {formatTimeAgo(notification.created_at)}
                    </Text>
                  </View>
                </Pressable>
              </Swipeable>
            ))}
          </ScrollView>
        </GestureHandlerRootView>
      )}
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
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  clearAllText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
  notificationCard: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  notificationUnread: {
    backgroundColor: colors.background,
  },
  cardPressed: {
    opacity: 0.7,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationMessage: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
    lineHeight: 20,
  },
  notificationTime: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  swipeAction: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  deleteButton: {
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
});
