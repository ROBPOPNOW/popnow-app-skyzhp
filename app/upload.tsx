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
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import type { NavigationAction } from '@react-navigation/routers';
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
  getBunnyLibraryConfig,
  getVideoThumbnailUrl,
} from '@/utils/bunnynet';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { USE_TUS_UPLOAD, USE_EDGE_STATUS_CHECK, USE_EDGE_DELETE, USE_PREUPLOAD } from '@/config/uploadFlags';

type LocationPrivacy = 'exact' | '3km' | '10km';

const MAX_HASHTAGS = 8;
const MAX_TAG_LENGTH = 20;

// Tier 1 background pre-upload (behind USE_PREUPLOAD) — same pattern proven in the
// dev-preupload-test.tsx prototype.
const SUPABASE_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const PREUPLOAD_PROXY_URL = `${SUPABASE_URL}/functions/v1/bunny-upload-proxy`;

export default function UploadScreen() {
  const params = useLocalSearchParams();
  const requestId = params.requestId as string | undefined;
  const requestDescription = params.requestDescription as string | undefined;
  const videoUri = params.videoUri as string | undefined;
  const [isPremium, setIsPremium] = useState(false);

  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    name: string;
  } | null>(null);
  const [locationPrivacy, setLocationPrivacy] = useState<LocationPrivacy>('exact');
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [locationDenied, setLocationDenied] = useState(false);
  
  // 🚨 CRITICAL: Upload state management to prevent double uploads
  const [isUploading, setIsUploading] = useState(false);
  const uploadInProgressRef = useRef(false);
  const uploadStartedRef = useRef(false);
  const videoUriRef = useRef<string | null>(null); // Track which video is being uploaded
  const lastUploadAttemptRef = useRef<number>(0); // Debouncing timestamp

  // Tier 1 background pre-upload (behind USE_PREUPLOAD) — distinct from the refs above,
  // which track the legacy Post-time JS upload. These track the silent background upload
  // that starts the moment the edit screen mounts, before Post is ever tapped.
  const hasStartedPreuploadRef = useRef(false); // once-only guard — set synchronously, before any await
  const preuploadTaskRef = useRef<FileSystem.UploadTask | null>(null); // for cancelAsync() on back-arrow discard
  const preuploadBunnyVideoIdRef = useRef<string | null>(null);
  const preuploadPendingUploadIdRef = useRef<string | null>(null);
  const preuploadIsPremiumRef = useRef(false); // so the discard handler doesn't need to re-query is_premium
  // Step 4 (Part A, Layer 1): set true only on a GENUINE background-upload failure
  // (startPreupload's own passive-failure branch and its outer-catch mirror) — never
  // on a user-initiated discard. handlePreuploadPost checks this at Post time to write
  // 'interrupted' instead of 'posted' when there's already nothing left to wait on.
  const preuploadUploadFailedRef = useRef(false);
  const isDiscardingRef = useRef(false); // re-entrancy guard — a second exit attempt while cleanup is mid-flight is a no-op
  // Step 2 (Post handler) will flip this true on a successful Post — gates the discard
  // confirmation off once the user has committed, per the state model ('interrupted' is
  // only ever reachable from 'posted', never a reason to discard-on-exit again here).
  const [hasPosted, setHasPosted] = useState(false);
  // Drives the Post button's disabled/"Preparing..." state and Step 2's post-time
  // decision: 'ready' once startPreupload has a row to attach metadata to; 'failed'
  // if pre-upload couldn't get that far (Post transparently falls back to the legacy
  // flow in that case). Stays 'preparing' forever when USE_PREUPLOAD is off — harmless,
  // since every check on this value is itself gated behind USE_PREUPLOAD.
  const [preuploadState, setPreuploadState] = useState<'preparing' | 'ready' | 'failed'>('preparing');

  const navigation = useNavigation();

  // Abandon-with-confirmation (Step 3): usePreventRemove intercepts the navigator's
  // beforeRemove event, which fires for ANY action that removes this screen's route —
  // back arrow, Android hardware/gesture back, iOS edge-swipe, and "Record Again"'s
  // router.replace() all dispatch actions that qualify, so this single hook covers all
  // of them uniformly. No-op when USE_PREUPLOAD is off or once hasPosted is true.
  usePreventRemove(USE_PREUPLOAD && !hasPosted, ({ data: { action } }) => {
    Alert.alert(
      'Discard video?',
      'Are you sure you want to go back? Your recorded video will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => handleDiscardAndLeave(action) },
      ]
    );
  });

  const handleDiscardAndLeave = async (action: NavigationAction) => {
    if (isDiscardingRef.current) return; // double-tap / re-entrancy guard
    isDiscardingRef.current = true;

    try {
      if (preuploadTaskRef.current) {
        try {
          await preuploadTaskRef.current.cancelAsync();
        } catch (cancelError) {
          console.error('⚠️ [preupload] cancelAsync failed (continuing cleanup anyway):', cancelError);
        }
      }

      if (preuploadBunnyVideoIdRef.current) {
        await cleanupBunnyVideo(preuploadBunnyVideoIdRef.current, preuploadIsPremiumRef.current);
      }

      if (preuploadPendingUploadIdRef.current) {
        const { error: deleteRowError } = await supabase
          .from('pending_uploads')
          .delete()
          .eq('id', preuploadPendingUploadIdRef.current);
        if (deleteRowError) {
          console.error('⚠️ [preupload] failed to delete pending_uploads row on discard:', deleteRowError);
        }
      }
    } finally {
      preuploadTaskRef.current = null;
      preuploadBunnyVideoIdRef.current = null;
      preuploadPendingUploadIdRef.current = null;
      // Replay the EXACT action object the callback received — it already carries
      // React Navigation's own VISITED_ROUTE_KEYS marker for this route, so dispatching
      // it again does not re-trigger usePreventRemove's listener for this screen (no
      // loop, no re-prompt). A freshly-constructed action here would NOT have that
      // marker and would re-show the confirmation.
      navigation.dispatch(action);
    }
  };

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

    // 🆕 Tier 1 background pre-upload (behind USE_PREUPLOAD) — fire-and-forget, must run
    // BEFORE the location-permission check below since byte-upload doesn't depend on
    // location at all; gating it behind that check would silently skip pre-upload for
    // any user who denies location. Guard is set synchronously, before any await, so a
    // re-entrant initializeScreen call (StrictMode double-invoke, effect re-firing) can
    // never start a second Bunny video for the same recording.
    if (USE_PREUPLOAD && !hasStartedPreuploadRef.current) {
      hasStartedPreuploadRef.current = true;
      startPreupload(videoUri, requestId).catch((err) => console.error('❌ [preupload] unhandled error:', err));
    }

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

  // Deletes a Bunny video object, reusing the same USE_EDGE_DELETE-gated helper the
  // legacy flow's cleanupFailedUpload/handleRetryUpload already use — no new deletion
  // logic, just a thin wrapper for the pre-upload trigger's own cleanup paths.
  const cleanupBunnyVideo = async (bunnyVideoId: string, isPremium: boolean) => {
    try {
      if (USE_EDGE_DELETE) {
        await getDeleteVideoViaEdgeFunction(bunnyVideoId, isPremium);
      } else {
        await deleteStreamVideo(bunnyVideoId, isPremium);
      }
      console.log('✅ [preupload] cleaned up Bunny video:', bunnyVideoId);
    } catch (deleteError) {
      console.error('⚠️ [preupload] failed to clean up Bunny video:', bunnyVideoId, deleteError);
    }
  };

  // Tier 1 background pre-upload (behind USE_PREUPLOAD). Runs silently from the moment
  // the edit screen mounts, well before the user taps Post — caption/tags/location are
  // unknown at this point (pending_uploads.caption is inserted null), which is exactly
  // the row shape the Phase 1 webhook finalizer and the caption-nullable migration were
  // built for. Fire-and-forget: never blocks initializeScreen's own loading state.
  const startPreupload = async (uri: string, reqId?: string) => {
    let bunnyVideoId: string | null = null;
    let pendingUploadId: string | null = null;
    let isPremium = false;

    try {
      // Step 1: premium status — needed for library selection (X-Bunny-Is-Premium header)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ [preupload] no authenticated user, aborting');
        return;
      }

      const { data: userData } = await supabase
        .from('users')
        .select('is_premium')
        .eq('id', user.id)
        .single();

      isPremium = userData?.is_premium || false;
      preuploadIsPremiumRef.current = isPremium;
      console.log('🚀 [preupload] starting for', uri, isPremium ? '(Premium)' : '(Free)');

      // Step 2: create the Bunny video, get the GUID (matches bunny-create-video's
      // response shape used by the live TUS flow: { videoId, libraryId, ... })
      const { data: createData, error: createError } = await supabase.functions.invoke('bunny-create-video', {
        body: { title: `preupload-${Date.now()}`, isPremium },
      });

      if (createError || !createData?.videoId) {
        console.error('❌ [preupload] bunny-create-video failed:', createError || createData);
        setPreuploadState('failed');
        return; // nothing created yet — nothing to clean up
      }

      bunnyVideoId = createData.videoId;
      preuploadBunnyVideoIdRef.current = bunnyVideoId;
      console.log('✅ [preupload] Bunny video created:', bunnyVideoId);

      // Step 3: insert the pending_uploads row — caption null, status 'uploading'.
      // Invisible on the pending tab (caption IS NOT NULL filter) until Post attaches
      // real metadata and flips status to 'posted'.
      const { data: pendingRow, error: insertError } = await supabase
        .from('pending_uploads')
        .insert({
          user_id: user.id,
          video_uri: uri,
          caption: null,
          bunny_video_id: bunnyVideoId,
          status: 'uploading',
          upload_progress: 0,
          request_id: reqId || null,
        })
        .select()
        .single();

      if (insertError || !pendingRow) {
        console.error('❌ [preupload] pending_uploads insert failed:', insertError);
        // Bunny video WAS created — active cleanup, nothing else exists yet to undo.
        await cleanupBunnyVideo(bunnyVideoId!, isPremium);
        preuploadBunnyVideoIdRef.current = null;
        setPreuploadState('failed');
        return;
      }

      pendingUploadId = pendingRow.id;
      preuploadPendingUploadIdRef.current = pendingUploadId;
      setPreuploadState('ready');
      console.log('✅ [preupload] pending_uploads row inserted:', pendingUploadId);

      // Step 4: start the background upload via the proxy.
      // The background task carries this exact Authorization header for its whole life,
      // including any OS retry after a network drop, so mint a fresh token right before
      // handing it over. Never blocks the upload — any failure falls through to the cached token.
      let accessToken: string | undefined;
      try {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshed?.session?.access_token) {
          accessToken = refreshed.session.access_token;
        } else {
          console.warn('⚠️ [preupload] refreshSession failed, using existing session token:', refreshError?.message);
        }
      } catch (refreshException) {
        // Caught here on purpose: if this escaped to the outer catch, its active cleanup
        // would delete the Bunny video + row over a transient token hiccup.
        console.warn('⚠️ [preupload] refreshSession threw, using existing session token:', refreshException);
      }
      if (!accessToken) {
        const { data: { session } } = await supabase.auth.getSession();
        accessToken = session?.access_token;
      }

      // The user may have discarded during the awaits above, when no task existed yet to cancel.
      if (isDiscardingRef.current) {
        console.log('ℹ️ [preupload] discarded before the upload task was created — not starting it');
        return;
      }

      if (!accessToken) {
        console.error('❌ [preupload] no active session token, aborting');
        await cleanupBunnyVideo(bunnyVideoId!, isPremium);
        await supabase.from('pending_uploads').delete().eq('id', pendingUploadId!);
        preuploadBunnyVideoIdRef.current = null;
        preuploadPendingUploadIdRef.current = null;
        setPreuploadState('failed');
        return;
      }

      const task = FileSystem.createUploadTask(
        PREUPLOAD_PROXY_URL,
        uri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: SUPABASE_ANON_KEY,
            'X-Bunny-Video-Guid': bunnyVideoId!,
            'X-Bunny-Is-Premium': isPremium ? 'true' : 'false',
          },
        },
        (_progressData) => {
          // Step 5: optional progress indicator — not wired to UI state yet.
        }
      );
      preuploadTaskRef.current = task;

      console.log('📤 [preupload] background upload starting for', bunnyVideoId);
      const result = await task.uploadAsync();

      // Note: if the app is backgrounded/killed and this JS instance never resumes,
      // this await simply never settles here — that's expected. The webhook finalizer
      // and reconciliation cron are the source of truth for completion, not this promise.
      if (isDiscardingRef.current) {
        // cancelAsync() (called by handleDiscardAndLeave) surfaced here as a falsy/non-200
        // result, not a thrown exception. This is the EXPECTED effect of a user-initiated
        // discard, not a real failure — handleDiscardAndLeave already owns cleanup for
        // this row/video (and may have already deleted them by the time this settles), so
        // log calmly and touch nothing.
        console.log('ℹ️ [preupload] upload cancelled by user discard for', bunnyVideoId);
      } else if (!result || result.status !== 200) {
        console.error('❌ [preupload] upload failed:', result?.status, result?.body);
        // PASSIVE — deliberately no cleanup here. A pre-Post failure is silent abandon
        // per the state model: the row stays 'uploading' and is resolved either by the
        // user's own back-arrow discard or the 3-hour reconciliation cron, never by an
        // active delete triggered from a possibly-spurious upload rejection.
        // Still record that it failed, though — if the user Posts anyway, Post should
        // write 'interrupted' (Option C) instead of 'posted' (nothing left to wait on).
        preuploadUploadFailedRef.current = true;
      } else {
        console.log('✅ [preupload] upload complete for', bunnyVideoId);
      }
    } catch (error) {
      if (isDiscardingRef.current) {
        // Same reasoning as above, in case cancellation surfaces as a thrown exception
        // instead of a falsy result on some platform. handleDiscardAndLeave already owns
        // cleanup for this row/video — running it again here would be redundant (Bunny's
        // own delete endpoint treats a repeat delete as a no-op 404), so just log and stop.
        console.log('ℹ️ [preupload] upload cancelled by user discard (via exception) for', bunnyVideoId);
        return;
      }
      console.error('❌ [preupload] exception:', error);
      // Exception after the row existed — active cleanup, same as the insert-failure path.
      if (pendingUploadId) {
        if (bunnyVideoId) await cleanupBunnyVideo(bunnyVideoId, isPremium);
        const { error: deleteRowError } = await supabase.from('pending_uploads').delete().eq('id', pendingUploadId);
        if (deleteRowError) console.error('⚠️ [preupload] failed to delete pending_uploads row during cleanup:', deleteRowError);
      } else if (bunnyVideoId) {
        // Exception after the Bunny video existed but before the row — Bunny-only cleanup.
        await cleanupBunnyVideo(bunnyVideoId, isPremium);
      }
      preuploadBunnyVideoIdRef.current = null;
      preuploadPendingUploadIdRef.current = null;
      setPreuploadState('failed');
      // Note: by this point preuploadPendingUploadIdRef is already null and preuploadState
      // is already 'failed' — handlePreuploadPost's own defensive ready-check already
      // falls back to the legacy flow before this ref would ever be read for this row.
      // Set anyway for consistency with the passive-failure branch above.
      preuploadUploadFailedRef.current = true;
    }
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

  const normalizeTag = (raw: string): string =>
    raw.trim().toLowerCase().replace(/^#+/, '').replace(/[^a-z0-9]/g, '').slice(0, MAX_TAG_LENGTH);

  const handleAddHashtag = () => {
    const normalized = normalizeTag(hashtagInput);
    setHashtagInput('');
    if (!normalized) return;
    const tag = `#${normalized}`;
    if (hashtags.includes(tag)) return;
    if (hashtags.length >= MAX_HASHTAGS) {
      Alert.alert('Limit reached', `You can add up to ${MAX_HASHTAGS} tags.`);
      return;
    }
    setHashtags([...hashtags, tag]);
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

// Dispatches to the new pre-upload-aware Post path when USE_PREUPLOAD is on AND
// pre-upload actually got far enough to have something to attach to; falls back
// to the legacy flow otherwise (flag off, or pre-upload failed — see preuploadState).
// The USE_PREUPLOAD && short-circuit means this always resolves to proceedWithUpload
// when the flag is off, regardless of preuploadState's value.
const handlePostConfirmed = async () => {
  if (USE_PREUPLOAD && preuploadState !== 'failed') {
    await handlePreuploadPost();
  } else {
    await proceedWithUpload();
  }
};

// Step 2's Post path: attach the now-known caption/tags/location to the pre-upload
// row that's been silently uploading since the edit screen mounted, flip it to
// 'posted', and let the finalizer (webhook, or this call's own unconditional
// finalize-posted-upload check for the case Bunny already finished before Post)
// take it from here — no new Bunny video, no re-upload of the bytes.
const handlePreuploadPost = async () => {
  console.log('🚀 handlePreuploadPost called');

  // 🚨 CRITICAL: Immediate state update to disable button
  setIsUploading(true);

  const validated = await validatePostPreconditions();
  if (!validated) return;
  const { user, description, location } = validated;

  // Legacy fallback for both branches below. Resets the 2s rapid-tap debounce first:
  // validatePostPreconditions() above just stamped it and proceedWithUpload() runs the
  // same validator again — without this it would bail with "Rapid tap detected" a moment
  // later, silently re-enable the button and upload nothing. The validator re-stamps the
  // timestamp before its first await, so normal double-tap protection is unchanged.
  const fallbackToLegacy = () => {
    lastUploadAttemptRef.current = 0;
    return proceedWithUpload();
  };

  // Defensive — the "Preparing..." disabled button should make this unreachable
  // (preuploadState only leaves 'preparing' once the ref is set), but never trust
  // UI state alone for something this consequential. If they've somehow drifted
  // apart, fall back to the legacy flow rather than crash or hang on a null ref.
  if (preuploadState !== 'ready' || !preuploadPendingUploadIdRef.current) {
    console.error('⚠️ [preupload] Post tapped but pre-upload is not ready (state:', preuploadState, ') — falling back to legacy flow');
    return fallbackToLegacy();
  }

  try {
    console.log('🔍 Checking upload limit...');
    const uploadLimitCheck = await checkUploadLimit(user.id);

    if (!uploadLimitCheck.allowed) {
      console.log('❌ Upload limit reached:', uploadLimitCheck.currentCount);
      Alert.alert(
        'Upload Limit Reached',
        uploadLimitCheck.message,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade to Premium', onPress: () => router.push('/settings') },
        ]
      );
      setIsUploading(false);
      return;
    }

    // Step 4 (Part A, Layer 1): if the background upload already demonstrably failed
    // (observed by startPreupload before Post was even tapped), there's no pending
    // upload left for any webhook or finalize-posted-upload call to ever resolve —
    // write 'interrupted' directly instead of 'posted', skipping the dead-end state.
    const finalStatus: 'posted' | 'interrupted' = preuploadUploadFailedRef.current ? 'interrupted' : 'posted';

    console.log(`✅ Upload limit OK, attaching metadata to pre-upload row (status: ${finalStatus}):`, preuploadPendingUploadIdRef.current);

    const { data: updatedRows, error: updateError } = await supabase
      .from('pending_uploads')
      .update({
        caption: description,
        tags: hashtags,
        location_latitude: location.latitude,
        location_longitude: location.longitude,
        location_name: location.name,
        location_privacy: locationPrivacy,
        request_id: requestId || null,
        status: finalStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', preuploadPendingUploadIdRef.current)
      .select('id'); // returns the rows actually updated, so zero matches is detectable

    if (updateError) {
      console.error('❌ [preupload] Failed to attach metadata to pending_uploads row:', updateError);
      Alert.alert('Upload Failed', 'Failed to save your post. Please try again.');
      setIsUploading(false);
      return;
    }

    if (!updatedRows || updatedRows.length === 0) {
      // Zero rows matched. RLS on pending_uploads is owner-only for both UPDATE and SELECT,
      // so for an owned row an empty result means the row isn't there (e.g. the 3h reconciler
      // abandoned it during a very long edit). Confirm with a separate read before acting — a
      // false "gone" would post this video TWICE (legacy upload + the surviving row finalizing).
      const { data: stillThere, error: probeError } = await supabase
        .from('pending_uploads')
        .select('id, status')
        .eq('id', preuploadPendingUploadIdRef.current)
        .maybeSingle();

      if (probeError || stillThere) {
        console.error('❌ [preupload] update matched no rows but the row exists / probe failed:', probeError ?? stillThere);
        Alert.alert('Upload Failed', 'Failed to save your post. Please try again.');
        setIsUploading(false);
        return; // can't be sure it's gone — letting the user retry beats risking a duplicate
      }

      console.warn('⚠️ [preupload] pre-upload row is gone — posting via the legacy flow instead');
      // Tear down what's left of the dead pre-upload (same helpers handleDiscardAndLeave uses).
      try {
        await preuploadTaskRef.current?.cancelAsync();
      } catch (cancelError) {
        console.error('⚠️ [preupload] cancelAsync failed during zero-rows fallback (continuing):', cancelError);
      }
      if (preuploadBunnyVideoIdRef.current) {
        await cleanupBunnyVideo(preuploadBunnyVideoIdRef.current, preuploadIsPremiumRef.current);
      }
      preuploadTaskRef.current = null;
      preuploadBunnyVideoIdRef.current = null;
      preuploadPendingUploadIdRef.current = null;
      return fallbackToLegacy();
    }

    console.log(`✅ [preupload] pending_upload marked ${finalStatus}:`, preuploadPendingUploadIdRef.current);
    setHasPosted(true);

    if (finalStatus === 'posted') {
      // Fire-and-forget — covers the case where Bunny already reported Finished
      // before Post happened (webhook fired while this row was still 'uploading'/
      // 'ready', so no future webhook delivery is coming for this GUID). A no-op
      // if Bunny isn't done yet; the webhook or reconciliation cron finalizes later.
      supabase.functions
        .invoke('finalize-posted-upload', { body: { pendingUploadId: preuploadPendingUploadIdRef.current } })
        .then(({ data }) => console.log('ℹ️ [preupload] finalize-posted-upload result:', data))
        .catch((error) => console.error('⚠️ [preupload] finalize-posted-upload invoke failed (non-critical):', error));
    }

    console.log('📱 Navigating to profile pending tab...');
    router.replace('/(tabs)/profile?tab=pending&refresh=true');
  } catch (error: any) {
    console.error('❌ [preupload] Post error:', error);
    Alert.alert('Upload Failed', error.message || 'An unknown error occurred. Please try again.', [{ text: 'OK' }]);
    setIsUploading(false);
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
            handlePostConfirmed();
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
  handlePostConfirmed();
};

// Shared by proceedWithUpload (legacy) and handlePreuploadPost (Step 2) — one
// implementation, two callers, so the double-tap guard and required-field checks
// can't drift apart between the two Post paths. Returns the validated, non-null
// { user, description, location } on success (destructuring these shadows the
// same-named component state below, so every existing reference to description/
// location further down proceedWithUpload keeps working unchanged, now non-null),
// or null after already showing whatever Alert applies and resetting isUploading
// (except the "already in progress" guard, which deliberately leaves isUploading
// true — a real upload is still running, so the button should stay disabled).
const validatePostPreconditions = async (): Promise<{
  user: any;
  videoUri: string;
  description: string;
  location: { latitude: number; longitude: number; name: string };
} | null> => {
  // 🚨 CRITICAL: Prevent double uploads - check all flags FIRST
  if (uploadStartedRef.current || uploadInProgressRef.current) {
    console.log('⚠️ Upload already in progress, ignoring duplicate tap');
    return null;
  }

  // Debouncing: Prevent multiple taps within 2 seconds
  const now = Date.now();
  const timeSinceLastAttempt = now - lastUploadAttemptRef.current;
  if (timeSinceLastAttempt < 2000) {
    console.log('⚠️ Rapid tap detected, debouncing');
    setIsUploading(false);
    return null;
  }
  lastUploadAttemptRef.current = now;

  // Prevent uploading the same video file twice
  if (videoUriRef.current === videoUri && uploadStartedRef.current) {
    console.log('⚠️ This video is already being uploaded');
    setIsUploading(false);
    return null;
  }

  try {
    // 🆕 GET USER FIRST (needed for all checks)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Error', 'You must be logged in to upload');
      setIsUploading(false);
      return null;
    }

    // Validation
    if (!videoUri) {
      Alert.alert('Error', 'Please record a video first');
      setIsUploading(false);
      return null;
    }

    if (!description.trim()) {
      Alert.alert('Error', 'Please add a description');
      setIsUploading(false);
      return null;
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
      return null;
    }

    return { user, videoUri, description, location };
  } catch (error: any) {
    // Mirrors proceedWithUpload's own catch below — a validation-time exception
    // (e.g. auth.getUser() failing) gets the same generic alert and flag reset
    // it always has, rather than surfacing as a silent unhandled rejection.
    console.error('❌ Upload error (validation):', error);
    Alert.alert('Upload Failed', error.message || 'An unknown error occurred. Please try again.', [{ text: 'OK' }]);
    uploadStartedRef.current = false;
    uploadInProgressRef.current = false;
    setIsUploading(false);
    return null;
  }
};

const proceedWithUpload = async () => {
  console.log('🚀 proceedWithUpload called');

  // 🚨 CRITICAL: Immediate state update to disable button
  setIsUploading(true);

  const validated = await validatePostPreconditions();
  if (!validated) return;
  const { user, videoUri, description, location } = validated;

  try {
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
      console.log('  - Library ID:', Constants.expoConfig?.extra?.EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID);
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
    // Disarms usePreventRemove now that this upload is genuinely committed, so the
    // navigate below isn't intercepted — same timing principle as handlePreuploadPost's
    // own setHasPosted, placed right after its write succeeds, not before validation.
    // Harmless no-op when USE_PREUPLOAD is off (nothing reads hasPosted in that case).
    setHasPosted(true);

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
        .update({ upload_progress: 10, updated_at: new Date().toISOString() })
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
                .update({ bunny_video_id: bunnyVideoId, upload_progress: 20, updated_at: new Date().toISOString() })
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
              await supabase.from('pending_uploads').update({ upload_progress: pct, updated_at: new Date().toISOString() }).eq('id', pendingUploadId);
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
            .update({ bunny_video_id: bunnyVideoId, updated_at: new Date().toISOString() })
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
          .update({ upload_progress: 20, updated_at: new Date().toISOString() })
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
        .update({ upload_progress: 60, status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', pendingUploadId);

      // Wait for video processing
      console.log('⏳ Waiting for video processing...');
      let processed = false;
      let attempts = 0;
      const maxAttempts = 120;
      // Hard wall-clock cap on top of maxAttempts: individual poll timeouts (see
      // getVideoStatus/getVideoStatusViaEdgeFunction) retry rather than kill the upload, so
      // without this a run of stalled polls could stretch attempts-based pacing well past the
      // intended ~4 minutes. This bounds the worst case regardless of how many polls stall.
      const pollDeadline = Date.now() + 4 * 60 * 1000;

      while (!processed && attempts < maxAttempts && Date.now() < pollDeadline) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        // A failed/timed-out poll is NOT a failed upload — the bytes are already on Bunny and
        // are still transcoding. Just retry next tick; only a real status===5/6 answer from
        // Bunny, or running out of attempts/deadline, ends the upload.
        let status: any = null;
        try {
          status = USE_EDGE_STATUS_CHECK
            ? await getVideoStatusViaEdgeFunction(bunnyVideoId, isPremium)
            : await getVideoStatus(bunnyVideoId, isPremium);
        } catch (pollError: any) {
          console.warn(`⚠️ Status poll attempt ${attempts + 1}/${maxAttempts} failed (will retry): ${pollError.message}`);
        }

        attempts++;
        const processingProgress = 60 + Math.min(attempts * 1, 30);
        await supabase
          .from('pending_uploads')
          .update({ upload_progress: processingProgress, updated_at: new Date().toISOString() })
          .eq('id', pendingUploadId);

        if (!status) continue;

        console.log(`⏳ Attempt ${attempts}/${maxAttempts} - Bunny status: ${status.status}`);
        if (status.status === 4) {
          processed = true;
          console.log('✅ Video processing complete');
        } else if (status.status === 5 || status.status === 6) {
          console.log('❌ Video processing failed on Bunny.net, status:', status.status);
          throw new Error('Video processing failed on Bunny.net');
        }
      }

      if (!processed) {
        throw new Error('Video processing timed out after 4 minutes — please try again');
      }

      // Update progress: 95% - Saving to database
      console.log('📊 Progress: 95% - Saving to database');
      await supabase
        .from('pending_uploads')
        .update({ upload_progress: 95, updated_at: new Date().toISOString() })
        .eq('id', pendingUploadId);

      if (!bunnyVideoId) {
        throw new Error('Cannot save video: bunnyVideoId is null after upload');
      }

      const videoUrl = bunnyVideoId;

      // 🆕 Determine which library and CDN to use based on premium status
      const { libraryId, cdnHostname } = getBunnyLibraryConfig(isPremium);
      const thumbnailUrl = getVideoThumbnailUrl(bunnyVideoId, libraryId);

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
          status: 'completed',
          updated_at: new Date().toISOString()
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
      await cleanupFailedUpload(pendingUploadId, bunnyVideoId, videoRecordId, isPremium, error.message);
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
    isPremium: boolean = false,
    errorMessage?: string
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
        error_message: errorMessage || 'Upload failed. Tap retry to try again.',
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
              Type a short description of your video.
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Hashtags</Text>
            </View>

            <View style={styles.hashtagInputRow}>
              <TextInput
                style={styles.hashtagInputField}
                value={hashtagInput}
                onChangeText={setHashtagInput}
                placeholder="Add a tag"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={MAX_TAG_LENGTH + 1}
                returnKeyType="done"
                onSubmitEditing={handleAddHashtag}
              />
              <Pressable
                onPress={handleAddHashtag}
                style={styles.addHashtagButton}
                disabled={!hashtagInput.trim() || hashtags.length >= MAX_HASHTAGS}
              >
                <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={18} color="#FFFFFF" />
              </Pressable>
            </View>

            {hashtags.length > 0 && (
              <View style={styles.hashtagsContainer}>
                {hashtags.map((tag) => (
                  <Pressable
                    key={tag}
                    style={styles.hashtagChip}
                    onPress={() => toggleHashtag(tag)}
                  >
                    <Text style={styles.hashtagChipText}>{tag} ✕</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={styles.helperText}>
              {hashtags.length}/{MAX_HASHTAGS} tags. Tap a tag to remove it.
            </Text>
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
            style={[
              styles.uploadButton,
              (isUploading || (USE_PREUPLOAD && preuploadState === 'preparing')) && styles.uploadButtonDisabled,
            ]}
            onPress={handleUpload}
            disabled={isUploading || (USE_PREUPLOAD && preuploadState === 'preparing')}
          >
            {isUploading ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.uploadButtonText}>Uploading...</Text>
              </>
            ) : USE_PREUPLOAD && preuploadState === 'preparing' ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.uploadButtonText}>Preparing...</Text>
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
  hashtagInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  hashtagInputField: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.textSecondary + '30',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  addHashtagButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
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