
import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Pressable } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { getVideoPlaybackUrl } from '@/utils/bunnynet';
import { colors } from '@/styles/commonStyles';

interface VideoPlayerProps {
  videoUrl: string | undefined | null;
  isActive: boolean;
  onLoad?: () => void;
  onError?: (error: string) => void;
}

export default function VideoPlayer({ videoUrl, isActive, onLoad, onError }: VideoPlayerProps) {
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [isTouching, setIsTouching] = useState(false);
  const isActiveRef = useRef(isActive);

  // Update ref when isActive changes
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Generate playback URL from video GUID
  useEffect(() => {
    console.log('VideoPlayer received videoUrl:', videoUrl);
    
    // Validate videoUrl before processing
    if (!videoUrl || 
        videoUrl === '' || 
        videoUrl === 'undefined' || 
        videoUrl === 'null' ||
        typeof videoUrl !== 'string') {
      console.error('Invalid video URL:', videoUrl);
      setHasError(true);
      setErrorMessage('Invalid video URL');
      setLoading(false);
      if (onError) {
        onError('Invalid video URL');
      }
      return;
    }

    // Generate playback URL from video GUID
    const url = getPlaybackUrlFromVideo(videoUrl);
    if (!url) {
      console.error('Failed to generate playback URL for:', videoUrl);
      setHasError(true);
      setErrorMessage('Invalid video URL');
      setLoading(false);
      if (onError) {
        onError('Invalid video URL');
      }
      return;
    }

    console.log('Generated playback URL:', url);
    setPlaybackUrl(url);
    setHasError(false);
    setLoading(true);
  }, [videoUrl]);

  const getPlaybackUrlFromVideo = (url: string | undefined | null): string | null => {
    // Validate input
    if (!url || 
        typeof url !== 'string' || 
        url === 'undefined' || 
        url === 'null' || 
        url.trim() === '') {
      console.error('Invalid URL provided to getPlaybackUrlFromVideo:', url);
      return null;
    }

    // If it's already a full URL, return it
    if (url.startsWith('http://') || url.startsWith('https://')) {
      console.log('URL is already a full URL:', url);
      return url;
    }
    
    // Otherwise, treat it as a video GUID and generate the playback URL
    console.log('Treating as video GUID, generating playback URL for:', url);
    const playbackUrl = getVideoPlaybackUrl(url);
    if (!playbackUrl) {
      console.error('Failed to generate playback URL from GUID:', url);
      return null;
    }
    
    console.log('Generated playback URL:', playbackUrl);
    return playbackUrl;
  };

  // Create video player with expo-video
  const player = useVideoPlayer(playbackUrl, (player) => {
    if (playbackUrl) {
      player.loop = true;
      player.muted = false;
      player.volume = 1.0;
    }
  });

  // Control playback based on isActive prop
  useEffect(() => {
    if (!playbackUrl || hasError || !player) {
      return;
    }

    console.log('isActive changed:', isActive, 'for video:', videoUrl);

    if (isActive) {
      // Play video when active
      console.log('Video becoming active, playing:', videoUrl);
      try {
        player.muted = false;
        player.volume = 1.0;
        player.play();
      } catch (error) {
        console.error('Error playing video:', error);
      }
    } else {
      // COMPLETELY STOP video when not active
      console.log('Video becoming inactive, STOPPING completely:', videoUrl);
      try {
        // Stop playback and mute
        player.pause();
        player.muted = true;
        player.volume = 0;
        // Reset to beginning
        player.currentTime = 0;
      } catch (error) {
        console.error('Error stopping video:', error);
      }
    }
  }, [isActive, playbackUrl, hasError, player, videoUrl]);

  // NEW: Handle touch-and-hold for 2x speed
  useEffect(() => {
    if (!player || !isActive) return;

    if (isTouching) {
      // Speed up to 2x when touching
      console.log('Touch detected - setting playback rate to 2x');
      player.playbackRate = 2.0;
    } else {
      // Normal speed when not touching
      console.log('Touch released - setting playback rate to 1x');
      player.playbackRate = 1.0;
    }
  }, [isTouching, player, isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('VideoPlayer unmounting, cleaning up:', videoUrl);
      try {
        if (player) {
          player.pause();
          player.muted = true;
          player.volume = 0;
        }
      } catch (error) {
        console.log('Cleanup error (expected):', error);
      }
    };
  }, [player, videoUrl]);

  const handleLoad = () => {
    console.log('Video loaded successfully:', videoUrl);
    setLoading(false);
    setHasError(false);
    if (onLoad) {
      onLoad();
    }
  };

  const handleError = (error: any) => {
    console.error('Video playback error:', error);
    setLoading(false);
    setHasError(true);

    let errorMsg = 'Failed to load video';
    
    // Check if it's a 403 error
    if (error?.error?.code === -1102 || error?.error?.domain === 'NSURLErrorDomain') {
      errorMsg = 'Video access denied (403)';
      console.error('🚨 403 Error detected! Check Bunny.net Stream security settings.');
    }

    setErrorMessage(errorMsg);
    
    if (onError) {
      onError(errorMsg);
    }
  };

  const handleManualRetry = () => {
    console.log('Manual retry triggered');
    setHasError(false);
    setLoading(true);
    
    // Force reload by updating the playback URL
    if (videoUrl) {
      const url = getPlaybackUrlFromVideo(videoUrl);
      if (url) {
        setPlaybackUrl(url + `?retry=${Date.now()}`);
      }
    }
  };

  if (!videoUrl || 
      videoUrl === '' || 
      videoUrl === 'undefined' || 
      videoUrl === 'null' ||
      typeof videoUrl !== 'string') {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌</Text>
          <Text style={styles.errorMessage}>Invalid video URL</Text>
          <Text style={styles.errorDetails}>
            The video URL is missing or invalid
          </Text>
        </View>
      </View>
    );
  }

  if (!playbackUrl) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌</Text>
          <Text style={styles.errorMessage}>Invalid video URL</Text>
          <Text style={styles.errorDetails}>
            CDN hostname not configured
          </Text>
        </View>
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌</Text>
          <Text style={styles.errorMessage}>{errorMessage}</Text>
          {errorMessage.includes('403') || errorMessage.includes('blocked') ? (
            <>
              <Text style={styles.errorDetails}>
                This video is blocked by security settings
              </Text>
              <Text style={styles.errorFix}>
                Fix: Disable Token Authentication in Bunny.net Stream settings
              </Text>
            </>
          ) : (
            <Text style={styles.errorDetails}>
              Check your internet connection
            </Text>
          )}
          <Pressable style={styles.retryButton} onPress={handleManualRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* NEW: Touch overlay for speed control */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPressIn={() => setIsTouching(true)}
        onPressOut={() => setIsTouching(false)}
      >
        <VideoView
          player={player}
          style={styles.video}
          contentFit="cover"
          nativeControls={false}
          onFirstFrameRender={handleLoad}
        />
      </Pressable>
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>Loading video...</Text>
        </View>
      )}
      {/* NEW: Speed indicator when touching */}
      {isTouching && isActive && (
        <View style={styles.speedIndicator}>
          <Text style={styles.speedIndicatorText}>2x</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  video: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#FFFFFF',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#000000',
  },
  errorText: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorMessage: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorDetails: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorFix: {
    fontSize: 12,
    color: '#FF9800',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  speedIndicator: {
    position: 'absolute',
    top: 80,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  speedIndicatorText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
