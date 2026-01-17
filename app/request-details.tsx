
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';

export default function RequestDetailsScreen() {
  const params = useLocalSearchParams();
  const requestId = params.requestId as string;

  const [request, setRequest] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingLocation, setIsCheckingLocation] = useState(true);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isWithinRange, setIsWithinRange] = useState(false);
  const [distance, setDistance] = useState<number>(0);
  const [fulfillmentCount, setFulfillmentCount] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [isOwnRequest, setIsOwnRequest] = useState(false);

  useEffect(() => {
    // Load request and location in parallel for faster response
    Promise.all([
      loadRequest(),
      getCurrentLocationAndCheck()
    ]);

    // Update time remaining every second
    const interval = setInterval(() => {
      updateTimeRemaining();
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const loadRequest = async () => {
    try {
      setIsLoading(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Load request with user info - specify which relationship to use
      const { data, error } = await supabase
        .from('video_requests')
        .select(`
          *,
          requester:users!video_requests_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('id', requestId)
        .single();

      if (error) {
        console.error('Error loading request:', error);
        Alert.alert('Error', 'Failed to load request');
        return;
      }

      console.log('Request loaded:', data);
      console.log('Requester data:', data.requester);
      setRequest(data);

      // Check if this is the user's own request
      if (user && data.user_id === user.id) {
        setIsOwnRequest(true);
      }

      // Load fulfillment count
      const { count } = await supabase
        .from('request_fulfillments')
        .select('*', { count: 'exact', head: true })
        .eq('request_id', requestId);

      setFulfillmentCount(count || 0);
    } catch (error) {
      console.error('Error in loadRequest:', error);
      Alert.alert('Error', 'Failed to load request');
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentLocationAndCheck = async () => {
    try {
      setIsCheckingLocation(true);
      console.log('Getting current location for range check...');
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission not granted');
        setIsCheckingLocation(false);
        return;
      }

      // Get location with high accuracy for immediate check
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      console.log('User location obtained:', coords);
      setUserLocation(coords);
      
      // Check range immediately after getting location
      if (request) {
        checkIfWithinRangeImmediate(coords, request);
      }
    } catch (error) {
      console.error('Error getting location:', error);
    } finally {
      setIsCheckingLocation(false);
    }
  };

  const checkIfWithinRangeImmediate = (userCoords: { latitude: number; longitude: number }, requestData: any) => {
    if (!requestData || !userCoords) return;

    const dist = calculateDistance(
      userCoords.latitude,
      userCoords.longitude,
      requestData.location_latitude,
      requestData.location_longitude
    );

    setDistance(dist);

    let maxDistance = 0.3; // 300 meters for exact
    if (requestData.location_type === '3km') {
      maxDistance = 3;
    } else if (requestData.location_type === '10km') {
      maxDistance = 10;
    }

    const withinRange = dist <= maxDistance;
    setIsWithinRange(withinRange);
    
    console.log(`Distance: ${dist.toFixed(2)}km, Max: ${maxDistance}km, Within range: ${withinRange}`);
  };

  useEffect(() => {
    // Re-check range when both request and location are available
    if (request && userLocation) {
      checkIfWithinRangeImmediate(userLocation, request);
    }
  }, [request, userLocation]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const toRad = (value: number): number => {
    return (value * Math.PI) / 180;
  };

  const updateTimeRemaining = () => {
    if (!request || !request.expires_at) return;

    const now = new Date();
    const expiresAt = new Date(request.expires_at);
    const diff = expiresAt.getTime() - now.getTime();

    if (diff <= 0) {
      setTimeRemaining('Expired');
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (hours > 0) {
      setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
    } else if (minutes > 0) {
      setTimeRemaining(`${minutes}m ${seconds}s`);
    } else {
      setTimeRemaining(`${seconds}s`);
    }
  };

  const getLocationTypeLabel = (type: string): string => {
    switch (type) {
      case 'exact':
        return 'Exact Location';
      case '3km':
        return '3km radius';
      case '10km':
        return '10km radius';
      default:
        return type;
    }
  };

  const handleTakeRequest = () => {
    if (isCheckingLocation) {
      Alert.alert(
        'Checking Location',
        'Please wait while we verify your location...'
      );
      return;
    }

    if (!isWithinRange) {
      Alert.alert(
        'Too Far Away',
        `You are ${distance.toFixed(2)}km away from the requested location. You need to be within the requested range to fulfill this request.`
      );
      return;
    }

    // Navigate to camera to record video
    router.push({
      pathname: '/record-video',
      params: {
        requestId: request.id,
        requestDescription: request.description,
      },
    });
  };

  const handleEditRequest = () => {
    // Navigate to request page with pre-filled data
    router.push({
      pathname: '/(tabs)/request',
      params: {
        requestId: request.id,
        latitude: request.location_latitude.toString(),
        longitude: request.location_longitude.toString(),
        address: request.address,
        description: request.description,
        locationType: request.location_type,
        duration: request.duration_hours.toString(),
        isEditing: 'true',
      },
    });
  };

  const handleViewFulfillments = () => {
    if (fulfillmentCount === 0) {
      Alert.alert('No Fulfillments', 'No videos have been posted to fulfill this request yet.');
      return;
    }

    // Navigate to fulfillment videos viewer
    router.push({
      pathname: '/fulfillment-videos',
      params: {
        requestId: request.id,
      },
    });
  };

  const handleCancel = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading request...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!request) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <IconSymbol name="exclamationmark.triangle" size={48} color={colors.textSecondary} />
          <Text style={styles.errorText}>Request not found</Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
        <Pressable onPress={handleCancel} style={styles.headerBackButton}>
          <IconSymbol name="chevron.left" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Video Request</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.userInfo}>
              <View style={styles.avatarContainer}>
                {request.requester?.avatar_url ? (
                  <Image 
                    source={{ uri: request.requester.avatar_url }} 
                    style={styles.avatar}
                  />
                ) : (
                  <View style={[
                    styles.avatarPlaceholder,
                    isOwnRequest && styles.ownRequestAvatar
                  ]}>
                    <IconSymbol name="person.fill" size={24} color="#FFFFFF" />
                  </View>
                )}
              </View>
              <View>
                <Text style={styles.userName}>
                  {request.requester?.display_name || request.requester?.username}
                  {isOwnRequest && ' (You)'}
                </Text>
                <Text style={styles.userHandle}>@{request.requester?.username}</Text>
              </View>
            </View>
            <View style={styles.timeRemainingBadge}>
              <IconSymbol name="clock.fill" size={16} color={colors.primary} />
              <Text style={styles.timeRemainingText}>{timeRemaining}</Text>
            </View>
          </View>

          <View style={styles.descriptionSection}>
            <Text style={styles.sectionLabel}>Description</Text>
            <Text style={styles.descriptionText}>{request.description}</Text>
          </View>

          <View style={styles.locationSection}>
            <Text style={styles.sectionLabel}>Location</Text>
            <View style={styles.locationInfo}>
              <IconSymbol name="mappin.circle.fill" size={24} color={colors.primary} />
              <View style={styles.locationDetails}>
                <Text style={styles.locationAddress}>{request.address}</Text>
                <Text style={styles.locationPrecision}>
                  {getLocationTypeLabel(request.location_type)}
                </Text>
                {!isOwnRequest && userLocation && (
                  <Text style={[
                    styles.distanceText,
                    isWithinRange ? styles.distanceTextInRange : styles.distanceTextOutOfRange
                  ]}>
                    {isCheckingLocation ? 'Checking location...' : `${distance.toFixed(2)}km away ${isWithinRange ? '✓' : '✗'}`}
                  </Text>
                )}
              </View>
            </View>
          </View>

          <View style={styles.statsSection}>
            <Pressable 
              style={[styles.statItem, fulfillmentCount > 0 && styles.statItemClickable]}
              onPress={handleViewFulfillments}
              disabled={fulfillmentCount === 0}
            >
              <IconSymbol name="video.fill" size={24} color={fulfillmentCount > 0 ? colors.primary : colors.textSecondary} />
              <Text style={[styles.statValue, fulfillmentCount > 0 && styles.statValueClickable]}>
                {fulfillmentCount}
              </Text>
              <Text style={styles.statLabel}>Fulfillments</Text>
              {fulfillmentCount > 0 && (
                <View style={styles.clickableIndicator}>
                  <IconSymbol name="chevron.right" size={16} color={colors.primary} />
                </View>
              )}
            </Pressable>
            <View style={styles.statItem}>
              <IconSymbol name="clock.fill" size={24} color={colors.primary} />
              <Text style={styles.statValue}>{request.duration_hours}h</Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          {isOwnRequest ? (
            // User's own request - show edit button
            <Pressable style={styles.editRequestButton} onPress={handleEditRequest}>
              <IconSymbol name="pencil" size={24} color="#FFFFFF" />
              <Text style={styles.editRequestButtonText}>Edit Request</Text>
            </Pressable>
          ) : isCheckingLocation ? (
            // Checking location
            <View style={styles.checkingLocationCard}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.checkingLocationText}>Checking your location...</Text>
            </View>
          ) : isWithinRange ? (
            // Other user's request and within range - show take request button
            <Pressable style={styles.takeRequestButton} onPress={handleTakeRequest}>
              <IconSymbol name="video.fill" size={24} color="#FFFFFF" />
              <Text style={styles.takeRequestButtonText}>Take Request & Record</Text>
            </Pressable>
          ) : (
            // Other user's request but out of range
            <View style={styles.outOfRangeCard}>
              <IconSymbol name="location.slash" size={32} color={colors.textSecondary} />
              <Text style={styles.outOfRangeTitle}>Out of Range</Text>
              <Text style={styles.outOfRangeText}>
                You are {distance.toFixed(2)}km away. You need to be within the requested location range to fulfill this request.
              </Text>
            </View>
          )}

          <Pressable style={styles.cancelButton} onPress={handleCancel}>
            <IconSymbol name="xmark.circle" size={20} color={colors.text} />
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  headerBackButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 20,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ownRequestAvatar: {
    backgroundColor: '#00D084',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  userHandle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  timeRemainingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: `${colors.primary}20`,
    borderRadius: 12,
  },
  timeRemainingText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  descriptionSection: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  descriptionText: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
  },
  locationSection: {
    marginBottom: 20,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  locationDetails: {
    flex: 1,
  },
  locationAddress: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 4,
  },
  locationPrecision: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  distanceText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  distanceTextInRange: {
    color: '#00D084',
  },
  distanceTextOutOfRange: {
    color: '#FF6B6B',
  },
  statsSection: {
    flexDirection: 'row',
    gap: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    position: 'relative',
  },
  statItemClickable: {
    backgroundColor: `${colors.primary}10`,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  statValueClickable: {
    color: colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  clickableIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  buttonContainer: {
    gap: 12,
    marginBottom: 40,
  },
  takeRequestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  takeRequestButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  editRequestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    backgroundColor: '#00D084',
    borderRadius: 12,
  },
  editRequestButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  checkingLocationCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  checkingLocationText: {
    fontSize: 16,
    color: colors.text,
    marginTop: 16,
    textAlign: 'center',
  },
  outOfRangeCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  outOfRangeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  outOfRangeText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
