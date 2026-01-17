
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
  const [locationType, setLocationType] = useState<LocationType>('exact');
  const [duration, setDuration] = useState('6'); // Default to 6 hours
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  useEffect(() => {
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
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Failed to get current location');
    } finally {
      setIsLoadingLocation(false);
    }
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
        // FIXED: Update existing request instead of creating new
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
              // FIXED: Use replace instead of back to clear navigation stack
              router.replace('/(tabs)/profile?tab=requests');
            },
          },
        ]);
      } else {
        // Create new request
        console.log('Creating new request');
        
        const { error } = await supabase.from('video_requests').insert({
          user_id: user.id,
          description: description.trim(),
          location_latitude: location.latitude,
          location_longitude: location.longitude,
          address: location.address,
          location_type: locationType,
          duration_hours: durationHours,
          expires_at: expiresAt.toISOString(),
          status: 'open',
        });

        if (error) {
          console.error('Error creating request:', error);
          Alert.alert('Error', 'Failed to create request');
          return;
        }

        Alert.alert('Success', 'Request created successfully!', [
          {
            text: 'OK',
            onPress: () => {
              // FIXED: Use replace instead of back to clear navigation stack
              router.replace('/(tabs)/profile?tab=requests');
            },
          },
        ]);
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
      <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>
          {isEditing ? 'Edit Request' : 'Request Video'}
        </Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
      >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What do you want to see?</Text>
            <TextInput
              style={styles.descriptionInput}
              value={description}
              onChangeText={setDescription}
              placeholder="E.g., Show me the sunset at the beach"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Location</Text>
              <Pressable onPress={getCurrentLocation} style={styles.refreshButton}>
                {isLoadingLocation ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <IconSymbol name="location.fill" size={16} color={colors.primary} />
                    <Text style={styles.refreshButtonText}>Refresh</Text>
                  </>
                )}
              </Pressable>
            </View>
            {location ? (
              <View style={styles.locationCard}>
                <IconSymbol name="mappin.circle.fill" size={24} color={colors.primary} />
                <View style={styles.locationInfo}>
                  <Text style={styles.locationAddress}>{location.address}</Text>
                  <Text style={styles.locationCoords}>
                    {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.locationPlaceholder}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.locationPlaceholderText}>Getting location...</Text>
              </View>
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
                { label: '72 hours', value: '72' },
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
  },
  locationAddress: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  locationCoords: {
    fontSize: 12,
    color: colors.textSecondary,
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
});
