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
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';

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
  const lastLoadedAt = useRef<number>(0);
  const [isGpsReady, setIsGpsReady] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const params = useLocalSearchParams();
  const [mapZoomLevel, setMapZoomLevel] = useState<'world' | 'country' | 'city'>('city');
  const [showLegend, setShowLegend] = useState(false);
  const [isDarkMap, setIsDarkMap] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const { trackVideoView } = useAdManager(isPremium);
 const mountedRef = useRef(true);

  useEffect(() => {
    AsyncStorage.getItem('map_theme_dark').then((val) => {
      if (val === 'true') setIsDarkMap(true);
    });
  }, []);

  // 🔄 Reload videos when map tab is focused (if older than 5 minutes)
useFocusEffect(
  useCallback(() => {
    if (!isInitialLoad.current) {
      const fiveMinutes = 5 * 60 * 1000;
      const timeSinceLastLoad = Date.now() - lastLoadedAt.current;
      if (timeSinceLastLoad > fiveMinutes) {
        console.log('🔄 Map focused — reloading videos (5min threshold)');
        loadVideoLocations();
      } else {
        console.log('⚡ Map focused — skipping reload (loaded recently)');
      }
    }
  }, [])
);

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

// ⚡ Handle navigation from feed with video location - runs when params change
  useEffect(() => {
    if (params.videoId && params.fromFeed === 'true') {
      // Focused on a specific video. loadVideoLocations will find it by ID and
      // centre on its privacy-safe display point — no coords needed here.
      if (mountedRef.current) setIsGpsReady(true);
      loadVideoLocations();
    }
  }, [params.videoId, params.fromFeed]);

  // 🔔 Handle daily digest notification tap
  useEffect(() => {
    if (params.zoom) {
      const zoomLevel = parseInt(params.zoom as string);
      if (!isNaN(zoomLevel)) {
        if (zoomLevel <= 3) {
          // World view — clear center so map shows world
          if (mountedRef.current) setInitialMapCenter(null);
        } else if (params.focusLatitude && params.focusLongitude) {
          // Single video — center on that location
          const lat = parseFloat(params.focusLatitude as string);
          const lng = parseFloat(params.focusLongitude as string);
          if (!isNaN(lat) && !isNaN(lng)) {
            if (mountedRef.current) setInitialMapCenter({ latitude: lat, longitude: lng });
          }
        }
        if (mountedRef.current) setIsGpsReady(true);
        loadVideoLocations();
      }
    }
  }, [params.zoom, params.focusLatitude, params.focusLongitude]);

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

      // ⚡ STEP 0: Check if navigating from feed focused on a video (HIGHEST PRIORITY)
      if (params.videoId && params.fromFeed === 'true') {
        {
          // loadVideoLocations() finds the video by ID and centres on its
          // privacy-safe display point. No coordinates are passed or read here.
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

// ⚡ STEP 1: Try to load cached GPS location FIRST
      let resolvedLocation: { latitude: number; longitude: number } | null = null;
      try {
        const cached = await AsyncStorage.getItem('cached_location');
        if (cached) {
          const cachedData = JSON.parse(cached);
          if (Date.now() - cachedData.timestamp < 86400000) {
            console.log('✅ Using cached GPS location');
            resolvedLocation = {
              latitude: cachedData.latitude,
              longitude: cachedData.longitude,
            };
          }
        }
      } catch (error) {
        // ignore cache errors
      }

      // ⚡ STEP 2: Try cached default city coordinates
      if (!resolvedLocation) {
        try {
          const cachedCity = await AsyncStorage.getItem('default_city_location');
          if (cachedCity) {
            const cityData = JSON.parse(cachedCity);
            console.log('✅ Using cached default city:', cityData.cityName);
            resolvedLocation = {
              latitude: cityData.latitude,
              longitude: cityData.longitude,
            };
          }
        } catch (error) {
          // ignore cache errors
        }
      }

// ⚡ STEP 3: Try geocoding user's profile city live (Nominatim - no permission needed)
      if (!resolvedLocation && user) {
        try {
          const { data: userData } = await supabase
            .from('users')
            .select('location')
            .eq('id', user.id)
            .single();

          if (userData?.location) {
            console.log('📍 Geocoding profile city:', userData.location);
            const encodedCity = encodeURIComponent(userData.location);
            const response = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodedCity}&format=json&limit=1`,
              { headers: { 'User-Agent': 'POPNOW/1.0' } }
            );
            const results = await response.json();
            if (results && results.length > 0) {
              const latitude = parseFloat(results[0].lat);
              const longitude = parseFloat(results[0].lon);
              resolvedLocation = { latitude, longitude };
              console.log('✅ Geocoded city coordinates:', resolvedLocation);
              await AsyncStorage.setItem('default_city_location', JSON.stringify({
                latitude,
                longitude,
                cityName: userData.location,
                timestamp: Date.now(),
              }));
            }
          }
        } catch (error) {
          console.log('⚠️ Geocoding failed:', error);
        }
      }

      // ⚡ STEP 4: Final fallback - world zoom view (no hardcoded city)
      if (!resolvedLocation) {
        console.log('⚠️ No location available - showing world view');
        if (mountedRef.current) setHasInitializedMap(true);
        if (mountedRef.current) setIsGpsReady(true);
      } else {
        // ✅ Set location AND mark GPS ready immediately
        if (mountedRef.current) setUserLocation(resolvedLocation);
        if (mountedRef.current) setInitialMapCenter(resolvedLocation);
        if (mountedRef.current) setHasInitializedMap(true);
        if (mountedRef.current) setIsGpsReady(true);
      }

      // ⚡ STEP 5: Load videos in parallel with GPS
      const loadVideosPromise = loadVideoLocations();

      // ⚡ STEP 6: Start GPS in background (non-blocking)
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
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          if (mountedRef.current) setLocationDenied(false);
          getCurrentLocation();
        } else {
          if (mountedRef.current) setLocationDenied(true);
        }
      }

      // ⚡ STEP 7: Wait for videos to load
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

  // 🔒 Deterministic privacy offset. The same video/request ID always produces
  // the SAME point within the radius, so the pin is stable across reloads.
  // Stability matters for privacy: a pin that re-randomised every load could be
  // averaged over many samples to recover the true centre. True coordinates are
  // only ever used as the hidden anchor for this offset — never displayed.
  const getPrivacyOffsetPoint = useCallback(
    (seed: string, lat: number, lon: number, radiusKm: number) => {
      // FNV-1a hash of the seed → two deterministic pseudo-random values.
      let h = 0x811c9dc5;
      for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      const r1 = ((h >>> 0) % 1000000) / 1000000;
      const h2 = Math.imul(h ^ 0x9e3779b9, 0x85ebca6b);
      const r2 = ((h2 >>> 0) % 1000000) / 1000000;

      const radiusInDegrees = radiusKm / 111.32;
      const angle = r1 * 2 * Math.PI;
      // sqrt keeps the distribution uniform across the disk (no centre clustering).
      const distance = Math.sqrt(r2) * radiusInDegrees;

      const newLat = lat + distance * Math.cos(angle);
      const newLon = lon + (distance * Math.sin(angle)) / Math.cos((lat * Math.PI) / 180);
      return { latitude: newLat, longitude: newLon };
    },
    []
  );

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
      oneHourAgo.setHours(oneHourAgo.getHours() - 24);
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

      // 🔒 If we arrived here focused on a specific video, we'll centre the map
      // on that video's PRIVACY-SAFE display point (computed below), never its
      // true coordinates. Captured during the loop, applied after it.
      let focusedCenter: { latitude: number; longitude: number } | null = null;
      const focusedVideoId =
        params.fromFeed === 'true' && params.videoId ? (params.videoId as string) : null;

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

        // 🔒 Always apply a deterministic privacy offset for 3km/10km videos,
        // no matter how the user reached this screen. 'exact' videos keep their
        // true coordinates (the uploader chose to share them precisely).
        if (privacyRadius === '3km') {
          const p = getPrivacyOffsetPoint(video.id, lat, lon, 3);
          displayLat = p.latitude;
          displayLon = p.longitude;
        } else if (privacyRadius === '10km') {
          const p = getPrivacyOffsetPoint(video.id, lat, lon, 10);
          displayLat = p.latitude;
          displayLon = p.longitude;
        }

        // If this is the video we navigated to, remember its safe display point
        // so we can centre the map on it (matching the pin exactly).
        if (focusedVideoId && video.id === focusedVideoId) {
          focusedCenter = { latitude: displayLat, longitude: displayLon };
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
          const p = getPrivacyOffsetPoint(request.id, lat, lon, 3);
          displayLat = p.latitude;
          displayLon = p.longitude;
        } else if (locationType === '10km') {
          const p = getPrivacyOffsetPoint(request.id, lat, lon, 10);
          displayLat = p.latitude;
          displayLon = p.longitude;
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

      // 🔒 Centre on the focused video's privacy-safe point (if we found it).
      // This runs before loading finishes, so the map opens already centred on
      // the offset location — never the true one.
      if (focusedCenter && mountedRef.current) {
        setInitialMapCenter(focusedCenter);
      }

      if (mountedRef.current) setVideoLocations(locations);
      if (mountedRef.current) setHeatmapData(heatPoints);
      lastLoadedAt.current = Date.now();

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
      oneHourAgo.setHours(oneHourAgo.getHours() - 24);
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

  const handleLike = useCallback((videoId: string, newIsLiked: boolean, newLikesCount: number) => {
    if (!mountedRef.current) return;
    setSelectedVideos(prev => prev.map(v =>
      v.id === videoId
        ? { ...v, isLiked: newIsLiked, likes_count: newLikesCount, likes: newLikesCount }
        : v
    ));
  }, []);

  const handleViewChange = (videoId: string) => {
    if (typeof trackVideoView === 'function') {
      trackVideoView();
    }
  };

const handleAvatarPress = useCallback((userId: string) => {
  if (!mountedRef.current) return;
  setModalVisible(false);
  setTimeout(() => {
    if (!mountedRef.current) return;
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
        {!modalVisible && (
          <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.searchButtonTopLeft}>
            <IconSymbol name="magnifyingglass" size={24} color="#FFFFFF" />
          </Pressable>
        )}

        {!modalVisible && (
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
        )}

        <LeafletMap
          key="map-instance"
          markers={videoLocations}
          center={initialMapCenter || undefined}
          zoom={params.zoom ? parseInt(params.zoom as string) : 12}
          onMarkerPress={handleMarkerPress}
          onLocateMePress={handleLocateMe}
          onDoubleTap={handleMapDoubleTap}
          showHeatmap={true}
          heatmapData={heatmapData}
          userLocation={locationDenied ? null : userLocation}
          isGpsReady={isGpsReady}
          locationDenied={locationDenied}
          onZoomChange={setMapZoomLevel}
          isDarkMode={isDarkMap}
          hideControls={modalVisible}
        />

        {!modalVisible && (
        <>
        <Pressable
          style={styles.legendButton}
          onPress={() => setShowLegend(!showLegend)}
        >
          <Text style={[styles.legendButtonText, { color: isDarkMap ? '#FFFFFF' : '#333333' }]}>ⓘ</Text>
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
          style={styles.themeToggleButton}
          onPress={() => {
            const newVal = !isDarkMap;
            setIsDarkMap(newVal);
            AsyncStorage.setItem('map_theme_dark', String(newVal));
          }}
        >
        <Text style={[styles.themeToggleText, { color: isDarkMap ? '#FFFFFF' : '#333333' }]}>
            {isDarkMap ? '✺' : '☽'}
          </Text>
        </Pressable>

        <Pressable
          style={styles.refreshButton}
          onPress={handleRefreshMap}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <IconSymbol name="arrow.clockwise" size={20} color="#FFFFFF" />
          )}
        </Pressable>
        </>
        )}

        {modalVisible && (
          <GestureHandlerRootView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}>
            <PanGestureHandler
              ref={swipeGestureRef}
              onHandlerStateChange={handleModalSwipe}
              activeOffsetX={[-10000, 50]}
              failOffsetY={[-30, 30]}
              enabled={true}
            >
              <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
                {/* Search button - top left */}
                <Pressable
                  style={styles.modalSearchButton}
                  onPress={() => {
                    handleCloseModal();
                    router.push('/(tabs)/search');
                  }}
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
                  style={styles.modalCloseButton}
                  onPress={handleCloseModal}
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
        )}
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
    bottom: 172,
    right: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 1000,
  },
  searchButtonTopLeft: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 1001,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    padding: 10,
  },
  infoBannerTop: {
    position: 'absolute',
    top: 60,
    left: 80,
    right: 16,
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
themeToggleButton: {
    position: 'absolute',
    top: 110,
    right: 20,
    zIndex: 1001,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeToggleText: {
    fontSize: 22,
  },
legendButton: {
    position: 'absolute',
    bottom: 180,
    left: 20,
    width: 44,
    height: 44,
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
  modalSearchButton: {
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
  modalCloseButton: {
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