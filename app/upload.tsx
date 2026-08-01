import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { checkUploadLimit } from '@/services/premiumLimitsService';
import {
  createStreamVideo,
  uploadToStream,
  uploadVideoViaTus,
  getVideoStatus,
  getVideoStatusViaEdgeFunction,
  deleteStreamVideo,
  getDeleteVideoViaEdgeFunction,
} from '@/utils/bunnynet';
import Constants from 'expo-constants';
import { USE_TUS_UPLOAD, USE_EDGE_STATUS_CHECK, USE_EDGE_DELETE } from '@/config/uploadFlags';

type LocationPrivacy = 'exact' | '3km' | '10km';

export default function UploadScreen() {
  const params = useLocalSearchParams();
  const requestId = params.requestId as string | undefined;
  const requestDescription = params.requestDescription as string | undefined;
  const videoUri = params.videoUri as string | undefined;
  const [isPremium, setIsPremium] = useState(false);

  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [suggestedHashtags, setSuggestedHashtags] = useState<string[]>([]);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    name: string;
  } | null>(null);
  const [locationPrivacy, setLocationPrivacy] = useState<LocationPrivacy>('exact');
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [locationDenied, setLocationDenied] = useState(false);
  
  // 🚨 CRITICAL: Upload state management to prevent double uploads
  const [isUploading, setIsUploading] = useState(false);
  const uploadInProgressRef = useRef(false);
  const uploadStartedRef = useRef(false);
  const videoUriRef = useRef<string | null>(null); // Track which video is being uploaded
  const lastUploadAttemptRef = useRef<number>(0); // Debouncing timestamp

  useEffect(() => {
    initializeScreen();
  }, [requestDescription, videoUri]);

  const initializeScreen = async () => {
    console.log('=== INITIALIZING UPLOAD SCREEN ===');
    console.log('Video URI:', videoUri);
    
    if (!videoUri) {
      Alert.alert('Error', 'No video to upload');
      router.back();
      return;
    }

    // Store the video URI for duplicate detection
    videoUriRef.current = videoUri;

    // 📍 CHECK LOCATION PERMISSION FIRST
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('❌ Location permission not granted');
      setLocationDenied(true);
      setIsLoading(false);
      return;
    }

    // 🆕 Check premium status
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: userData } = await supabase
        .from('users')
        .select('is_premium')
        .eq('id', user.id)
        .single();
      
      setIsPremium(userData?.is_premium || false);
      console.log('👑 Premium status:', userData?.is_premium || false);
    }

    // Start location fetch
    getCurrentLocation().catch(err => console.log('Location fetch error (non-critical):', err));
    
    // If this is for a request, pre-fill the description
    if (requestDescription) {
      setDescription(`Fulfilling request: ${requestDescription}`);
    }

    setIsLoading(false);
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (address && address.length > 0) {
        const addr = address[0] as any;
        
        const locationParts = [];
        
        if (addr.sublocality) {
          locationParts.push(addr.sublocality);
        } else if (addr.district) {
          locationParts.push(addr.district);
        }
        
        if (addr.city) {
          locationParts.push(addr.city);
        }
        
        if (addr.region && addr.region !== addr.city) {
          locationParts.push(addr.region);
        }
        
        if (addr.country) {
          locationParts.push(addr.country);
        }
        
        const locationName = locationParts.filter(Boolean).join(', ');
        
        console.log('📍 Location obtained:', locationName);

        setLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          name: locationName,
        });
      }
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const refreshLocation = async (isManual: boolean = false) => {
    try {
      setIsRefreshingLocation(true);
      console.log('🔄 Refreshing location...', isManual ? '(Manual)' : '(Automatic)');
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (isManual) {
          Alert.alert('Permission Required', 'Location permission is required to refresh location');
        }
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (address && address.length > 0) {
        const addr = address[0] as any;
        
        const locationParts = [];
        
        if (addr.sublocality) {
          locationParts.push(addr.sublocality);
        } else if (addr.district) {
          locationParts.push(addr.district);
        }
        
        if (addr.city) {
          locationParts.push(addr.city);
        }
        
        if (addr.region && addr.region !== addr.city) {
          locationParts.push(addr.region);
        }
        
        if (addr.country) {
          locationParts.push(addr.country);
        }
        
        const locationName = locationParts.filter(Boolean).join(', ');
        
        console.log('✅ Location refreshed:', locationName);

        setLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          name: locationName,
        });
        
        if (isManual) {
          Alert.alert('Success', 'Location refreshed successfully');
        }
      }
    } catch (error) {
      console.error('Error refreshing location:', error);
      if (isManual) {
        Alert.alert('Error', 'Failed to refresh location. Please try again.');
      }
    } finally {
      setIsRefreshingLocation(false);
    }
  };

  const handleRecordAgain = () => {
    router.replace({
      pathname: '/record-video',
      params: {
        requestId: requestId || '',
        requestDescription: requestDescription || '',
      },
    });
  };

  const handleGenerateHashtags = async () => {
    const words = description.toLowerCase().split(' ');
    const suggested = words
      .filter(word => word.length > 3)
      .map(word => word.replace(/[^a-z0-9]/g, ''))
      .filter(word => word.length > 0)
      .slice(0, 5)
      .map(word => `#${word}`);
    
    setSuggestedHashtags(suggested);
  };

  const handleGenerateDescription = async () => {
    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a description first');
      return;
    }

    try {
      setIsGeneratingDescription(true);
      console.log('Generating AI description from:', description);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Error', 'You must be logged in');
        return;
      }

      const { data, error } = await supabase.functions.invoke('generate-description', {
        body: { prompt: description },
      });

      if (error) {
        console.error('Error generating description:', error);
        Alert.alert('Error', 'Failed to generate description. Please try again.');
        return;
      }

      if (data && data.description) {
        console.log('Generated description:', data.description);
        setDescription(data.description);
      } else {
        Alert.alert('Error', 'No description generated');
      }
    } catch (error) {
      console.error('Error in handleGenerateDescription:', error);
      Alert.alert('Error', 'Failed to generate description');
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const toggleHashtag = (hashtag: string) => {
    if (hashtags.includes(hashtag)) {
      setHashtags(hashtags.filter(h => h !== hashtag));
    } else {
      setHashtags([...hashtags, hashtag]);
    }
  };

  const getPrivacyDescription = (privacy: LocationPrivacy): string => {
    switch (privacy) {
      case 'exact':
        return 'Show exact location';
      case '3km':
        return 'Show approximate area (3km radius)';
      case '10km':
        return 'Show general area (10km radius)';
    }
  };

  const getPrivacyIcon = (privacy: LocationPrivacy): string => {
    switch (privacy) {
      case 'exact':
        return 'scope';
      case '3km':
        return 'circle';
      case '10km':
        return 'circle.circle';
    }
  };

const handleUpload = async () => {
  console.log('🎬 User tapped Upload Video button');
  
  // 🚨 CHECK: If exact location is selected, show confirmation popup FIRST
  if (locationPrivacy === 'exact') {
    console.log('⚠️ Exact location selected - showing confirmation popup');
    Alert.alert(
      'Confirm Exact Location?',
      "You've chosen to share your exact location.\n\n✅ Great for: Public places, businesses & events, landmarks\n⚠️ Not recommended for: Home, private locations\n\nAre you sure you want to reveal the exact spot?",
      [
        {
          text: 'Show Exact',
          onPress: () => {
            console.log('✅ User confirmed exact location - proceeding with upload');
            // User confirmed - proceed with upload
            proceedWithUpload();
          },
        },
        {
          text: 'Randomised ping in 3km radius',
          onPress: () => {
            console.log('✅ User changed to 3km radius');
            setLocationPrivacy('3km');
            // Don't upload - user needs to tap Upload button again
          },
        },
        {
          text: 'Randomised ping in 10km radius',
          onPress: () => {
            console.log('✅ User changed to 10km radius');
            setLocationPrivacy('10km');
            // Don't upload - user needs to tap Upload button again
          },
          style: 'cancel',
        },
      ],
      { cancelable: false }
    );
    return; // Stop here - don't proceed with upload yet
  }

  // If not exact location, proceed directly with upload
  console.log('✅ Non-exact location selected - proceeding with upload');
  proceedWithUpload();
};

const proceedWithUpload = async () => {
  console.log('🚀 proceedWithUpload called');
  
  // 🚨 CRITICAL: Immediate state update to disable button
  setIsUploading(true);
  
  // 🚨 CRITICAL: Prevent double uploads - check all flags FIRST
  if (uploadStartedRef.current || uploadInProgressRef.current) {
    console.log('⚠️ Upload already in progress, ignoring duplicate tap');
    return;
  }

  // Debouncing: Prevent multiple taps within 2 seconds
  const now = Date.now();
  const timeSinceLastAttempt = now - lastUploadAttemptRef.current;
  if (timeSinceLastAttempt < 2000) {
    console.log('⚠️ Rapid tap detected, debouncing');
    setIsUploading(false);
    return;
  }
  lastUploadAttemptRef.current = now;

  // Prevent uploading the same video file twice
  if (videoUriRef.current === videoUri && uploadStartedRef.current) {
    console.log('⚠️ This video is already being uploaded');
    setIsUploading(false);
    return;
  }

  try {
    // 🆕 GET USER FIRST (needed for all checks)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Error', 'You must be logged in to upload');
      setIsUploading(false);
      return;
    }

    // Validation
    if (!videoUri) {
      Alert.alert('Error', 'Please record a video first');
      setIsUploading(false);
      return;
    }

    if (!description.trim()) {
      Alert.alert('Error', 'Please add a description');
      setIsUploading(false);
      return;
    }

    if (!location) {
      Alert.alert(
        'Location Required',
        'Your location is still loading. Would you like to refresh it now?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setIsUploading(false);
            }
          },
          {
            text: 'Refresh Location',
            onPress: async () => {
              setIsUploading(false);
              // Auto-trigger location refresh
              await refreshLocation(true);
            }
          }
        ]
      );
      return;
    }

    // 🆕 CHECK UPLOAD LIMIT (5/hour for free users)
    console.log('🔍 Checking upload limit...');
    const uploadLimitCheck = await checkUploadLimit(user.id);

    if (!uploadLimitCheck.allowed) {
      console.log('❌ Upload limit reached:', uploadLimitCheck.currentCount);
      Alert.alert(
        'Upload Limit Reached',
        uploadLimitCheck.message,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Upgrade to Premium',
            onPress: () => router.push('/settings')
          }
        ]
      );
      setIsUploading(false);
      return;
    }

    console.log('✅ Upload limit OK, proceeding...');

    // 🚨 CRITICAL: Validate environment variables BEFORE attempting upload
    // Only needed for the legacy direct-key path — the TUS path (utils/bunnynet.ts →
    // uploadVideoViaTus) is key-free and doesn't read EXPO_PUBLIC_BUNNY_STREAM_API_KEY at all.
    if (!USE_TUS_UPLOAD) {
      console.log('🔍 Validating Bunny.net credentials...');
      const bunnyApiKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_API_KEY;

      if (!bunnyApiKey) {
        console.error('❌ EXPO_PUBLIC_BUNNY_STREAM_API_KEY is not set');
        Alert.alert(
          'Configuration Error',
          'Bunny.net API key is missing.\n\nPlease check your .env file and ensure EXPO_PUBLIC_BUNNY_STREAM_API_KEY is set correctly.',
          [{ text: 'OK' }]
        );
        setIsUploading(false);
        return;
      }

      if (bunnyApiKey.length < 20) {
        console.error('❌ EXPO_PUBLIC_BUNNY_STREAM_API_KEY appears invalid (too short)');
        Alert.alert(
          'Configuration Error',
          'Bunny.net API key appears invalid.\n\nPlease verify EXPO_PUBLIC_BUNNY_STREAM_API_KEY in your .env file.',
          [{ text: 'OK' }]
        );
        setIsUploading(false);
        return;
      }

      console.log('✅ Credentials validated');
      console.log('  - Library ID: 517995 (hardcoded)');
      console.log('  - API Key: Present (length:', bunnyApiKey.length, ')');
    }

    console.log('🚀 Starting upload process');
    console.log('  - User ID:', user.id);
    console.log('  - Caption:', description);
    console.log('  - Location:', location.name);
    
    // 🔒 Set upload flags to prevent double uploads
    console.log('🔒 Locking upload to prevent duplicates');
    uploadStartedRef.current = true;
    uploadInProgressRef.current = true;
      
    console.log('📝 Creating pending upload record...');

    // Create pending upload record FIRST (before navigation)
    const { data: pendingUpload, error: pendingError } = await supabase
      .from('pending_uploads')
      .insert({
        user_id: user.id,
        video_uri: videoUri,
        caption: description,
        tags: hashtags,
        location_latitude: location.latitude,
        location_longitude: location.longitude,
        location_name: location.name,
        location_privacy: locationPrivacy,
        request_id: requestId || null,
        upload_progress: 0,
        status: 'uploading',
      })
      .select()
      .single();

    if (pendingError) {
      console.error('❌ Error creating pending upload:', pendingError);
      Alert.alert('Error', 'Failed to start upload. Please try again.');
      // Reset flags on error
      uploadStartedRef.current = false;
      uploadInProgressRef.current = false;
      setIsUploading(false);
      return;
    }

    console.log('✅ Pending upload created:', pendingUpload.id);

    // NOW navigate to Pending tab (after record exists)
    console.log('📱 Navigating to profile pending tab...');
    router.replace('/(tabs)/profile?tab=pending&refresh=true');

    // Small delay to ensure navigation completes
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('✅ Pending upload created:', pendingUpload.id);

    // Start background upload
    console.log('🔄 Starting background upload');
    uploadVideoInBackground( 
      pendingUpload.id,
      user.id,
      videoUri,
      description,
      hashtags,
      location,
      locationPrivacy,
      requestId
    );
      
  } catch (error: any) {
    console.error('❌ Upload error:', error);
    Alert.alert(
      'Upload Failed',
      error.message || 'An unknown error occurred. Please try again.',
      [{ text: 'OK' }]
    );
    // Reset flags on error
    uploadStartedRef.current = false;
    uploadInProgressRef.current = false;
    setIsUploading(false);
  }
};

  const uploadVideoInBackground = async (
    pendingUploadId: string,
    userId: string,
    videoUri: string,
    caption: string,
    tags: string[],
    loc: { latitude: number; longitude: number; name: string },
    privacy: LocationPrivacy,
    reqId?: string
  ) => {
    let bunnyVideoId: string | null = null;
    let videoRecordId: string | null = null;
    
    try {
      console.log('🎬 Background upload started');
      console.log('  - Pending Upload ID:', pendingUploadId);

      // Update progress: 10% - Creating video on Bunny.net
      console.log('📊 Progress: 10% - Creating video on Bunny.net');
      await supabase
        .from('pending_uploads')
        .update({ upload_progress: 10 })
        .eq('id', pendingUploadId);

      // 🚨 CRITICAL: Create video on Bunny.net Stream
      console.log('🎬 Creating video on Bunny.net...');

      // Get user's premium status
      const { data: userData } = await supabase
        .from('users')
        .select('is_premium')
        .eq('id', userId)
        .single();

      const isPremium = userData?.is_premium || false;
      console.log('👑 User premium status:', isPremium);

      if (USE_TUS_UPLOAD) {
        // ── NEW: key-free TUS path (utils/bunnynet.ts → uploadVideoViaTus) ──
        try {
          await uploadVideoViaTus(caption, videoUri, {
            isPremium,
            onVideoCreated: async (created) => {
              bunnyVideoId = created.guid;
              console.log('✅ Video created with ID:', bunnyVideoId);
              console.log('  Watermark:', isPremium ? 'DISABLED (Premium)' : 'ENABLED (Free)');

              // 🚨 CRITICAL: Store Bunny video ID in pending_uploads so cancel can find it
              console.log('💾 Storing Bunny video ID in pending upload record...');
              const { error: updateError } = await supabase
                .from('pending_uploads')
                .update({ bunny_video_id: bunnyVideoId, upload_progress: 20 })
                .eq('id', pendingUploadId);

              if (updateError) {
                console.error('❌ Error storing Bunny video ID:', updateError);
              } else {
                console.log('✅ Bunny video ID stored successfully');
              }
            },
            onProgress: async (uploaded, total) => {
              // maps the byte-upload phase onto the existing 20%→60% band
              const pct = 20 + Math.round((uploaded / total) * 40);
              await supabase.from('pending_uploads').update({ upload_progress: pct }).eq('id', pendingUploadId);
            },
          });
          console.log('✅ Video uploaded successfully via TUS');
        } catch (error: any) {
          console.error('❌ TUS upload failed:', error.message);
          throw new Error(`Failed to upload video: ${error.message}`);
        }
      } else {
        // ── OLD: direct-key path (fallback, unchanged) ──
        try {
          const videoData = await createStreamVideo(caption, isPremium);
          bunnyVideoId = videoData.guid;
          console.log('✅ Video created with ID:', bunnyVideoId);
          console.log('  Watermark:', isPremium ? 'DISABLED (Premium)' : 'ENABLED (Free)');

          // 🚨 CRITICAL: Store Bunny video ID in pending_uploads so cancel can find it
          console.log('💾 Storing Bunny video ID in pending upload record...');
          console.log('   Pending Upload ID:', pendingUploadId);
          console.log('   Bunny Video ID:', bunnyVideoId);

          const { data: updateResult, error: updateError } = await supabase
            .from('pending_uploads')
            .update({ bunny_video_id: bunnyVideoId })
            .eq('id', pendingUploadId)
            .select();

          if (updateError) {
            console.error('❌ Error storing Bunny video ID:', updateError);
          } else {
            console.log('✅ Bunny video ID stored successfully');
            console.log('   Updated record:', updateResult);
          }
        } catch (createError: any) {
          console.error('❌ Failed to create video on Bunny.net:', createError.message);
          throw new Error(`Failed to create video: ${createError.message}`);
        }

        // Update progress: 20% - Uploading video file
        console.log('📊 Progress: 20% - Uploading video file');
        await supabase
          .from('pending_uploads')
          .update({ upload_progress: 20 })
          .eq('id', pendingUploadId);

        // 🚨 CRITICAL: Upload video file
        console.log('📤 Uploading video file to Bunny.net...');
        try {
          await uploadToStream(bunnyVideoId, videoUri, isPremium);

          console.log('✅ Video uploaded successfully');
        } catch (uploadError: any) {
          console.error('❌ Failed to upload video file:', uploadError.message);

          throw new Error(`Failed to upload video: ${uploadError.message}`);
        }
      }

      // Update progress: 60% - Processing video
      console.log('📊 Progress: 60% - Processing video');
      await supabase
        .from('pending_uploads')
        .update({ upload_progress: 60, status: 'processing' })
        .eq('id', pendingUploadId);

      // Wait for video processing
      console.log('⏳ Waiting for video processing...');
      let processed = false;
      let attempts = 0;
      const maxAttempts = 120;

      while (!processed && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const status = USE_EDGE_STATUS_CHECK
          ? await getVideoStatusViaEdgeFunction(bunnyVideoId, isPremium)
          : await getVideoStatus(bunnyVideoId, isPremium);

        const processingProgress = 60 + Math.min(attempts * 1, 30);
        await supabase
          .from('pending_uploads')
          .update({ upload_progress: processingProgress })
          .eq('id', pendingUploadId);
        
        console.log(`⏳ Attempt ${attempts + 1}/${maxAttempts} - Bunny status: ${status.status}`);
        if (status.status === 4) {
          processed = true;
          console.log('✅ Video processing complete');
        } else if (status.status === 5 || status.status === 6) {
          console.log('❌ Video processing failed on Bunny.net, status:', status.status);
          throw new Error('Video processing failed on Bunny.net');
        }
        attempts++;
      }

      if (!processed) {
        throw new Error('Video processing timeout - please try again');
      }

      // Update progress: 95% - Saving to database
      console.log('📊 Progress: 95% - Saving to database');
      await supabase
        .from('pending_uploads')
        .update({ upload_progress: 95 })
        .eq('id', pendingUploadId);

      const videoUrl = bunnyVideoId;

      // 🆕 Determine which library and CDN to use based on premium status
      const libraryId = isPremium ? 597832 : 517995;
      const cdnHostname = isPremium 
        ? Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_PREMIUM_CDN_HOSTNAME 
        : Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME;

      const thumbnailUrl = `https://${cdnHostname}/${bunnyVideoId}/thumbnail.jpg`;

      console.log('💾 Saving video to database...');
      console.log('  - Library ID:', libraryId, isPremium ? '(Premium)' : '(Free)');
      console.log('  - CDN Hostname:', cdnHostname);
      console.log('  - Thumbnail URL:', thumbnailUrl);

      const videoRecord: any = {
        user_id: userId,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        caption: caption,
        tags: tags,
        location_latitude: loc.latitude,
        location_longitude: loc.longitude,
        location_name: loc.name,
        location_privacy: privacy,
        moderation_status: 'pending',
        is_approved: false,
        request_id: reqId || null,
        library_id: libraryId,
      };

      const { data: video, error: dbError } = await supabase
        .from('videos')
        .insert(videoRecord)
        .select()
        .single();

      if (dbError) {
        console.error('❌ Database error:', dbError);
        throw new Error('Failed to save video to database');
      }

      videoRecordId = video.id;
console.log('✅ Video saved to database:', video.id);

// 🚨 CRITICAL: If this fulfills a request, create fulfillment record
if (reqId) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 CREATING REQUEST FULFILLMENT');
  console.log('  Request ID:', reqId);
  console.log('  Video ID:', video.id);
  console.log('  User ID:', userId);
  
  const { data: fulfillmentData, error: fulfillmentError } = await supabase
    .from('request_fulfillments')
    .insert({
      request_id: reqId,
      video_id: video.id,
      user_id: userId,
    })
    .select()
    .single();

  if (fulfillmentError) {
    console.error('❌ CRITICAL ERROR: Failed to create fulfillment record!');
    console.error('Error details:', fulfillmentError);
    console.error('This means the requester will NOT see this video!');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Don't throw - let the upload complete, but log the issue prominently
    // The video is still saved, but won't appear in fulfillments
  } else {
    console.log('✅ Request fulfillment created successfully');
    console.log('Fulfillment ID:', fulfillmentData.id);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
} else {
  console.log('ℹ️ This is not a request fulfillment (no request_id)');
}

      // Update progress: 100% - Complete, then DELETE the pending upload
      console.log('📊 Progress: 100% - Upload complete');
      await supabase
        .from('pending_uploads')
        .update({ 
          upload_progress: 100, 
          status: 'completed'
        })
        .eq('id', pendingUploadId);

      // DELETE the pending upload immediately - video is now in the videos table
      console.log('🗑️ Deleting pending upload record (upload complete)');
      await supabase
        .from('pending_uploads')
        .delete()
        .eq('id', pendingUploadId);

      console.log('✅ Pending upload card removed');

      // 🚀 Trigger video moderation asynchronously (fire and forget)
      console.log('🚀 Triggering video moderation...');

      supabase.functions
        .invoke('moderate-video', {
          body: {
            videoId: video.id,
            videoUrl: videoUrl,
            thumbnailUrl: thumbnailUrl,
            userId: userId,
            requestId: reqId || null,
          },
        })
        .then((response) => {
          console.log('✅ Video moderation triggered:', response);
        })
        .catch((error) => {
          console.error('⚠️ Video moderation trigger failed (non-critical):', error);
        });

      console.log('✅ Upload completed successfully');

    } catch (error: any) {
      console.error('❌ Upload failed:', error.message);
      
      // Clean up failed upload
      await cleanupFailedUpload(pendingUploadId, bunnyVideoId, videoRecordId, isPremium);
    } finally {
      // Reset upload flags
      uploadInProgressRef.current = false;
      uploadStartedRef.current = false;
      setIsUploading(false);
    }
  };

  /**
   * Clean up a failed or cancelled upload
   * Deletes from Bunny.net, database, and pending uploads table
   */
  const cleanupFailedUpload = useCallback(async (
    pendingUploadId: string,
    bunnyVideoId: string | null,
    videoRecordId: string | null,
    isPremium: boolean = false
  ) => {
    console.log('🧹 === CLEANING UP FAILED/CANCELLED UPLOAD ===');
    console.log('  - Pending Upload ID:', pendingUploadId);
    console.log('  - Bunny Video ID:', bunnyVideoId || 'None');
    console.log('  - Video Record ID:', videoRecordId || 'None');
    
    const cleanupResults = {
      bunny: false,
      database: false,
      pending: false,
    };
    
    // Delete from Bunny.net if video was created
    if (bunnyVideoId) {
      console.log('🗑️ Deleting video from Bunny.net...');
      try {
        if (USE_EDGE_DELETE) {
          await getDeleteVideoViaEdgeFunction(bunnyVideoId, isPremium);
        } else {
          await deleteStreamVideo(bunnyVideoId, isPremium);
        }
        console.log('✅ Video deleted from Bunny.net');
        cleanupResults.bunny = true;
      } catch (deleteError: any) {
        console.error('⚠️ Error deleting from Bunny.net:', deleteError.message);
      }
    } else {
      console.log('ℹ️ No Bunny video ID, skipping Bunny.net deletion');
    }
    
    // Delete from database if record was created
    if (videoRecordId) {
      console.log('🗑️ Deleting video record from database...');
      try {
        const { error: deleteError } = await supabase
          .from('videos')
          .delete()
          .eq('id', videoRecordId);
        
        if (deleteError) {
          console.error('⚠️ Database delete error:', deleteError);
        } else {
          console.log('✅ Video record deleted from database');
          cleanupResults.database = true;
        }
      } catch (deleteError: any) {
        console.error('⚠️ Error deleting from database:', deleteError.message);
      }
    } else {
      console.log('ℹ️ No video record ID, skipping database deletion');
    }
    
// Mark as failed instead of deleting — allows retry
if (pendingUploadId) {
  console.log('🔴 Marking pending upload as failed...');
  try {
    const { error: updateError } = await supabase
      .from('pending_uploads')
      .update({ 
        status: 'failed',
        upload_progress: 0,
        error_message: 'Upload failed. Tap retry to try again.',
      })
      .eq('id', pendingUploadId);

    if (updateError) {
      console.error('⚠️ Failed to mark as failed:', updateError);
    } else {
      console.log('✅ Pending upload marked as failed');
      cleanupResults.pending = true;
    }
  } catch (deleteError: any) {
    console.error('⚠️ Error updating pending upload:', deleteError);
  }
}

}, []); // ← This closes cleanupFailedUpload

  // 📍 LOCATION DENIED SCREEN
  if (locationDenied) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Location Required</Text>
          <View style={{ width: 40 }} />
        </LinearGradient>
        <View style={styles.locationDeniedContainer}>
          <IconSymbol ios_icon_name="location.slash.fill" android_material_icon_name="location-off" size={80} color={colors.primary} />
          <Text style={styles.locationDeniedTitle}>Location Access Required</Text>
          <Text style={styles.locationDeniedText}>
            POPNOW is a location-based video platform. Your location is needed to pin your video on the map so people around the world can discover it.
          </Text>
          <Text style={styles.locationDeniedSubtext}>
            Without location access, you can still browse, watch, like, comment, follow users, and create video requests.
          </Text>
          <Pressable
            style={styles.openSettingsButton}
            onPress={() => Linking.openSettings()}
          >
            <IconSymbol ios_icon_name="gear" android_material_icon_name="settings" size={20} color="#FFFFFF" />
            <Text style={styles.openSettingsButtonText}>Open Settings</Text>
          </Pressable>
          <Pressable
            style={styles.goBackButton}
            onPress={() => router.back()}
          >
            <Text style={styles.goBackButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>
            {requestId ? 'Fulfill Request' : 'Upload Video'}
          </Text>
          <View style={{ width: 40 }} />
        </LinearGradient>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
        <Pressable 
          onPress={() => router.back()} 
          style={styles.backButton}
          disabled={isUploading}
        >
          <IconSymbol 
            ios_icon_name="chevron.left" 
            android_material_icon_name="arrow-back" 
            size={24} 
            color={isUploading ? '#666666' : '#FFFFFF'} 
          />
        </Pressable>
        <Text style={styles.headerTitle}>
          {requestId ? 'Fulfill Request' : 'Upload Video'}
        </Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 160 }}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Video Ready</Text>
            <View style={styles.videoPreview}>
              <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={48} color={colors.primary} />
              <Text style={styles.videoPreviewText}>Video recorded successfully</Text>
              <Pressable onPress={handleRecordAgain} style={styles.rerecordButton}>
                <Text style={styles.rerecordButtonText}>Record Again</Text>
              </Pressable>
            </View>
          </View>

          {requestId && (
            <View style={styles.warningSection}>
              <View style={styles.warningHeader}>
                <IconSymbol ios_icon_name="info.circle.fill" android_material_icon_name="info" size={24} color={colors.primary} />
                <Text style={styles.warningTitle}>Important Notice</Text>
              </View>
              <Text style={styles.warningText}>
                Please note, by taking this request, your video will be downloadable for the requester for 3 days.
              </Text>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Pressable 
                onPress={handleGenerateDescription} 
                style={styles.generateButton}
                disabled={isGeneratingDescription}
              >
                {isGeneratingDescription ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={16} color={colors.primary} />
                    <Text style={styles.generateButtonText}>AI Generate</Text>
                  </>
                )}
              </Pressable>
            </View>
            <TextInput
              style={styles.descriptionInput}
              value={description}
              onChangeText={setDescription}
              placeholder="E.g., my dog friend"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
            />
            <Text style={styles.helperText}>
              Type a short description, then tap AI Generate to make it more vivid
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Hashtags</Text>
              <Pressable onPress={handleGenerateHashtags} style={styles.generateButton}>
                <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={16} color={colors.primary} />
                <Text style={styles.generateButtonText}>Suggest</Text>
              </Pressable>
            </View>
            
            {suggestedHashtags.length > 0 && (
              <View style={styles.hashtagsContainer}>
                {suggestedHashtags.map((tag) => (
                  <Pressable
                    key={tag}
                    style={[
                      styles.hashtagChip,
                      hashtags.includes(tag) && styles.hashtagChipActive,
                    ]}
                    onPress={() => toggleHashtag(tag)}
                  >
                    <Text
                      style={[
                        styles.hashtagChipText,
                        hashtags.includes(tag) && styles.hashtagChipTextActive,
                      ]}
                    >
                      {tag}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Location</Text>
              <Pressable 
                onPress={() => refreshLocation(true)} 
                style={styles.refreshButton}
                disabled={isRefreshingLocation}
              >
                {isRefreshingLocation ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <IconSymbol ios_icon_name="arrow.clockwise" android_material_icon_name="refresh" size={16} color={colors.primary} />
                    <Text style={styles.refreshButtonText}>Refresh</Text>
                  </>
                )}
              </Pressable>
            </View>
            <View style={styles.locationCard}>
              <IconSymbol ios_icon_name="location.fill" android_material_icon_name="location-on" size={24} color={colors.primary} />
              <View style={styles.locationInfo}>
                <Text style={styles.locationName}>{location?.name || 'Unknown'}</Text>
                <Text style={styles.locationCoords}>
                  {location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : ''}
                </Text>
              </View>
            </View>
            <Text style={styles.helperText}>
              Location is automatically refreshed when you record a video. Tap Refresh to update it manually.
            </Text>
          </View>

          <View style={styles.section}>
  <Text style={styles.sectionTitle}>Location Privacy</Text>
  <View style={styles.privacyOptions}>
    {(['exact', '3km', '10km'] as LocationPrivacy[]).map((privacy) => (
  <Pressable
  key={privacy}
  style={[
    styles.privacyOption,
    locationPrivacy === privacy && styles.privacyOptionActive,
  ]}
  onPress={() => setLocationPrivacy(privacy)}
>
        <IconSymbol
          ios_icon_name={getPrivacyIcon(privacy)}
          android_material_icon_name="circle"
          size={24}
          color={locationPrivacy === privacy ? '#FFFFFF' : colors.text}
        />
        <Text
          style={[
            styles.privacyOptionText,
            locationPrivacy === privacy && styles.privacyOptionTextActive,
          ]}
        >
          {getPrivacyDescription(privacy)}
        </Text>
      </Pressable>
    ))}
  </View>
</View>

          {/* Watermark Notice - Only show for free users */}
          {!isPremium && (
            <Pressable 
              style={styles.watermarkNotice}
              onPress={() => router.push('/settings')}
            >
              <View style={styles.watermarkHeader}>
                <IconSymbol 
                  ios_icon_name="info.circle.fill" 
                  android_material_icon_name="info" 
                  size={20} 
                  color={colors.primary} 
                />
                <Text style={styles.watermarkTitle}>Watermark Notice</Text>
              </View>
              <Text style={styles.watermarkText}>
                A POPNOW watermark will be added to your video. Free users can upload up to <Text style={{ fontWeight: '700' }}>5 videos per hour</Text>.
                <Text style={styles.watermarkLink}> Upgrade to Premium</Text> to <Text style={{ fontWeight: '700' }}>remove watermarks, get unlimited uploads, and download your videos without any branding</Text>.
              </Text>
            </Pressable>
          )}

          <Pressable
            style={[styles.uploadButton, isUploading && styles.uploadButtonDisabled]}
            onPress={handleUpload}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.uploadButtonText}>Uploading...</Text>
              </>
            ) : (
              <>
                <IconSymbol ios_icon_name="arrow.up.circle.fill" android_material_icon_name="upload" size={24} color="#FFFFFF" />
                <Text style={styles.uploadButtonText}>Upload Video</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
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
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: `${colors.primary}20`,
    borderRadius: 8,
    minWidth: 100,
    justifyContent: 'center',
  },
  generateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: `${colors.primary}20`,
    borderRadius: 8,
    minWidth: 90,
    justifyContent: 'center',
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  videoPreview: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  videoPreviewText: {
    fontSize: 16,
    color: colors.text,
  },
  rerecordButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  rerecordButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  descriptionInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.textSecondary + '30',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  helperText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  hashtagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hashtagChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.textSecondary + '30',
  },
  hashtagChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  hashtagChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  hashtagChipTextActive: {
    color: '#FFFFFF',
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.textSecondary + '30',
    borderRadius: 12,
    padding: 16,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  locationCoords: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  privacyOptions: {
    gap: 12,
  },
  privacyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.textSecondary + '30',
    borderRadius: 12,
  },
  privacyOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  privacyOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  privacyOptionTextActive: {
    color: '#FFFFFF',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    marginTop: 8,
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  warningSection: {
    backgroundColor: `${colors.primary}15`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: `${colors.primary}40`,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  warningText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  watermarkNotice: {
    backgroundColor: '#fff8dc',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  watermarkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  watermarkTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  watermarkText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 19,
  },
  watermarkLink: {
    color: colors.primary,
    fontWeight: '600',
  },
  // 📍 Location Denied Screen styles
  locationDeniedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  locationDeniedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  locationDeniedText: {
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 12,
  },
  locationDeniedSubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  openSettingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 16,
    width: '100%',
  },
  openSettingsButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  goBackButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  goBackButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});