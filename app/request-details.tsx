
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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { PremiumAvatar } from '@/components/PremiumAvatar';

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
  const [liveFulfillmentCount, setLiveFulfillmentCount] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [isOwnRequest, setIsOwnRequest] = useState(false);
  const [showEarningsDetails, setShowEarningsDetails] = useState(false);

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
    avatar_url,
    is_premium
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

// Load fulfillment counts - both total and live
const { count: totalCount } = await supabase
  .from('request_fulfillments')
  .select('*', { count: 'exact', head: true })
  .eq('request_id', requestId);

setFulfillmentCount(totalCount || 0);

// Get live fulfillments (videos within 24 hours)
const twentyFourHoursAgo = new Date();
twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

const { data: fulfillments } = await supabase
  .from('request_fulfillments')
  .select('video_id')
  .eq('request_id', requestId);

if (fulfillments && fulfillments.length > 0) {
  const videoIds = fulfillments.map(f => f.video_id);
  
  // Count how many of these videos are still live (within 24 hours)
  const { count: liveCount } = await supabase
    .from('videos')
    .select('*', { count: 'exact', head: true })
    .in('id', videoIds)
    .eq('moderation_status', 'approved')
    .gte('created_at', twentyFourHoursAgo.toISOString());
  
  setLiveFulfillmentCount(liveCount || 0);
  console.log(`📊 Fulfillments: ${liveCount} live / ${totalCount} total`);
} else {
  setLiveFulfillmentCount(0);
}
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

  const handleTakeRequest = async () => {
    if (isCheckingLocation) {
      Alert.alert(
        'Checking Location',
        'Please wait while we verify your location...'
      );
      return;
    }

    // 📍 Check location permission before allowing fulfillment
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Location Access Required',
        'POPNOW requires location access to fulfill video requests. Your location is needed to verify you are within range and to pin your video on the map.\n\nWithout location, you can still browse, watch, like, comment, and follow users.',
        [
          { text: 'Go Back', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
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
const handleDeleteRequest = async (requestId: string) => {
  try {
    // First, check if request has fulfillments
    const { count: fulfillmentCount } = await supabase
      .from('request_fulfillments')
      .select('*', { count: 'exact', head: true })
      .eq('request_id', requestId);

    if (fulfillmentCount && fulfillmentCount > 0) {
      Alert.alert(
        'Cannot Delete',
        'This request has fulfillment videos. Please select a winner before deleting.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Delete Request',
      fulfillmentCount === 0 
        ? 'No one fulfilled this request. You will be refunded 100 coins. Delete this request?'
        : 'Are you sure you want to delete this request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;

              // Get the request to check ownership
              if (request.user_id !== user.id) {
                Alert.alert('Error', 'Invalid request');
                return;
              }

              // Delete the request
              const { error: deleteError } = await supabase
                .from('video_requests')
                .delete()
                .eq('id', requestId);

              if (deleteError) throw deleteError;

              // Refund 100 coins if no fulfillments
              if (fulfillmentCount === 0) {
                console.log('💰 Refunding 100 coins for deleted request with no fulfillments');
                
                const { data: userData } = await supabase
                  .from('users')
                  .select('coins')
                  .eq('id', user.id)
                  .single();

                const currentCoins = userData?.coins || 0;
                const newCoins = currentCoins + 100;

                await supabase
                  .from('users')
                  .update({ coins: newCoins })
                  .eq('id', user.id);

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

              Alert.alert(
                'Success', 
                fulfillmentCount === 0 
                  ? 'Request deleted and 100 coins refunded' 
                  : 'Request deleted successfully',
                [{ 
                  text: 'OK',
                  onPress: () => router.back()
                }]
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

 const handleViewFulfillments = () => {
  // For public users: check if there are live videos
  // For requesters: always allow (they see all videos regardless)
  if (!isOwnRequest && liveFulfillmentCount === 0) {
    // Public user with no live videos - do nothing (silent)
    console.log('ℹ️ No live videos for public user - button press ignored');
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
          <IconSymbol 
  ios_icon_name="exclamationmark.triangle" 
  android_material_icon_name="warning" 
  size={48} 
  color={colors.textSecondary} 
/>
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
          <IconSymbol 
  ios_icon_name="chevron.left" 
  android_material_icon_name="chevron-left" 
  size={24} 
  color="#FFFFFF" 
/>
        </Pressable>
        <Text style={styles.headerTitle}>Video Request</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.userInfo}>
              <PremiumAvatar
  avatarUrl={request.requester?.avatar_url}
  size={48}
  isPremium={request.requester?.is_premium || false}
/>
              <View>
  <Text style={styles.userName}>
    @{request.requester?.username}
    {isOwnRequest && ' (You)'}
  </Text>
</View>
            </View>
            <View style={styles.timeRemainingBadge}>
              <IconSymbol 
  ios_icon_name="clock.fill" 
  android_material_icon_name="schedule" 
  size={16} 
  color={colors.primary} 
/>
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
              <IconSymbol 
  ios_icon_name="mappin.circle.fill" 
  android_material_icon_name="place" 
  size={24} 
  color={colors.primary} 
/>
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
  style={[
    styles.statItem, 
    // Clickable if: (requester with any videos) OR (public with live videos)
    ((isOwnRequest && fulfillmentCount > 0) || (!isOwnRequest && liveFulfillmentCount > 0)) && styles.statItemClickable
  ]}
  onPress={handleViewFulfillments}
  disabled={false}  // ← Never disabled, handleViewFulfillments decides what happens
>
 <IconSymbol 
  ios_icon_name="video.fill" 
  android_material_icon_name="videocam" 
  size={24} 
    color={
      ((isOwnRequest && fulfillmentCount > 0) || (!isOwnRequest && liveFulfillmentCount > 0))
        ? colors.primary 
        : colors.textSecondary
    }
  />
  <View style={styles.fulfillmentCountContainer}>
    <Text style={[styles.statValue, styles.liveCount]}>
      {liveFulfillmentCount}
    </Text>
    <Text style={[styles.statValue, styles.countSeparator]}> / </Text>
    <Text style={[styles.statValue, styles.totalCount]}>
      {fulfillmentCount}
    </Text>
  </View>
  <Text style={styles.statLabel}>Fulfillments</Text>
  {((isOwnRequest && fulfillmentCount > 0) || (!isOwnRequest && liveFulfillmentCount > 0)) && (
    <View style={styles.clickableIndicator}>
      <IconSymbol 
  ios_icon_name="chevron.right" 
  android_material_icon_name="chevron-right" 
  size={16} 
  color={colors.primary} 
/>
    </View>
  )}
</Pressable>
            <View style={styles.statItem}>
              <IconSymbol 
  ios_icon_name="clock.fill" 
  android_material_icon_name="schedule" 
  size={24} 
  color={colors.primary} 
/>
              <Text style={styles.statValue}>{request.duration_hours}h</Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
          </View>
        </View>

{/* 💰 POPCOINS EARNING INFO - Only show for other users' requests */}
        {!isOwnRequest && (
          <View style={styles.earningsCard}>
            <View style={styles.earningsHeader}>
              <Text style={styles.earningsEmoji}>🍿</Text>
              <Text style={styles.earningsTitle}>Earn POPCoins by Fulfilling This Request</Text>
            </View>

            <View style={styles.bonusesSection}>
              <View style={styles.bonusItem}>
                <Text style={{ fontSize: 20 }}>🤝</Text>
                <Text style={styles.bonusText}>
                  <Text style={styles.bonusLabel}>Contributor Bonus: </Text>
                  <Text style={styles.bonusAmount}>+20 POPCoins </Text>
                  <Text style={styles.bonusDescription}>(just for uploading)</Text>
                </Text>
              </View>

              <View style={styles.bonusItem}>
                <Text style={{ fontSize: 20 }}>🏆</Text>
                <Text style={styles.bonusText}>
                  <Text style={styles.bonusLabel}>Winner Bonus: </Text>
                  <Text style={styles.bonusAmount}>+100 POPCoins </Text>
                  <Text style={styles.bonusDescription}>(if selected by requester)</Text>
                </Text>
              </View>
            </View>

            {/* Expandable Details Section */}
            <Pressable 
              style={styles.expandButton}
              onPress={() => setShowEarningsDetails(!showEarningsDetails)}
            >
              <Text style={styles.expandButtonText}>
                {showEarningsDetails ? 'Hide Details' : 'View Full Details'}
              </Text>
              <IconSymbol 
  ios_icon_name={showEarningsDetails ? "chevron.up" : "chevron.down"}
  android_material_icon_name={showEarningsDetails ? "keyboard-arrow-up" : "keyboard-arrow-down"}
  size={16} 
  color={colors.primary} 
/>
            </Pressable>

            {showEarningsDetails && (
              <>
                <View style={styles.infoSection}>
                  <Text style={styles.infoSectionTitle}>How Winner Selection Works:</Text>
                  <View style={styles.infoBullets}>
                    <Text style={styles.infoBullet}>• Requester has 24 hours after the request expires to pick a winner</Text>
                    <Text style={styles.infoBullet}>• If no winner is selected, the FIRST fulfillment video wins automatically</Text>
                    <Text style={styles.infoBullet}>• Winner receives 100 extra coins (120 total with contributor bonus)</Text>
                  </View>
                </View>

                <View style={styles.tipsSection}>
                  <Text style={styles.tipsSectionTitle}>Tips to Win:</Text>
                  <View style={styles.tipsBullets}>
                    <Text style={styles.tipBullet}>• Follow the request description carefully</Text>
                    <Text style={styles.tipBullet}>• Show exactly what the requester wants to see</Text>
                    <Text style={styles.tipBullet}>• High-quality video = higher chance of winning</Text>
                  </View>
                </View>

                <Text style={styles.goodLuckText}>Good luck! 🎬</Text>
              </>
            )}
          </View>
        )}
        <View style={styles.buttonContainer}>
        {isOwnRequest ? (
  // User's own request - show delete button
  <Pressable style={styles.deleteRequestButton} onPress={() => handleDeleteRequest(request.id)}>
    <IconSymbol 
  ios_icon_name="trash.fill" 
  android_material_icon_name="delete" 
  size={24} 
  color="#FFFFFF" 
/>
    <Text style={styles.deleteRequestButtonText}>Delete Request</Text>
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
              <IconSymbol 
  ios_icon_name="video.fill" 
  android_material_icon_name="videocam" 
  size={24} 
  color="#FFFFFF" 
/>
              <Text style={styles.takeRequestButtonText}>Take Request & Record</Text>
            </Pressable>
          ) : (
            // Other user's request but out of range
            <View style={styles.outOfRangeCard}>
              <IconSymbol 
  ios_icon_name="location.slash" 
  android_material_icon_name="location-off" 
  size={32} 
  color={colors.textSecondary} 
/>
              <Text style={styles.outOfRangeTitle}>Out of Range</Text>
              <Text style={styles.outOfRangeText}>
                You are {distance.toFixed(2)}km away. You need to be within the requested location range to fulfill this request.
              </Text>
            </View>
          )}

          <Pressable style={styles.cancelButton} onPress={handleCancel}>
            <IconSymbol 
  ios_icon_name="xmark.circle" 
  android_material_icon_name="cancel" 
  size={20} 
  color={colors.text} 
/>
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
  // Avatar styles removed - now handled by PremiumAvatar component
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
deleteRequestButton: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  paddingVertical: 16,
  backgroundColor: '#F44336',
  borderRadius: 12,
},
deleteRequestButtonText: {
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
  fulfillmentCountContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
},
liveCount: {
  color: '#00D084',
  fontSize: 24, // ← Match the separator size
  fontWeight: 'bold',
},
countSeparator: {
  color: colors.text,
  fontSize: 24,
  fontWeight: 'bold',
  marginHorizontal: 0,
},
totalCount: {
  color: colors.text,
  fontSize: 24,
  fontWeight: 'bold',
},
earningsCard: {
  backgroundColor: '#fff8e1',
  borderRadius: 16,
  padding: 20,
  marginBottom: 20,
  borderLeftWidth: 4,
  borderLeftColor: '#FFD700',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 3,
},
earningsHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 16,
  gap: 8,
},
earningsEmoji: {
  fontSize: 24,
},
earningsTitle: {
  fontSize: 18,
  fontWeight: '700',
  color: '#333',
  flex: 1,
},
bonusesSection: {
  marginBottom: 16,
  gap: 12,
},
bonusItem: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: 10,
  paddingVertical: 8,
},
bonusText: {
  flex: 1,
  fontSize: 15,
  lineHeight: 22,
  color: '#333',
},
bonusLabel: {
  fontWeight: '600',
  color: '#333',
},
bonusAmount: {
  fontWeight: '800',
  color: '#f57c00',
  fontSize: 16,
},
bonusDescription: {
  color: '#666',
  fontSize: 14,
  fontStyle: 'italic',
},
expandButton: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  paddingVertical: 12,
  paddingHorizontal: 16,
  backgroundColor: '#ffffff',
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.primary,
  marginBottom: 16,
},
expandButtonText: {
  fontSize: 14,
  fontWeight: '600',
  color: colors.primary,
},
infoSection: {
  backgroundColor: '#ffffff',
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
  borderWidth: 1,
  borderColor: '#e0e0e0',
},
infoSectionTitle: {
  fontSize: 16,
  fontWeight: '700',
  color: '#333',
  marginBottom: 10,
},
infoBullets: {
  gap: 8,
},
infoBullet: {
  fontSize: 14,
  lineHeight: 20,
  color: '#555',
  paddingLeft: 8,
},
tipsSection: {
  backgroundColor: '#e8f5e9',
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
  borderWidth: 1,
  borderColor: '#00D084',
},
tipsSectionTitle: {
  fontSize: 16,
  fontWeight: '700',
  color: '#2e7d32',
  marginBottom: 10,
},
tipsBullets: {
  gap: 8,
},
tipBullet: {
  fontSize: 14,
  lineHeight: 20,
  color: '#1b5e20',
  paddingLeft: 8,
},
goodLuckText: {
  fontSize: 16,
  fontWeight: '600',
  color: '#666',
  textAlign: 'center',
  fontStyle: 'italic',
  marginTop: 8,
},
});
