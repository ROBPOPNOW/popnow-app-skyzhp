
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Dimensions,
  ActivityIndicator,
  Alert,
  Text,
  ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';
import { supabase } from '@/lib/supabase';
import { VideoPost } from '@/types/video';
import VideoFeedItem from '@/components/VideoFeedItem';
import * as Location from 'expo-location';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { Pressable } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { isVideoStillPublic, showLocationExpiredAlert } from '@/utils/videoVisibility';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function SearchVideoPlayerScreen() {
  const params = useLocalSearchParams();
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const viewedVideos = useRef<Set<string>>(new Set());
  const swipeGestureRef = useRef<PanGestureHandler>(null);

  useEffect(() => {
    loadVideos();
    getUserLocation();
  }, []);
  // ⏸️ Pause video when navigating away
useFocusEffect(
  useCallback(() => {
    setActiveIndex(prev => prev);
    return () => {
      setActiveIndex(-1);
    };
  }, [])
);

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        console.log('User location obtained:', location.coords);
      }
    } catch (error) {
      console.error('Error getting user location:', error);
    }
  };

  const loadVideos = async () => {
    try {
      setLoading(true);

      console.log('📦 Raw params received:', params);

      // Validate params exist
      if (!params.videoIds) {
        console.error('❌ Missing videoIds parameter');
        Alert.alert('Error', 'Video information is missing');
        setLoading(false);
        return;
      }

      // Parse video IDs from params with error handling
      let videoIds: string[];
      try {
        videoIds = JSON.parse(params.videoIds as string);
        console.log('✅ Parsed videoIds:', videoIds);
      } catch (parseError) {
        console.error('❌ Failed to parse videoIds:', parseError);
        Alert.alert('Error', 'Invalid video data format');
        setLoading(false);
        return;
      }

      // Validate videoIds is an array
      if (!Array.isArray(videoIds) || videoIds.length === 0) {
        console.error('❌ videoIds is not a valid array:', videoIds);
        Alert.alert('Error', 'No videos to display');
        setLoading(false);
        return;
      }

      const startIndex = params.startIndex ? parseInt(params.startIndex as string, 10) : 0;

      console.log('Loading videos for search player:', videoIds.length, 'videos, starting at index:', startIndex);

      // Get current user to check liked videos
const { data: { user } } = await supabase.auth.getUser();

// Fetch videos from Supabase with user information
// For own videos: show videos up to 3 days old (for profile Videos tab)
// For others' videos: show only videos within last hour (still live)
const threeDaysAgo = new Date();
threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
const threeDaysAgoISO = threeDaysAgo.toISOString();

console.log('Loading videos created after:', threeDaysAgoISO);

const { data, error } = await supabase
  .from('videos')
  .select(`
    *,
    users (
      id,
      username,
      avatar_url,
      is_premium
    )
  `)
  .in('id', videoIds)
  .eq('moderation_status', 'approved')
  .gte('created_at', threeDaysAgoISO); // ← Changed to 3 days

      if (error) {
        console.error('Error loading videos:', error);
        Alert.alert('Error', 'Failed to load videos');
        return;
      }

      if (!data || data.length === 0) {
  console.log('No videos found');
  setVideos([]);
  return;
}

// Filter out expired videos (older than 24 hours) ONLY if they're not owned by current user
const twentyFourHoursAgo = new Date();
twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

const filteredData = data.filter((video: any) => {
  const videoCreatedAt = new Date(video.created_at);
  const isOwnVideo = user && video.user_id === user.id;
  const isExpired = videoCreatedAt < twentyFourHoursAgo;

  // Keep video if:
  // 1. It's the user's own video (even if expired to public)
  // 2. OR it's not expired yet (within 24 hours)
  return isOwnVideo || !isExpired;
});

if (filteredData.length === 0) {
  console.log('All videos have expired');
  setVideos([]);
  return;
}

      // Get liked videos for current user
      let likedVideoIds: string[] = [];
      if (user) {
        const { data: likes } = await supabase
          .from('likes')
          .select('video_id')
          .eq('user_id', user.id);
        
        likedVideoIds = likes?.map(like => like.video_id) || [];
      }

      // Transform data to VideoPost format
const transformedVideos: VideoPost[] = filteredData.map((video: any) => ({
  id: video.id,
  videoUrl: video.video_url,
  video_url: video.video_url,
  library_id: video.library_id, // ← ADD THIS LINE
  thumbnailUrl: video.thumbnail_url,
  caption: video.caption || '',
  tags: video.tags || [],
  latitude: video.location_latitude,
  longitude: video.location_longitude,
  locationName: video.location_name,
  locationPrivacy: video.location_privacy,
  users: video.users ? {
    id: video.users.id,
    username: video.users.username || 'Unknown',
    avatar_url: video.users.avatar_url,
    is_premium: video.users.is_premium, // ← ALSO ADD THIS
  } : undefined,
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

      // Sort videos to match the original order
      const sortedVideos = videoIds
        .map((id: string) => transformedVideos.find(v => v.id === id))
        .filter((v: VideoPost | undefined): v is VideoPost => v !== undefined);

      setVideos(sortedVideos);
      console.log(`Loaded ${sortedVideos.length} videos`);
      
      // Set active index to the starting video
      setActiveIndex(startIndex);
      
      // Scroll to the starting video after a short delay
      setTimeout(() => {
        if (flatListRef.current && sortedVideos.length > 0) {
          flatListRef.current.scrollToIndex({
            index: startIndex,
            animated: false,
          });
        }
      }, 100);
    } catch (error) {
      console.error('Error in loadVideos:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleLike = useCallback((videoId: string, newIsLiked: boolean, newLikesCount: number) => {
    setVideos(prev => prev.map(v =>
      v.id === videoId
        ? { ...v, isLiked: newIsLiked, likes_count: newLikesCount, likes: newLikesCount }
        : v
    ));
  }, []);

  const handleViewChange = useCallback((videoId: string) => {
    // Track view only once per video
    if (!viewedVideos.current.has(videoId)) {
      viewedVideos.current.add(videoId);
      trackView(videoId);
    }
  }, []);

  const trackView = async (videoId: string) => {
    try {
      console.log('Tracking view for video:', videoId);
      
      // Increment view count in database
      const { data: currentVideo } = await supabase
        .from('videos')
        .select('views_count')
        .eq('id', videoId)
        .single();

      if (currentVideo) {
        const newCount = (currentVideo.views_count || 0) + 1;
        await supabase
          .from('videos')
          .update({ views_count: newCount })
          .eq('id', videoId);

        console.log('View tracked successfully, new count:', newCount);
        
        // Update local state
        setVideos(prevVideos => prevVideos.map(v =>
          v.id === videoId
            ? { ...v, views: newCount, views_count: newCount }
            : v
        ));
      }
    } catch (error) {
      console.error('Error tracking view:', error);
    }
  };

  // NEW: Swipe-to-exit gesture handler
  const handleSwipeGesture = useCallback(({ nativeEvent }: any) => {
    if (nativeEvent.state === State.ACTIVE) {
      const { translationX, velocityX } = nativeEvent;
      
      // Detect swipe to the right
      if (translationX > 50 || velocityX > 100) {
        console.log('⚡ Swipe detected - exiting search video player');
        router.back();
      }
    }
  }, []);

  const renderItem = ({ item, index }: { item: VideoPost; index: number }) => {
  const isActive = index === activeIndex;
  
  return (
    <VideoFeedItem
      video={item}
      isActive={isActive}
      onLike={handleLike}
      onViewChange={handleViewChange}
      userLocation={userLocation}
      onAvatarPress={(userId) => {
  // Close video player and navigate to user profile (full page)
  router.replace({
    pathname: '/user-profile',
    params: { userId },
  });
}}
 onLocationPress={(latitude, longitude, locationName) => {
        if (!isVideoStillPublic(item.createdAt)) {
          showLocationExpiredAlert();
          return;
        }
        // Pass only the video ID. The map looks the video up by ID, reads its
        // true coords from its own query, and applies the privacy offset
        // itself. We deliberately DON'T send coordinates, so true locations
        // never travel through navigation params at all.
        router.replace({
          pathname: '/(tabs)/map',
          params: {
            videoId: item.id,
            fromFeed: 'true',
          },
        });
      }}
    />
  );
};

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        const newIndex = viewableItems[0].index;
        console.log('Active video index changed to:', newIndex);
        setActiveIndex(newIndex);
        
        // Track view for the newly visible video
        const video = videos[newIndex];
        if (video) {
          handleViewChange(video.id);
        }
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
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>😔 Video Expired</Text>
        <Text style={styles.emptySubtext}>
          This video is no longer available.{'\n'}
          Videos expire after 24 hours.
        </Text>
        
        <Pressable 
          style={styles.closeButton} 
          onPress={() => router.back()}
        >
          <Text style={styles.closeButtonText}>Close</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PanGestureHandler
        ref={swipeGestureRef}
        onHandlerStateChange={handleSwipeGesture}
        activeOffsetX={[-10000, 50]}
        failOffsetY={[-30, 30]}
        enabled={true}
      >
        <SafeAreaView style={styles.container} edges={['top']}>
          {/* Search button - top left */}
          <Pressable
            style={styles.topLeftButton}
            onPress={() => router.push('/(tabs)/search')}
          >
            <IconSymbol
              ios_icon_name="magnifyingglass"
              android_material_icon_name="search"
              size={20}
              color="#FFFFFF"
            />
          </Pressable>

          {/* Close button - top right */}
          <Pressable
            style={styles.topRightButton}
            onPress={() => router.back()}
          >
            <IconSymbol
              ios_icon_name="xmark"
              android_material_icon_name="close"
              size={20}
              color="#FFFFFF"
            />
          </Pressable>

          <FlatList
            ref={flatListRef}
            data={videos}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            snapToInterval={SCREEN_HEIGHT}
            snapToAlignment="start"
            decelerationRate="fast"
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            removeClippedSubviews={true}
maxToRenderPerBatch={1}
windowSize={2}
initialNumToRender={1}
            getItemLayout={(data, index) => ({
              length: SCREEN_HEIGHT,
              offset: SCREEN_HEIGHT * index,
              index,
            })}
            onScrollToIndexFailed={(info) => {
              console.log('Scroll to index failed:', info);
              setTimeout(() => {
                if (flatListRef.current) {
                  flatListRef.current.scrollToIndex({
                    index: info.index,
                    animated: false,
                  });
                }
              }, 100);
            }}
          />
        </SafeAreaView>
      </PanGestureHandler>
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
    marginBottom: 8,
  },
  // KEEP ONLY THIS ONE (delete the duplicate above)
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  closeButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 24,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  topLeftButton: {
    position: 'absolute',
    top: 60,
    left: 16,
    zIndex: 1001,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRightButton: {
    position: 'absolute',
    top: 60,
    right: 16,
    zIndex: 1001,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
