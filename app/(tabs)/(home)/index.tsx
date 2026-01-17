
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '@/lib/supabase';
import { VideoPost } from '@/types/video';
import VideoFeedItem from '@/components/VideoFeedItem';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function HomeScreen() {
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const viewedVideos = useRef<Set<string>>(new Set());
  const [isFocused, setIsFocused] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadVideos();
    getUserLocation();
    getCurrentUser();
  }, []);

  // Handle screen focus/unfocus
  useFocusEffect(
    useCallback(() => {
      console.log('Home screen focused');
      setIsFocused(true);
      
      return () => {
        console.log('Home screen unfocused, stopping all videos');
        setIsFocused(false);
        // Set activeIndex to -1 to stop all videos
        setActiveIndex(-1);
      };
    }, [])
  );

  const getCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
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
        console.log('User location obtained:', location.coords);
      }
    } catch (error) {
      console.error('Error getting user location:', error);
    }
  };

  const loadVideos = async () => {
    try {
      setLoading(true);

      // Get current user to check liked videos
      const { data: { user } } = await supabase.auth.getUser();

      // Calculate the timestamp for 1 hour ago
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      const oneHourAgoISO = oneHourAgo.toISOString();

      console.log('Loading videos created after:', oneHourAgoISO);

      // Fetch videos from Supabase with user information
      // Only show videos created within the last hour
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
        .eq('moderation_status', 'approved')
        .gte('created_at', oneHourAgoISO)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading videos:', error);
        Alert.alert('Error', 'Failed to load videos');
        return;
      }

      if (!data || data.length === 0) {
        console.log('No videos found within the last hour');
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

      setVideos(transformedVideos);
      console.log(`Loaded ${transformedVideos.length} videos (within last hour)`);
      
      // Start playing the first video
      if (transformedVideos.length > 0) {
        setActiveIndex(0);
      }
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

          // Broadcast the update
          const channel = supabase.channel(`video:${videoId}:stats`);
          await channel.send({
            type: 'broadcast',
            event: 'stats_updated',
            payload: {
              video_id: videoId,
              likes_count: newCount,
            },
          });
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

          // Broadcast the update
          const channel = supabase.channel(`video:${videoId}:stats`);
          await channel.send({
            type: 'broadcast',
            event: 'stats_updated',
            payload: {
              video_id: videoId,
              likes_count: newCount,
            },
          });
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

  const renderItem = ({ item, index }: { item: VideoPost; index: number }) => {
    const isActive = isFocused && index === activeIndex;
    
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
          <IconSymbol name="video.fill" size={64} color={colors.textSecondary} />
          <Text style={styles.emptyText}>No videos available</Text>
          <Text style={styles.emptySubtext}>
            Be the first to upload a video!
          </Text>
          <Pressable
            style={styles.uploadButton}
            onPress={() => router.push('/record-video')}
          >
            <Text style={styles.uploadButtonText}>Upload Video</Text>
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
        />
        
        {/* Search Button */}
        <Pressable
          style={styles.searchButton}
          onPress={() => router.push('/(tabs)/search')}
        >
          <IconSymbol name="magnifyingglass" size={24} color="white" />
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
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
});
