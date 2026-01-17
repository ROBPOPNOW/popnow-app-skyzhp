
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
import { router, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';

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

      // Parse video IDs from params
      const videoIds = JSON.parse(params.videoIds as string);
      const startIndex = parseInt(params.startIndex as string, 10);

      console.log('Loading videos for search player:', videoIds.length, 'videos, starting at index:', startIndex);

      // Get current user to check liked videos
      const { data: { user } } = await supabase.auth.getUser();

      // Calculate the timestamp for 1 hour ago
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      const oneHourAgoISO = oneHourAgo.toISOString();

      console.log('Loading videos created after:', oneHourAgoISO);

      // Fetch videos from Supabase with user information (only within last hour)
      const { data, error } = await supabase
        .from('videos')
        .select(`
          *,
          users (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .in('id', videoIds)
        .eq('moderation_status', 'approved')
        .gte('created_at', oneHourAgoISO);

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
      const transformedVideos: VideoPost[] = data.map((video: any) => ({
        id: video.id,
        videoUrl: video.video_url,
        video_url: video.video_url,
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
          display_name: video.users.display_name || 'Unknown User',
          avatar_url: video.users.avatar_url,
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

  const handleLike = async (videoId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to like videos');
        return;
      }

      // Check if already liked
      const { data: existingLike } = await supabase
        .from('likes')
        .select('id')
        .eq('video_id', videoId)
        .eq('user_id', user.id)
        .single();

      if (existingLike) {
        // Unlike
        await supabase
          .from('likes')
          .delete()
          .eq('video_id', videoId)
          .eq('user_id', user.id);

        // Decrement likes count
        const { data: currentVideo } = await supabase
          .from('videos')
          .select('likes_count')
          .eq('id', videoId)
          .single();

        if (currentVideo) {
          const newCount = Math.max(0, (currentVideo.likes_count || 0) - 1);
          await supabase
            .from('videos')
            .update({ likes_count: newCount })
            .eq('id', videoId);
        }

        setVideos(videos.map(v =>
          v.id === videoId
            ? { ...v, likes: Math.max(0, v.likes - 1), likes_count: Math.max(0, (v.likes_count || 0) - 1), isLiked: false }
            : v
        ));
      } else {
        // Like
        await supabase
          .from('likes')
          .insert({ video_id: videoId, user_id: user.id });

        // Increment likes count
        const { data: currentVideo } = await supabase
          .from('videos')
          .select('likes_count')
          .eq('id', videoId)
          .single();

        if (currentVideo) {
          const newCount = (currentVideo.likes_count || 0) + 1;
          await supabase
            .from('videos')
            .update({ likes_count: newCount })
            .eq('id', videoId);
        }

        setVideos(videos.map(v =>
          v.id === videoId
            ? { ...v, likes: v.likes + 1, likes_count: (v.likes_count || 0) + 1, isLiked: true }
            : v
        ));
      }
    } catch (error) {
      console.error('Error liking video:', error);
      Alert.alert('Error', 'Failed to like video');
    }
  };

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
          <Text style={styles.emptyText}>No videos available</Text>
          <Text style={styles.emptySubtext}>Swipe right to go back</Text>
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
            removeClippedSubviews={false}
            maxToRenderPerBatch={3}
            windowSize={5}
            initialNumToRender={2}
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
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
