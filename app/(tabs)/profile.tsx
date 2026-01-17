
import React, { useState, useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { VideoPost } from '@/types/video';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import * as MediaLibrary from 'expo-media-library';
import VideoFeedItem from '@/components/VideoFeedItem';
import { getVideoPlaybackUrl, getVideoThumbnailUrl, getVideoDownloadUrl, deleteStreamVideo, extractVideoId } from '@/utils/bunnynet';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';
import { requestMediaLibraryPermission, requestMediaLibrarySavePermission } from '@/utils/permissions';
import { File, Directory, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { GestureHandlerRootView, Swipeable, PanGestureHandler, State } from 'react-native-gesture-handler';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
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

type ProfileTab = 'videos' | 'pending' | 'liked' | 'requests' | 'notifications';

const AVAILABLE_CATEGORIES = [
  'Food & Dining',
  'Entertainment',
  'Sports',
  'Travel',
  'Fashion',
  'Technology',
  'Art & Culture',
  'Music',
  'Fitness',
  'Nature',
  'Pets',
  'Gaming',
  'Education',
  'Business',
  'Lifestyle',
];

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 3;

export default function ProfileScreen() {
  const params = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState<ProfileTab>((params.tab as ProfileTab) || 'videos');
  const [profile, setProfile] = useState<any>(null);
  const [videos, setVideos] = useState<VideoPost[]>([]);
  const [likedVideos, setLikedVideos] = useState<VideoPost[]>([]);
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
  const router = useRouter();
  const swipeableRefs = useRef<{ [key: string]: Swipeable | null }>({});
  const requestTimerRef = useRef<NodeJS.Timeout | null>(null);
  const expiryTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (params.tab) {
      setActiveTab(params.tab as ProfileTab);
    }
  }, [params.tab]);

  useEffect(() => {
    loadProfile();
    loadUserLocation();
    loadUnreadNotificationsCount();
  }, []);

  useEffect(() => {
    if (activeTab === 'videos') {
      loadVideos();
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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('pending_uploads')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingUploads(data || []);
      
      // Check for rejected videos
      checkForRejectedVideos();
    } catch (error) {
      console.error('Error loading pending uploads:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkForRejectedVideos = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: rejectedVideos, error } = await supabase
        .from('videos')
        .select('id, caption, moderation_status')
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

        await supabase
          .from('videos')
          .delete()
          .eq('id', rejectedVideo.id);
      }
    } catch (error) {
      console.error('Error checking for rejected videos:', error);
    }
  };

  const loadVideos = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('No user found in loadVideos');
        setVideos([]);
        return;
      }

      console.log('=== LOADING VIDEOS ===');
      console.log('User ID:', user.id);

      // Calculate 3 days ago timestamp to filter out expired videos
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const cutoffDate = threeDaysAgo.toISOString();

      console.log('📅 Filtering videos created after:', cutoffDate);

      const { data, error } = await supabase
        .from('videos')
        .select(`
          *,
          users (
            id,
            username,
            avatar_url
          )
        `)
        .eq('user_id', user.id)
        .eq('is_approved', true)
        .gte('created_at', cutoffDate) // Only show videos less than 3 days old
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error loading videos from database:', error);
        throw error;
      }

      console.log('✅ Raw video data from database:', data?.length || 0, 'videos');

      // Add extensive null/undefined checks before processing video data
      const videosWithLikes = await Promise.all(
        (data || []).map(async (video) => {
          try {
            // CRITICAL: Check if video object exists and has required fields
            if (!video) {
              console.warn('⚠️ Null video object encountered');
              return null;
            }
            
            if (!video.id) {
              console.warn('⚠️ Video missing ID:', video);
              return null;
            }

            if (!video.video_url) {
              console.warn('⚠️ Video missing video_url:', video.id);
              return null;
            }

            console.log('Processing video:', video.id);

            const { data: likeData } = await supabase
              .from('likes')
              .select('id')
              .eq('video_id', video.id)
              .eq('user_id', user.id)
              .single();

            // Safely parse tags with extensive error handling
            let parsedTags = [];
            if (video.tags !== null && video.tags !== undefined) {
              if (typeof video.tags === 'string') {
                try {
                  // Only parse if it's a non-empty string
                  if (video.tags.trim().length > 0) {
                    parsedTags = JSON.parse(video.tags);
                    console.log('✅ Parsed tags for video', video.id, ':', parsedTags);
                  }
                } catch (parseError) {
                  console.warn('⚠️ Failed to parse tags for video', video.id, ':', parseError);
                  console.warn('Tags value:', video.tags);
                  parsedTags = [];
                }
              } else if (Array.isArray(video.tags)) {
                parsedTags = video.tags;
                console.log('✅ Tags already array for video', video.id);
              } else {
                console.warn('⚠️ Unexpected tags type for video', video.id, ':', typeof video.tags);
              }
            }

            return {
              ...video,
              tags: parsedTags,
              isLiked: !!likeData,
              // Ensure all required fields have safe defaults
              likes_count: video.likes_count || 0,
              comments_count: video.comments_count || 0,
              shares_count: video.shares_count || 0,
              caption: video.caption || '',
              created_at: video.created_at || new Date().toISOString(),
            };
          } catch (videoError) {
            console.error('❌ Error processing video:', video?.id, videoError);
            return null;
          }
        })
      );

      // Filter out null values from failed video processing
      const validVideos = videosWithLikes.filter(v => v !== null);
      console.log('✅ Processed videos count:', validVideos.length);
      console.log('=== LOADING VIDEOS COMPLETE ===');

      setVideos(validVideos);
      
      // Start updating expiry timers
      updateVideoExpiryTimers();
    } catch (error) {
      console.error('❌ Error in loadVideos:', error);
      Alert.alert('Error', 'Failed to load videos. Please try again.');
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  const updateVideoExpiryTimers = () => {
    // Clear existing timer
    if (expiryTimerRef.current) {
      clearInterval(expiryTimerRef.current);
    }

    // Update every minute
    expiryTimerRef.current = setInterval(() => {
      setVideos(prevVideos => [...prevVideos]);
    }, 60000);
  };

  const loadLikedVideos = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('likes')
        .select(`
          video_id,
          videos (
            *,
            users (
              id,
              username,
              avatar_url
            )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const likedVideosData = (data || [])
        .filter(like => like.videos)
        .map(like => ({
          ...(like.videos as any),
          isLiked: true,
        }));

      setLikedVideos(likedVideosData);
    } catch (error) {
      console.error('Error loading liked videos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelPendingUpload = async (uploadId: string) => {
    try {
      const { error } = await supabase
        .from('pending_uploads')
        .delete()
        .eq('id', uploadId);

      if (error) throw error;

      setPendingUploads(pendingUploads.filter(u => u.id !== uploadId));
      Alert.alert('Success', 'Upload cancelled');
    } catch (error) {
      console.error('Error cancelling upload:', error);
      Alert.alert('Error', 'Failed to cancel upload');
    }
  };

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      setProfile(data);
      setEditedProfile(data);
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const loadMyRequests = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('video_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setMyRequests(data || []);
      updateRequestTimers();
    } catch (error) {
      console.error('Error loading requests:', error);
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
            avatar_url
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
      newExpiresAt.setHours(newExpiresAt.getHours() + (request.duration || 24));

      const { error } = await supabase
        .from('video_requests')
        .insert({
          user_id: user.id,
          description: request.description,
          location_type: request.location_type,
          latitude: request.latitude,
          longitude: request.longitude,
          location_name: request.location_name,
          duration: request.duration,
          expires_at: newExpiresAt.toISOString(),
        });

      if (error) throw error;

      Alert.alert('Success', 'Request reposted successfully');
      loadMyRequests();
    } catch (error) {
      console.error('Error reposting request:', error);
      Alert.alert('Error', 'Failed to repost request');
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    Alert.alert(
      'Delete Request',
      'Are you sure you want to delete this request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('video_requests')
                .delete()
                .eq('id', requestId);

              if (error) throw error;

              setMyRequests(myRequests.filter(r => r.id !== requestId));
              Alert.alert('Success', 'Request deleted successfully');
            } catch (error) {
              console.error('Error deleting request:', error);
              Alert.alert('Error', 'Failed to delete request');
            }
          },
        },
      ]
    );
  };

  const handleViewFulfillments = (request: any) => {
    router.push({
      pathname: '/fulfillment-videos',
      params: { requestId: request.id },
    });
  };

  const handleNotificationPress = async (notification: any) => {
    console.log('=== NOTIFICATION PRESSED ===');
    console.log('Notification type:', notification.type);
    console.log('Notification data:', JSON.stringify(notification, null, 2));

    try {
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fileName = `${user.id}-${Date.now()}.jpg`;
      const fileExt = uri.split('.').pop();
      const filePath = `${user.id}/${fileName}`;

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

      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setProfile({ ...profile, avatar_url: publicUrl });
      Alert.alert('Success', 'Avatar updated successfully');
    } catch (error) {
      console.error('Error uploading avatar:', error);
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

  const handleEditProfile = () => {
    setIsEditMode(true);
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

  const toggleCategory = (category: string) => {
    const currentCategories = editedProfile.categories || [];
    const newCategories = currentCategories.includes(category)
      ? currentCategories.filter((c: string) => c !== category)
      : [...currentCategories, category];

    setEditedProfile({
      ...editedProfile,
      categories: newCategories,
    });
  };

  const handleSaveProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('users')
        .update({
          display_name: editedProfile.display_name,
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

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.auth.signOut();
              router.replace('/auth/sign-in');
            } catch (error) {
              console.error('Error signing out:', error);
              Alert.alert('Error', 'Failed to sign out');
            }
          },
        },
      ]
    );
  };

  const formatCount = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const handleSaveVideo = async (videoUrl: string, videoId: string) => {
    try {
      const hasPermission = await requestMediaLibrarySavePermission();
      if (!hasPermission) {
        Alert.alert('Permission Denied', 'Media library permission is required to save videos');
        return;
      }

      Alert.alert('Downloading', 'Please wait while we download your video...');

      const downloadUrl = await getVideoDownloadUrl(videoUrl);
      const fileName = `POPNOW_${videoId}_${Date.now()}.mp4`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      const downloadResult = await FileSystem.downloadAsync(downloadUrl, fileUri);

      if (downloadResult.status !== 200) {
        throw new Error('Download failed');
      }

      const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
      await MediaLibrary.createAlbumAsync('POPNOW', asset, false);

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

              // Delete from Bunny.net first
              if (video.video_url) {
                const bunnyVideoId = extractVideoId(video.video_url);
                if (bunnyVideoId) {
                  await deleteStreamVideo(bunnyVideoId);
                }
              }

              // Then delete from database
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

  const handleLike = async (videoId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const video = videos.find(v => v.id === videoId);
      if (!video) return;

      if (video.isLiked) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('video_id', videoId)
          .eq('user_id', user.id);

        if (error) throw error;

        setVideos(videos.map(v =>
          v.id === videoId
            ? { ...v, isLiked: false, likes_count: v.likes_count - 1 }
            : v
        ));
      } else {
        const { error } = await supabase
          .from('likes')
          .insert({ video_id: videoId, user_id: user.id });

        if (error) throw error;

        setVideos(videos.map(v =>
          v.id === videoId
            ? { ...v, isLiked: true, likes_count: v.likes_count + 1 }
            : v
        ));
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleVideoPress = (video: VideoPost, index: number, videoList: VideoPost[]) => {
    setSelectedVideo(video);
    setSelectedVideoIndex(index);
    setCurrentVideoList(videoList);
    setVideoModalVisible(true);
  };

  const handleCloseVideoModal = () => {
    setVideoModalVisible(false);
    setSelectedVideo(null);
  };

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
                await handleSaveVideo(video.video_url, video.id);
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
                // Delete from Bunny.net
                if (video.video_url) {
                  const bunnyVideoId = extractVideoId(video.video_url);
                  if (bunnyVideoId) {
                    await deleteStreamVideo(bunnyVideoId);
                  }
                }

                // Delete from database
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
    const expiresAt = new Date(request.expires_at);
    const now = new Date();
    const isExpired = expiresAt < now;
    const timeRemaining = Math.max(0, expiresAt.getTime() - now.getTime());
    const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

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
          <Text style={styles.requestDescription}>{request.description}</Text>
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
          <Text style={styles.requestLocation}>{request.location_name}</Text>
        </View>

        {!isExpired && (
          <View style={styles.requestInfo}>
            <IconSymbol
              ios_icon_name="clock.fill"
              android_material_icon_name="schedule"
              size={16}
              color={colors.textSecondary}
            />
            <Text style={styles.requestTime}>
              {hoursRemaining}h {minutesRemaining}m remaining
            </Text>
          </View>
        )}

        <View style={styles.requestActions}>
          {!isExpired && (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.requestActionButton,
                  pressed && styles.actionButtonPressed,
                ]}
                onPress={() => handleEditRequest(request)}
              >
                <IconSymbol
                  ios_icon_name="pencil"
                  android_material_icon_name="edit"
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.requestActionText}>Edit</Text>
              </Pressable>

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
            </>
          )}

          {isExpired && (
            <Pressable
              style={({ pressed }) => [
                styles.requestActionButton,
                pressed && styles.actionButtonPressed,
              ]}
              onPress={() => handleRepostRequest(request)}
            >
              <IconSymbol
                ios_icon_name="arrow.clockwise"
                android_material_icon_name="refresh"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.requestActionText}>Repost</Text>
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.requestActionButton,
              pressed && styles.actionButtonPressed,
            ]}
            onPress={() => handleDeleteRequest(request.id)}
          >
            <IconSymbol
              ios_icon_name="trash.fill"
              android_material_icon_name="delete"
              size={20}
              color="#F44336"
            />
            <Text style={[styles.requestActionText, { color: '#F44336' }]}>Delete</Text>
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
    const expiresAt = new Date(created.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days
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
    const expiryInfo = getExpiryInfo(video.created_at);

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
          source={{ uri: getVideoThumbnailUrl(video.video_url) }}
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
              <Text style={styles.videoStatText}>{formatCount(video.likes_count || 0)}</Text>
            </View>

            <View style={styles.videoStat}>
              <IconSymbol
                ios_icon_name="bubble.left.fill"
                android_material_icon_name="chat-bubble"
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.videoStatText}>{formatCount(video.comments_count || 0)}</Text>
            </View>

            <View style={styles.videoStat}>
              <IconSymbol
                ios_icon_name="arrowshape.turn.up.right.fill"
                android_material_icon_name="share"
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.videoStatText}>{formatCount(video.shares_count || 0)}</Text>
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
              onPress={() => handleSaveVideo(video.video_url, video.id)}
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

            <ScrollView contentContainerStyle={styles.videosGrid}>
              {videos.map((video, index) => renderVideoCard(video, index))}
            </ScrollView>
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
            {pendingUploads.map((upload) => (
              <Pressable
                key={upload.id}
                style={({ pressed }) => [
                  styles.pendingCard,
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={styles.pendingHeader}>
                  <Text style={styles.pendingCaption}>{upload.caption || 'Untitled'}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getModerationStatusColor(upload.status) },
                    ]}
                  >
                    <Text style={styles.statusText}>{upload.status}</Text>
                  </View>
                </View>

                <Text style={styles.pendingDate}>{formatDate(upload.created_at)}</Text>

                {upload.status === 'uploading' && upload.upload_progress !== undefined && (
                  <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${upload.upload_progress}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressText}>{upload.upload_progress}%</Text>
                  </View>
                )}

                {upload.status === 'uploading' && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.cancelButton,
                      pressed && styles.actionButtonPressed,
                    ]}
                    onPress={() => handleCancelPendingUpload(upload.id)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel Upload</Text>
                  </Pressable>
                )}
              </Pressable>
            ))}
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
          <ScrollView contentContainerStyle={styles.videosGrid}>
            {likedVideos.map((video, index) => (
              <Pressable
                key={video.id}
                style={({ pressed }) => [
                  styles.videoCard,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => handleVideoPress(video, index, likedVideos)}
              >
                <Image
                  source={{ uri: getVideoThumbnailUrl(video.video_url) }}
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
                      <Text style={styles.videoStatText}>{formatCount(video.likes_count || 0)}</Text>
                    </View>

                    <View style={styles.videoStat}>
                      <IconSymbol
                        ios_icon_name="bubble.left.fill"
                        android_material_icon_name="chat-bubble"
                        size={16}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.videoStatText}>{formatCount(video.comments_count || 0)}</Text>
                    </View>
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.unlikeButton,
                      pressed && styles.actionButtonPressed,
                    ]}
                    onPress={() => handleUnlikeVideo(video.id)}
                  >
                    <IconSymbol
                      ios_icon_name="heart.slash.fill"
                      android_material_icon_name="heart-broken"
                      size={24}
                      color="#F44336"
                    />
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </ScrollView>
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
              <Text style={styles.emptySubtext}>Create a request to see it here</Text>
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
                      <Pressable onPress={() => handleNotificationAvatarPress(notification)}>
                        <Image
                          source={{
                            uri: notification.users?.avatar_url || 'https://via.placeholder.com/40',
                          }}
                          style={styles.notificationAvatar}
                        />
                      </Pressable>

                      <View style={styles.notificationContent}>
                        <Text style={styles.notificationMessage}>{notification.message}</Text>
                        <Text style={styles.notificationTime}>
                          {formatDate(notification.created_at)}
                        </Text>
                      </View>
                    </Pressable>
                  </Swipeable>
                ))}
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

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={[colors.background, colors.background]} style={styles.gradient}>
        <ScrollView>
          {/* Profile Header */}
          <View style={styles.header}>
            <Pressable onPress={handleChangeAvatar}>
              <Image
                source={{
                  uri: profile.avatar_url || 'https://via.placeholder.com/100',
                }}
                style={styles.avatar}
              />
              <View style={styles.avatarEditIcon}>
                <IconSymbol
                  ios_icon_name="camera.fill"
                  android_material_icon_name="camera"
                  size={16}
                  color="#FFF"
                />
              </View>
            </Pressable>

            <Text style={styles.displayName}>{profile.display_name || profile.username}</Text>
            <Text style={styles.username}>@{profile.username}</Text>

            {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

            {profile.location && (
              <View style={styles.locationContainer}>
                <IconSymbol
                  ios_icon_name="location.fill"
                  android_material_icon_name="location-on"
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={styles.location}>{profile.location}</Text>
              </View>
            )}

            {/* Stats */}
            <View style={styles.stats}>
              <Pressable style={styles.stat} onPress={handleNavigateToVideosTab}>
                <Text style={styles.statValue}>{formatCount(profile.videos_count || 0)}</Text>
                <Text style={styles.statLabel}>Videos</Text>
              </Pressable>

              <Pressable
                style={styles.stat}
                onPress={() => handleNavigateToFollowersList('followers')}
              >
                <Text style={styles.statValue}>{formatCount(profile.followers_count || 0)}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </Pressable>

              <Pressable
                style={styles.stat}
                onPress={() => handleNavigateToFollowersList('following')}
              >
                <Text style={styles.statValue}>{formatCount(profile.following_count || 0)}</Text>
                <Text style={styles.statLabel}>Following</Text>
              </Pressable>

              <Pressable style={styles.stat} onPress={handleNavigateToLikedTab}>
                <Text style={styles.statValue}>{formatCount(likedVideos.length)}</Text>
                <Text style={styles.statLabel}>Likes</Text>
              </Pressable>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <Pressable style={styles.editButton} onPress={handleEditProfile}>
                <IconSymbol
                  ios_icon_name="pencil"
                  android_material_icon_name="edit"
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.editButtonText}>Edit Profile</Text>
              </Pressable>

              <Pressable style={styles.signOutButton} onPress={handleSignOut}>
                <IconSymbol
                  ios_icon_name="arrow.right.square"
                  android_material_icon_name="logout"
                  size={20}
                  color="#F44336"
                />
              </Pressable>
            </View>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, activeTab === 'videos' && styles.activeTab]}
              onPress={() => setActiveTab('videos')}
            >
              <IconSymbol
                ios_icon_name="play.rectangle.fill"
                android_material_icon_name="videocam"
                size={24}
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
              style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
              onPress={() => setActiveTab('pending')}
            >
              <IconSymbol
                ios_icon_name="clock.fill"
                android_material_icon_name="schedule"
                size={24}
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
              style={[styles.tab, activeTab === 'liked' && styles.activeTab]}
              onPress={() => setActiveTab('liked')}
            >
              <IconSymbol
                ios_icon_name="heart.fill"
                android_material_icon_name="favorite"
                size={24}
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
              style={[styles.tab, activeTab === 'requests' && styles.activeTab]}
              onPress={() => setActiveTab('requests')}
            >
              <IconSymbol
                ios_icon_name="questionmark.circle.fill"
                android_material_icon_name="help"
                size={24}
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
              style={[styles.tab, activeTab === 'notifications' && styles.activeTab]}
              onPress={() => setActiveTab('notifications')}
            >
              <View>
                <IconSymbol
                  ios_icon_name="bell.fill"
                  android_material_icon_name="notifications"
                  size={24}
                  color={activeTab === 'notifications' ? colors.primary : colors.textSecondary}
                />
                {unreadNotificationsCount > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                    </Text>
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

          {/* Select Mode Toggle */}
          {activeTab === 'videos' && videos.length > 0 && !isSelectMode && (
            <View style={styles.selectModeContainer}>
              <Pressable style={styles.selectModeButton} onPress={toggleSelectMode}>
                <IconSymbol
                  ios_icon_name="checkmark.circle"
                  android_material_icon_name="check-circle"
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.selectModeText}>Select</Text>
              </Pressable>
            </View>
          )}

          {/* Content */}
          {renderContent()}
        </ScrollView>

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
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Display Name</Text>
                  <TextInput
                    style={styles.input}
                    value={editedProfile.display_name || ''}
                    onChangeText={(text) =>
                      setEditedProfile({ ...editedProfile, display_name: text })
                    }
                    placeholder="Enter display name"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>

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

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Interests</Text>
                  <View style={styles.categoriesContainer}>
                    {AVAILABLE_CATEGORIES.map((category) => (
                      <Pressable
                        key={category}
                        style={[
                          styles.categoryChip,
                          (editedProfile.categories || []).includes(category) &&
                            styles.categoryChipSelected,
                        ]}
                        onPress={() => toggleCategory(category)}
                      >
                        <Text
                          style={[
                            styles.categoryChipText,
                            (editedProfile.categories || []).includes(category) &&
                              styles.categoryChipTextSelected,
                          ]}
                        >
                          {category}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* Video Modal */}
        <Modal
          visible={videoModalVisible}
          animationType="fade"
          presentationStyle="fullScreen"
          onRequestClose={handleCloseVideoModal}
        >
          <SafeAreaView style={styles.videoModalContainer}>
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
                    />
                  </View>
                )}
                keyExtractor={(item) => item.id}
                pagingEnabled
                showsVerticalScrollIndicator={false}
                initialScrollIndex={selectedVideoIndex}
                getItemLayout={(data, index) => ({
                  length: Dimensions.get('window').height,
                  offset: Dimensions.get('window').height * index,
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
          </SafeAreaView>
        </Modal>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    alignItems: 'center',
    padding: 20,
    paddingTop: 10,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  avatarEditIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  displayName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 12,
  },
  username: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 4,
  },
  bio: {
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  location: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
    paddingHorizontal: 20,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
  },
  editButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  signOutButton: {
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 12,
  },
  videoCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
  pendingContainer: {
    padding: 16,
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
    elevation: 3,
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
  progressBar: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  cancelButton: {
    backgroundColor: '#F44336',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  requestsContainer: {
    padding: 16,
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
    elevation: 3,
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
  requestActionText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  notificationsContainer: {
    flex: 1,
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
  notificationAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
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
    height: Dimensions.get('window').height,
  },
});
