
import React, { useState, useEffect, useRef } from 'react';
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
import { 
  createStreamVideo, 
  uploadToStream, 
  getVideoStatus, 
  deleteStreamVideo,
} from '@/utils/bunnynet';

type LocationPrivacy = 'exact' | '3km' | '10km';

export default function UploadScreen() {
  const params = useLocalSearchParams();
  const requestId = params.requestId as string | undefined;
  const requestDescription = params.requestDescription as string | undefined;
  const videoUri = params.videoUri as string | undefined;

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
  
  // 🚨 CRITICAL: Upload state management to prevent double uploads
  const [isUploading, setIsUploading] = useState(false);
  const uploadInProgressRef = useRef(false);
  const uploadStartedRef = useRef(false);
  const videoUriRef = useRef<string | null>(null); // Track which video is being uploaded
  const lastUploadAttemptRef = useRef<number>(0); // Debouncing timestamp
  
  // 🚨 NEW: AbortController for canceling uploads
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentBunnyVideoIdRef = useRef<string | null>(null);
  const currentPendingUploadIdRef = useRef<string | null>(null);

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
        const addr = address[0];
        
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
        const addr = address[0];
        
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
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎬 USER TAPPED UPLOAD VIDEO BUTTON');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // 🚨 CRITICAL: Prevent double uploads - Check ALL upload flags
    console.log('🔍 Checking upload state...');
    console.log('  - uploadStartedRef.current:', uploadStartedRef.current);
    console.log('  - uploadInProgressRef.current:', uploadInProgressRef.current);
    console.log('  - isUploading state:', isUploading);
    console.log('  - videoUriRef.current:', videoUriRef.current);
    console.log('  - current videoUri:', videoUri);
    
    // Check if upload already started
    if (uploadStartedRef.current || uploadInProgressRef.current || isUploading) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️ DUPLICATE UPLOAD ATTEMPT BLOCKED');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Upload already in progress. Ignoring duplicate tap.');
      return;
    }

    // Debouncing: Prevent multiple taps within 2 seconds
    const now = Date.now();
    const timeSinceLastAttempt = now - lastUploadAttemptRef.current;
    if (timeSinceLastAttempt < 2000) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️ RAPID TAP DETECTED - DEBOUNCING');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Time since last attempt: ${timeSinceLastAttempt}ms (minimum: 2000ms)`);
      return;
    }
    lastUploadAttemptRef.current = now;

    // Additional check: Prevent uploading the same video file twice
    if (videoUriRef.current === videoUri && uploadStartedRef.current) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️ DUPLICATE VIDEO UPLOAD BLOCKED');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('This video file is already being uploaded.');
      return;
    }

    // Validation
    if (!videoUri) {
      Alert.alert('Error', 'Please record a video first');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Error', 'Please add a description');
      return;
    }

    if (!location) {
      Alert.alert('Error', 'Location is required');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to upload');
        return;
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚀 STARTING UPLOAD PROCESS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('User ID:', user.id);
      console.log('Video URI:', videoUri);
      console.log('Caption:', description);
      console.log('Tags:', hashtags);
      console.log('Location:', location.name);
      
      // 🔒 IMMEDIATELY set ALL upload flags to prevent double uploads
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔒 LOCKING UPLOAD - Setting all flags to prevent duplicates');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      uploadStartedRef.current = true;
      uploadInProgressRef.current = true;
      setIsUploading(true);
      
      // 🚨 NEW: Create AbortController for this upload
      abortControllerRef.current = new AbortController();
      
      console.log('✅ Upload flags set:');
      console.log('  - uploadStartedRef.current:', uploadStartedRef.current);
      console.log('  - uploadInProgressRef.current:', uploadInProgressRef.current);
      console.log('  - isUploading state:', true);
      console.log('  - Button is now DISABLED');
      console.log('  - AbortController created');
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📝 Creating pending upload record in database...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Create pending upload record
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
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ ERROR CREATING PENDING UPLOAD');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('Error:', pendingError);
        Alert.alert('Error', 'Failed to start upload');
        // Reset flags on error
        uploadStartedRef.current = false;
        uploadInProgressRef.current = false;
        setIsUploading(false);
        abortControllerRef.current = null;
        return;
      }

      console.log('✅ Pending upload created successfully');
      console.log('Pending Upload ID:', pendingUpload.id);
      
      // Store pending upload ID for cancellation
      currentPendingUploadIdRef.current = pendingUpload.id;

      // 📱 IMMEDIATELY navigate to profile pending tab (BEFORE starting upload)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📱 NAVIGATING TO PROFILE PENDING TAB');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('User will see "Uploading..." status immediately');
      router.replace('/(tabs)/profile?tab=pending');

      // 🔄 Start background upload (non-blocking) - this happens AFTER navigation
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔄 STARTING BACKGROUND UPLOAD PROCESS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
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
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ UPLOAD ERROR');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('Error:', error);
      Alert.alert('Error', 'Failed to start upload: ' + (error.message || 'Unknown error'));
      // Reset flags on error
      uploadStartedRef.current = false;
      uploadInProgressRef.current = false;
      setIsUploading(false);
      abortControllerRef.current = null;
      currentPendingUploadIdRef.current = null;
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
    
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎬 BACKGROUND UPLOAD STARTED');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Pending Upload ID:', pendingUploadId);

      // Check if upload was aborted
      if (abortControllerRef.current?.signal.aborted) {
        console.log('⚠️ Upload aborted before starting');
        return;
      }

      // Update progress: 10% - Creating video on Bunny.net
      console.log('📊 Progress: 10% - Creating video on Bunny.net');
      await supabase
        .from('pending_uploads')
        .update({ upload_progress: 10 })
        .eq('id', pendingUploadId);

      // Create video on Bunny.net Stream
      console.log('🎬 Creating video on Bunny.net Stream...');
      const videoData = await createStreamVideo(caption);
      bunnyVideoId = videoData.guid;
      currentBunnyVideoIdRef.current = bunnyVideoId;
      console.log('✅ Video created with ID:', bunnyVideoId);

      // Check if upload was aborted after creating video
      if (abortControllerRef.current?.signal.aborted) {
        console.log('⚠️ Upload aborted after creating video, deleting from Bunny.net...');
        if (bunnyVideoId) {
          await deleteStreamVideo(bunnyVideoId);
          console.log('✅ Video deleted from Bunny.net');
        }
        return;
      }

      // Update progress: 20% - Uploading video file
      console.log('📊 Progress: 20% - Uploading video file');
      await supabase
        .from('pending_uploads')
        .update({ upload_progress: 20 })
        .eq('id', pendingUploadId);

      // Upload video file
      console.log('📤 Uploading video file to Bunny.net...');
      await uploadToStream(bunnyVideoId, videoUri);
      console.log('✅ Video uploaded to stream');

      // Check if upload was aborted after uploading
      if (abortControllerRef.current?.signal.aborted) {
        console.log('⚠️ Upload aborted after uploading, deleting from Bunny.net...');
        if (bunnyVideoId) {
          await deleteStreamVideo(bunnyVideoId);
          console.log('✅ Video deleted from Bunny.net');
        }
        return;
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
      const maxAttempts = 30;

      while (!processed && attempts < maxAttempts) {
        // Check if upload was aborted during processing
        if (abortControllerRef.current?.signal.aborted) {
          console.log('⚠️ Upload aborted during processing, deleting from Bunny.net...');
          if (bunnyVideoId) {
            await deleteStreamVideo(bunnyVideoId);
            console.log('✅ Video deleted from Bunny.net');
          }
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
        const status = await getVideoStatus(bunnyVideoId);
        console.log(`Video status check ${attempts + 1}/${maxAttempts}:`, status);
        
        // Update progress incrementally during processing
        const processingProgress = 60 + Math.min(attempts * 1, 30);
        await supabase
          .from('pending_uploads')
          .update({ upload_progress: processingProgress })
          .eq('id', pendingUploadId);
        
        if (status.status === 4) {
          processed = true;
          console.log('✅ Video processing complete!');
        }
        attempts++;
      }

      if (!processed) {
        throw new Error('Video processing timeout');
      }

      console.log('✅ Video processed successfully');

      // Final check before saving to database
      if (abortControllerRef.current?.signal.aborted) {
        console.log('⚠️ Upload aborted before saving to database, deleting from Bunny.net...');
        if (bunnyVideoId) {
          await deleteStreamVideo(bunnyVideoId);
          console.log('✅ Video deleted from Bunny.net');
        }
        return;
      }

      // Update progress: 95% - Saving to database
      console.log('📊 Progress: 95% - Saving to database');
      await supabase
        .from('pending_uploads')
        .update({ upload_progress: 95 })
        .eq('id', pendingUploadId);

      const videoUrl = bunnyVideoId;
      const thumbnailUrl = `https://${process.env.EXPO_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME}/${bunnyVideoId}/thumbnail.jpg`;

      console.log('💾 Saving video to database...');
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
        is_approved: false, // Start as not approved until moderation completes
      };

      const { data: video, error: dbError } = await supabase
        .from('videos')
        .insert(videoRecord)
        .select()
        .single();

      if (dbError) {
        console.error('❌ Database error:', dbError);
        throw dbError;
      }

      console.log('✅ Video saved to database:', video.id);

      // If this fulfills a request, create fulfillment record
      if (reqId) {
        console.log('📝 Creating request fulfillment record...');
        const { error: fulfillmentError } = await supabase
          .from('request_fulfillments')
          .insert({
            request_id: reqId,
            video_id: video.id,
            user_id: userId,
          });

        if (fulfillmentError) {
          console.error('❌ Error creating fulfillment:', fulfillmentError);
        } else {
          console.log('✅ Request fulfillment created successfully');
        }
      }

      // Update progress: 100% - Complete
      console.log('📊 Progress: 100% - Complete');
      await supabase
        .from('pending_uploads')
        .update({ upload_progress: 100, status: 'completed' })
        .eq('id', pendingUploadId);

      // Delete pending upload record after a short delay
      setTimeout(async () => {
        console.log('🧹 Cleaning up pending upload record...');
        await supabase
          .from('pending_uploads')
          .delete()
          .eq('id', pendingUploadId);
        console.log('✅ Pending upload record deleted');
      }, 3000);

      // 🚨 CRITICAL: Call moderate-video Edge Function to trigger AI moderation
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔍 TRIGGERING AWS REKOGNITION MODERATION');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Video ID:', video.id);
      console.log('Video URL:', videoUrl);
      console.log('User ID:', userId);
      
      try {
        const { data: moderationData, error: moderationError } = await supabase.functions.invoke(
          'moderate-video',
          {
            body: {
              videoId: video.id,
              videoUrl: videoUrl,
              thumbnailUrl: thumbnailUrl,
              userId: userId,
            },
          }
        );

        if (moderationError) {
          console.error('❌ Moderation invocation error:', moderationError);
          console.error('Error details:', JSON.stringify(moderationError, null, 2));
        } else {
          console.log('✅ AWS Rekognition moderation triggered successfully');
          console.log('Moderation response:', moderationData);
        }
      } catch (moderationError: any) {
        console.error('❌ Error calling moderation function:', moderationError);
        console.error('Error message:', moderationError.message);
        console.error('Error stack:', moderationError.stack);
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ BACKGROUND UPLOAD COMPLETED SUCCESSFULLY');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (error: any) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ BACKGROUND UPLOAD ERROR');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('Error:', error);
      
      // If upload failed, delete video from Bunny.net if it was created
      if (bunnyVideoId) {
        console.log('🗑️ Cleaning up failed upload from Bunny.net...');
        try {
          await deleteStreamVideo(bunnyVideoId);
          console.log('✅ Failed video deleted from Bunny.net');
        } catch (deleteError) {
          console.error('❌ Error deleting failed video:', deleteError);
        }
      }
      
      await supabase
        .from('pending_uploads')
        .update({ 
          status: 'failed',
          error_message: error.message || 'Unknown error'
        })
        .eq('id', pendingUploadId);
    } finally {
      // Reset upload flags after completion or error
      console.log('🔓 Resetting upload flags...');
      uploadInProgressRef.current = false;
      abortControllerRef.current = null;
      currentBunnyVideoIdRef.current = null;
      currentPendingUploadIdRef.current = null;
      // Note: We don't reset uploadStartedRef because the user has already navigated away
      // This prevents them from uploading the same video again if they come back to this screen
    }
  };

  const handleCancelUpload = () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚫 USER TAPPED CANCEL UPLOAD');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('isUploading:', isUploading);
    console.log('uploadInProgressRef.current:', uploadInProgressRef.current);
    
    if (isUploading || uploadInProgressRef.current) {
      Alert.alert(
        'Cancel Upload',
        'Are you sure you want to cancel this upload? The video will be deleted.',
        [
          { text: 'Continue Upload', style: 'cancel' },
          {
            text: 'Cancel Upload',
            style: 'destructive',
            onPress: async () => {
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log('🗑️ CANCELING UPLOAD');
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              
              // 1. Abort the upload request
              if (abortControllerRef.current) {
                console.log('⚠️ Aborting upload request...');
                abortControllerRef.current.abort();
                console.log('✅ Upload request aborted');
              }
              
              // 2. Delete video from Bunny.net if it was created
              if (currentBunnyVideoIdRef.current) {
                console.log('🗑️ Deleting video from Bunny.net...');
                console.log('Video ID:', currentBunnyVideoIdRef.current);
                try {
                  await deleteStreamVideo(currentBunnyVideoIdRef.current);
                  console.log('✅ Video deleted from Bunny.net');
                } catch (error) {
                  console.error('❌ Error deleting video from Bunny.net:', error);
                }
              }
              
              // 3. Delete pending upload record from database
              if (currentPendingUploadIdRef.current) {
                console.log('🗑️ Deleting pending upload record from database...');
                console.log('Pending Upload ID:', currentPendingUploadIdRef.current);
                try {
                  await supabase
                    .from('pending_uploads')
                    .delete()
                    .eq('id', currentPendingUploadIdRef.current);
                  console.log('✅ Pending upload record deleted');
                } catch (error) {
                  console.error('❌ Error deleting pending upload record:', error);
                }
              }
              
              // 4. Reset all flags
              console.log('🔓 Resetting all upload flags...');
              uploadStartedRef.current = false;
              uploadInProgressRef.current = false;
              setIsUploading(false);
              abortControllerRef.current = null;
              currentBunnyVideoIdRef.current = null;
              currentPendingUploadIdRef.current = null;
              console.log('✅ All flags reset');
              
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log('✅ UPLOAD CANCELED SUCCESSFULLY');
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              
              // 5. Navigate back
              router.back();
            },
          },
        ]
      );
    } else {
      console.log('No upload in progress, navigating back');
      router.back();
    }
  };

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
        <Pressable onPress={handleCancelUpload} style={styles.backButton}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>
          {requestId ? 'Fulfill Request' : 'Upload Video'}
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
    backgroundColor: colors.surface,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
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
});
