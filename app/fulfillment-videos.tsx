
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
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';
import { supabase } from '@/lib/supabase';
import { VideoPost } from '@/types/video';
import VideoFeedItem from '@/components/VideoFeedItem';
import * as Location from 'expo-location';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import * as MediaLibrary from 'expo-media-library';
import { File, Directory, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { getVideoDownloadUrl } from '@/utils/bunnynet';
import { requestMediaLibrarySavePermission } from '@/utils/permissions';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function FulfillmentVideosScreen() {
  const params = useLocalSearchParams();
  const requestId = params.requestId as string;
  const initialVideoId = params.videoId as string | undefined;

  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const viewedVideos = useRef<Set<string>>(new Set());
  const [isFocused, setIsFocused] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const swipeGestureRef = useRef<PanGestureHandler>(null);

  useEffect(() => {
    loadFulfillmentVideos();
    getUserLocation();
    getCurrentUser();
  }, []);

  // Handle screen focus/unfocus
  useFocusEffect(
    useCallback(() => {
      console.log('Fulfillment videos screen focused');
      setIsFocused(true);
      
      return () => {
        console.log('Fulfillment videos screen unfocused, stopping all videos');
        setIsFocused(false);
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

  const loadFulfillmentVideos = async () => {
    try {
      setLoading(true);
      console.log('Loading fulfillment videos for request:', requestId);

      // Get current user to check liked videos and ownership
      const { data: { user } } = await supabase.auth.getUser();

      // Fetch fulfillment videos for this request
      const { data: fulfillments, error: fulfillmentsError } = await supabase
        .from('request_fulfillments')
        .select('video_id')
        .eq('request_id', requestId)
        .order('created_at', { ascending: false });

      if (fulfillmentsError) {
        console.error('Error loading fulfillments:', fulfillmentsError);
        Alert.alert('Error', 'Failed to load fulfillment videos');
        return;
      }

      if (!fulfillments || fulfillments.length === 0) {
        console.log('No fulfillment videos found');
        setVideos([]);
        return;
      }

      const videoIds = fulfillments.map(f => f.video_id);
      console.log('Found fulfillment video IDs:', videoIds);

      // Calculate the timestamp for 1 hour ago
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      const oneHourAgoISO = oneHourAgo.toISOString();

      console.log('Loading videos created after:', oneHourAgoISO);

      // Fetch video details
      // For fulfillment videos, show videos within last hour OR videos owned by current user
      const { data: videosData, error: videosError } = await supabase
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
        .or(`created_at.gte.${oneHourAgoISO},user_id.eq.${user?.id || 'none'}`);

      if (videosError) {
        console.error('Error loading videos:', videosError);
        Alert.alert('Error', 'Failed to load videos');
        return;
      }

      if (!videosData || videosData.length === 0) {
        console.log('No approved videos found');
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
      const transformedVideos: VideoPost[] = videosData.map((video: any) => ({
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
      console.log(`Loaded ${transformedVideos.length} fulfillment videos`);
      
      // If initialVideoId is provided, scroll to that video
      if (initialVideoId) {
        const videoIndex = transformedVideos.findIndex(v => v.id === initialVideoId);
        if (videoIndex !== -1) {
          setActiveIndex(videoIndex);
          // Scroll to the video after a short delay to ensure FlatList is ready
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index: videoIndex,
              animated: false,
            });
          }, 100);
        } else {
          setActiveIndex(0);
        }
      } else {
        setActiveIndex(0);
      }
    } catch (error) {
      console.error('Error in loadFulfillmentVideos:', error);
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
        console.log('⚡ Swipe detected - exiting fulfillment videos');
        router.back();
      }
    }
  }, []);

  const handleDownloadVideo = async (videoUrl: string, videoId: string) => {
    try {
      console.log('=== DOWNLOADING FULFILLMENT VIDEO ===');
      console.log('Video ID:', videoId);
      console.log('Video URL:', videoUrl);
      
      const permissionResult = await requestMediaLibrarySavePermission();
      
      if (!permissionResult.granted) {
        console.log('❌ Permission not granted');
        return;
      }

      Alert.alert('Preparing Download', 'Checking video availability...');
      
      let downloadUrl: string;
      
      try {
        downloadUrl = await getVideoDownloadUrl(videoUrl);
        console.log('✅ Download URL obtained:', downloadUrl);
      } catch (downloadError: any) {
        console.error('❌ Failed to get download URL:', downloadError.message);
        
        Alert.alert(
          'Download Not Available',
          downloadError.message || 'Unable to download this video.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const videoIdShort = videoId.substring(0, 8);
      const filename = `POPNOW_${videoIdShort}_${timestamp}_${randomSuffix}.mp4`;
      
      Alert.alert('Downloading', 'Please wait while we download your video...');
      
      const downloadDir = new Directory(Paths.cache, 'downloads');
      try {
        downloadDir.create({ intermediates: true });
      } catch (dirError) {
        console.log('Download directory already exists');
      }
      
      const targetFile = new File(downloadDir, filename);
      if (targetFile.exists) {
        try {
          targetFile.delete();
        } catch (deleteError) {
          console.log('Could not delete old file, will try to overwrite');
        }
      }
      
      const downloadedFile = await File.downloadFileAsync(downloadUrl, downloadDir);
      
      if (!downloadedFile.exists || downloadedFile.size === 0) {
        throw new Error('Downloaded file is empty or does not exist');
      }
      
      await MediaLibrary.saveToLibraryAsync(downloadedFile.uri);
      
      try {
        const asset = await MediaLibrary.createAssetAsync(downloadedFile.uri);
        const album = await MediaLibrary.getAlbumAsync('POPNOW');
        if (album) {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        } else {
          await MediaLibrary.createAlbumAsync('POPNOW', asset, false);
        }
      } catch (albumError: any) {
        console.log('Album operation note (non-critical):', albumError.message || albumError);
      }
      
      try {
        downloadedFile.delete();
      } catch (cleanupError: any) {
        console.log('Cleanup note (non-critical):', cleanupError.message || cleanupError);
      }
      
      Alert.alert('Success!', 'Video has been saved to your photo library.');
      
    } catch (error: any) {
      console.error('=== ❌ ERROR DOWNLOADING VIDEO ===');
      console.error('Error:', error.message);
      
      let errorMessage = 'Failed to download video. Please try again.';
      
      if (error.message) {
        const msg = error.message.toLowerCase();
        
        if (msg.includes('permission')) {
          errorMessage = 'Permission error. Please check Settings > POPNOW > Photos.';
        } else if (msg.includes('network') || msg.includes('connection')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else {
          errorMessage = `Error: ${error.message}`;
        }
      }
      
      Alert.alert('Download Failed', errorMessage);
    }
  };

  const renderItem = ({ item, index }: { item: VideoPost; index: number }) => {
    const isActive = isFocused && index === activeIndex;
    
    return (
      <View style={{ height: SCREEN_HEIGHT }}>
        <VideoFeedItem
          video={item}
          isActive={isActive}
          onLike={handleLike}
          onViewChange={handleViewChange}
          userLocation={userLocation}
        />
        {/* Download button overlay */}
        <View style={styles.downloadButtonContainer}>
          <Pressable
            style={styles.downloadButton}
            onPress={() => handleDownloadVideo(item.video_url, item.id)}
          >
            <IconSymbol name="arrow.down.circle.fill" size={32} color="#FFFFFF" />
            <Text style={styles.downloadButtonText}>Download</Text>
          </Pressable>
        </View>
      </View>
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
          <Text style={styles.loadingText}>Loading fulfillment videos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (videos.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No fulfillment videos</Text>
          <Text style={styles.emptySubtext}>
            No videos have been posted to fulfill this request yet.
          </Text>
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
              // Retry after a delay
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                  index: info.index,
                  animated: false,
                });
              }, 100);
            }}
          />
          
          {/* Video Counter */}
          <View style={styles.videoCounter}>
            <Text style={styles.videoCounterText}>
              {activeIndex + 1} / {videos.length}
            </Text>
          </View>
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
    marginBottom: 8,
    textAlign: 'center',
  },
  videoCounter: {
    position: 'absolute',
    top: 60,
    right: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 100,
  },
  videoCounterText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  downloadButtonContainer: {
    position: 'absolute',
    bottom: 120,
    right: 20,
    zIndex: 10,
  },
  downloadButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 4,
  },
  downloadButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
