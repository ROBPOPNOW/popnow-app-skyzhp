
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
import { router } from 'expo-router';
import * as Location from 'expo-location';
import LeafletMap from '@/components/LeafletMap';
import VideoFeedItem from '@/components/VideoFeedItem';
import { VideoPost } from '@/types/video';
import { requestLocationPermission } from '@/utils/permissions';

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

  useEffect(() => {
    initializeMap();
    
    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, []);

  const initializeMap = useCallback(async () => {
    try {
      console.log('=== INITIALIZING MAP ===');
      
      // Request location permission with custom dialog (only once)
      if (!hasRequestedPermission.current) {
        hasRequestedPermission.current = true;
        const permissionResult = await requestLocationPermission();
        
        if (!permissionResult.granted) {
          console.log('Location permission not granted, using default location');
          // Set a default location (e.g., San Francisco)
          setUserLocation({
            latitude: 37.7749,
            longitude: -122.4194,
          });
        } else {
          // Get user location
          await getCurrentLocation();
        }
      } else {
        // Permission already requested, just get location
        await getCurrentLocation();
      }
      
      // Load video locations
      await loadVideoLocations();
      
      // Start location tracking
      startLocationTracking();
      
      isInitialLoad.current = false;
    } catch (error) {
      console.error('Error initializing map:', error);
      setIsLoading(false);
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
            console.log('Location updated');
            setUserLocation({
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
      console.log('Getting current location...');
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission not granted');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      
      console.log('User location obtained:', coords);
      setUserLocation(coords);
    } catch (error) {
      console.error('Error getting location:', error);
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
      setIsLoading(true);
      console.log('=== LOADING VIDEO LOCATIONS ===');

      // Calculate the timestamp for 1 hour ago
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      const oneHourAgoISO = oneHourAgo.toISOString();

      console.log('Loading videos created after:', oneHourAgoISO);

      // Load approved videos with location (only within last hour)
      const { data: videos, error: videosError } = await supabase
        .from('videos')
        .select('*')
        .eq('moderation_status', 'approved')
        .gte('created_at', oneHourAgoISO)
        .not('location_latitude', 'is', null)
        .not('location_longitude', 'is', null);

      if (videosError) {
        console.error('Error loading videos:', videosError);
        throw videosError;
      }

      // Load open video requests
      const { data: requests, error: requestsError } = await supabase
        .from('video_requests')
        .select('*')
        .eq('status', 'open')
        .gt('expires_at', new Date().toISOString());

      if (requestsError) {
        console.error('Error loading requests:', requestsError);
      }

      console.log('✅ Videos loaded:', videos?.length || 0);
      console.log('✅ Requests loaded:', requests?.length || 0);

      if (videos && videos.length > 0) {
        console.log('Sample video data:', {
          id: videos[0].id,
          lat: videos[0].location_latitude,
          lng: videos[0].location_longitude,
          privacy: videos[0].location_privacy,
          caption: videos[0].caption
        });
      }

      // Process videos into locations and heatmap data
      const locations: VideoLocation[] = [];
      const heatPoints: HeatmapPoint[] = [];

      // Process each video individually - create a unique marker for each
      videos?.forEach((video) => {
        const lat = video.location_latitude;
        const lon = video.location_longitude;
        const privacyRadius = video.location_privacy || 'exact';

        // Validate coordinates
        if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
          console.warn('Invalid coordinates for video:', video.id);
          return;
        }

        // Generate display coordinates based on privacy
        let displayLat = lat;
        let displayLon = lon;
        
        if (privacyRadius === '3km') {
          const randomPoint = getRandomPointInRadius(lat, lon, 3);
          displayLat = randomPoint.latitude;
          displayLon = randomPoint.longitude;
        } else if (privacyRadius === '10km') {
          const randomPoint = getRandomPointInRadius(lat, lon, 10);
          displayLat = randomPoint.latitude;
          displayLon = randomPoint.longitude;
        }

        // Create a unique marker for each video
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

        // Add to heatmap data (use actual location for heatmap)
        heatPoints.push({
          latitude: lat,
          longitude: lon,
          intensity: 1,
        });

        console.log(`✅ Created marker for video ${video.id} at [${displayLat.toFixed(4)}, ${displayLon.toFixed(4)}]`);
      });

      // Add video requests as markers
      requests?.forEach((request) => {
        const lat = request.location_latitude;
        const lon = request.location_longitude;
        const locationType = request.location_type || 'exact';

        // Validate coordinates
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

        console.log(`✅ Created marker for request ${request.id} at [${displayLat.toFixed(4)}, ${displayLon.toFixed(4)}]`);
      });

      console.log('=== FINAL MARKER COUNT ===');
      console.log('Total markers:', locations.length);
      console.log('Heatmap points:', heatPoints.length);
      
      if (locations.length > 0) {
        console.log('First 3 markers:', locations.slice(0, 3).map(l => ({
          id: l.id,
          lat: l.latitude.toFixed(4),
          lng: l.longitude.toFixed(4),
          title: l.title
        })));
      }
      
      setVideoLocations(locations);
      setHeatmapData(heatPoints);
      
      console.log('=== STATE UPDATED ===');
    } catch (error) {
      console.error('Error in loadVideoLocations:', error);
      Alert.alert('Error', 'Failed to load video locations');
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh map function
  const handleRefreshMap = async () => {
    try {
      console.log('=== REFRESHING MAP ===');
      setIsRefreshing(true);
      
      // Reload video locations
      await loadVideoLocations();
      
      // Optionally refresh user location
      await getCurrentLocation();
      
      console.log('✅ Map refreshed successfully');
    } catch (error) {
      console.error('Error refreshing map:', error);
      Alert.alert('Error', 'Failed to refresh map');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleMarkerPress = useCallback(async (markerId: string, videoIds: string[]) => {
    try {
      console.log('=== MARKER PRESSED ===');
      console.log('Marker ID:', markerId);
      console.log('Video IDs:', videoIds);

      // Check if it's a request marker
      if (markerId.startsWith('request_')) {
        const requestId = markerId.replace('request_', '');
        router.push({
          pathname: '/request-details',
          params: { requestId },
        });
        return;
      }

      // Validate videoIds
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

      console.log('Loading videos with IDs:', validVideoIds);

      // Get current user to check liked videos
      const { data: { user } } = await supabase.auth.getUser();

      // Calculate the timestamp for 1 hour ago
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      const oneHourAgoISO = oneHourAgo.toISOString();

      // Load videos with user information (only within last hour)
      const { data: videos, error } = await supabase
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
        .in('id', validVideoIds)
        .eq('moderation_status', 'approved')
        .gte('created_at', oneHourAgoISO);

      if (error) {
        console.error('Error loading videos:', error);
        Alert.alert('Error', 'Failed to load videos');
        return;
      }

      if (videos && videos.length > 0) {
        console.log('✅ Loaded', videos.length, 'videos');
        console.log('Sample video user data:', videos[0].users);
        
        // Get liked videos for current user
        let likedVideoIds: string[] = [];
        if (user) {
          const { data: likes } = await supabase
            .from('likes')
            .select('video_id')
            .eq('user_id', user.id);
          
          likedVideoIds = likes?.map(like => like.video_id) || [];
        }

        // Transform data to match VideoPost interface
        const transformedVideos = videos.map(video => ({
          ...video,
          videoUrl: video.video_url,
          latitude: video.location_latitude,
          longitude: video.location_longitude,
          locationName: video.location_name,
          locationPrivacy: video.location_privacy,
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

        setSelectedVideos(transformedVideos as VideoPost[]);
        setActiveVideoIndex(0);
        setModalVisible(true);
      } else {
        Alert.alert('No Videos', 'No videos found at this location');
      }
    } catch (error) {
      console.error('Error in handleMarkerPress:', error);
      Alert.alert('Error', 'Failed to load videos');
    }
  }, []);

  const handleLocateMe = async () => {
    console.log('Locate me pressed');
    const permissionResult = await requestLocationPermission();
    if (permissionResult.granted) {
      await getCurrentLocation();
    }
  };

  const handleMapDoubleTap = async (location: { latitude: number; longitude: number }) => {
    console.log('Map double-tapped at:', location);
    
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

  // INSTANT modal close
  const handleCloseModal = useCallback(() => {
    console.log('🚀 Closing video modal INSTANTLY');
    setModalVisible(false);
    setSelectedVideos([]);
    setActiveVideoIndex(0);
  }, []);

  // FIXED: Swipe to exit gesture handler with correct activeOffsetX
  const handleModalSwipe = useCallback(({ nativeEvent }: any) => {
    if (nativeEvent.state === State.ACTIVE) {
      const { translationX, velocityX } = nativeEvent;
      
      // Detect swipe to the right
      if (translationX > 50 || velocityX > 100) {
        console.log('⚡ Swipe detected - closing modal');
        handleCloseModal();
      }
    }
  }, [handleCloseModal]);

  const handleLike = async (videoId: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
      } else {
        await supabase.from('likes').insert({ video_id: videoId, user_id: user.id });
        
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
      }

      // Update local state
      setSelectedVideos((prev) =>
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
    console.log('Video viewed in map modal:', videoId);
  };

  // FIXED: Handle avatar press with immediate modal close
  const handleAvatarPress = useCallback((userId: string) => {
    console.log('🎯 Avatar pressed for user:', userId);
    
    // Close modal IMMEDIATELY
    setModalVisible(false);
    
    // Small delay to ensure modal is closed before navigation
    setTimeout(() => {
      console.log('🚀 Navigating to user profile:', userId);
      router.push({
        pathname: '/user-profile',
        params: { userId },
      });
      
      // Clear selected videos after navigation
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
        <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
          <Text style={styles.headerTitle}>Map</Text>
          <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.searchButton}>
            <IconSymbol name="magnifyingglass" size={24} color="#FFFFFF" />
          </Pressable>
        </LinearGradient>
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
        <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
          <Text style={styles.headerTitle}>Map</Text>
          <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.searchButton}>
            <IconSymbol name="magnifyingglass" size={24} color="#FFFFFF" />
          </Pressable>
        </LinearGradient>

        <LeafletMap
          markers={videoLocations}
          center={userLocation || undefined}
          zoom={12}
          onMarkerPress={handleMarkerPress}
          onLocateMePress={handleLocateMe}
          onDoubleTap={handleMapDoubleTap}
          showHeatmap={true}
          heatmapData={heatmapData}
          userLocation={userLocation}
        />

        {/* UPDATED: Fixed refresh button positioned ABOVE the Locate Me button */}
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
                {/* REMOVED: Close button - swipe-to-exit only */}

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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  searchButton: {
    padding: 8,
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
  // UPDATED: Refresh button positioned ABOVE the Locate Me button (bottom: 180)
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
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
    zIndex: 1000,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
