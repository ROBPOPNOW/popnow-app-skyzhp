import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import { IconSymbol } from '@/components/IconSymbol';
import UsernameInput from '@/components/UsernameInput';

export default function EditProfileScreen() {
  const params = useLocalSearchParams();
  const isFirstTime = params.firstTime === 'true';

  const [username, setUsername] = useState('');
  const [currentUsername, setCurrentUsername] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isUsernameValid, setIsUsernameValid] = useState(false);
const [isValidatingCity, setIsValidatingCity] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('users')
        .select('username, bio, location, avatar_url')
        .eq('id', user.id)
        .single();

      if (profile) {
  if (!username) setUsername(profile.username || '');
  setCurrentUsername(profile.username || ''); // ← ADD THIS LINE
  if (!bio) setBio(profile.bio || '');
  if (!location) setLocation(profile.location || '');
  setAvatarUrl(profile.avatar_url);
}
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to upload a profile picture.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      setUploadingAvatar(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user');

      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Generate filename
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, decode(base64), {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update user profile
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          avatar_url: publicUrl,
          moderation_status: 'pending' // Avatar needs moderation
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      Alert.alert('Success', 'Profile picture uploaded! It will be reviewed shortly.');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      Alert.alert('Error', 'Failed to upload profile picture');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Helper function to decode base64
  const decode = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in');
        return;
      }

      // Validation
if (isFirstTime && !username.trim()) {
  Alert.alert('Required', 'Please enter a username');
  return;
}

if (isFirstTime && !isUsernameValid) {
  Alert.alert('Invalid Username', 'Please enter a valid, available username');
  return;
}

if (!location.trim()) {
  Alert.alert('Required', 'Please enter your city');
  return;
}

// Validate city name is real and geocodable
setIsValidatingCity(true);
try {
  const geocodeResult = await Location.geocodeAsync(location.trim());
  if (!geocodeResult || geocodeResult.length === 0) {
    Alert.alert(
      'Invalid City',
      `No city found for "${location.trim()}". Please enter a valid city name.`
    );
    setIsValidatingCity(false);
    return;
  }
  // Cache the coordinates for offline use
  const { latitude, longitude } = geocodeResult[0];
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  await AsyncStorage.setItem('default_city_location', JSON.stringify({
    latitude,
    longitude,
    cityName: location.trim(),
    timestamp: Date.now(),
  }));
} catch (error) {
  Alert.alert(
    'Validation Error',
    'Could not validate city name. Please check your internet connection and try again.'
  );
  setIsValidatingCity(false);
  return;
} finally {
  setIsValidatingCity(false);
}

      const updates: any = {
        bio: bio.trim(),
        location: location.trim(),
      };

      // Only update username if it's changed
      if (username.trim()) {
        updates.username = username.trim().toLowerCase();
      }

      // Mark profile as completed on first save
      if (isFirstTime) {
        updates.profile_completed = true;
      }

      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      Alert.alert('Success', 'Profile updated successfully');
      
      if (isFirstTime) {
        router.replace('/(tabs)/(home)/' as any);
      } else {
        router.back();
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView style={styles.scrollView}>
          {/* Header */}
          <View style={styles.header}>
            {!isFirstTime && (
              <Pressable onPress={() => router.back()} style={styles.backButton}>
                <IconSymbol 
                  ios_icon_name="chevron.left" 
                  android_material_icon_name="arrow-back" 
                  size={24} 
                  color={colors.text} 
                />
              </Pressable>
            )}
            <Text style={styles.title}>
              {isFirstTime ? 'Complete Your Profile' : 'Edit Profile'}
            </Text>
            <View style={styles.placeholder} />
          </View>

          {/* Avatar */}
          <View style={styles.avatarSection}>
            <Pressable onPress={pickImage} style={styles.avatarContainer}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <IconSymbol 
                    ios_icon_name="person.fill" 
                    android_material_icon_name="person" 
                    size={48} 
                    color={colors.textSecondary} 
                  />
                </View>
              )}
              {uploadingAvatar && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                </View>
              )}
            </Pressable>
            <Pressable onPress={pickImage} style={styles.changePhotoButton}>
              <Text style={styles.changePhotoText}>
                {avatarUrl ? 'Change Photo' : 'Add Photo'}
              </Text>
            </Pressable>
          </View>

          {/* Form Fields */}
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Username {isFirstTime && '*'}</Text>
              <UsernameInput
  value={username}
  onChangeText={setUsername}
  onValidationChange={(isValid) => {
    setIsUsernameValid(isValid);
  }}
  currentUsername={currentUsername}
/>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, styles.bioInput]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell us about yourself"
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

           <View style={styles.field}>
  <Text style={styles.label}>Location *</Text>
  <TextInput
    style={styles.input}
    value={location}
    onChangeText={setLocation}
    placeholder="Enter your city (e.g. Auckland, Tokyo)"
    placeholderTextColor={colors.textSecondary}
  />
  <Text style={styles.fieldTip}>
    Enter your city so the map shows your area by default
  </Text>
</View>
          </View>

          {/* Save Button */}
          <Pressable
  style={[styles.saveButton, (saving || isValidatingCity) && styles.saveButtonDisabled]}
  onPress={handleSave}
  disabled={saving || isValidatingCity}
>
  {(saving || isValidatingCity) ? (
    <ActivityIndicator size="small" color="#FFFFFF" />
  ) : (
    <Text style={styles.saveButtonText}>
      {isFirstTime ? 'Complete Profile' : 'Save Changes'}
    </Text>
  )}
</Pressable>

          {isFirstTime && (
            <Text style={styles.requiredNote}>* Required field</Text>
          )}
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
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  placeholder: {
    width: 40,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarPlaceholder: {
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 60,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  changePhotoButton: {
    marginTop: 12,
  },
  changePhotoText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  form: {
    paddingHorizontal: 20,
  },
  field: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  bioInput: {
    height: 100,
    paddingTop: 12,
  },
  saveButton: {
    backgroundColor: colors.primary,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 24,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  requiredNote: {
  textAlign: 'center',
  color: colors.textSecondary,
  fontSize: 14,
  marginBottom: 24,
},
fieldTip: {
  fontSize: 12,
  color: colors.textSecondary,
  marginTop: 6,
  marginLeft: 4,
},
});