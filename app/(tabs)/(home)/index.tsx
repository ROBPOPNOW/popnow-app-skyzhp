import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Dimensions,
  ActivityIndicator,
  Alert,
  Text,
  Pressable,
  ViewToken,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '@/lib/supabase';
import { VideoPost } from '@/types/video';
import VideoFeedItem from '@/components/VideoFeedItem';
import * as Location from 'expo-location';
import { useAdManager } from '@/hooks/useAdManager';
import { router, useFocusEffect } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const TAB_BAR_HEIGHT = 50; // compact tab bar height
const VIDEO_HEIGHT = SCREEN_HEIGHT - TAB_BAR_HEIGHT;

export default function HomeScreen() {
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allContentLoaded, setAllContentLoaded] = useState(false);
  const BATCH_SIZE = 8;
  const [activeIndex, setActiveIndex] = useState(0);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const [isFocused, setIsFocused] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const seenVideoIds = useRef(new Set<string>());
  const [newVideosCount, setNewVideosCount] = useState(0);
  const newestVideoTime = useRef<string | null>(null);
  const hasInitialized = useRef(false);
  const focusInitialized = useRef(false);

  const { trackVideoView } = useAdManager(isPremium);

  // ✅ ALL FUNCTIONS DEFINED BEFORE useEffect
  const loadFeedBatch = async (isLoadingMore: boolean) => {
    try {
      if (isLoadingMore && loadingMore) return;
      if (isLoadingMore && allContentLoaded) return;

      if (isLoadingMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const { data: { user } } = await supabase.auth.getUser();

      console.log(`📄 Loading batch of ${BATCH_SIZE} videos (excluding ${seenVideoIds.current.size} seen)...`);

      const { data, error } = await supabase.rpc('get_feed_videos', {
        p_user_id: user?.id || null,
        p_count: BATCH_SIZE,
        p_exclude_ids: Array.from(seenVideoIds.current),
        p_lat: userLocation?.latitude || null,
        p_lng: userLocation?.longitude || null,
      });

      if (error) {
        console.error('Error loading feed:', error);
        if (!isLoadingMore) {
          Alert.alert('Error', 'Failed to load videos');
        }
        return;
      }

      const feedVideos = data || [];
      console.log(`✅ Received ${feedVideos.length} videos`);

      if (feedVideos.length < BATCH_SIZE) {
        console.log('✅ All available videos loaded');
        setAllContentLoaded(true);
      }

      if (feedVideos.length === 0 && !isLoadingMore) {
        setVideos([]);
        return;
      }

      feedVideos.forEach((v: any) => seenVideoIds.current.add(v.id));

      if (feedVideos.length > 0 && !isLoadingMore) {
        const newest = feedVideos.reduce((a: any, b: any) =>
          new Date(a.created_at) > new Date(b.created_at) ? a : b
        );
        newestVideoTime.current = newest.created_at;
      }

      let likedVideoIds: string[] = [];
      if (user) {
        const { data: likes } = await supabase
          .from('likes')
          .select('video_id')
          .eq('user_id', user.id);
        likedVideoIds = likes?.map(like => like.video_id) || [];
      }

      const transformedVideos: VideoPost[] = feedVideos.map((video: any) => ({
        id: video.id,
        videoUrl: video.video_url,
        video_url: video.video_url,
        library_id: video.library_id,
        thumbnailUrl: video.thumbnail_url,
        caption: video.caption || '',
        tags: video.tags || [],
        latitude: video.location_latitude,
        longitude: video.location_longitude,
        locationName: video.location_name,
        locationPrivacy: video.location_privacy,
        users: {
          id: video.user_id,
          username: video.username || 'Unknown',
          avatar_url: video.avatar_url,
          is_premium: video.user_is_premium || false,
        },
        likes: video.likes_count || 0,
        likes_count: video.likes_count || 0,
        comments: video.comments_count || 0,
        comments_count: video.comments_count || 0,
        shares: video.shares_count || 0,
        shares_count: video.shares_count || 0,
        views: video.views_count || 0,
        views_count: video.views_count || 0,
        isLiked: likedVideoIds.includes(video.id),
        createdAt: video.created_at,
      }));

      if (isLoadingMore) {
        setVideos(prev => [...prev, ...transformedVideos]);
      } else {
        setVideos(transformedVideos);
        if (transformedVideos.length > 0) {
          setActiveIndex(0);
        }
      }

      console.log(`✅ Batch loaded: ${transformedVideos.length} videos`);
    } catch (error) {
      console.error('Error in loadFeedBatch:', error);
      if (!isLoadingMore) {
        Alert.alert('Error', 'An unexpected error occurred');
      }
    } finally {
      if (isLoadingMore) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  };

  const getCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userData } = await supabase
          .from('users')
          .select('is_premium')
          .eq('id', user.id)
          .single();
        setIsPremium(userData?.is_premium || false);
        console.log('👤 User premium status:', userData?.is_premium || false);
        setCurrentUserId(user.id);
      }
    } catch (error) {
      console.error('Error getting current user:', error);
    }
  };

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }
    } catch (error) {
      console.error('Error getting user location:', error);
    }
  };

  const saveUserLocationForNotifications = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('users')
        .update({
          last_latitude: location.coords.latitude,
          last_longitude: location.coords.longitude,
          last_location_updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      await supabase.rpc('check_nearby_requests', {
        p_user_id: user.id,
        p_lat: location.coords.latitude,
        p_lng: location.coords.longitude,
      });
    } catch (error) {
      console.error('Error saving location:', error);
    }
  };

 // ✅ mountedRef declared first
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  // ✅ useEffect AFTER all functions
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    loadFeedBatch(false);
    getUserLocation();
    getCurrentUser();
    saveUserLocationForNotifications();
  }, []);
  // Background check for new videos every 30 seconds
  useEffect(() => {
    let mounted = true;
    const interval = setInterval(async () => {
      if (!mounted) return;
      if (!newestVideoTime.current) return;
      try {
        const { count, error } = await supabase
          .from('videos')
          .select('id', { count: 'exact', head: true })
          .eq('moderation_status', 'approved')
          .gt('created_at', newestVideoTime.current!);
        if (!mounted) return;
        if (!error && count && count > 0) {
          if (mountedRef.current) setNewVideosCount(count);
        }
      } catch (err) {
        console.error('Error checking new videos:', err);
      }
    }, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (!focusInitialized.current) {
        focusInitialized.current = true;
      }
      if (mountedRef.current) setIsFocused(true);
      return () => {
        if (mountedRef.current) setIsFocused(false);
        if (mountedRef.current) setActiveIndex(-1);
      };
    }, [])
  );

  const handleLike = useCallback((videoId: string, newIsLiked: boolean, newLikesCount: number) => {
    setVideos(prev => prev.map(v =>
      v.id === videoId
        ? { ...v, isLiked: newIsLiked, likes_count: newLikesCount, likes: newLikesCount }
        : v
    ));
  }, []);

  const trackView = async (videoId: string) => {
    try {
      const { data: newCount, error } = await supabase.rpc('increment_view_count', {
        p_video_id: videoId,
      });
      if (error) {
        console.error('❌ Error tracking view:', error);
        return;
      }
      setVideos(prevVideos => prevVideos.map(v =>
        v.id === videoId
          ? { ...v, views: newCount, views_count: newCount }
          : v
      ));
    } catch (error) {
      console.error('❌ Error tracking view:', error);
    }
  };

  const handleViewChange = (videoId: string) => {
    trackView(videoId);
    if (typeof trackVideoView === 'function') {
      trackVideoView();
    }
  };

  const handleLoadMore = () => {
    if (allContentLoaded) return;
    if (loadingMore) return;
    loadFeedBatch(true);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    seenVideoIds.current.clear();
    setAllContentLoaded(false);
    setNewVideosCount(0);
    newestVideoTime.current = null;
    await loadFeedBatch(false);
    setRefreshing(false);
  };

  const handleNewVideosBanner = async () => {
    setNewVideosCount(0);
    setRefreshing(true);
    seenVideoIds.current.clear();
    setAllContentLoaded(false);
    newestVideoTime.current = null;
    await loadFeedBatch(false);
    setRefreshing(false);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const renderItem = useCallback(({ item, index }: { item: VideoPost; index: number }) => {
    const isActive = isFocused && index === activeIndex;
    return (
      <VideoFeedItem
        video={item}
        isActive={isActive}
        onLike={handleLike}
        onViewChange={handleViewChange}
        userLocation={userLocation}
        onLocationPress={(actualLat, actualLng, locationName) => {
          // Pass only the video ID. The map looks the video up by ID, reads its
          // true coords from its own query, and applies the privacy offset
          // itself. We deliberately DON'T send coordinates, so true locations
          // never travel through navigation params at all.
          router.push({
            pathname: '/(tabs)/map',
            params: {
              videoId: item.id,
              fromFeed: 'true',
            },
          });
        }}
      />
    );
  }, [activeIndex, isFocused, userLocation]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        const newIndex = viewableItems[0].index;
        setActiveIndex(newIndex);
      } else {
        setActiveIndex(-1);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 100,
  }).current;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading videos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (videos.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Pressable
          style={styles.searchButton}
          onPress={() => router.push('/(tabs)/search')}
        >
          <IconSymbol
            ios_icon_name="magnifyingglass"
            android_material_icon_name="search"
            size={24}
            color="white"
          />
        </Pressable>
        <View style={styles.emptyContainer}>
          <IconSymbol
            ios_icon_name="video.fill"
            android_material_icon_name="videocam"
            size={64}
            color={colors.textSecondary}
          />
          <Text style={styles.emptyText}>No videos available</Text>
          <Text style={styles.emptySubtext}>Be the first to upload a video!</Text>
          <Pressable
            style={styles.uploadButton}
            onPress={() => router.push('/record-video')}
          >
            <Text style={styles.uploadButtonText}>Upload Video</Text>
          </Pressable>
          <Pressable style={styles.refreshButton} onPress={handleRefresh}>
            <Text style={styles.refreshButtonText}>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <FlatList
          ref={flatListRef}
          data={videos}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={VIDEO_HEIGHT}
          snapToAlignment="start"
          decelerationRate="fast"
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingMoreText}>Loading more videos...</Text>
              </View>
            ) : allContentLoaded ? (
              <View style={styles.loadingMore}>
                <Image
                  source={require('@/assets/images/pingsonmap.png')}
                  style={styles.endOfFeedImage}
                />
                <Text style={styles.endOfFeedText}>
                  The world is waiting — no filters, no edits, just the real world through your camera.
                </Text>
                <Pressable style={styles.postVideoButton} onPress={() => router.push('/record-video')}>
                  <Text style={styles.postVideoButtonText}>Post a Video</Text>
                </Pressable>
                <Pressable style={styles.refreshFeedButton} onPress={handleRefresh}>
                  <Text style={styles.refreshFeedButtonText}>Refresh Feed</Text>
                </Pressable>
              </View>
            ) : null
          }
          removeClippedSubviews={true}
maxToRenderPerBatch={1}
windowSize={2}
initialNumToRender={1}
          getItemLayout={(data, index) => ({
            length: VIDEO_HEIGHT,
            offset: VIDEO_HEIGHT * index,
            index,
          })}
        />

        {newVideosCount > 0 && (
          <Pressable style={styles.newVideosBanner} onPress={handleNewVideosBanner}>
            <Text style={styles.newVideosBannerText}>
              {newVideosCount} new video{newVideosCount === 1 ? '' : 's'} — Tap to watch
            </Text>
          </Pressable>
        )}

        <Pressable
          style={styles.searchButton}
          onPress={() => router.push('/(tabs)/search')}
        >
          <IconSymbol
            ios_icon_name="magnifyingglass"
            android_material_icon_name="search"
            size={24}
            color="white"
          />
        </Pressable>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  uploadButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  searchButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  loadingMore: {
    height: VIDEO_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingBottom: 120,
  },
  loadingMoreText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  newVideosBanner: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 80,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    zIndex: 100,
    alignItems: 'center',
  },
  newVideosBannerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  refreshButton: {
    marginTop: 16,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  refreshButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  endOfFeedText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 24,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  postVideoButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  postVideoButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  refreshFeedButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  refreshFeedButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  endOfFeedImage: {
    width: 400,
    height: 400,
    resizeMode: 'contain',
    marginBottom: 8,
  },
});