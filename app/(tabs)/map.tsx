import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  Dimensions,
  FlatList,
  ViewToken
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';
import * as Location from 'expo-location';
import LeafletMap from '@/components/LeafletMap';
import VideoFeedItem from '@/components/VideoFeedItem';
import { VideoPost } from '@/types/video';
import { requestLocationPermission } from '@/utils/permissions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAdManager } from '@/hooks/useAdManager';
import { router, useLocalSearchParams } from 'expo-router';

interface VideoLocation {
  id: string;
  videoIds: string[];
  latitude: number;
  longitude: number;
  title: string;
  videoCount: number;
  privacyRadius?: 'exact' | '3km' | '10km';
  isRequest?: boolean;
}

interface HeatmapPoint {
  latitude: number;
  longitude: number;
  intensity: number;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MapScreen() {
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const [initialMapCenter, setInitialMapCenter] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [hasInitializedMap, setHasInitializedMap] = useState(false);

  const [videoLocations, setVideoLocations] = useState<VideoLocation[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState<VideoPost[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const locationSubscription = useRef<any>(null);
  const isInitialLoad = useRef(true);
  const swipeGestureRef = useRef<PanGestureHandler>(null);
  const hasRequestedPermission = useRef(false);
  const [isGpsReady, setIsGpsReady] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const params = useLocalSearchParams();
  const [mapZoomLevel, setMapZoomLevel] = useState<'world' | 'country' | 'city'>('city');
  const [showLegend, setShowLegend] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const { trackVideoView } = useAdManager(isPremium);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    initializeMap();

    return () => {
      mountedRef.current = false;
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
      if (userLocation) {
        AsyncStorage.setItem('cached_location', JSON.stringify({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          timestamp: Date.now(),
        })).catch(err => console.log('Failed to cache location:', err));
      }
    };
  }, []);

  // Handle deep link to specific request from notification
  useEffect(() => {
    if (params.requestId && videoLocations.length > 0) {
      const requestMarkerId = `request_${params.requestId}`;
      const requestMarker = videoLocations.find(loc => loc.id === requestMarkerId);

      if (requestMarker) {
        console.log('📍 Zooming to request from notification:', params.requestId);
        if (mountedRef.current) setUserLocation({
          latitude: requestMarker.latitude,
          longitude: requestMarker.longitude,
        });

        setTimeout(() => {
          router.push({
            pathname: '/request-details',
            params: { requestId: params.requestId as string },
          });
        }, 500);
      }
    }
  }, [params.requestId, videoLocations]);

  const initializeMap = useCallback(async () => {
    try {
      if (!mountedRef.current) return;

      // ⭐ Get user's premium status
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userData } = await supabase
          .from('users')
          .select('is_premium')
          .eq('id', user.id)
          .single();

        if (mountedRef.current) setIsPremium(userData?.is_premium || false);
      }

      // ⚡ STEP 0: Check if navigating from feed with video location (HIGHEST PRIORITY)
      if (params.centerLat && params.centerLng && params.fromFeed === 'true') {
        const centerLat = parseFloat(params.centerLat as string);
        const centerLng = parseFloat(params.centerLng as string);

        if (!isNaN(centerLat) && !isNaN(centerLng)) {
          const videoCenter = { latitude: centerLat, longitude: centerLng };
          if (mountedRef.current) setInitialMapCenter(videoCenter);
          if (mountedRef.current) setHasInitializedMap(true);
          if (mountedRef.current) setIsGpsReady(true);

          if (!hasRequestedPermission.current) {
            hasRequestedPermission.current = true;
            const permissionResult = await requestLocationPermission();
            if (permissionResult.granted) {
              if (mountedRef.current) setLocationDenied(false);

              try {
                const location = await Location.getCurrentPositionAsync({
                  accuracy: Location.Accuracy.Balanced,
                });

                const coords = {
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                };

                if (mountedRef.current) setUserLocation(coords);
              } catch (error) {
                console.error('Error getting GPS location:', error);
              }
            } else {
              if (mountedRef.current) setLocationDenied(true);
            }
          }

          await loadVideoLocations();
          startLocationTracking();
          isInitialLoad.current = false;
          return;
        }
      }

      // ⚡ STEP 1: Try to load cached location FIRST
      try {
        const cached = await AsyncStorage.getItem('cached_location');
        if (cached) {
          const cachedData = JSON.parse(cached);
          if (Date.now() - cachedData.timestamp < 86400000) {
            console.log('✅ Using cached location');
            const cachedLocation = {
              latitude: cachedData.latitude,
              longitude: cachedData.longitude,
            };
            if (mountedRef.current) setUserLocation(cachedLocation);
            if (mountedRef.current) setInitialMapCenter(cachedLocation);
            if (mountedRef.current) setHasInitializedMap(true);
          }
        }
      } catch (error) {
        // ignore cache errors
      }

      // ⚡ STEP 2: If no cache, use default location (Auckland)
      if (!userLocation) {
        const defaultLocation = {
          latitude: -36.8485,
          longitude: 174.7633,
        };
        if (mountedRef.current) setUserLocation(defaultLocation);
        if (mountedRef.current) setInitialMapCenter(defaultLocation);
        if (mountedRef.current) setHasInitializedMap(true);
      }

      // ⚡ STEP 3: Load videos in parallel with GPS
      const loadVideosPromise = loadVideoLocations();

      // ⚡ STEP 4: Start GPS in background (non-blocking)
      if (!hasRequestedPermission.current) {
        hasRequestedPermission.current = true;
        requestLocationPermission().then((permissionResult) => {
          if (permissionResult.granted) {
            if (mountedRef.current) setLocationDenied(false);
            getCurrentLocation();
          } else {
            if (mountedRef.current) setLocationDenied(true);
          }
        });
      } else {
        const Location = require('expo-location');
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          if (mountedRef.current) setLocationDenied(false);
          getCurrentLocation();
        } else {
          if (mountedRef.current) setLocationDenied(true);
        }
      }

      // ⚡ STEP 5: Wait for videos to load
      await loadVideosPromise;

      startLocationTracking();

      isInitialLoad.current = false;
    } catch (error) {
      console.error('Error initializing map:', error);
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  const startLocationTracking = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        locationSubscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000,
            distanceInterval: 50,
          },
          (location) => {
            if (mountedRef.current) setUserLocation({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
          }
        );
      }
    } catch (error) {
      console.error('Error starting location tracking:', error);
    }
  };

  const getCurrentLocation = async () => {
    try {
      if (mountedRef.current) setIsGpsReady(false);

      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      if (mountedRef.current) setUserLocation(coords);
      if (mountedRef.current) setIsGpsReady(true);

      if (!hasInitializedMap) {
        if (mountedRef.current) setInitialMapCenter(coords);
        if (mountedRef.current) setHasInitializedMap(true);
      }

      AsyncStorage.setItem('cached_location', JSON.stringify({
        latitude: coords.latitude,
        longitude: coords.longitude,
        timestamp: Date.now(),
      })).catch(err => console.log('Failed to cache location:', err));
    } catch (error) {
      console.error('Error getting location:', error);
      if (mountedRef.current) setIsGpsReady(false);
    }
  };

  const getRandomPointInRadius = useCallback((lat: number, lon: number, radiusKm: number) => {
    const radiusInDegrees = radiusKm / 111.32;
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.random() * radiusInDegrees;

    const newLat = lat + (distance * Math.cos(angle));
    const newLon = lon + (distance * Math.sin(angle)) / Math.cos(lat * Math.PI / 180);

    return { latitude: newLat, longitude: newLon };
  }, []);

  const loadVideoLocations = async () => {
    try {
      if (isInitialLoad.current) {
        if (mountedRef.current) setIsLoading(true);
      }

      let blockedUserIds: string[] = [];
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: blockedData } = await supabase
          .from('blocked_users')
          .select('blocked_id')
          .eq('blocker_id', user.id);

        const { data: blockedByData } = await supabase
          .from('blocked_users')
          .select('blocker_id')
          .eq('blocked_id', user.id);

        blockedUserIds = [
          ...(blockedData?.map(b => b.blocked_id) || []),
          ...(blockedByData?.map(b => b.blocker_id) || []),
        ];
      }

      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      const oneHourAgoISO = oneHourAgo.toISOString();

      const [videosResult, requestsResult] = await Promise.all([
        supabase
          .from('videos')
          .select('*')
          .eq('moderation_status', 'approved')
          .gte('created_at', oneHourAgoISO)
          .not('location_latitude', 'is', null)
          .not('location_longitude', 'is', null),

        supabase
          .from('video_requests')
          .select('*')
          .eq('status', 'open')
          .gt('expires_at', new Date().toISOString())
      ]);

      const videos = videosResult.data;
      const requests = requestsResult.data;

      if (videosResult.error) {
        console.error('Error loading videos:', videosResult.error);
        throw videosResult.error;
      }

      if (requestsResult.error) {
        console.error('Error loading requests:', requestsResult.error);
      }

      const locations: VideoLocation[] = [];
      const heatPoints: HeatmapPoint[] = [];

      const filteredVideos = blockedUserIds.length > 0
        ? (videos || []).filter(v => !blockedUserIds.includes(v.user_id))
        : (videos || []);

      filteredVideos.forEach((video) => {
        const lat = video.location_latitude;
        const lon = video.location_longitude;
        const privacyRadius = video.location_privacy || 'exact';

        if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
          console.warn('Invalid coordinates for video:', video.id);
          return;
        }

        let displayLat = lat;
        let displayLon = lon;

        const isVideoFromFeed = params.videoId === video.id && params.fromFeed === 'true';

        if (isVideoFromFeed && params.centerLat && params.centerLng) {
          displayLat = parseFloat(params.centerLat as string);
          displayLon = parseFloat(params.centerLng as string);
        } else {
          if (privacyRadius === '3km') {
            const randomPoint = getRandomPointInRadius(lat, lon, 3);
            displayLat = randomPoint.latitude;
            displayLon = randomPoint.longitude;
          } else if (privacyRadius === '10km') {
            const randomPoint = getRandomPointInRadius(lat, lon, 10);
            displayLat = randomPoint.latitude;
            displayLon = randomPoint.longitude;
          }
        }

        const locationKey = `video_${video.id}`;

        locations.push({
          id: locationKey,
          videoIds: [video.id],
          latitude: displayLat,
          longitude: displayLon,
          title: video.location_name || video.caption || 'Video Location',
          videoCount: 1,
          privacyRadius: privacyRadius as 'exact' | '3km' | '10km',
          isRequest: false,
        });

        heatPoints.push({
          latitude: lat,
          longitude: lon,
          intensity: 1,
        });
      });

      requests?.forEach((request) => {
        const lat = request.location_latitude;
        const lon = request.location_longitude;
        const locationType = request.location_type || 'exact';

        if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
          console.warn('Invalid coordinates for request:', request.id);
          return;
        }

        let displayLat = lat;
        let displayLon = lon;

        if (locationType === '3km') {
          const randomPoint = getRandomPointInRadius(lat, lon, 3);
          displayLat = randomPoint.latitude;
          displayLon = randomPoint.longitude;
        } else if (locationType === '10km') {
          const randomPoint = getRandomPointInRadius(lat, lon, 10);
          displayLat = randomPoint.latitude;
          displayLon = randomPoint.longitude;
        }

        const locationKey = `request_${request.id}`;

        locations.push({
          id: locationKey,
          videoIds: [request.id],
          latitude: displayLat,
          longitude: displayLon,
          title: request.description || request.address || 'Video Request',
          videoCount: 0,
          privacyRadius: locationType as 'exact' | '3km' | '10km',
          isRequest: true,
        });
      });

      if (mountedRef.current) setVideoLocations(locations);
      if (mountedRef.current) setHeatmapData(heatPoints);

    } catch (error) {
      console.error('Error in loadVideoLocations:', error);
      Alert.alert('Error', 'Failed to load video locations');
    } finally {
      if (isInitialLoad.current && mountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleRefreshMap = async () => {
    try {
      if (mountedRef.current) setIsRefreshing(true);
      await loadVideoLocations();
    } catch (error) {
      console.error('Error refreshing map:', error);
      Alert.alert('Error', 'Failed to refresh map');
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  };

  const handleMarkerPress = useCallback(async (markerId: string, videoIds: string[]) => {
    try {
      if (markerId.startsWith('request_')) {
        const requestId = markerId.replace('request_', '');
        router.push({
          pathname: '/request-details',
          params: { requestId },
        });
        return;
      }

      if (!videoIds || videoIds.length === 0) {
        console.error('No video IDs provided');
        Alert.alert('Error', 'No videos found at this location');
        return;
      }

      const validVideoIds = videoIds.filter(id => id != null && id !== '');

      if (validVideoIds.length === 0) {
        console.error('No valid video IDs');
        Alert.alert('Error', 'No videos found at this location');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      const oneHourAgoISO = oneHourAgo.toISOString();

      const { data: videos, error } = await supabase
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
        .in('id', validVideoIds)
        .eq('moderation_status', 'approved')
        .gte('created_at', oneHourAgoISO);

      if (error) {
        console.error('Error loading videos:', error);
        Alert.alert('Error', 'Failed to load videos');
        return;
      }

      if (videos && videos.length > 0) {
        let likedVideoIds: string[] = [];
        if (user) {
          const { data: likes } = await supabase
            .from('likes')
            .select('video_id')
            .eq('user_id', user.id);

          likedVideoIds = likes?.map(like => like.video_id) || [];
        }

        const transformedVideos = videos.map(video => ({
          ...video,
          videoUrl: video.video_url,
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
          likes_count: video.likes_count || 0,
          comments_count: video.comments_count || 0,
          shares_count: video.shares_count || 0,
          views_count: video.views_count || 0,
          comments: video.comments_count || 0,
          likes: video.likes_count || 0,
          shares: video.shares_count || 0,
          isLiked: likedVideoIds.includes(video.id),
          createdAt: video.created_at,
        }));

        if (mountedRef.current) setSelectedVideos(transformedVideos as VideoPost[]);
        if (mountedRef.current) setActiveVideoIndex(0);
        if (mountedRef.current) setModalVisible(true);
      } else {
        Alert.alert('No Videos', 'No videos found at this location');
      }
    } catch (error) {
      console.error('Error in handleMarkerPress:', error);
      Alert.alert('Error', 'Failed to load videos');
    }
  }, []);

  const handleLocateMe = async () => {
    const permissionResult = await requestLocationPermission();
    if (permissionResult.granted) {
      await getCurrentLocation();
    }
  };

  const handleMapDoubleTap = async (location: { latitude: number; longitude: number }) => {
    try {
      const addresses = await Location.reverseGeocodeAsync({
        latitude: location.latitude,
        longitude: location.longitude,
      });

      let addressString = '';
      if (addresses && addresses.length > 0) {
        const addr = addresses[0];
        addressString = [
          addr.streetNumber,
          addr.street,
          addr.city,
          addr.region,
          addr.country,
        ]
          .filter(Boolean)
          .join(', ');
      }

      router.push({
        pathname: '/(tabs)/request',
        params: {
          latitude: location.latitude.toString(),
          longitude: location.longitude.toString(),
          address: addressString,
          fromDoubleTap: 'true',
        },
      });
    } catch (error) {
      console.error('Error getting address:', error);
      router.push({
        pathname: '/(tabs)/request',
        params: {
          latitude: location.latitude.toString(),
          longitude: location.longitude.toString(),
          fromDoubleTap: 'true',
        },
      });
    }
  };

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    setSelectedVideos([]);
    setActiveVideoIndex(0);
  }, []);

  const handleModalSwipe = useCallback(({ nativeEvent }: any) => {
    if (nativeEvent.state === State.ACTIVE) {
      const { translationX, velocityX } = nativeEvent;
      if (translationX > 50 || velocityX > 100) {
        handleCloseModal();
      }
    }
  }, [handleCloseModal]);

  const handleLike = async (videoId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to like videos');
        return;
      }

      const { data: existingLike } = await supabase
        .from('likes')
        .select('id')
        .eq('video_id', videoId)
        .eq('user_id', user.id)
        .single();

      if (existingLike) {
        await supabase.from('likes').delete().eq('video_id', videoId).eq('user_id', user.id);

        const { data: currentVideo } = await supabase
          .from('videos')
          .select('likes_count')
          .eq('id', videoId)
          .single();

        if (currentVideo) {
          const newCount = Math.max(0, (currentVideo.likes_count || 0) - 1);
          await supabase.from('videos').update({ likes_count: newCount }).eq('id', videoId);

          const channel = supabase.channel(`video:${videoId}:stats`);
          await channel.send({
            type: 'broadcast',
            event: 'stats_updated',
            payload: { video_id: videoId, likes_count: newCount },
          });
        }
      } else {
        await supabase.from('likes').insert({ video_id: videoId, user_id: user.id });

        const { data: currentVideo } = await supabase
          .from('videos')
          .select('likes_count')
          .eq('id', videoId)
          .single();

        if (currentVideo) {
          const newCount = (currentVideo.likes_count || 0) + 1;
          await supabase.from('videos').update({ likes_count: newCount }).eq('id', videoId);

          const channel = supabase.channel(`video:${videoId}:stats`);
          await channel.send({
            type: 'broadcast',
            event: 'stats_updated',
            payload: { video_id: videoId, likes_count: newCount },
          });
        }
      }

      if (mountedRef.current) setSelectedVideos((prev) =>
        prev.map((video) =>
          video.id === videoId
            ? {
                ...video,
                likes_count: existingLike
                  ? Math.max(0, (video.likes_count || 0) - 1)
                  : (video.likes_count || 0) + 1,
                isLiked: !existingLike,
              }
            : video
        )
      );
    } catch (error) {
      console.error('Error liking video:', error);
      Alert.alert('Error', 'Failed to like video');
    }
  };

  const handleViewChange = (videoId: string) => {
    if (typeof trackVideoView === 'function') {
      trackVideoView();
    }
  };

  const handleAvatarPress = useCallback((userId: string) => {
    setModalVisible(false);
    setTimeout(() => {
      router.push({
        pathname: '/user-profile',
        params: { userId },
      });
      setSelectedVideos([]);
      setActiveVideoIndex(0);
    }, 100);
  }, []);

  const renderVideoItem = useCallback(({ item, index }: { item: VideoPost; index: number }) => {
    return (
      <VideoFeedItem
        video={item}
        isActive={index === activeVideoIndex && modalVisible}
        onLike={handleLike}
        onViewChange={handleViewChange}
        userLocation={userLocation}
        onAvatarPress={handleAvatarPress}
        disableLocationTap={true}
      />
    );
  }, [activeVideoIndex, modalVisible, userLocation, handleAvatarPress]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setActiveVideoIndex(viewableItems[0].index);
    }
  }, []);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const keyExtractor = useCallback((item: VideoPost) => item.id, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.searchButtonTopRight}>
          <IconSymbol name="magnifyingglass" size={24} color="#FFFFFF" />
        </Pressable>

        <View style={[
          styles.infoBannerTop,
          (mapZoomLevel === 'world' || mapZoomLevel === 'country') && styles.infoBannerTopPushed
        ]}>
          <IconSymbol
            ios_icon_name="lightbulb.fill"
            android_material_icon_name="lightbulb"
            size={16}
            color="#FFF"
          />
          <Text style={styles.infoBannerText}>
            Can't find what you're looking for? Double-tap to request a video!
          </Text>
        </View>

        <LeafletMap
          key="map-instance"
          markers={videoLocations}
          center={initialMapCenter || undefined}
          zoom={12}
          onMarkerPress={handleMarkerPress}
          onLocateMePress={handleLocateMe}
          onDoubleTap={handleMapDoubleTap}
          showHeatmap={true}
          heatmapData={heatmapData}
          userLocation={locationDenied ? null : userLocation}
          isGpsReady={isGpsReady}
          locationDenied={locationDenied}
          onZoomChange={setMapZoomLevel}
        />

        <Pressable
          style={styles.legendButton}
          onPress={() => setShowLegend(!showLegend)}
        >
          <Text style={styles.legendButtonText}>ⓘ</Text>
        </Pressable>

        {showLegend && (
          <View style={styles.legendPanel}>
            <Text style={styles.legendTitle}>Map Guide</Text>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#FF6B6B' }]} />
              <Text style={styles.legendText}>Exact location video</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#FFD93D' }]} />
              <Text style={styles.legendText}>Within 3km radius (randomised)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#4169E1' }]} />
              <Text style={styles.legendText}>Within 10km radius (randomised)</Text>
            </View>
            <View style={styles.legendItem}>
              <LinearGradient
                colors={['#FF00FF', '#00FFFF', '#FFFF00', '#FF00FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.legendDot}
              />
              <Text style={styles.legendText}>Multiple videos in area</Text>
            </View>
            <View style={styles.legendItem}>
              <Text style={styles.legendEmoji}>🙋</Text>
              <Text style={styles.legendText}>Video request</Text>
            </View>
          </View>
        )}

        <Pressable
          style={styles.refreshButton}
          onPress={handleRefreshMap}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <IconSymbol name="arrow.clockwise" size={24} color="#FFFFFF" />
          )}
        </Pressable>

        <Modal
          visible={modalVisible}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={handleCloseModal}
        >
          <GestureHandlerRootView style={{ flex: 1 }}>
            <PanGestureHandler
              ref={swipeGestureRef}
              onHandlerStateChange={handleModalSwipe}
              activeOffsetX={[-10000, 50]}
              failOffsetY={[-30, 30]}
              enabled={true}
            >
              <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
                <FlatList
                  ref={flatListRef}
                  data={selectedVideos}
                  renderItem={renderVideoItem}
                  keyExtractor={keyExtractor}
                  pagingEnabled
                  showsVerticalScrollIndicator={false}
                  snapToInterval={SCREEN_HEIGHT}
                  snapToAlignment="start"
                  decelerationRate="fast"
                  onViewableItemsChanged={onViewableItemsChanged}
                  viewabilityConfig={viewabilityConfig}
                  removeClippedSubviews={true}
                  maxToRenderPerBatch={2}
                  windowSize={3}
                  initialNumToRender={1}
                />
              </SafeAreaView>
            </PanGestureHandler>
          </GestureHandlerRootView>
        </Modal>
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
    fontSize: 14,
    color: colors.textSecondary,
  },
  refreshButton: {
    position: 'absolute',
    bottom: 180,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
    zIndex: 1000,
  },
  searchButtonTopRight: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 1001,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    padding: 10,
  },
  infoBannerTop: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 80,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 8,
    zIndex: 1000,
  },
  infoBannerTopPushed: {
    top: 135,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 11,
    color: '#FFFFFF',
    lineHeight: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  legendButton: {
    position: 'absolute',
    bottom: 180,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  legendButtonText: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  legendPanel: {
    position: 'absolute',
    bottom: 234,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 12,
    padding: 16,
    zIndex: 1000,
    minWidth: 240,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  legendDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  legendEmoji: {
    fontSize: 20,
    width: 20,
    textAlign: 'center',
  },
  legendText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    flex: 1,
  },
});