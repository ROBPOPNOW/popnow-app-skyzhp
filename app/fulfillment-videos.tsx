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
import { getVideoDownloadUrl, getDownloadUrlViaEdgeFunction } from '@/utils/bunnynet';
import { requestMediaLibrarySavePermission } from '@/utils/permissions';
import { USE_EDGE_DOWNLOAD } from '@/config/uploadFlags';
// 🪙 PHASE 7 IMPORT
import { awardWinnerCoins } from '@/utils/request-coins';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function FulfillmentVideosScreen() {
  const params = useLocalSearchParams();
  const requestId = params.requestId as string;
  const initialVideoId = params.videoId as string | undefined;
  console.log('🎬 PARAMS RECEIVED:', {
  requestId,
  videoId: initialVideoId,
  rawParams: params
});

  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const viewedVideos = useRef<Set<string>>(new Set());
  const [isFocused, setIsFocused] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isRequester, setIsRequester] = useState(false);
  const swipeGestureRef = useRef<PanGestureHandler>(null);
  const [downloadingVideoId, setDownloadingVideoId] = useState<string | null>(null);
  const downloadInProgressRef = useRef<string | null>(null);
  // 🪙 PHASE 7: Track if winner was selected
  const [winnerSelected, setWinnerSelected] = useState(false);
  const [initialScrollIndex, setInitialScrollIndex] = useState(0);

  useEffect(() => {
    loadFulfillmentVideos();
    getUserLocation();
    getCurrentUser();
  }, []);

// Add this near the top with other useEffects (around line 100)
useEffect(() => {
  if (params.requestId) {
    console.log('🔄 Request ID changed or screen focused - reloading videos');
    loadFulfillmentVideos();
  }
}, [params.requestId, params.refresh]); // Reload when requestId or refresh changes

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
    if (!user) return;

    setCurrentUserId(user.id);
    
    // Check if current user is the requester
    const { data: request } = await supabase
      .from('video_requests')
      .select('user_id, status, winner_video_id, grace_period_ends_at')
      .eq('id', requestId)
      .single();
    
    if (request && request.user_id === user.id) {
      console.log('✅ Current user is the requester');
      setIsRequester(true);
      
      // 🔒 CRITICAL: Check if winner selection is still allowed
      const now = new Date();
      const gracePeriodEnded = request.grace_period_ends_at 
        ? new Date(request.grace_period_ends_at) < now 
        : false;

      console.log('📊 Winner Selection Logic:');
      console.log('  Status:', request.status);
      console.log('  Winner Video ID:', request.winner_video_id);
      console.log('  Grace Period Ends:', request.grace_period_ends_at);
      console.log('  Grace Period Ended?', gracePeriodEnded);

      // Hide button ONLY if:
      // 1. Winner already selected, OR
      // 2. Status is 'completed', OR
      // 3. Grace period has ended (24 hours passed)
      if (request.winner_video_id || request.status === 'completed' || gracePeriodEnded) {
        console.log('🏆 Winner already selected OR grace period ended - hiding button');
        setWinnerSelected(true);
      } else {
        console.log('✅ Winner selection ALLOWED - showing button');
        setWinnerSelected(false);
      }
    } else {
      console.log('ℹ️ Current user is NOT the requester');
      setIsRequester(false);
      setWinnerSelected(false);
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
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📹 LOADING FULFILLMENT VIDEOS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Request ID:', requestId);

    // Get current user to check liked videos and ownership
    const { data: { user } } = await supabase.auth.getUser();
    console.log('Current user ID:', user?.id);

    // Check if current user is the requester
    const { data: request } = await supabase
      .from('video_requests')
      .select('user_id')
      .eq('id', requestId)
      .single();
    
    const isUserRequester = request && user && request.user_id === user.id;
    console.log('Is user the requester?', isUserRequester);

    // Fetch fulfillment videos for this request
    const { data: fulfillments, error: fulfillmentsError } = await supabase
      .from('request_fulfillments')
      .select('video_id')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true }); // ✅ ASCENDING ORDER (oldest first)

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

    // 🚨 CRITICAL FIX: Different time filters based on viewer role
    let timeFilter: string;
    
    if (isUserRequester) {
      // REQUESTER: Show videos up to 3 days old
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      timeFilter = threeDaysAgo.toISOString();
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('👤 REQUESTER VIEW: Showing videos up to 3 days old');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Cutoff date:', timeFilter);
    } else {
      // PUBLIC: Show videos up to 24 hours old
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      timeFilter = twentyFourHoursAgo.toISOString();
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🌍 PUBLIC VIEW: Showing videos up to 24 hours old');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Cutoff date:', timeFilter);
    }

    // Fetch video details with time filter
    let query = supabase
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
      .eq('moderation_status', 'approved');

    // Apply time filter based on viewer role
    if (isUserRequester) {
      // Requester: Show all videos (no time filter)
      console.log('👤 REQUESTER: No time filter - showing all videos');
    } else {
      // Public: Only show videos within 24 hours
      query = query.gte('created_at', timeFilter);
      console.log('🌍 PUBLIC: Applying 24-hour filter');
    }

    const { data: videosData, error: videosError } = await query;

    if (videosError) {
      console.error('Error loading videos:', videosError);
      Alert.alert('Error', 'Failed to load videos');
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

    // ✅ FIX: Sort videos in the SAME ORDER as videoIds array
    const orderedVideos = videoIds
      .map(id => videosData.find(v => v.id === id))
      .filter(v => v !== undefined); // Remove any videos that weren't found

    // Transform data to VideoPost format
    const transformedVideos: VideoPost[] = orderedVideos.map((video: any) => ({
      id: video.id,
      videoUrl: video.video_url,
      video_url: video.video_url,
      thumbnailUrl: video.thumbnail_url,
      thumbnail_url: video.thumbnail_url,
      library_id: video.library_id,
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
        is_premium: video.users.is_premium || false,
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
      is_winner: video.is_winner || false,
    }));

    setVideos(transformedVideos);
    console.log(`✅ Loaded ${transformedVideos.length} fulfillment videos`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // If initialVideoId is provided, set initial scroll index
    if (initialVideoId) {
      console.log('🎯 Initial video ID provided:', initialVideoId);
      console.log('🔍 Searching for video in transformed list...');
      const videoIndex = transformedVideos.findIndex(v => v.id === initialVideoId);
      
      if (videoIndex !== -1) {
        console.log('📍 Found video at index:', videoIndex);
        setActiveIndex(videoIndex);
        setInitialScrollIndex(videoIndex);
      } else {
        console.log('⚠️ Video not found in list');
        setActiveIndex(0);
        setInitialScrollIndex(0);
      }
    } else {
      console.log('ℹ️ No initial video ID, starting at index 0');
      setActiveIndex(0);
      setInitialScrollIndex(0);
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

  // Swipe-to-exit gesture handler
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

  // 🪙 PHASE 7: Select Winner Function - COMPLETE FIX
  const handleSelectWinner = async (videoId: string, winnerId: string) => {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🏆 SELECTING WINNER');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  Video ID:', videoId);
      console.log('  Winner ID:', winnerId);
      console.log('  Request ID:', requestId);

      if (!winnerId) {
        console.error('❌ No winner ID provided');
        Alert.alert('Error', 'Could not identify video creator');
        return;
      }

      // Confirm with user first
      Alert.alert(
        'Select Winner',
        'Are you sure you want to select this video as the winner? The creator will receive 100 coins and the request will be closed.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => console.log('Winner selection cancelled'),
          },
          {
            text: 'Select Winner',
            style: 'default',
            onPress: async () => {
              try {
                console.log('💫 User confirmed winner selection');

                // STEP 1: Mark this video as the winner
                console.log('📹 Marking video as winner...');
                const { error: updateError } = await supabase
                  .from('videos')
                  .update({ is_winner: true })
                  .eq('id', videoId);

                if (updateError) {
                  console.error('❌ Error updating video:', updateError);
                  throw updateError;
                }
                console.log('✅ Video marked as winner');

                // STEP 2: Expire the request (this hides it from map and marks as expired)
                console.log('📝 Expiring request...');
                const { error: closeError } = await supabase
                  .from('video_requests')
                  .update({ 
                    status: 'expired',  // ✅ FIX: Use 'expired' to close request
                    winner_video_id: videoId 
                  })
                  .eq('id', requestId);

                if (closeError) {
                  console.error('❌ Error expiring request:', closeError);
                  console.error('Error details:', JSON.stringify(closeError, null, 2));
                  throw closeError;
                }
                console.log('✅ Request marked as expired');

                // STEP 3: Award 100 coins to the winner
                console.log('💰 Awarding 100 coins to winner...');
                console.log('  Calling awardWinnerCoins with:');
                console.log('    winnerId:', winnerId);
                console.log('    requestId:', requestId);
                
                const coinsAwarded = await awardWinnerCoins(winnerId, requestId);
                console.log('  awardWinnerCoins returned:', coinsAwarded);

                if (coinsAwarded) {
                  console.log('✅ Winner successfully awarded 100 coins');
                  
                  // STEP 4: Create notification for winner
                  console.log('📬 Creating notification for winner...');
                  const { error: notifError } = await supabase.from('notifications').insert({
                    user_id: winnerId,
                    type: 'request_winner_manual',
                    message: '🎉 Congratulations! Your video was selected as the winner! You earned 100 POPCoins!',
                    video_id: videoId,
                    request_id: requestId,
                    actor_id: currentUserId,
                  });

                  if (notifError) {
                    console.error('⚠️ Error creating notification:', notifError);
                  } else {
                    console.log('✅ Notification created');
                  }

                  // STEP 4b: Send PUSH notification to winner
                  console.log('📤 Sending push notification to winner...');
                  try {
                    const { data: winnerData } = await supabase
                      .from('users')
                      .select('push_token')
                      .eq('id', winnerId)
                      .single();

                    if (winnerData?.push_token) {
                      const { error: pushError } = await supabase.functions.invoke('send-push-notification', {
                        body: {
                          pushToken: winnerData.push_token,
                          title: '🏆 You Won!',
                          body: 'Your video was selected as the winner! You earned 100 POPCoins! 🎉',
                          data: {
                            type: 'request_winner_manual',
                            requestId: requestId,
                            videoId: videoId,
                          },
                        },
                      });

                      if (pushError) {
                        console.error('⚠️ Push notification error:', pushError);
                      } else {
                        console.log('✅ Push notification sent to winner');
                      }
                    } else {
                      console.log('ℹ️ Winner has no push token, skipping push');
                    }
                  } catch (pushErr) {
                    console.error('⚠️ Push notification failed:', pushErr);
                  }

                  // STEP 5: Mark winner as selected (hide button)
                  setWinnerSelected(true);
                  console.log('✅ Winner selection state updated');

 console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎉 WINNER SELECTION COMPLETE');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

Alert.alert(
  'Winner Selected! 🎉',
  'The creator has been awarded 100 coins and the request has been closed!',
  [{ 
    text: 'OK', 
    onPress: () => {
      router.replace('/(tabs)/profile?tab=requests&refresh=true');
    }
  }]
);
              } else {
                console.error('❌ Failed to award coins to winner');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                Alert.alert(
                  'Winner Selected',
                  'Winner selected and request closed, but there was an issue awarding coins. Please contact support.',
                  [{ 
                    text: 'OK', 
                    onPress: () => router.replace('/(tabs)/profile?tab=requests&refresh=true')
                  }]
                );
              }
            } catch (selectionError) {
              console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.error('❌ ERROR IN WINNER SELECTION');
              console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.error('Error:', selectionError);
              console.error('Error details:', JSON.stringify(selectionError, null, 2));
              Alert.alert('Error', 'Failed to select winner. Please try again.');
            }
          },
        },
      ]
    );
  } catch (error) {
    console.error('Error selecting winner:', error);
    Alert.alert('Error', 'Failed to select winner');
  }
};
  const handleDownloadVideo = async (videoUrl: string, videoId: string) => {
    const timestamp = new Date().toISOString();
    console.log(`🔍 [${timestamp}] handleDownloadVideo CALLED for video: ${videoId}`);
    console.log(`🔍 Current downloadInProgressRef: ${downloadInProgressRef.current}`);
    console.log(`🔍 Current downloadingVideoId state: ${downloadingVideoId}`);
    
    // Prevent double downloads using ref (immediate check before any async operations)
    if (downloadInProgressRef.current === videoId) {
      console.log(`❌ [${timestamp}] BLOCKED: Download already in progress (ref check)`);
      return;
    }
    
    if (downloadingVideoId === videoId) {
      console.log(`❌ [${timestamp}] BLOCKED: Download already in progress (state check)`);
      return;
    }

    try {
      // Set both ref and state immediately
      downloadInProgressRef.current = videoId;
      setDownloadingVideoId(videoId);
      console.log(`✅ [${timestamp}] STARTING DOWNLOAD - Lock acquired`);
      console.log('=== DOWNLOADING FULFILLMENT VIDEO ===');
      console.log('Video ID:', videoId);
      console.log('Video URL:', videoUrl);
      
      const permissionResult = await requestMediaLibrarySavePermission();
      
      if (!permissionResult.granted) {
        console.log('❌ Permission not granted');
        downloadInProgressRef.current = null;
        setDownloadingVideoId(null);
        return;
      }
      
      let downloadUrl: string;
      
      try {
  // Find the video in the videos array to get its library_id
  const video = videos.find(v => v.id === videoId);
  const libraryId = video?.library_id;
  
  if (!libraryId) {
    throw new Error('Could not determine video library');
  }
  
  console.log('📚 Using library ID:', libraryId);
  const isPremium = libraryId === 597832;
  downloadUrl = USE_EDGE_DOWNLOAD
    ? await getDownloadUrlViaEdgeFunction(videoUrl, isPremium)
    : await getVideoDownloadUrl(videoUrl, libraryId);
  console.log('✅ Download URL obtained:', downloadUrl);
} catch (downloadError: any) {
        console.error('❌ Failed to get download URL:', downloadError.message);
        
        Alert.alert(
          'Download Not Available',
          downloadError.message || 'Unable to download this video.',
          [{ text: 'OK' }]
        );
        downloadInProgressRef.current = null;
        setDownloadingVideoId(null);
        return;
      }
      
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const videoIdShort = videoId.substring(0, 8);
      const filename = `POPNOW_${videoIdShort}_${timestamp}_${randomSuffix}.mp4`;
      
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
      
      // Create asset (this also saves to library) and add to POPNOW album
      console.log('💾 Saving to photo library...');
      const asset = await MediaLibrary.createAssetAsync(downloadedFile.uri);
      console.log('✅ Asset created, adding to POPNOW album...');
      
      try {
        const album = await MediaLibrary.getAlbumAsync('POPNOW');
        if (album) {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
          console.log('✅ Added to existing POPNOW album');
        } else {
          await MediaLibrary.createAlbumAsync('POPNOW', asset, false);
          console.log('✅ Created POPNOW album and added video');
        }
      } catch (albumError: any) {
        console.log('Album operation note (non-critical):', albumError.message || albumError);
      }
      
      try {
        downloadedFile.delete();
      } catch (cleanupError: any) {
        console.log('Cleanup note (non-critical):', cleanupError.message || cleanupError);
      }
      
      // Single success alert
      Alert.alert('Success!', 'Video has been saved to your photo library.');
      console.log(`✅ [${new Date().toISOString()}] DOWNLOAD COMPLETED SUCCESSFULLY`);
      
    } catch (error: any) {
      console.error('=== ❌ ERROR DOWNLOADING VIDEO ===');
      console.error(`⏰ Error timestamp: ${new Date().toISOString()}`);
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
    } finally {
      downloadInProgressRef.current = null;
      setDownloadingVideoId(null);
      console.log(`🔓 [${new Date().toISOString()}] DOWNLOAD LOCK RELEASED`);
    }
  };

  const renderItem = ({ item, index }: { item: VideoPost; index: number }) => {
  const isActive = isFocused && index === activeIndex;
  const isDownloading = downloadingVideoId === item.id;
  const isWinner = item.is_winner || false;
  
  return (
    <View style={{ height: SCREEN_HEIGHT }}>
      <VideoFeedItem
        video={item}
        isActive={isActive}
        onLike={handleLike}
        onViewChange={handleViewChange}
        userLocation={userLocation}
      />
      
      {/* 🪙 Requester Action Buttons */}
      {isRequester && (
        <View style={styles.requesterActionsContainer}>
          {/* 🔒 LOGIC: Show winner badge OR select winner button OR nothing */}
          {isWinner ? (
            // THIS VIDEO WON - Show Winner Badge
            <View style={styles.winnerBadge}>
              <Text style={styles.winnerIcon}>👑</Text>
              <Text style={styles.winnerBadgeText}>Winner!</Text>
            </View>
          ) : !winnerSelected ? (
            // NO WINNER YET - Show Select Winner Button
            <Pressable
              style={styles.selectWinnerButton}
              onPress={() => {
                console.log('👆 Select Winner button pressed');
                console.log('  Video:', item.id);
                console.log('  Creator:', item.users?.id);
                handleSelectWinner(item.id, item.users?.id || '');
              }}
            >
              <Text style={styles.selectWinnerIcon}>👑</Text>
              <Text style={styles.selectWinnerButtonText}>Select{'\n'}Winner</Text>
            </Pressable>
          ) : null}
          {/* WINNER ALREADY SELECTED - Show nothing (only download button) */}

          {/* Download Button - ALWAYS show */}
<Pressable
  style={[styles.downloadButton, isDownloading && styles.downloadButtonDisabled]}
  onPress={() => {
    const videoUrl = item.video_url || item.videoUrl;
    if (videoUrl) {
      handleDownloadVideo(videoUrl, item.id);
    }
  }}
  disabled={isDownloading}
>
            {isDownloading ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.downloadButtonText}>Downloading...</Text>
              </>
            ) : (
              <>
                <IconSymbol 
                  ios_icon_name="arrow.down.circle.fill" 
                  android_material_icon_name="download" 
                  size={32} 
                  color="#FFFFFF" 
                />
                <Text style={styles.downloadButtonText}>Download</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
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
            {isRequester 
              ? 'No videos have been posted to fulfill this request yet, or they have expired (3 days).'
              : 'No videos have been posted to fulfill this request yet, or they have expired (24 hours).'}
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
  initialScrollIndex={initialScrollIndex}  // ✅ ADD THIS LINE
  getItemLayout={(data, index) => ({
    length: SCREEN_HEIGHT,
    offset: SCREEN_HEIGHT * index,
    index,
  })}
            onScrollToIndexFailed={(info) => {
              console.log('Scroll to index failed:', info);
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
          
          {/* Requester Badge */}
          {isRequester && (
            <View style={styles.requesterBadge}>
              <IconSymbol ios_icon_name="checkmark.seal.fill" android_material_icon_name="verified" size={16} color="#FFFFFF" />
              <Text style={styles.requesterBadgeText}>Your Request</Text>
            </View>
          )}
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
  requesterBadge: {
    position: 'absolute',
    top: 60,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.primary,
    zIndex: 100,
  },
  requesterBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  // 🪙 PHASE 7: Container for both buttons (horizontal layout)
  requesterActionsContainer: {
    position: 'absolute',
    bottom: 150,
    right: 20,
    flexDirection: 'row', // HORIZONTAL layout
    gap: 12,
    zIndex: 10,
  },
  // 🪙 PHASE 7: Select Winner Button (LEFT - Gold)
  selectWinnerButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.95)', // Gold
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 4,
    borderWidth: 2,
    borderColor: '#FFD700',
    minWidth: 80,
  },
  selectWinnerIcon: {
    fontSize: 32,
  },
  selectWinnerButtonText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  // 🪙 PHASE 7: Winner Badge (non-tappable - GREEN)
  winnerBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.95)', // Green background
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 4,
    borderWidth: 2,
    borderColor: '#22C55E',
    minWidth: 80,
  },
  winnerIcon: {
    fontSize: 32,
  },
  winnerBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  // Download Button (RIGHT - Black)
  downloadButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 4,
    minWidth: 80,
  },
  downloadButtonDisabled: {
    opacity: 0.6,
  },
  downloadButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});