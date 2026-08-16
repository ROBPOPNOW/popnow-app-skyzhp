
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { VideoPost } from '@/types/video';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import * as MediaLibrary from 'expo-media-library';
import VideoFeedItem from '@/components/VideoFeedItem';
import { getVideoPlaybackUrl, getVideoThumbnailUrl, getVideoDownloadUrl, getDownloadUrlViaEdgeFunction, deleteStreamVideo, getDeleteVideoViaEdgeFunction, extractVideoId, isPremiumLibrary } from '@/utils/bunnynet';
import { supabase } from '@/lib/supabase';
import { USE_TUS_UPLOAD, USE_EDGE_STATUS_CHECK, USE_EDGE_DELETE, USE_EDGE_DOWNLOAD } from '@/config/uploadFlags';
import { colors } from '@/styles/commonStyles';
import { requestMediaLibraryPermission, requestMediaLibrarySavePermission } from '@/utils/permissions';
import { File, Directory, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { GestureHandlerRootView, Swipeable, PanGestureHandler, State } from 'react-native-gesture-handler';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import CoinAnimation from '@/components/CoinAnimation';
// Add these imports
import CoinBalance from '@/components/CoinBalance';
import DailyBonusPopup from '@/components/DailyBonusPopup';
import { useCoinBalance } from '@/hooks/useCoinBalance';
import { checkAndAwardDailyBonus } from '@/utils/coins';
import { useFocusEffect } from 'expo-router';
import { PremiumAvatar } from '@/components/PremiumAvatar';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Dimensions,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Animated,
} from 'react-native';

// Helper function to check video validity and navigate
const navigateToVideoOrProfile = async (videoId: string, actorId: string | undefined, router: any) => {
  console.log('🔍 navigateToVideoOrProfile called with:', { videoId, actorId });
  
  try {
    console.log('🔍 Checking video validity in database...');
    const { data: video, error } = await supabase
      .from('videos')
      .select('created_at, moderation_status, user_id')
      .eq('id', videoId)
      .single();
    
    console.log('📊 Video check result:', { video, error });
    
    if (error || !video) {
      console.log('❌ Video not found, navigating to profile');
      if (actorId) {
        router.push({
          pathname: '/user-profile',
          params: { userId: actorId },
        });
      }
      return;
    }
    
    const videoAge = Date.now() - new Date(video.created_at).getTime();
    const oneHourInMs = 24 * 60 * 60 * 1000;
    const isExpired = videoAge > oneHourInMs;
    const isRejected = video.moderation_status === 'rejected';
    
    console.log('📊 Video age check:', { videoAge, oneHourInMs, isExpired, isRejected });
    
    if (isExpired || isRejected) {
      console.log(`❌ Video ${isExpired ? 'expired' : 'rejected'}, navigating to profile`);
      router.push({
        pathname: '/user-profile',
        params: { userId: video.user_id },
      });
    } else {
      console.log('✅ Video is valid, navigating to player');
      router.push({
        pathname: '/search-video-player',
        params: { 
          videoIds: JSON.stringify([videoId]),
          startIndex: '0'
        },
      });
    }
  } catch (err) {
    console.error('❌ Error checking video validity:', err);
    if (actorId) {
      router.push({
        pathname: '/user-profile',
        params: { userId: actorId },
      });
    }
  }
};

type ProfileTab = 'videos' | 'pending' | 'liked' | 'requests' | 'notifications';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 3;

export default function ProfileScreen() {
  const params = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState<ProfileTab>((params.tab as ProfileTab) || 'videos');
  const [profile, setProfile] = useState<any>(null);
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [likedVideos, setLikedVideos] = useState<VideoPost[]>([]);
  const [videosPage, setVideosPage] = useState(0);
const [hasMoreVideos, setHasMoreVideos] = useState(true);
const [loadingMoreVideos, setLoadingMoreVideos] = useState(false);
const VIDEOS_PAGE_SIZE = 5;
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [pendingUploads, setPendingUploads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedProfile, setEditedProfile] = useState<any>({});
  const [selectedVideo, setSelectedVideo] = useState<VideoPost | null>(null);
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [currentVideoList, setCurrentVideoList] = useState<VideoPost[]>([]);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  // 🪙 COIN STATE
const [showDailyBonus, setShowDailyBonus] = useState(false);
const [showCoinAnimation, setShowCoinAnimation] = useState(false);
const [coinAnimationAmount, setCoinAnimationAmount] = useState(0);
// Get user ID from auth (available immediately)
const [userId, setUserId] = useState<string | null>(null);
const { coins, loading: coinsLoading, refetch: refetchCoins } = useCoinBalance(userId);
const prevCoinsRef = useRef(coins); // ← Move AFTER coins is declared
const router = useRouter();
  const swipeableRefs = useRef<{ [key: string]: Swipeable | null }>({});
  const requestTimerRef = useRef<number | null>(null);
  const expiryTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const [showDeletionBanner, setShowDeletionBanner] = useState(false);
  const retryInProgressRef = useRef(false);

// 🔧 FIX: Reload requests when returning to profile
useFocusEffect(
  useCallback(() => {
    if (!mountedRef.current) return;
    console.log('🔄 Profile screen focused - checking if refresh needed');
    
    // 🆕 ALWAYS reload profile (including premium status) when screen is focused
    loadProfile();
    reloadProfileCounts();
    
    // Always reload requests when focusing on this screen
    if (activeTab === 'requests') {
      console.log('📋 Reloading requests...');
      loadMyRequests();
    }
    
    // Also reload if coming from winner selection
    if (params.refresh || params.reload) {
      console.log('🔄 Refresh param detected - reloading requests');
      loadMyRequests();
    }
  }, [activeTab, params.refresh, params.reload])
);
  useEffect(() => {
    if (params.tab) {
      setActiveTab(params.tab as ProfileTab);
    }
  }, [params.tab]);

useEffect(() => {
  mountedRef.current = true;
  loadProfile();
  loadUserLocation();
  loadUnreadNotificationsCount();
  checkDailyBonus();
  return () => {
    mountedRef.current = false;
    if (expiryTimerRef.current) {
      clearInterval(expiryTimerRef.current);
    }
    if (requestTimerRef.current) {
      clearInterval(requestTimerRef.current);
    }
  };
}, []);

useEffect(() => {
  if (!mountedRef.current) return;
  if (activeTab === 'videos') {
    loadVideos(0, false);
  } else if (activeTab === 'liked') {
      loadLikedVideos();
    } else if (activeTab === 'requests') {
      loadMyRequests();
    } else if (activeTab === 'notifications') {
      loadNotifications();
    } else if (activeTab === 'pending') {
      loadPendingUploads();
    }
  }, [activeTab]);

// Auto-refresh pending uploads every 5 seconds (background)
useEffect(() => {
  if (activeTab !== 'pending') return;

  console.log('🔄 Setting up background auto-refresh for Pending tab');
  let mounted = true;

  loadPendingUploads();

  const interval = setInterval(async () => {
    if (!mounted) return;
    const hasPendingUploads = await loadPendingUploadsInBackground();
    if (!mounted) return;
    if (!hasPendingUploads) {
      console.log('✅ No pending uploads, stopping auto-refresh');
      clearInterval(interval);
    }
  }, 5000);

  return () => {
    mounted = false;
    console.log('🛑 Stopping auto-refresh');
    clearInterval(interval);
  };
}, [activeTab]);

// 🎬 Trigger animation when coins change
useEffect(() => {
  if (!mountedRef.current) return;
  if (prevCoinsRef.current !== 0 && coins !== 0) {
    const coinDifference = coins - prevCoinsRef.current;

    if (coinDifference !== 0) {
      console.log('🎬 Coin animation triggered:', coinDifference);
      if (mountedRef.current) setCoinAnimationAmount(coinDifference);
      if (mountedRef.current) setShowCoinAnimation(true);
      setTimeout(() => { if (mountedRef.current) setShowCoinAnimation(false); }, 1100);
    }
  }

  prevCoinsRef.current = coins;
}, [coins]);

useEffect(() => {
  if (activeTab !== 'pending') return;

  console.log('🔔 Setting up real-time listener for pending videos...');
  let mounted = true;
  let subscription: any = null;

  const setupListener = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !mounted) return;

    subscription = supabase
      .channel('pending-videos-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'videos',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (!mounted) return;
          console.log('🔄 Video status updated:', payload);
          const updatedVideo = payload.new;
          loadPendingUploads();
          if (updatedVideo.moderation_status === 'rejected') {
            Alert.alert(
              '❌ Video Rejected',
              'Your video was rejected due to inappropriate content and has been deleted.',
              [{ text: 'OK' }]
            );
          }
        }
      )
      .subscribe();

    console.log('✅ Real-time listener active');
  };

  setupListener();

  return () => {
    mounted = false;
    console.log('🔕 Removing real-time listener');
    if (subscription) {
      supabase.removeChannel(subscription);
    }
  };
}, [activeTab]);
  const loadUserLocation = async () => {
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
      console.error('Error loading user location:', error);
    }
  };

  const loadUnreadNotificationsCount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
      setUnreadNotificationsCount(count || 0);
    } catch (error) {
      console.error('Error loading unread notifications count:', error);
    }
  };

const loadPendingUploads = async () => {
  // Don't overwrite UI during active retry
  if (retryInProgressRef.current) return;

  try {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Auto-mark stale uploading records as failed.
    // 90s, not lower: bounded by the slowest legitimate single TUS chunk (5MB) upload
    // time on a poor connection — going shorter risks a false flip while the upload is
    // still genuinely in progress, which is now destructive (retry/dismiss delete the
    // Bunny video the real upload may still be streaming into).
    const staleThreshold = new Date(Date.now() - 90 * 1000).toISOString();
    await supabase
      .from('pending_uploads')
      .update({
        status: 'failed',
        upload_progress: 0,
        error_message: 'Upload failed. Tap retry to try again.',
      })
      .eq('user_id', user.id)
      .in('status', ['uploading', 'processing'])
      .lt('updated_at', staleThreshold);

    // Get pending uploads from pending_uploads table
    const { data, error } = await supabase
      .from('pending_uploads')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['uploading', 'processing', 'failed'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    console.log(`📋 Loaded ${data?.length || 0} pending uploads`);
    setPendingUploads(data || []);
    
  } catch (error) {
    console.error('Error loading pending uploads:', error);
  } finally {
    setLoading(false);
  }
};

// Background refresh without loading indicator
const loadPendingUploadsInBackground = async () => {
  // Don't overwrite UI during active retry
  if (retryInProgressRef.current) return true;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Auto-mark stale uploading records as failed (see loadPendingUploads for why 90s)
    const staleThreshold = new Date(Date.now() - 90 * 1000).toISOString();
    await supabase
      .from('pending_uploads')
      .update({
        status: 'failed',
        upload_progress: 0,
        error_message: 'Upload failed. Tap retry to try again.',
      })
      .eq('user_id', user.id)
      .in('status', ['uploading', 'processing'])
      .lt('updated_at', staleThreshold);

    // Fetch without showing loading state
    const { data, error } = await supabase
      .from('pending_uploads')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['uploading', 'processing', 'failed'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Background refresh error:', error);
      return false;
    }

    setPendingUploads(data || []);
    return (data && data.length > 0);
    
  } catch (error) {
    console.error('Background refresh error:', error);
    return false;
  }
};

const handleRetryUpload = async (upload: any) => {
  try {
    console.log('🔄 Retrying failed upload:', upload.id);

    // Block background refresh from overwriting optimistic update
    retryInProgressRef.current = true;

    // Optimistically update UI immediately so badge changes to Uploading
    setPendingUploads(prev => prev.map(p =>
      p.id === upload.id
        ? { ...p, status: 'uploading', upload_progress: 10, error_message: null }
        : p
    ));

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Error', 'You must be logged in to retry');
      return;
    }

    const { data: userData } = await supabase
      .from('users')
      .select('is_premium')
      .eq('id', user.id)
      .single();

    const isPremium = userData?.is_premium || false;

    // Check if the original video file still exists
    const fileInfo = await FileSystem.getInfoAsync(upload.video_uri);

    if (!fileInfo.exists) {
      // Delete the orphaned Bunny video from the failed attempt before dropping the row
      if (upload.bunny_video_id) {
        try {
          if (USE_EDGE_DELETE) {
            await getDeleteVideoViaEdgeFunction(upload.bunny_video_id, isPremium);
          } else {
            await deleteStreamVideo(upload.bunny_video_id, isPremium);
          }
          console.log('✅ Orphaned Bunny video deleted:', upload.bunny_video_id);
        } catch (deleteError) {
          console.error('⚠️ Failed to delete orphaned Bunny video:', deleteError);
        }
      }

      Alert.alert(
        'Video File Not Found',
        'The original video file is no longer available. Please record a new video.',
        [{ text: 'OK' }]
      );
      // Clean up the failed record
      await supabase.from('pending_uploads').delete().eq('id', upload.id);
      loadPendingUploads();
      return;
    }

    // Delete the previous (interrupted) Bunny video before starting a fresh upload,
    // so retrying doesn't orphan the old half-uploaded video on Bunny.net
    if (upload.bunny_video_id) {
      try {
        if (USE_EDGE_DELETE) {
          await getDeleteVideoViaEdgeFunction(upload.bunny_video_id, isPremium);
        } else {
          await deleteStreamVideo(upload.bunny_video_id, isPremium);
        }
        console.log('✅ Previous Bunny video deleted before retry:', upload.bunny_video_id);
      } catch (deleteError) {
        console.error('⚠️ Failed to delete previous Bunny video before retry:', deleteError);
      }
    }

    // Reset to uploading status
    await supabase
      .from('pending_uploads')
      .update({
        status: 'uploading',
        upload_progress: 10,
        error_message: null,
        bunny_video_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', upload.id);

    console.log('✅ Retrying upload for:', upload.caption);

    // Dynamically import bunnynet utils and restart upload
    const bunnynet = await import('@/utils/bunnynet');

    let bunnyVideoId: string | null = null;

    if (USE_TUS_UPLOAD) {
      // ── NEW: key-free TUS path (utils/bunnynet.ts → uploadVideoViaTus) ──
      await bunnynet.uploadVideoViaTus(upload.caption, upload.video_uri, {
        isPremium,
        onVideoCreated: async (created) => {
          bunnyVideoId = created.guid;
          console.log('✅ Video created with ID:', bunnyVideoId);
          setPendingUploads(prev => prev.map(p =>
            p.id === upload.id
              ? { ...p, bunny_video_id: bunnyVideoId, upload_progress: 20 }
              : p
          ));
          await supabase
            .from('pending_uploads')
            .update({ bunny_video_id: bunnyVideoId, upload_progress: 20, updated_at: new Date().toISOString() })
            .eq('id', upload.id);
        },
        onProgress: async (uploaded, total) => {
          const pct = 20 + Math.round((uploaded / total) * 40);
          setPendingUploads(prev => prev.map(p =>
            p.id === upload.id
              ? { ...p, upload_progress: pct }
              : p
          ));
          await supabase.from('pending_uploads').update({ upload_progress: pct, updated_at: new Date().toISOString() }).eq('id', upload.id);
        },
      });
    } else {
      // ── OLD: direct-key path (fallback, unchanged) ──
      // Step 1: Create new video on Bunny
      const videoData = await bunnynet.createStreamVideo(upload.caption, isPremium);
      bunnyVideoId = videoData.guid;

      await supabase
        .from('pending_uploads')
        .update({ bunny_video_id: bunnyVideoId, upload_progress: 20, updated_at: new Date().toISOString() })
        .eq('id', upload.id);

      // Step 2: Upload file
      await bunnynet.uploadToStream(bunnyVideoId, upload.video_uri, isPremium);
    }

    await supabase
      .from('pending_uploads')
      .update({ upload_progress: 60, status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', upload.id);

    // Step 3: Wait for processing
    let processed = false;
    let attempts = 0;
    while (!processed && attempts < 120) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const status = USE_EDGE_STATUS_CHECK
        ? await bunnynet.getVideoStatusViaEdgeFunction(bunnyVideoId, isPremium)
        : await bunnynet.getVideoStatus(bunnyVideoId, isPremium);
      if (status.status === 4) {
        processed = true;
      } else if (status.status === 5 || status.status === 6) {
        throw new Error('Video processing failed on Bunny.net');
      }
      attempts++;
      const processingPct = Math.min(60 + attempts, 90);
      setPendingUploads(prev => prev.map(p =>
        p.id === upload.id
          ? { ...p, upload_progress: processingPct }
          : p
      ));
      await supabase
        .from('pending_uploads')
        .update({ upload_progress: processingPct, updated_at: new Date().toISOString() })
        .eq('id', upload.id);
    }

    if (!processed) throw new Error('Processing timeout');

    // Step 4: Save to database
    await supabase
      .from('pending_uploads')
      .update({ upload_progress: 95, updated_at: new Date().toISOString() })
      .eq('id', upload.id);

    const { libraryId, cdnHostname } = bunnynet.getBunnyLibraryConfig(isPremium);

    const { data: video, error: dbError } = await supabase
      .from('videos')
      .insert({
        user_id: user.id,
        video_url: bunnyVideoId,
        thumbnail_url: `https://${cdnHostname}/${bunnyVideoId}/thumbnail.jpg`,
        caption: upload.caption,
        tags: upload.tags || [],
        location_latitude: upload.location_latitude,
        location_longitude: upload.location_longitude,
        location_name: upload.location_name,
        location_privacy: upload.location_privacy,
        moderation_status: 'pending',
        is_approved: false,
        request_id: upload.request_id || null,
        library_id: libraryId,
      })
      .select()
      .single();

    if (dbError) throw new Error('Failed to save video to database');

    // Step 5: Delete pending record
    await supabase.from('pending_uploads').delete().eq('id', upload.id);

    // Step 6: Trigger moderation
    supabase.functions.invoke('moderate-video', {
      body: {
        videoId: video.id,
        videoUrl: bunnyVideoId,
        thumbnailUrl: `https://${cdnHostname}/${bunnyVideoId}/thumbnail.jpg`,
        userId: user.id,
        requestId: upload.request_id || null,
      },
    }).catch(console.error);

    console.log('✅ Retry upload completed successfully');
    retryInProgressRef.current = false;
    loadPendingUploads();

  } catch (error: any) {
    console.error('❌ Retry failed:', error);
    retryInProgressRef.current = false;
    // Mark as failed again
    await supabase
      .from('pending_uploads')
      .update({ 
        status: 'failed',
        upload_progress: 0,
        error_message: error.message,
      })
      .eq('id', upload.id);
    loadPendingUploads();
    Alert.alert('Retry Failed', 'Upload failed again. Please try again later.');
  }
};

const handleDismissFailedUpload = (upload: any) => {
  Alert.alert(
    'Delete Upload',
    'This will permanently delete this failed upload. This action cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          console.log('🗑️ Dismissing failed upload:', upload.id);

          // Optimistically remove from UI immediately
          setPendingUploads(prev => prev.filter(p => p.id !== upload.id));

          try {
            if (upload.bunny_video_id) {
              const { data: { user } } = await supabase.auth.getUser();
              let isPremium = false;
              if (user) {
                const { data: userData } = await supabase
                  .from('users')
                  .select('is_premium')
                  .eq('id', user.id)
                  .single();
                isPremium = userData?.is_premium || false;
              }

              try {
                if (USE_EDGE_DELETE) {
                  await getDeleteVideoViaEdgeFunction(upload.bunny_video_id, isPremium);
                } else {
                  await deleteStreamVideo(upload.bunny_video_id, isPremium);
                }
                console.log("✅ Dismissed upload's Bunny video deleted:", upload.bunny_video_id);
              } catch (deleteError) {
                console.error('⚠️ Failed to delete Bunny video for dismissed upload:', deleteError);
              }
            }

            const { error } = await supabase.from('pending_uploads').delete().eq('id', upload.id);
            if (error) {
              console.error('❌ Failed to delete pending upload row:', error);
            }
          } catch (error) {
            console.error('❌ Error dismissing failed upload:', error);
            loadPendingUploads();
          }
        },
      },
    ]
  );
};

// 🪙 CHECK AND AWARD DAILY BONUS
const checkDailyBonus = async () => {
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    const coinsAwarded = await checkAndAwardDailyBonus(authUser.id);
    
    if (coinsAwarded > 0) {
      // Show daily bonus popup
      setShowDailyBonus(true);
      // Refetch coin balance to show updated amount
      refetchCoins();
    }
  } catch (error) {
    console.error('Error checking daily bonus:', error);
  }
};
  const checkForRejectedVideos = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: rejectedVideos, error } = await supabase
  .from('videos')
  .select('id, caption, moderation_status, video_url, library_id')
  .eq('user_id', user.id)
  .eq('moderation_status', 'rejected')
  .order('created_at', { ascending: false })
  .limit(1);

      if (error) throw error;

      if (rejectedVideos && rejectedVideos.length > 0) {
        const rejectedVideo = rejectedVideos[0];
        Alert.alert(
          'Video Rejected',
          `Your video "${rejectedVideo.caption || 'Untitled'}" was rejected due to content policy violations. It has been removed from our platform.`,
          [{ text: 'OK' }]
        );

        if (rejectedVideo.video_url) {
  const bunnyVideoId = extractVideoId(rejectedVideo.video_url);
  if (bunnyVideoId) {
    try {
      const isPremium = isPremiumLibrary(rejectedVideo.library_id);
      if (USE_EDGE_DELETE) {
        await getDeleteVideoViaEdgeFunction(bunnyVideoId, isPremium);
      } else {
        await deleteStreamVideo(bunnyVideoId, isPremium);
      }
      console.log('✅ Rejected video deleted from Bunny.net');
    } catch (deleteError) {
      console.error('❌ Error deleting rejected video from Bunny.net:', deleteError);
    }
  }
}

        await supabase
          .from('videos')
          .delete()
          .eq('id', rejectedVideo.id);
      }
    } catch (error) {
      console.error('Error checking for rejected videos:', error);
    }
  };

const loadVideos = async (pageNum: number = 0, isLoadingMore: boolean = false) => {
  try {
    // Prevent duplicate loading
    if (isLoadingMore && loadingMoreVideos) return;
    if (isLoadingMore && !hasMoreVideos) return;

    if (isLoadingMore) {
      setLoadingMoreVideos(true);
    } else {
      setLoading(true);
      setVideosPage(0);
      setHasMoreVideos(true);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('No user found in loadVideos');
      setVideos([]);
      return;
    }

    console.log(`📄 Loading videos page ${pageNum} (${VIDEOS_PAGE_SIZE} videos)...`);

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const cutoffDate = threeDaysAgo.toISOString();

    // Calculate offset
    const offset = pageNum * VIDEOS_PAGE_SIZE;

    // 🚀 PARALLEL QUERIES - fetch video data and likes simultaneously
    const [videosResult, likesResult] = await Promise.all([
      supabase
        .from('videos')
        .select(`
          id,
          video_url,
          caption,
          tags,
          library_id,
          location_latitude,
          location_longitude,
          location_name,
          location_privacy,
          created_at,
          expires_at,
          likes_count,
          comments_count,
          shares_count,
          views_count,
          moderation_status,
          thumbnail_url,
          users (
            id,
            username,
            avatar_url,
            is_premium
          )
        `)
        .eq('user_id', user.id)
        .gte('created_at', cutoffDate)
        .order('created_at', { ascending: false })
        .range(offset, offset + VIDEOS_PAGE_SIZE - 1),
      
      // Pre-fetch likes for this user
      supabase
        .from('likes')
        .select('video_id')
        .eq('user_id', user.id)
    ]);

    if (videosResult.error) {
      console.error('❌ Error loading videos:', videosResult.error);
      throw videosResult.error;
    }

    const data = videosResult.data;

    // Check if we got fewer videos than requested (no more videos)
    if (!data || data.length < VIDEOS_PAGE_SIZE) {
      setHasMoreVideos(false);
      console.log('📭 No more videos available');
    }

    if (!data || data.length === 0) {
      if (!isLoadingMore) {
        console.log('ℹ️ No videos found');
        setVideos([]);
      }
      return;
    }

    // 🚀 Use Set for O(1) lookup
    const likedVideoIds = new Set(
      (likesResult.data || [])
        .map(like => like.video_id)
        .filter(id => data.some(v => v.id === id))
    );

    // 🚀 OPTIMIZED: Process all videos in a single pass
    const processedVideos = data
      .filter(video => video?.id && video?.video_url)
      .map(video => {
        let parsedTags = [];
        if (video.tags) {
          if (typeof video.tags === 'string') {
            try {
              parsedTags = video.tags.trim() ? JSON.parse(video.tags) : [];
            } catch {
              parsedTags = [];
            }
          } else if (Array.isArray(video.tags)) {
            parsedTags = video.tags;
          }
        }

        return {
          ...video,
          tags: parsedTags,
          isLiked: likedVideoIds.has(video.id),
          likes_count: video.likes_count || 0,
          comments_count: video.comments_count || 0,
          shares_count: video.shares_count || 0,
          caption: video.caption || '',
          created_at: video.created_at || new Date().toISOString(),
          createdAt: video.created_at || new Date().toISOString(),
        };
      });

    console.log(`✅ Loaded ${processedVideos.length} videos for page ${pageNum}`);

    // Append or replace videos
    if (pageNum === 0) {
      setVideos(processedVideos);
    } else {
      setVideos(prev => [...prev, ...processedVideos]);
    }

    updateVideoExpiryTimers();
  } catch (error) {
    console.error('❌ Error in loadVideos:', error);
    Alert.alert('Error', 'Failed to load videos. Please try again.');
    if (!isLoadingMore) {
      setVideos([]);
    }
  } finally {
    if (isLoadingMore) {
      setLoadingMoreVideos(false);
    } else {
      setLoading(false);
    }
  }
};

const handleLoadMoreVideos = () => {
  if (!loadingMoreVideos && hasMoreVideos) {
    const nextPage = videosPage + 1;
    setVideosPage(nextPage);
    loadVideos(nextPage, true);
  }
};

const updateVideoExpiryTimers = () => {
  if (expiryTimerRef.current) {
    clearInterval(expiryTimerRef.current);
  }
  expiryTimerRef.current = setInterval(() => {
    if (!mountedRef.current) return;
    setVideos(prevVideos => [...prevVideos]);
  }, 60000);
};

const loadLikedVideos = async () => {
  try {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('No user found in loadLikedVideos');
      setLikedVideos([]);
      return;
    }

    console.log('=== LOADING LIKED VIDEOS ===');
    console.log('User ID:', user.id);

    // Only fetch likes from last 3 days — videos auto-delete after 3 days
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data: likesData, error: likesError } = await supabase
      .from('likes')
      .select('video_id, created_at')
      .eq('user_id', user.id)
      .gte('created_at', threeDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (likesError) {
      console.error('❌ Error loading likes:', likesError);
      throw likesError;
    }

    console.log('✅ User has liked', likesData?.length || 0, 'videos');

    if (!likesData || likesData.length === 0) {
      console.log('ℹ️ No liked videos found');
      setLikedVideos([]);
      return;
    }

    // Get video IDs
    const videoIds = likesData.map(like => like.video_id);
    console.log('📹 Loading details for', videoIds.length, 'videos');

    // Liked tab follows the same 24-hour public rule as the feed/map — a
    // liked video that's aged out of public visibility disappears from
    // Liked too, for everyone, including the liker's own videos.
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // 🚨 CRITICAL: Fresh query for video details (no cache)
    const { data: videosData, error: videosError } = await supabase
  .from('videos')
  .select(`
  id,
  video_url,
  caption,
  tags,
  library_id,
  location_latitude,
  location_longitude,
  location_name,
  location_privacy,
  created_at,
  expires_at,
  likes_count,
  comments_count,
  shares_count,
  views_count,
  moderation_status,
  thumbnail_url,
  users (
    id,
    username,
    avatar_url,
    is_premium
  )
`)
  .in('id', videoIds)
  .gte('created_at', twentyFourHoursAgo.toISOString());

    if (videosError) {
      console.error('❌ Error loading video details:', videosError);
      throw videosError;
    }

    console.log('✅ Loaded', videosData?.length || 0, 'video details');

    // Process videos
    const processedVideos = (videosData || [])
      .filter(video => video && video.id && video.video_url)
      .map(video => {
        console.log('📹 Processing liked video:', video.id);
        console.log('  📊 Counts:');
        console.log('    - Likes:', video.likes_count);
        console.log('    - Comments:', video.comments_count);
        console.log('    - Shares:', video.shares_count);

        // Streamlined, single-pass parsing
let parsedTags = [];
if (video.tags) {
  if (typeof video.tags === 'string') {
    try {
      parsedTags = video.tags.trim() ? JSON.parse(video.tags) : [];
    } catch {
      parsedTags = [];
    }
  } else if (Array.isArray(video.tags)) {
    parsedTags = video.tags;
  }
}

        return {
          ...video,
          tags: parsedTags,
          isLiked: true,
          likes_count: video.likes_count || 0,
          comments_count: video.comments_count || 0,
          shares_count: video.shares_count || 0,
          caption: video.caption || '',
         created_at: video.created_at || new Date().toISOString(),
          createdAt: video.created_at || new Date().toISOString(),
        };
      });

    console.log('✅ Processed', processedVideos.length, 'liked videos');
    console.log('=== LOADING LIKED VIDEOS COMPLETE ===');

    setLikedVideos(processedVideos);
  } catch (error) {
    console.error('❌ Error in loadLikedVideos:', error);
    Alert.alert('Error', 'Failed to load liked videos. Please try again.');
    setLikedVideos([]);
  } finally {
    setLoading(false);
  }
};

const loadProfile = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 🔧 FIX: Set user ID for coin balance hook
    setUserId(user.id);

const { data, error } = await supabase
  .from('users')
  .select('*, is_premium, premium_expires_at, coins')
  .eq('id', user.id)
  .single();

    if (error) throw error;

    console.log('📊 Lifetime Stats:');
    console.log('  Videos:', data.lifetime_videos_count);
    console.log('  Likes:', data.lifetime_likes_count);
    console.log('  Views:', data.lifetime_views_count);

    setProfile(data);
    setEditedProfile(data);
  } catch (error) {
    console.error('Error loading profile:', error);
  }
};

// 🆕 Reload follower/following counts
const reloadProfileCounts = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('users')
      .select('followers_count, following_count')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error reloading counts:', error);
      return;
    }

    // Update only the counts, keep rest of profile intact
    setProfile((prev: any) => ({
  ...prev,
  followers_count: data.followers_count,
  following_count: data.following_count,
}));

    console.log('✅ Profile counts reloaded:', {
      followers: data.followers_count,
      following: data.following_count,
    });
  } catch (error) {
    console.error('Error in reloadProfileCounts:', error);
  }
};

const loadMyRequests = async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 LOADING MY REQUESTS - NEW VERSION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    console.log('📥 Fetching requests for user:', user.id);

    // First, get all requests
    const { data: requests, error: requestError } = await supabase
      .from('video_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (requestError) {
      console.error('❌ Error fetching requests:', requestError);
      throw requestError;
    }

    console.log('✅ Fetched', requests?.length || 0, 'requests');

    // Then, for each request, count fulfillments
    console.log('🔢 Counting fulfillments for each request...');
    
    const requestsWithCount = await Promise.all(
      (requests || []).map(async (request) => {
        console.log(`  Counting for request ${request.id}...`);
        
        const { count } = await supabase
          .from('request_fulfillments')
          .select('*', { count: 'exact', head: true })
          .eq('request_id', request.id);

        console.log(`    → Count: ${count || 0}`);

        return {
          ...request,
          fulfillment_count: count || 0,
        };
      })
    );

    console.log('📊 Final requests with counts:');
    requestsWithCount.forEach((req, i) => {
      console.log(`  ${i + 1}. ${req.description} - fulfillments: ${req.fulfillment_count}`);
    });
    
    setMyRequests(requestsWithCount);
    updateRequestTimers();
    
    console.log('✅ loadMyRequests complete');
  } catch (error) {
    console.error('❌ Error loading requests:', error);
  } finally {
    setLoading(false);
  }
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
    avatar_url,
    is_premium
  )
`)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setNotifications(data || []);

      const { error: updateError } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (updateError) throw updateError;

      setUnreadNotificationsCount(0);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

const updateRequestTimers = () => {
  if (requestTimerRef.current) {
    clearInterval(requestTimerRef.current);
  }
  requestTimerRef.current = setInterval(() => {
    if (!mountedRef.current) return;
    setMyRequests(prevRequests => [...prevRequests]);
  }, 60000);
};

  const handleEditRequest = (request: any) => {
    router.push({
      pathname: '/request',
      params: {
        requestId: request.id,
        description: request.description,
        locationType: request.location_type,
        latitude: request.latitude?.toString(),
        longitude: request.longitude?.toString(),
        locationName: request.location_name,
        duration: request.duration?.toString(),
      },
    });
  };

const handleRepostRequest = async (request: any) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newExpiresAt = new Date();
    newExpiresAt.setHours(newExpiresAt.getHours() + (request.duration_hours || 24));

    // Create the new request
    const { error: insertError } = await supabase
      .from('video_requests')
      .insert({
        user_id: user.id,
        description: request.description,
        location_type: request.location_type,
        location_latitude: request.location_latitude,
        location_longitude: request.location_longitude,
        address: request.address || 'Selected Location',
        duration_hours: request.duration_hours,
        expires_at: newExpiresAt.toISOString(),
        status: 'open',
      });

    if (insertError) throw insertError;

    // Delete the old request
    const { error: deleteError } = await supabase
      .from('video_requests')
      .delete()
      .eq('id', request.id);

    if (deleteError) throw deleteError;

    Alert.alert('Success', 'Request reposted successfully');
    loadMyRequests();
  } catch (error) {
    console.error('Error reposting request:', error);
    Alert.alert('Error', 'Failed to repost request');
  }
};

const handleDeleteRequest = async (requestId: string) => {
  try {
    // Get the request details first
    const { data: request, error: requestError } = await supabase
      .from('video_requests')
      .select('status, winner_video_id')
      .eq('id', requestId)
      .single();

    if (requestError) throw requestError;

    // Check if request has fulfillments
    const { count: fulfillmentCount } = await supabase
      .from('request_fulfillments')
      .select('*', { count: 'exact', head: true })
      .eq('request_id', requestId);

    // Block deletion only if:
    // 1. Has fulfillments AND
    // 2. No winner selected yet (winner_video_id is null) AND
    // 3. Status is still 'open'
    if (fulfillmentCount && fulfillmentCount > 0 && !request.winner_video_id && request.status === 'open') {
      Alert.alert(
        'Cannot Delete',
        'This request has fulfillment videos. Please select a winner before deleting.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Check if already refunded to customize message
const { data: refundCheckData } = await supabase
  .from('video_requests')
  .select('refunded')
  .eq('id', requestId)
  .single();

const isAlreadyRefunded = refundCheckData?.refunded || false;

// Determine refund message
const shouldRefund = fulfillmentCount === 0;
let deleteMessage = '';

if (shouldRefund && isAlreadyRefunded) {
  deleteMessage = "You've already been refunded 100 POPCoins. Delete this request?";
} else if (shouldRefund) {
  deleteMessage = 'No one fulfilled this request. You will be refunded 100 POPCoins. Delete this request?';
} else if (request.winner_video_id) {
  deleteMessage = 'This request has been completed. Delete this request?';
} else {
  deleteMessage = 'Are you sure you want to delete this request?';
}

// Show confirmation dialog
Alert.alert(
  'Delete Request',
  deleteMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;

              // Verify ownership
              const { data: requestData } = await supabase
                .from('video_requests')
                .select('user_id')
                .eq('id', requestId)
                .single();

              if (!requestData || requestData.user_id !== user.id) {
                Alert.alert('Error', 'Invalid request');
                return;
              }

              // 🔍 Check if already refunded BEFORE deleting
let alreadyRefunded = false;
if (shouldRefund) {
  const { data: requestData } = await supabase
    .from('video_requests')
    .select('refunded')
    .eq('id', requestId)
    .single();
  
  alreadyRefunded = requestData?.refunded || false;
  console.log('🔍 Already refunded?', alreadyRefunded);
}

// Delete the request
const { error: deleteError } = await supabase
  .from('video_requests')
  .delete()
  .eq('id', requestId);

if (deleteError) throw deleteError;

// Refund 100 coins if no fulfillments AND not already refunded
if (shouldRefund && !alreadyRefunded) {
  console.log('💰 Refunding 100 coins for deleted request with no fulfillments');
  
  const { data: userData } = await supabase
    .from('users')
    .select('coins')
    .eq('id', user.id)
    .single();

  const currentCoins = userData?.coins || 0;
  const newCoins = currentCoins + 100;

  const { error: coinsError } = await supabase
    .from('users')
    .update({ coins: newCoins })
    .eq('id', user.id);

  if (coinsError) {
    console.error('Error refunding coins:', coinsError);
  } else {
    await supabase
      .from('coin_transactions')
      .insert({
        user_id: user.id,
        amount: 100,
        type: 'request_refund',
        description: 'Request deleted - no fulfillments',
      });

    console.log('✅ 100 coins refunded');
  }
}

// Update local state
setMyRequests(myRequests.filter(r => r.id !== requestId));

Alert.alert(
  'Success', 
  (shouldRefund && !alreadyRefunded)
    ? 'Request deleted and 100 coins refunded' 
    : 'Request deleted successfully'
);
            } catch (error) {
              console.error('Error deleting request:', error);
              Alert.alert('Error', 'Failed to delete request');
            }
          },
        },
      ]
    );
  } catch (error) {
    console.error('Error in handleDeleteRequest:', error);
    Alert.alert('Error', 'Failed to check request status');
  }
};

const handleViewFulfillments = (request: any) => {
  router.push({
    pathname: '/fulfillment-videos',
    params: { 
      requestId: request.id,
      refresh: Date.now().toString() // Force fresh data load
    },
  });
};

const handleNotificationPress = async (notification: any) => {
  console.log('=== NOTIFICATION PRESSED ===');
  console.log('Notification type:', notification.type);
  console.log('Notification data:', JSON.stringify(notification, null, 2));

  // ⚡ Check if request is expired for ALL request-related notifications
  const requestRelatedTypes = [
    'request_first_fulfillment',
    'request_expiring_soon',
    'request_expired_no_fulfillments',
    'request_fulfilled',
    'nearby_request',
    'nearby_request_needs_help',
    'request_expired_grace_period',
    'winner_selection_reminder_12h',
    'winner_selection_reminder_1h',
    'auto_winner_selected_requester',
    'fulfillment_milestone',
    'contributor_bonus',
  ];

  if (requestRelatedTypes.includes(notification.type) && notification.request_id) {
    try {
      const { data: requestData } = await supabase
        .from('video_requests')
        .select('expires_at, status')
        .eq('id', notification.request_id)
        .single();

      // Request not found or expired
      if (!requestData || new Date(requestData.expires_at) < new Date()) {
        Alert.alert(
          'Request Expired',
          'This request expired. Next time, jump on it before the clock runs out! ⏰'
        );
        return;
      }
    } catch (error) {
      console.error('Error checking request expiry:', error);
    }
  }

  // NEW: First fulfillment notification
if (notification.type === 'request_first_fulfillment') {
  router.push({
    pathname: '/fulfillment-videos',
    params: { requestId: notification.request_id },
  })
  return
}

// NEW: Request expiring soon
if (notification.type === 'request_expiring_soon') {
  router.push({
    pathname: '/fulfillment-videos',
    params: { requestId: notification.request_id },
  });
  return;
}

// NEW: Request expired with no fulfillments
if (notification.type === 'request_expired_no_fulfillments') {
  // Just acknowledge - no fulfillments to view
  return;
}

// NEW: Fulfillment milestone
if (notification.type === 'fulfillment_milestone') {
  router.push({
    pathname: '/fulfillment-videos',
    params: { requestId: notification.request_id },
  });
  return;
}

// NEW: Follower milestone
if (notification.type === 'follower_milestone') {
  // Navigate to their own followers list
  router.push({
    pathname: '/followers-list',
    params: { userId: profile.id, listType: 'followers' },
  });
  return;
}

// NEW: Nearby request needs help
if (notification.type === 'nearby_request_needs_help') {
  router.push({
    pathname: '/fulfillment-videos',
    params: { requestId: notification.request_id },
  });
  return;
}

// NEW: View milestone
if (notification.type === 'view_milestone') {
  // Creator can view their own video for 3 days
  return;
}

// NEW: Welcome onboarding
if (notification.type === 'welcome') {
  // No specific navigation needed
  return;
}

// NEW: Re-engagement
if (notification.type === 'reengagement') {
  return;
}

// NEW: Contributor Bonus notification
if (notification.type === 'contributor_bonus') {
  router.push({
    pathname: '/fulfillment-videos',
    params: { requestId: notification.request_id },
  });
  return;
}

// NEW: Request expired - grace period started
if (notification.type === 'request_expired_grace_period') {
  router.push({
    pathname: '/fulfillment-videos',
    params: { requestId: notification.request_id },
  })
  return
}

// NEW: 12h reminder
if (notification.type === 'winner_selection_reminder_12h') {
  Alert.alert(
    '⏰ 12 Hours Left!',
    'Pick your winner soon or the first video will be auto-selected.',
    [{ 
      text: 'Pick Winner Now',
      onPress: () => router.push({
        pathname: '/fulfillment-videos',
        params: { requestId: notification.request_id },
      })
    }]
  )
  return
}

// NEW: 1h urgent reminder
if (notification.type === 'winner_selection_reminder_1h') {
  Alert.alert(
    '⚠️ URGENT: 1 Hour Left!',
    'Pick your winner NOW or the first video wins automatically!',
    [{ 
      text: 'Pick Winner NOW',
      onPress: () => router.push({
        pathname: '/fulfillment-videos',
        params: { requestId: notification.request_id },
      })
    }]
  )
  return
}

// NEW: Auto-winner selected (requester)
if (notification.type === 'auto_winner_selected_requester') {
  router.push({
    pathname: '/fulfillment-videos',
    params: { requestId: notification.request_id },
  })
  return
}

// NEW: Auto-winner selected (winner) - play video directly
if (notification.type === 'auto_winner_selected_winner') {
  if (notification.video_id) {
    await navigateToVideoOrProfile(notification.video_id, notification.actor_id, router);
  }
  return;
}

// NEW: Manual winner selection - play video directly
if (notification.type === 'request_winner_manual') {
  if (notification.video_id) {
    await navigateToVideoOrProfile(notification.video_id, notification.actor_id, router);
  }
  return;
}

// Handle all video notifications with expiry check
if (notification.type === 'like' || 
    notification.type === 'comment' || 
    notification.type === 'comment_reply' ||
    notification.type === 'view_milestone' ||
    notification.type === 'following_new_video' ||
    notification.type === 'nearby_video') {  // ← Changed from 'nearby_new_video' to 'nearby_video'
  if (notification.video_id) {
    await navigateToVideoOrProfile(notification.video_id, notification.actor_id, router);
  }
  return;
}

// Nearby request - navigate to request details
if (notification.type === 'nearby_request') {
  if (notification.request_id) {
    router.push({
      pathname: '/request-details',
      params: { requestId: notification.request_id },
    });
  }
  return;
}

// Handle premium notifications (no navigation needed)
if (notification.type === 'premium_activated' || notification.type === 'premium_expired') {
  // Just acknowledge - no navigation needed
  return;
}
// Handle avatar_rejected notification (no navigation needed)
if (notification.type === 'avatar_rejected') {
  // Just acknowledge - no navigation needed
  return;
}
// Handle system notifications (no navigation needed)
if (notification.type === 'welcome' || notification.type === 'reengagement') {
  // Just acknowledge - no navigation needed
  return;
}
  try {
    // Handle video_rejected notifications
    if (notification.type === 'video_rejected') {
      console.log('🚫 Handling video_rejected notification');
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

      // ✅ ADD THIS LOGGING BLOCK:
  console.log('🚀 About to navigate with params:', {
    requestId: notification.request_id,
    videoId: notification.video_id,
  });
      
      router.push({
        pathname: '/fulfillment-videos',
        params: {
          requestId: notification.request_id,
          videoId: notification.video_id,
        },
      });
    }
    // (2) "Someone started following you" notification
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

  const handleNotificationAvatarPress = (notification: any) => {
    if (notification.actor_id) {
      router.push({
        pathname: '/user-profile',
        params: { userId: notification.actor_id },
      });
    }
  };

  const handleClearAllNotifications = async () => {
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

  const updateProfileCounts = async (userId: string) => {
    try {
      const { count: videosCount } = await supabase
        .from('videos')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      const { count: followersCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId);

      const { count: followingCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', userId);

      await supabase
        .from('users')
        .update({
          videos_count: videosCount || 0,
          followers_count: followersCount || 0,
          following_count: followingCount || 0,
        })
        .eq('id', userId);
    } catch (error) {
      console.error('Error updating profile counts:', error);
    }
  };

  const handleChangeAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadAvatar(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

const uploadAvatar = async (uri: string) => {
  try {
    console.log('🖼️ === STARTING AVATAR UPLOAD ===');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const previousAvatarUrl = profile?.avatar_url;
    console.log('📸 Previous avatar URL:', previousAvatarUrl);

    const fileName = `${user.id}-${Date.now()}.jpg`;
    const fileExt = uri.split('.').pop();
    const filePath = `${user.id}/${fileName}`;

    console.log('📤 Uploading avatar to storage...');
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, decode(base64), {
        contentType: `image/${fileExt}`,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    console.log('✅ Avatar uploaded to storage:', publicUrl);

    console.log('🔍 Triggering avatar moderation...');
    const { data: moderationData, error: moderationError } = await supabase.functions.invoke(
      'moderate-avatar',
      {
        body: {
          userId: user.id,
          avatarUrl: publicUrl,
          previousAvatarUrl: previousAvatarUrl,
        },
      }
    );

    if (moderationError) {
      console.error('❌ Moderation error:', moderationError);
      
      // Delete the uploaded file
      await supabase.storage.from('avatars').remove([filePath]);
      
      Alert.alert('Error', 'Failed to moderate avatar. Please try again.');
      return;
    }

    console.log('📊 Moderation result:', moderationData);

    if (!moderationData.approved) {
      console.log('❌ Avatar rejected by moderation');
      
      // DELETE the rejected avatar from storage
      console.log('🗑️ Deleting rejected avatar from storage...');
      const { error: deleteError } = await supabase.storage
        .from('avatars')
        .remove([filePath]);
      
      if (deleteError) {
        console.error('Error deleting rejected avatar:', deleteError);
      } else {
        console.log('✅ Rejected avatar deleted from storage');
      }
      
      // Update local state with previous avatar
      setProfile({ ...profile, avatar_url: previousAvatarUrl });
      
      Alert.alert(
        'Avatar Rejected',
        'Your profile picture was rejected because it contained inappropriate content. Your previous avatar has been restored.',
        [{ text: 'OK' }]
      );
      return;
    }

    console.log('✅ Avatar approved by moderation');

    console.log('💾 Updating user profile with new avatar...');
    const { error: updateError } = await supabase
      .from('users')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id);

    if (updateError) throw updateError;

    setProfile({ ...profile, avatar_url: publicUrl });
    console.log('✅ Avatar updated successfully');
    Alert.alert('Success', 'Avatar updated successfully');
  } catch (error) {
    console.error('❌ Error uploading avatar:', error);
    Alert.alert('Error', 'Failed to upload avatar');
  }
};

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const handleGetCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const [address] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      const locationName = address
        ? `${address.city || address.subregion || ''}, ${address.region || ''}`
        : 'Current Location';

      setEditedProfile({
        ...editedProfile,
        location: locationName,
      });
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Failed to get current location');
    }
  };

  const handleSaveProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
  .from('users')
  .update({
    bio: editedProfile.bio,
    location: editedProfile.location,
    categories: editedProfile.categories,
  })
  .eq('id', user.id);

      if (error) throw error;

      setProfile(editedProfile);
      setIsEditMode(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile');
    }
  };

  const formatCount = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

const handleSaveVideo = async (videoUrl: string, videoId: string, libraryId?: number) => {
  try {
    // Request both permissions
    const permissionResult = await requestMediaLibrarySavePermission();
    
    if (!permissionResult.granted) {
      Alert.alert('Permission Denied', 'Media library permission is required to save videos');
      return;
    }

    const isPremium = isPremiumLibrary(libraryId);
    const downloadUrl = USE_EDGE_DOWNLOAD
      ? await getDownloadUrlViaEdgeFunction(videoUrl, isPremium)
      : await getVideoDownloadUrl(videoUrl, libraryId);

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const videoIdShort = videoId.substring(0, 8);
    const fileName = `POPNOW_${videoIdShort}_${timestamp}_${randomSuffix}.mp4`;
    
    // Use expo-file-system with unique directory per download
    const uniqueDir = new Directory(Paths.cache, `downloads/${timestamp}_${randomSuffix}`);
    try {
      uniqueDir.create({ intermediates: true });
    } catch (dirError) {
      console.log('Download directory creation note:', dirError);
    }
    
    const downloadedFile = await File.downloadFileAsync(downloadUrl, uniqueDir);
    
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
    
    // Clean up temp file
    try {
      downloadedFile.delete();
    } catch (cleanupError: any) {
      console.log('Cleanup note (non-critical):', cleanupError.message || cleanupError);
    }
    
    Alert.alert('Success', 'Video saved to your gallery');
  } catch (error: any) {
    console.error('Error saving video:', error);
    Alert.alert('Error', error.message || 'Failed to save video');
  }
};

  const handleDeleteVideo = async (videoId: string) => {
    Alert.alert(
      'Delete Video',
      'Are you sure you want to delete this video? This action cannot be undone and the video will not be restored.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const video = videos.find(v => v.id === videoId);
              if (!video) return;

              if (video.video_url) {
                const bunnyVideoId = extractVideoId(video.video_url);
                if (bunnyVideoId) {
                  const isPremium = isPremiumLibrary(video.library_id);
if (USE_EDGE_DELETE) {
  await getDeleteVideoViaEdgeFunction(bunnyVideoId, isPremium);
} else {
  await deleteStreamVideo(bunnyVideoId, isPremium);
}
                }
              }

              const { error } = await supabase
                .from('videos')
                .delete()
                .eq('id', videoId);

              if (error) throw error;

              setVideos(videos.filter(v => v.id !== videoId));
              Alert.alert('Success', 'Video deleted successfully');
            } catch (error) {
              console.error('Error deleting video:', error);
              Alert.alert('Error', 'Failed to delete video');
            }
          },
        },
      ]
    );
  };

  const handleUnlikeVideo = async (videoId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('video_id', videoId)
        .eq('user_id', user.id);

      if (error) throw error;

      setLikedVideos(likedVideos.filter(v => v.id !== videoId));
    } catch (error) {
      console.error('Error unliking video:', error);
      Alert.alert('Error', 'Failed to unlike video');
    }
  };

const handleLike = useCallback((videoId: string, newIsLiked: boolean, newLikesCount: number) => {
  setVideos(prev => prev.map(v =>
    v.id === videoId
      ? { ...v, isLiked: newIsLiked, likes_count: newLikesCount, likes: newLikesCount }
      : v
  ));
  setLikedVideos(prev => prev.map(v =>
    v.id === videoId
      ? { ...v, isLiked: newIsLiked, likes_count: newLikesCount, likes: newLikesCount }
      : v
  ));
}, []);

const handleVideoPress = (video: VideoPost, index: number, videoList: VideoPost[]) => {
  router.push({
    pathname: '/search-video-player',
    params: {
      videoIds: JSON.stringify([video.id]),
      startIndex: '0',
    },
  });
};

  const handleCloseVideoModal = () => {
    setVideoModalVisible(false);
    setSelectedVideo(null);
  };

  // ⏸️ Close video modal when profile screen loses focus (reinforces VideoPlayer cleanup)
  useFocusEffect(
    useCallback(() => {
      return () => {
        handleCloseVideoModal();
      };
    }, [])
  );

  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    setSelectedVideoIds(new Set());
  };

  const toggleVideoSelection = (videoId: string) => {
    const newSelected = new Set(selectedVideoIds);
    if (newSelected.has(videoId)) {
      newSelected.delete(videoId);
    } else {
      newSelected.add(videoId);
    }
    setSelectedVideoIds(newSelected);
  };

  const selectAllVideos = () => {
    if (selectedVideoIds.size === videos.length) {
      setSelectedVideoIds(new Set());
    } else {
      setSelectedVideoIds(new Set(videos.map(v => v.id)));
    }
  };

  const handleBatchDownload = async () => {
    if (selectedVideoIds.size === 0) {
      Alert.alert('No Selection', 'Please select videos to download');
      return;
    }

    Alert.alert(
      'Download Videos',
      `Download ${selectedVideoIds.size} video(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: async () => {
            for (const videoId of selectedVideoIds) {
              const video = videos.find(v => v.id === videoId);
              if (video) {
                if (video.video_url) {
  await handleSaveVideo(video.video_url, video.id, video.library_id);
}
              }
            }
            setIsSelectMode(false);
            setSelectedVideoIds(new Set());
          },
        },
      ]
    );
  };

  const handleBatchDelete = async () => {
    if (selectedVideoIds.size === 0) {
      Alert.alert('No Selection', 'Please select videos to delete');
      return;
    }

    Alert.alert(
      'Delete Videos',
      `Delete ${selectedVideoIds.size} video(s)? This action cannot be undone and the videos will not be restored.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            for (const videoId of selectedVideoIds) {
              const video = videos.find(v => v.id === videoId);
              if (video) {
                if (video.video_url) {
                  const bunnyVideoId = extractVideoId(video.video_url);
                  if (bunnyVideoId) {
                    const isPremium = isPremiumLibrary(video.library_id);
if (USE_EDGE_DELETE) {
  await getDeleteVideoViaEdgeFunction(bunnyVideoId, isPremium);
} else {
  await deleteStreamVideo(bunnyVideoId, isPremium);
}
                  }
                }

                await supabase
                  .from('videos')
                  .delete()
                  .eq('id', videoId);
              }
            }

            setVideos(videos.filter(v => !selectedVideoIds.has(v.id)));
            setIsSelectMode(false);
            setSelectedVideoIds(new Set());
            Alert.alert('Success', 'Videos deleted successfully');
          },
        },
      ]
    );
  };

  const getModerationStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return '#FFA500';
      case 'approved':
        return '#4CAF50';
      case 'rejected':
        return '#F44336';
      default:
        return colors.text;
    }
  };

  const formatDate = (dateString: string) => {
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

  const handleNavigateToFollowersList = (type: 'followers' | 'following') => {
    if (!profile) return;
    router.push({
      pathname: '/followers-list',
      params: {
        userId: profile.id,
        listType: type,
      },
    });
  };

  const handleNavigateToVideosTab = () => {
    setActiveTab('videos');
  };

  const handleNavigateToLikedTab = () => {
    setActiveTab('liked');
  };

  const renderRequestCard = (request: any) => {
    // 🔍 DEBUG - Check what data we're receiving
  console.log('📋 Request Card Debug:', {
    id: request.id,
    description: request.description,
    fulfillment_count: request.fulfillment_count,
    type: typeof request.fulfillment_count,
  });
    const expiresAt = new Date(request.expires_at);
const now = new Date();
const timeRemaining = Math.max(0, expiresAt.getTime() - now.getTime());
// 🔧 FIX: Check status first, then time
const isExpired = request.status === 'expired' || expiresAt < now;
// 🔍 DEBUG
console.log('📋 Request Card:', {
  id: request.id,
  status: request.status,
  isExpired: isExpired,
  timeLeft: timeRemaining
});
    const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
  // 🔧 ADD THESE LINES:
  const hasFulfillments = (request.fulfillment_count || 0) > 0;
  const canDelete = !hasFulfillments || isExpired; // Can delete if: no fulfillments OR expired
    const requestDescriptionText = request.description;
    const requestLocationText = request.location_name;
    const hoursRemainingText = `${hoursRemaining}h ${minutesRemaining}m remaining`;

    return (
      <Pressable
        key={request.id}
        style={({ pressed }) => [
          styles.requestCard,
          pressed && styles.cardPressed,
        ]}
        onPress={() => handleViewFulfillments(request)}
      >
        <View style={styles.requestHeader}>
          <Text style={styles.requestDescription}>{requestDescriptionText}</Text>
          {isExpired ? (
            <View style={styles.expiredBadge}>
              <Text style={styles.expiredText}>Expired</Text>
            </View>
          ) : (
            <View style={styles.activeBadge}>
              <Text style={styles.activeText}>Active</Text>
            </View>
          )}
        </View>

        <View style={styles.requestInfo}>
          <IconSymbol
            ios_icon_name="location.fill"
            android_material_icon_name="location-on"
            size={16}
            color={colors.textSecondary}
          />
          <Text style={styles.requestLocation}>{requestLocationText}</Text>
        </View>

        {!isExpired && (
          <View style={styles.requestInfo}>
            <IconSymbol
              ios_icon_name="clock.fill"
              android_material_icon_name="schedule"
              size={16}
              color={colors.textSecondary}
            />
            <Text style={styles.requestTime}>{hoursRemainingText}</Text>
          </View>
        )}

<View style={styles.requestActions}>
  {/* View Videos - ALWAYS show */}
  <Pressable
    style={({ pressed }) => [
      styles.requestActionButton,
      pressed && styles.actionButtonPressed,
    ]}
    onPress={() => handleViewFulfillments(request)}
  >
    <IconSymbol
      ios_icon_name="play.circle.fill"
      android_material_icon_name="play-circle-filled"
      size={20}
      color={colors.primary}
    />
    <Text style={styles.requestActionText}>View Videos</Text>
  </Pressable>

{/* Delete button - greyed out if has fulfillments */}
<Pressable
  style={({ pressed }) => [
    styles.requestActionButton,
    !canDelete && styles.requestActionButtonDisabled,
    pressed && canDelete && styles.actionButtonPressed,
  ]}
  onPress={() => canDelete && handleDeleteRequest(request.id)}
  disabled={!canDelete}
>
  <IconSymbol
    ios_icon_name="trash.fill"
    android_material_icon_name="delete"
    size={20}
    color={canDelete ? "#F44336" : "#CCCCCC"}
  />
  <Text style={[
    styles.requestActionText, 
    { color: canDelete ? '#F44336' : '#CCCCCC' }
  ]}>
    Delete
  </Text>
</Pressable>
      </View>
    </Pressable>
  );
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

  const getExpiryInfo = (createdAt: string) => {
    const created = new Date(createdAt);
    const expiresAt = new Date(created.getTime() + 3 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const timeRemaining = expiresAt.getTime() - now.getTime();
    const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));

    if (daysRemaining <= 0) return 'Expired';
    if (daysRemaining === 1) return 'Expires in 1 day';
    if (daysRemaining === 2) return 'Expires in 2 days';
    if (daysRemaining === 3) return 'Expires in 3 days';
    return `Expires in ${daysRemaining} days`;
  };

  const renderVideoCard = (video: VideoPost, index: number) => {
    const isSelected = selectedVideoIds.has(video.id);
    const expiryInfo = getExpiryInfo(video.created_at || new Date().toISOString());
    const likesCountText = formatCount(video.likes_count || 0);
    const commentsCountText = formatCount(video.comments_count || 0);
    const sharesCountText = formatCount(video.shares_count || 0);

    return (
      <Pressable
        key={video.id}
        style={({ pressed }) => [
          styles.videoCard,
          isSelected && styles.videoCardSelected,
          pressed && styles.cardPressed,
        ]}
        onPress={() => {
          if (isSelectMode) {
            toggleVideoSelection(video.id);
          } else {
            handleVideoPress(video, index, videos);
          }
        }}
        onLongPress={() => {
          if (!isSelectMode) {
            setIsSelectMode(true);
            toggleVideoSelection(video.id);
          }
        }}
      >
        {isSelectMode && (
          <View style={styles.selectionOverlay}>
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && (
                <IconSymbol
                  ios_icon_name="checkmark"
                  android_material_icon_name="check"
                  size={16}
                  color="#FFF"
                />
              )}
            </View>
          </View>
        )}

        <Image
          source={{ uri: getVideoThumbnailUrl(video.video_url || '', video.library_id) }}
          style={styles.videoThumbnail}
        />

        <View style={styles.videoCardInfo}>
          <View style={styles.videoStats}>
            <View style={styles.videoStat}>
              <IconSymbol
                ios_icon_name="heart.fill"
                android_material_icon_name="favorite"
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.videoStatText}>{likesCountText}</Text>
            </View>

            <View style={styles.videoStat}>
              <IconSymbol
                ios_icon_name="bubble.left.fill"
                android_material_icon_name="chat-bubble"
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.videoStatText}>{commentsCountText}</Text>
            </View>

            <View style={styles.videoStat}>
              <IconSymbol
                ios_icon_name="arrowshape.turn.up.right.fill"
                android_material_icon_name="share"
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.videoStatText}>{sharesCountText}</Text>
            </View>
          </View>

          <View style={styles.videoExpiryInfo}>
            <Text style={styles.videoExpiryText}>{expiryInfo}</Text>
          </View>

          <View style={styles.videoActions}>
            <Pressable
              style={({ pressed }) => [
                styles.videoActionButton,
                pressed && styles.actionButtonPressed,
              ]}
              onPress={() => video.video_url && handleSaveVideo(video.video_url, video.id, video.library_id)}
            >
              <IconSymbol
                ios_icon_name="arrow.down.circle.fill"
                android_material_icon_name="download"
                size={24}
                color={colors.primary}
              />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.videoActionButton,
                pressed && styles.actionButtonPressed,
              ]}
              onPress={() => handleDeleteVideo(video.id)}
            >
              <IconSymbol
                ios_icon_name="trash.fill"
                android_material_icon_name="delete"
                size={24}
                color="#F44336"
              />
            </Pressable>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    switch (activeTab) {
      case 'videos':
        if (videos.length === 0) {
          return (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="video.slash"
                android_material_icon_name="videocam-off"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={styles.emptyText}>No videos yet</Text>
              <Text style={styles.emptySubtext}>Start creating content to see it here</Text>
            </View>
          );
        }

        return (
          <View style={styles.videosContainer}>
            {isSelectMode && (
              <View style={styles.selectionHeader}>
                <Pressable onPress={selectAllVideos}>
                  <Text style={styles.selectAllText}>
                    {selectedVideoIds.size === videos.length ? 'Deselect All' : 'Select All'}
                  </Text>
                </Pressable>

                <View style={styles.selectionActions}>
                  <Pressable
                    style={styles.selectionActionButton}
                    onPress={handleBatchDownload}
                  >
                    <IconSymbol
                      ios_icon_name="arrow.down.circle"
                      android_material_icon_name="download"
                      size={24}
                      color={colors.primary}
                    />
                  </Pressable>

                  <Pressable
                    style={styles.selectionActionButton}
                    onPress={handleBatchDelete}
                  >
                    <IconSymbol
                      ios_icon_name="trash"
                      android_material_icon_name="delete"
                      size={24}
                      color="#F44336"
                    />
                  </Pressable>

                  <Pressable
                    style={styles.selectionActionButton}
                    onPress={toggleSelectMode}
                  >
                    <IconSymbol
                      ios_icon_name="xmark"
                      android_material_icon_name="close"
                      size={24}
                      color={colors.text}
                    />
                  </Pressable>
                </View>
              </View>
            )}

            <FlatList
      data={videos}
      renderItem={({ item, index }) => renderVideoCard(item, index)}
      keyExtractor={(item) => item.id}
      numColumns={3}
      contentContainerStyle={styles.videosGrid}
      onEndReached={handleLoadMoreVideos}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        loadingMoreVideos ? (
          <View style={styles.loadingMoreVideos}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingMoreText}>Loading more...</Text>
          </View>
        ) : null
      }
      columnWrapperStyle={{ gap: 12 }}
    />
  </View>
);

      case 'pending':
        if (pendingUploads.length === 0) {
          return (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="clock"
                android_material_icon_name="schedule"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={styles.emptyText}>No pending uploads</Text>
            </View>
          );
        }

        return (
          <ScrollView contentContainerStyle={styles.pendingContainer}>
{pendingUploads.map((upload) => {
  const uploadCaptionText = upload.caption || 'Untitled';
  
  // Determine status text based on upload status
let uploadStatusText = 'Processing...';
if (upload.status === 'uploading') {
  uploadStatusText = 'Uploading...';
} else if (upload.status === 'processing') {
  uploadStatusText = 'Processing video...';
} else if (upload.status === 'failed') {
  uploadStatusText = 'Upload Failed';
}

const isFailed = upload.status === 'failed';
  
  const uploadDateText = formatDate(upload.created_at);
  const uploadProgress = upload.upload_progress || 0;
  return (
    <Pressable
      key={upload.id}
      style={({ pressed }) => [
        styles.pendingCard,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.pendingHeader}>
        <Text style={styles.pendingCaption}>{uploadCaptionText}</Text>
        {/* Progress bar */}
<View style={styles.progressBarContainer}>
  <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
</View>
<Text style={styles.progressText}>{uploadProgress}%</Text>
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
  <View
    style={[
      styles.statusBadge,
      { backgroundColor: isFailed ? '#F44336' : '#FFA500' },
    ]}
  >
    <Text style={styles.statusText}>{uploadStatusText}</Text>
  </View>
  {isFailed && (
    <>
      <Pressable
        onPress={() => handleRetryUpload(upload)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <IconSymbol
          ios_icon_name="arrow.clockwise.circle.fill"
          android_material_icon_name="refresh"
          size={24}
          color="#F44336"
        />
      </Pressable>
      <Pressable
        onPress={() => handleDismissFailedUpload(upload)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <IconSymbol
          ios_icon_name="trash.fill"
          android_material_icon_name="delete"
          size={22}
          color="#F44336"
        />
      </Pressable>
    </>
  )}
</View>
      </View>

      <Text style={styles.pendingDate}>{uploadDateText}</Text>

      {/* Show animated processing indicator */}
      {upload.moderation_status === 'pending' && (
        <View style={styles.processingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.processingText}>Checking video content...</Text>
        </View>
      )}
    </Pressable>
  );
})}
          </ScrollView>
        );

     case 'liked':
        if (likedVideos.length === 0) {
          return (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="heart.slash"
                android_material_icon_name="heart-broken"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={styles.emptyText}>No liked videos</Text>
              <Text style={styles.emptySubtext}>Videos you like will appear here</Text>
            </View>
          );
        }

        return (
          <View style={styles.videosContainer}>
            <FlatList
              data={likedVideos}
              renderItem={({ item: video }) => {
                const likesCountText = formatCount(video.likes_count || 0);
                const commentsCountText = formatCount(video.comments_count || 0);
                return (
                  <Pressable
                    key={video.id}
                    style={({ pressed }) => [
                      styles.videoCard,
                      pressed && styles.cardPressed,
                    ]}
                    onPress={() => {
                      // Navigate to single video player — no list passed
                      router.push({
                        pathname: '/search-video-player',
                        params: {
                          videoIds: JSON.stringify([video.id]),
                          startIndex: '0',
                        },
                      });
                    }}
                  >
                    <View style={{ position: 'relative' }}>
                      <Image
                        source={{ uri: getVideoThumbnailUrl(video.video_url || '', video.library_id) }}
                        style={styles.videoThumbnail}
                      />
                      <Pressable
                        style={styles.likedVideoUnlikeButton}
                        onPress={() => handleUnlikeVideo(video.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <IconSymbol
                          ios_icon_name="xmark.circle.fill"
                          android_material_icon_name="cancel"
                          size={22}
                          color="#FFFFFF"
                        />
                      </Pressable>
                    </View>
                    <View style={styles.videoCardInfo}>
                      <View style={styles.videoStats}>
                        <View style={styles.videoStat}>
                          <IconSymbol
                            ios_icon_name="heart.fill"
                            android_material_icon_name="favorite"
                            size={16}
                            color={colors.textSecondary}
                          />
                          <Text style={styles.videoStatText}>{likesCountText}</Text>
                        </View>
                        <View style={styles.videoStat}>
                          <IconSymbol
                            ios_icon_name="bubble.left.fill"
                            android_material_icon_name="chat-bubble"
                            size={16}
                            color={colors.textSecondary}
                          />
                          <Text style={styles.videoStatText}>{commentsCountText}</Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              }}
              keyExtractor={(item) => item.id}
              numColumns={3}
              contentContainerStyle={styles.videosGrid}
              columnWrapperStyle={{ gap: 12 }}
            />
          </View>
        );

      case 'requests':
        if (myRequests.length === 0) {
          return (
            <View style={styles.emptyContainer}>
              <IconSymbol
                ios_icon_name="questionmark.circle"
                android_material_icon_name="help"
                size={64}
                color={colors.textSecondary}
              />
              <Text style={styles.emptyText}>No requests yet</Text>
              <Text style={styles.emptySubtext}>
                Looking for a place but no live video yet?{'\n'}
                Double-tap the map to request one.
              </Text>
            </View>
          );
        }

        return (
          <ScrollView contentContainerStyle={styles.requestsContainer}>
            {myRequests.map(renderRequestCard)}
          </ScrollView>
        );

      case 'notifications':
        if (notifications.length === 0) {
          return (
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
          );
        }

        return (
          <View style={styles.notificationsContainer}>
            <View style={styles.notificationsHeader}>
              <Text style={styles.notificationsTitle}>Notifications</Text>
              <Pressable onPress={handleClearAllNotifications}>
                <Text style={styles.clearAllText}>Clear All</Text>
              </Pressable>
            </View>

            <GestureHandlerRootView style={{ flex: 1 }}>
              <ScrollView>
                {notifications.map((notification) => {
                  const notificationMessageText = notification.message;
                  const notificationTimeText = formatDate(notification.created_at);

                  return (
                    <Swipeable
                      key={notification.id}
                      ref={(ref: Swipeable | null) => {
  if (ref) {
    swipeableRefs.current[notification.id] = ref;
  }
}}
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
                        <Pressable onPress={() => handleNotificationAvatarPress(notification)}>
  <PremiumAvatar
    avatarUrl={notification.users?.avatar_url}
    size={40}
    isPremium={notification.users?.is_premium || false}
  />
</Pressable>

                        <View style={styles.notificationContent}>
                          <Text style={styles.notificationMessage}>{notificationMessageText}</Text>
                          <Text style={styles.notificationTime}>{notificationTimeText}</Text>
                        </View>
                      </Pressable>
                    </Swipeable>
                  );
                })}
              </ScrollView>
            </GestureHandlerRootView>
          </View>
        );

      default:
        return null;
    }
  };

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

const tabs: TabBarItem[] = [
  { name: 'explore', route: '/(tabs)/(home)/', icon: 'binoculars.fill', label: 'Explore' },
  { name: 'map', route: '/(tabs)/map', icon: 'map.fill', label: 'Map' },
  { name: 'upload', route: '/record-video', icon: 'plus', label: 'Upload', isUpload: true },
  { name: 'request', route: '/(tabs)/request', icon: 'hand.raised.fill', label: 'Request' },
  { name: 'profile', route: '/(tabs)/profile', icon: 'person.fill', label: 'Profile' },
];

  const displayNameText = `@${profile.username}`;
  const usernameText = `@${profile.username}`;
  const bioText = profile.bio || '';
  const locationText = profile.location || '';
  const videosCountText = formatCount(profile.videos_count || 0);
  const followersCountText = formatCount(profile.followers_count || 0);
  const followingCountText = formatCount(profile.following_count || 0);
  const likedCountText = formatCount(likedVideos.length);
  const unreadBadgeText = unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount.toString();

  return (
    <SafeAreaView style={styles.container}>
  {/* Coin Animation */}
  {showCoinAnimation && (
    <View style={{ position: 'absolute', top: 100, left: 0, right: 0, zIndex: 1000 }}>
      <CoinAnimation 
        amount={coinAnimationAmount}
        onComplete={() => setShowCoinAnimation(false)}
      />
    </View>
  )}
  
<LinearGradient colors={[colors.background, colors.background]} style={styles.gradient}>
      <View style={{ flex: 1 }}>
          {/* Profile Header - Horizontal Layout */}
          <View style={styles.header}>

            {/* 🪙 COIN BALANCE - Top Right Corner */}
<Pressable 
  onPress={() => router.push('/coin-history')} 
  style={styles.coinBalanceTopRight}
>
  <CoinBalance 
    coins={coins} 
    loading={coinsLoading}
    size="small"
  />
</Pressable>

<View style={styles.profileRow}>
  {/* Avatar on the left */}
  <View>
    <Pressable onPress={handleChangeAvatar}>
      <PremiumAvatar
        avatarUrl={profile.avatar_url}
        size={80}
        isPremium={profile.is_premium}
      />
    </Pressable>

    {/* Settings Icon on Avatar */}
    <Pressable 
      onPress={() => router.push('/settings')}
      style={styles.avatarEditIcon}
    >
      <IconSymbol
        ios_icon_name="gearshape.fill"
        android_material_icon_name="settings"
        size={16}
        color="#333"
      />
    </Pressable>
  </View>

              {/* Info on the right */}
              <View style={styles.profileInfo}>
  <Text style={styles.displayName} numberOfLines={1} ellipsizeMode="tail">
    {displayNameText}
  </Text>
  {bioText ? <Text style={styles.bio}>{bioText}</Text> : null}
  {locationText ? (
    <View style={styles.locationContainer}>
      <IconSymbol
        ios_icon_name="location.fill"
        android_material_icon_name="location-on"
        size={14}
        color={colors.textSecondary}
      />
      <Text style={styles.location}>{locationText}</Text>
    </View>
  ) : null}
</View>
            </View>

{/* Stats */}
<View style={styles.stats}>
  {/* Videos - Lifetime Count */}
  <View style={styles.stat}>
    <Text style={styles.statValue}>
      {formatCount(profile.lifetime_videos_count || 0)}
    </Text>
    <Text style={styles.statLabel}>Videos</Text>
  </View>

  {/* Views - Lifetime Count */}
  <View style={styles.stat}>
    <Text style={styles.statValue}>
      {formatCount(profile.lifetime_views_count || 0)}
    </Text>
    <Text style={styles.statLabel}>Views</Text>
  </View>

  {/* Likes - Lifetime Count */}
  <View style={styles.stat}>
    <Text style={styles.statValue}>
      {formatCount(profile.lifetime_likes_count || 0)}
    </Text>
    <Text style={styles.statLabel}>Likes</Text>
  </View>

  {/* Followers - Tappable */}
  <Pressable
    style={styles.stat}
    onPress={() => handleNavigateToFollowersList('followers')}
  >
    <Text style={styles.statValue}>{followersCountText}</Text>
    <Text style={styles.statLabel}>Followers</Text>
  </Pressable>

  {/* Following - Tappable */}
  <Pressable
    style={styles.stat}
    onPress={() => handleNavigateToFollowersList('following')}
  >
    <Text style={styles.statValue}>{followingCountText}</Text>
    <Text style={styles.statLabel}>Following</Text>
  </Pressable>
</View>

</View>
          {/* Tabs */}
          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, activeTab === 'videos' && styles.activeTabStyle]}
              onPress={() => setActiveTab('videos')}
            >
              <IconSymbol
                ios_icon_name="play.rectangle.fill"
                android_material_icon_name="videocam"
                size={20}
                color={activeTab === 'videos' ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'videos' && styles.activeTabText,
                ]}
              >
                Videos
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tab, activeTab === 'pending' && styles.activeTabStyle]}
              onPress={() => setActiveTab('pending')}
            >
              <IconSymbol
                ios_icon_name="clock.fill"
                android_material_icon_name="schedule"
                size={20}
                color={activeTab === 'pending' ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'pending' && styles.activeTabText,
                ]}
              >
                Pending
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tab, activeTab === 'liked' && styles.activeTabStyle]}
              onPress={() => setActiveTab('liked')}
            >
              <IconSymbol
                ios_icon_name="heart.fill"
                android_material_icon_name="favorite"
                size={20}
                color={activeTab === 'liked' ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'liked' && styles.activeTabText,
                ]}
              >
                Liked
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tab, activeTab === 'requests' && styles.activeTabStyle]}
              onPress={() => setActiveTab('requests')}
            >
              <IconSymbol
                ios_icon_name="hand.raised.fill"
                android_material_icon_name="pan-tool"
                size={18}
                color={activeTab === 'requests' ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'requests' && styles.activeTabText,
                ]}
              >
                Requests
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tab, activeTab === 'notifications' && styles.activeTabStyle]}
              onPress={() => setActiveTab('notifications')}
            >
              <View>
                <IconSymbol
                  ios_icon_name="bell.fill"
                  android_material_icon_name="notifications"
                  size={20}
                  color={activeTab === 'notifications' ? colors.primary : colors.textSecondary}
                />
                {unreadNotificationsCount > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>{unreadBadgeText}</Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'notifications' && styles.activeTabText,
                ]}
              >
                Notifications
              </Text>
            </Pressable>
          </View>

{activeTab === 'videos' && videos.length > 0 && (
  <View>
    <Pressable
      style={styles.videoDeletionToggle}
      onPress={() => setShowDeletionBanner(!showDeletionBanner)}
    >
      <IconSymbol
        ios_icon_name="clock.fill"
        android_material_icon_name="schedule"
        size={12}
        color="#fdfcfb"
      />
      <Text style={styles.videoDeletionToggleText}>Auto-delete after 3 days</Text>
      <IconSymbol
        ios_icon_name={showDeletionBanner ? 'chevron.up' : 'chevron.down'}
        android_material_icon_name={showDeletionBanner ? 'expand-less' : 'expand-more'}
        size={12}
        color="#ffffff"
      />
    </Pressable>
    {showDeletionBanner && (
      <View style={styles.videoDeletionBanner}>
        <Text style={styles.videoDeletionText}>
          Download your videos before they're gone. All videos are automatically deleted 3 days after upload.
        </Text>
      </View>
    )}
  </View>
)}
          {/* Content */}
          {renderContent()}
      </View>

        {/* Edit Profile Modal */}
        <Modal
          visible={isEditMode}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setIsEditMode(false)}
        >
          <SafeAreaView style={styles.modalContainer}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ flex: 1 }}
            >
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setIsEditMode(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <Pressable onPress={handleSaveProfile}>
                  <Text style={styles.modalSaveText}>Save</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.modalContent}>
                {/* Display Name field removed - using username only */}

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Bio</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={editedProfile.bio || ''}
                    onChangeText={(text) =>
                      setEditedProfile({ ...editedProfile, bio: text })
                    }
                    placeholder="Tell us about yourself"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    numberOfLines={4}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.inputLabelRow}>
                    <Text style={styles.inputLabel}>Location</Text>
                    <Pressable onPress={handleGetCurrentLocation}>
                      <Text style={styles.getCurrentLocationText}>Use Current Location</Text>
                    </Pressable>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={editedProfile.location || ''}
                    onChangeText={(text) =>
                      setEditedProfile({ ...editedProfile, location: text })
                    }
                    placeholder="Enter location"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* Video Modal */}
        {videoModalVisible && (
          <View style={[styles.videoModalContainer, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }]}>
    <Pressable style={styles.closeButton} onPress={handleCloseVideoModal}>
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="close"
                size={32}
                color="#FFF"
              />
            </Pressable>

            {selectedVideo && (
              <FlatList
                data={currentVideoList}
                renderItem={({ item, index }) => (
                  <View style={styles.videoModalItem}>
                    <VideoFeedItem
                      video={item}
                      isActive={index === selectedVideoIndex}
                      onLike={handleLike}
                      userLocation={userLocation}
                      hideUnlikeButton={activeTab !== 'liked'}
                      onAvatarPress={(userId) => {
                        setVideoModalVisible(false);
setTimeout(() => {
  if (!mountedRef.current) return;
  router.push({
    pathname: '/user-profile',
                            params: { userId },
                          });
                          setSelectedVideo(null);
                          setCurrentVideoList([]);
                        }, 100);
                      }}
                    />
                  </View>
                )}
                keyExtractor={(item) => item.id}
                pagingEnabled
                showsVerticalScrollIndicator={false}
                initialScrollIndex={selectedVideoIndex}
               getItemLayout={(data, index) => ({
                  length: Dimensions.get('screen').height,
                  offset: Dimensions.get('screen').height * index,
                  index,
                })}
                onViewableItemsChanged={({ viewableItems }) => {
                  if (viewableItems.length > 0) {
                    setSelectedVideoIndex(viewableItems[0].index || 0);
                  }
                }}
                viewabilityConfig={{
                  itemVisiblePercentThreshold: 50,
                }}
/>
            )}
          </View>
        )}

        {/* 🪙 DAILY BONUS POPUP - ADDED */}
        <DailyBonusPopup
          visible={showDailyBonus}
          onClose={() => setShowDailyBonus(false)}
        />
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  settingsIcon: {
    position: 'absolute',
    top: 0,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  gradient: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
  padding: 12,
  paddingTop: 10,
  position: 'relative', // ← ADD: Makes absolute positioning work properly
},
  profileRow: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  marginBottom: 16,
  paddingRight: 100, // ← ADD: Reserve space for coin badge
},
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  avatarEditIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
  flex: 1,
  marginLeft: 16,
  marginRight: 12, // ← ADD: Gap between name and coin badge
  minWidth: 0, // ← ADD: Allow flex shrinking
  justifyContent: 'flex-start',
},
displayName: {
  fontSize: 20,
  fontWeight: 'bold',
  color: colors.text,
  marginBottom: 2,
  flexShrink: 1, // ← ADD: Allow text to shrink
},
username: {
  fontSize: 14,
  color: colors.textSecondary,
  marginBottom: 6,
  flexShrink: 1, // ← ADD: Allow text to shrink
},
  bio: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
    marginBottom: 6,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  location: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',  // ← ADD THIS
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 4,
    paddingHorizontal: 4,
    rowGap: 6,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
  },
  statLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
 tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTabStyle: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  activeTabText: {
    color: colors.primary,
    fontWeight: '600',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#F44336',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  selectModeContainer: {
    padding: 16,
    alignItems: 'flex-end',
  },
  selectModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderRadius: 20,
  },
  selectModeText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  videosContainer: {
    flex: 1,
  },
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  selectAllText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 16,
  },
  selectionActionButton: {
    padding: 8,
  },
  videosGrid: {
  padding: 12,
  paddingBottom: 120,
},
  videoCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',/*  */
    marginBottom: 12,
    borderWidth: 2,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 0,
  },
  videoCardSelected: {
    borderWidth: 3,
    borderColor: colors.primary,
  },
  cardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  selectionOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFF',
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  videoThumbnail: {
    width: '100%',
    height: CARD_WIDTH * 1.5,
    backgroundColor: colors.border,
  },
  videoCardInfo: {
    padding: 12,
  },
  videoStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  videoStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  videoStatText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  videoExpiryInfo: {
    backgroundColor: colors.background,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  videoExpiryText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },
  videoActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  videoActionButton: {
    padding: 6,
  },
  actionButtonPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.95 }],
  },
  unlikeButton: {
    alignSelf: 'center',
    padding: 8,
  },
  likedVideoUnlikeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    zIndex: 10,
  },
  pendingContainer: {
    padding: 16,
    paddingBottom: 120,  // ← ADD THIS
  },
  pendingCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 0,
  },
  pendingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pendingCaption: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  pendingDate: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  requestsContainer: {
    padding: 16,
    paddingBottom: 120,
  },
  requestCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 0,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  requestDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 12,
  },
  expiredBadge: {
    backgroundColor: '#F44336',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  expiredText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  activeBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  requestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  requestLocation: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  requestTime: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  requestActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 16,
    marginTop: 12,
  },
requestActionButton: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  paddingVertical: 4,
},
requestActionButtonDisabled: {
  opacity: 0.4,
},
requestActionText: {
  fontSize: 14,
  color: colors.primary,
  fontWeight: '600',
  },
  notificationsContainer: {
    flex: 1,
    paddingBottom: 80,
  },
  notificationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  notificationsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  clearAllText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
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
  // Notification avatar style removed - now handled by PremiumAvatar component
  notificationContent: {
    flex: 1,
  },
  notificationMessage: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
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
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalCancelText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  modalSaveText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  getCurrentLocationText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    fontSize: 14,
    color: colors.text,
  },
  categoryChipTextSelected: {
    color: '#FFF',
    fontWeight: '600',
  },
  videoModalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  videoModalItem: {
    height: Dimensions.get('screen').height,
  },
  processingContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  marginTop: 8,
  paddingTop: 8,
  borderTopWidth: 1,
  borderTopColor: colors.border,
},
processingText: {
  fontSize: 12,
  color: colors.textSecondary,
  fontStyle: 'italic',
},
progressBarContainer: {
  height: 4,
  backgroundColor: colors.border,
  borderRadius: 2,
  marginTop: 8,
  overflow: 'hidden',
},
progressBar: {
  height: '100%',
  backgroundColor: colors.primary,
},
progressText: {
  fontSize: 10,
  color: colors.textSecondary,
  marginTop: 4,
  textAlign: 'right',
},
coinBalanceTopRight: {
  position: 'absolute',
  top: 10,
  right: 16,
  zIndex: 100, // ← Much higher to ensure it's on top
  flexShrink: 0, // ← Prevent shrinking
},
videoDeletionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  videoDeletionToggleText: {
    fontSize: 11,
    color: '#fcfbf9',
    fontWeight: '500',
  },
  videoDeletionBanner: {
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: '#FFB74D',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  videoDeletionText: {
    fontSize: 11,
    color: '#E65100',
    lineHeight: 16,
  },
loadingMoreVideos: {
  paddingVertical: 20,
  alignItems: 'center',
  width: '100%',
},
loadingMoreText: {
  marginTop: 8,
  fontSize: 12,
  color: colors.textSecondary,
},
});
