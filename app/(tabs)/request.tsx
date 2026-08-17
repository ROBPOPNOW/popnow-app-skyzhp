import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { checkRequestLimit, isPremiumUser } from '@/services/premiumLimitsService';
import CoinAnimation from '@/components/CoinAnimation';
// 🪙 PHASE 7 IMPORTS
import { checkCanCreateRequest, deductRequestCoins } from '@/utils/request-coins';
import InsufficientCoinsModal from '@/components/InsufficientCoinsModal';
import { useCoinBalance } from '@/hooks/useCoinBalance';
import { formatCoins } from '@/utils/coins';

type LocationType = 'exact' | '3km' | '10km';

export default function RequestScreen() {
  const params = useLocalSearchParams();
  const isEditing = params.isEditing === 'true';
  const requestId = params.requestId as string | undefined;
  
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    address: string;
  } | null>(null);
  const [isCurrentLocation, setIsCurrentLocation] = useState(true);
  const [locationType, setLocationType] = useState<LocationType>('exact');
  const [duration, setDuration] = useState('6'); // Default to 6 hours
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  
  // 🪙 PHASE 7 STATE
  const [showInsufficientCoins, setShowInsufficientCoins] = useState(false);
  const [currentCoins, setCurrentCoins] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const { coins, refetch: refetchCoins } = useCoinBalance(userId);

  const [showCoinAnimation, setShowCoinAnimation] = useState(false);
const [coinAnimationAmount, setCoinAnimationAmount] = useState(0);

  useEffect(() => {
    // Load user ID first
    loadUserId();
    
    // If editing, load the existing request data
    if (isEditing && requestId) {
      loadRequestData();
    } else if (params.latitude && params.longitude) {
      // Pre-fill location from map double-tap
      setLocation({
        latitude: parseFloat(params.latitude as string),
        longitude: parseFloat(params.longitude as string),
        address: (params.address as string) || 'Selected Location',
      });
      setIsCurrentLocation(false); // This is a preferred location from map
    } else {
      // Get current location
      getCurrentLocation();
    }

    // Pre-fill other params if provided
    if (params.description) {
      setDescription(params.description as string);
    }
    if (params.locationType) {
      setLocationType(params.locationType as LocationType);
    }
    if (params.duration) {
      setDuration(params.duration as string);
    }
  }, []);

  // 🪙 PHASE 7: Load user ID and premium status
const loadUserId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    setUserId(user.id);
    
    // Check if user is premium
    const premium = await isPremiumUser(user.id);
    setIsPremium(premium);
    console.log('👑 User premium status:', premium);
  }
};

  const loadRequestData = async () => {
    try {
      const { data, error } = await supabase
        .from('video_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (error) {
        console.error('Error loading request:', error);
        Alert.alert('Error', 'Failed to load request data');
        return;
      }

      if (data) {
        setDescription(data.description || '');
        setLocation({
          latitude: data.location_latitude,
          longitude: data.location_longitude,
          address: data.address,
        });
        setLocationType(data.location_type);
        setDuration(data.duration_hours.toString());
        setIsCurrentLocation(false); // Existing requests are not current location
      }
    } catch (error) {
      console.error('Error in loadRequestData:', error);
      Alert.alert('Error', 'Failed to load request data');
    }
  };

  const getCurrentLocation = async () => {
    try {
      setIsLoadingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const addresses = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      let addressString = 'Current Location';
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

      setLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address: addressString,
      });
      setIsCurrentLocation(true);
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Failed to get current location');
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const handleLocationCardPress = () => {
    // Navigate to map tab with current request data
    router.push({
      pathname: '/(tabs)/map',
      params: {
        fromRequest: 'true',
        description,
        locationType,
        duration,
        ...(location && {
          latitude: location.latitude.toString(),
          longitude: location.longitude.toString(),
        }),
      },
    });
  };

  const getLocationTypeLabel = (type: LocationType): string => {
    switch (type) {
      case 'exact':
        return 'Exact Location';
      case '3km':
        return '3km radius';
      case '10km':
        return '10km radius';
    }
  };

  const getLocationTypeDescription = (type: LocationType): string => {
    switch (type) {
      case 'exact':
        return 'Show exact location (within 300m)';
      case '3km':
        return 'Show approximate area (3km radius)';
      case '10km':
        return 'Show general area (10km radius)';
    }
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a description');
      return;
    }

    if (!location) {
      Alert.alert('Error', 'Please select a location');
      return;
    }

    const durationHours = parseInt(duration);
    if (isNaN(durationHours) || durationHours < 1 || durationHours > 168) {
      Alert.alert('Error', 'Duration must be between 1 and 168 hours (7 days)');
      return;
    }

    try {
      setIsSubmitting(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to create a request');
        return;
      }

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + durationHours);

      if (isEditing && requestId) {
        // UPDATING EXISTING REQUEST (no coin deduction)
        console.log('Updating existing request:', requestId);
        
        const { error } = await supabase
          .from('video_requests')
          .update({
            description: description.trim(),
            location_latitude: location.latitude,
            location_longitude: location.longitude,
            address: location.address,
            location_type: locationType,
            duration_hours: durationHours,
            expires_at: expiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', requestId);

        if (error) {
          console.error('Error updating request:', error);
          Alert.alert('Error', 'Failed to update request');
          return;
        }

        Alert.alert('Success', 'Request updated successfully!', [
          {
            text: 'OK',
            onPress: () => {
              router.replace('/(tabs)/profile?tab=requests');
            },
          },
        ]);
      } else {
        // CREATING NEW REQUEST - 🪙 PHASE 7: Check coins first
        console.log('Creating new request - checking coins...');
        
        const { canCreate, currentCoins: userCoins, message } = await checkCanCreateRequest(user.id);
        
        if (!canCreate) {
          console.log('❌ Insufficient coins:', userCoins);
          setCurrentCoins(userCoins);
          setShowInsufficientCoins(true);
          setIsSubmitting(false);
          return;
        }

 // 🆕 ADD THIS: Check request limit
  const limitCheck = await checkRequestLimit(user.id);
  
  if (!limitCheck.allowed) {
    Alert.alert(
      'Request Limit Reached',
      limitCheck.message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upgrade to Premium',
          onPress: () => router.push('/settings')
        }
      ]
    );
    setIsSubmitting(false);
    return;
  }

        console.log('✅ User has enough coins, creating request...');

        // Create the request
        const { data: requestData, error: requestError } = await supabase
          .from('video_requests')
          .insert({
            user_id: user.id,
            description: description.trim(),
            location_latitude: location.latitude,
            location_longitude: location.longitude,
            address: location.address,
            location_type: locationType,
            duration_hours: durationHours,
            expires_at: expiresAt.toISOString(),
            status: 'open',
          })
          .select()
          .single();

        if (requestError) {
          console.error('Error creating request:', requestError);
          Alert.alert('Error', 'Failed to create request');
          return;
        }

        // 🪙 PHASE 7: Deduct coins AFTER request is created
        console.log('💰 Deducting 100 coins...');
        const { success, message: coinMessage } = await deductRequestCoins(
          user.id,
          requestData.id
        );

        if (!success) {
          // If coin deduction fails, delete the request
          console.error('❌ Coin deduction failed, rolling back request');
          await supabase
            .from('video_requests')
            .delete()
            .eq('id', requestData.id);
          
          Alert.alert('Error', coinMessage || 'Failed to process coins');
          setIsSubmitting(false);
          return;
        }

        console.log('✅ 100 coins deducted successfully');

        // 🪙 Refetch coin balance to show updated amount
        refetchCoins();
        // Show floating -100 animation
setCoinAnimationAmount(-100);
setShowCoinAnimation(true);
setTimeout(() => setShowCoinAnimation(false), 1100);

        Alert.alert(
          'Success',
          'Your request has been posted! 100 coins deducted.',
          [{ 
            text: 'OK', 
            onPress: () => {
              router.replace('/(tabs)/profile?tab=requests');
            }
          }]
        );
      }
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      Alert.alert('Error', 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
  <SafeAreaView style={styles.container} edges={['top']}>
    {/* 🎬 ADD ANIMATION HERE */}
    {showCoinAnimation && (
      <View style={{ position: 'absolute', top: 100, left: 0, right: 0, zIndex: 1000 }}>
        <CoinAnimation 
          amount={coinAnimationAmount}
          onComplete={() => setShowCoinAnimation(false)}
        />
      </View>
    )}
    
    <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>
          {isEditing ? 'Edit Request' : 'Create Request'}
        </Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
     <ScrollView 
  style={styles.content} 
  showsVerticalScrollIndicator={false}
  contentContainerStyle={styles.scrollContent}
>
  <View style={styles.section}>
            <Text style={styles.sectionTitle}>What are you looking for?</Text>
            <TextInput
              style={styles.descriptionInput}
              placeholder="E.g., Live crowd at the concert, Traffic at the intersection..."
              placeholderTextColor={colors.textSecondary}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Location</Text>
              {!isLoadingLocation && location && (
                <Pressable
                  style={styles.refreshButton}
                  onPress={getCurrentLocation}
                >
                  <IconSymbol name="arrow.clockwise" size={16} color={colors.primary} />
                  <Text style={styles.refreshButtonText}>Refresh</Text>
                </Pressable>
              )}
            </View>

            {isLoadingLocation ? (
              <View style={styles.locationPlaceholder}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.locationPlaceholderText}>
                  Getting your location...
                </Text>
              </View>
            ) : location ? (
              <>
                <Pressable style={styles.locationCard} onPress={handleLocationCardPress}>
                  <IconSymbol name="location.fill" size={24} color={colors.primary} />
                  <View style={styles.locationInfo}>
                    <Text style={styles.locationAddress} numberOfLines={2}>
                      {location.address}
                    </Text>
                    <View
                      style={[
                        styles.locationBadge,
                        isCurrentLocation
                          ? styles.locationBadgeCurrent
                          : styles.locationBadgePreferred,
                      ]}
                    >
                      <Text style={styles.locationBadgeText}>
                        {isCurrentLocation ? 'Current Location' : 'Preferred Location'}
                      </Text>
                    </View>
                  </View>
                  <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
                </Pressable>
                <Text style={styles.locationHelper}>
                  Tap to select a different location on the map
                </Text>
              </>
            ) : (
              <Pressable style={styles.locationPlaceholder} onPress={getCurrentLocation}>
                <IconSymbol
  ios_icon_name="location"
  android_material_icon_name="location-on"
  size={24}
  color={colors.textSecondary}
/>
                <Text style={styles.locationPlaceholderText}>
                  Tap to set location
                </Text>
              </Pressable>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Location Precision</Text>
            <View style={styles.locationTypeOptions}>
              {(['exact', '3km', '10km'] as LocationType[]).map((type) => (
                <Pressable
                  key={type}
                  style={[
                    styles.locationTypeOption,
                    locationType === type && styles.locationTypeOptionActive,
                  ]}
                  onPress={() => setLocationType(type)}
                >
                  <View style={styles.locationTypeHeader}>
                    <Text
                      style={[
                        styles.locationTypeLabel,
                        locationType === type && styles.locationTypeLabelActive,
                      ]}
                    >
                      {getLocationTypeLabel(type)}
                    </Text>
                    {locationType === type && (
                      <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.locationTypeDescription,
                      locationType === type && styles.locationTypeDescriptionActive,
                    ]}
                  >
                    {getLocationTypeDescription(type)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Duration</Text>
            <View style={styles.durationOptions}>
              {[
                { label: '1 hour', value: '1' },
                { label: '6 hours', value: '6' },
                { label: '24 hours', value: '24' },
              ].map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.durationOption,
                    duration === option.value && styles.durationOptionActive,
                  ]}
                  onPress={() => setDuration(option.value)}
                >
                  <Text
                    style={[
                      styles.durationOptionText,
                      duration === option.value && styles.durationOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {duration === option.value && (
                    <IconSymbol 
                      ios_icon_name="checkmark.circle.fill" 
                      android_material_icon_name="check-circle" 
                      size={20} 
                      color={colors.primary} 
                    />
                  )}
                </Pressable>
              ))}
            </View>
            <Text style={styles.helperText}>
              How long should this request be active?
            </Text>
          </View>

          {/* 🪙 PHASE 7: Coin Cost Display - Only show when creating new request */}
          {!isEditing && (
            <View style={styles.coinCostContainer}>
              <View style={styles.coinCostLeft}>
                <Text style={styles.coinCostLabel}>Cost to create request:</Text>
                <View style={styles.coinCostBadge}>
                  <Text style={{ fontSize: 18 }}>🍿</Text>
                  <Text style={styles.coinCostAmount}>100</Text>
                </View>
              </View>
              <View style={styles.coinBalanceRight}>
                <Text style={styles.coinBalanceLabel}>Your balance:</Text>
                <View style={styles.coinBalanceBadge}>
                  <Text style={{ fontSize: 16 }}>🍿</Text>
                 <Text style={styles.coinBalanceAmount}>{formatCoins(coins)}</Text>
                </View>
              </View>
            </View>
          )}
{/* Premium Message - Different for Free vs Premium Users */}
{!isEditing && (
  isPremium ? (
    // Premium User Message
    <View style={styles.premiumBenefitsContainer}>
      <Text style={styles.premiumBenefitsTitle}>🌍 Premium Member Benefits</Text>
      <Text style={styles.premiumBenefitsText}>
        Request unlimited videos from anywhere in the world.{'\n'}
        Let your curiosity guide you—no limits, no boundaries.
      </Text>
    </View>
  ) : (
    // Free User Message
    <Pressable 
      style={styles.premiumMessageContainer}
      onPress={() => router.push('/settings')}
    >
      <Text style={styles.premiumMessageText}>
        ⭐ 5 requests/day for free users. 
        <Text style={styles.premiumMessageLink}> Upgrade to Premium</Text> for unlimited video requests.
      </Text>
    </Pressable>
  )
)}

          <Pressable
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.submitButtonText}>
                  {isEditing ? 'Updating...' : 'Creating...'}
                </Text>
              </>
            ) : (
              <>
                <IconSymbol name="checkmark.circle.fill" size={24} color="#FFFFFF" />
                <Text style={styles.submitButtonText}>
                  {isEditing ? 'Update Request' : 'Create Request'}
                </Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 🪙 PHASE 7: Insufficient Coins Modal */}
      <InsufficientCoinsModal
        visible={showInsufficientCoins}
        onClose={() => setShowInsufficientCoins(false)}
        currentCoins={currentCoins}
        requiredCoins={100}
      />
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
  backButton: {
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
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: `${colors.primary}20`,
    borderRadius: 8,
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  descriptionInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
  },
  locationInfo: {
    flex: 1,
    gap: 8,
  },
  locationAddress: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  locationBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  locationBadgeCurrent: {
    backgroundColor: '#10B981', // Green
  },
  locationBadgePreferred: {
    backgroundColor: '#EC4899', // Pink
  },
  locationBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  locationHelper: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  locationPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
  },
  locationPlaceholderText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  locationTypeOptions: {
    gap: 12,
  },
  locationTypeOption: {
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
  },
  locationTypeOptionActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  locationTypeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  locationTypeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  locationTypeLabelActive: {
    color: colors.primary,
  },
  locationTypeDescription: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  locationTypeDescriptionActive: {
    color: colors.text,
  },
  durationOptions: {
    gap: 12,
  },
  durationOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
  },
  durationOptionActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  durationOptionText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  durationOptionTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
  },
  // 🪙 PHASE 7: Coin Cost Styles
  coinCostContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff8e1',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#ffd54f',
  },
  coinCostLeft: {
    flex: 1,
  },
  coinCostLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
  },
  coinCostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coinCostAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f57c00',
  },
  coinBalanceRight: {
    alignItems: 'flex-end',
  },
  coinBalanceLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 6,
  },
  coinBalanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  coinBalanceAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scrollContent: {
  paddingBottom: 160,
},
premiumMessageContainer: {
  backgroundColor: '#fff3e0',
  padding: 12,
  borderRadius: 8,
  marginBottom: 16,
  borderLeftWidth: 3,
  borderLeftColor: '#FFD700',
},
premiumMessageText: {
  fontSize: 13,
  color: '#666',
  lineHeight: 18,
},
premiumMessageLink: {
  color: colors.primary,
  fontWeight: '600',
},
premiumBenefitsContainer: {
  backgroundColor: '#f0f4ff', // Light purple/blue background
  padding: 16,
  borderRadius: 12,
  marginBottom: 16,
  borderWidth: 2,
  borderColor: '#FFD700',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 3,
},
premiumBenefitsTitle: {
  fontSize: 16,
  fontWeight: '700',
  color: '#333',
  marginBottom: 8,
  letterSpacing: 0.5,
},
premiumBenefitsText: {
  fontSize: 14,
  color: '#666',
  lineHeight: 20,
  fontStyle: 'italic',
},
});