import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  Pressable,
  Animated,
  GestureResponderEvent,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { getVideoPlaybackUrl } from '@/utils/bunnynet';
import { colors } from '@/styles/commonStyles';

interface VideoPlayerProps {
  videoUrl: string | undefined | null;
  isActive: boolean;
  libraryId?: number;
  is2x?: boolean;
  onLoad?: () => void;
  onError?: (error: string) => void;
}

const TAB_BAR_HEIGHT = 50;
const BAR_HEIGHT_NORMAL = 3;
const BAR_HEIGHT_SEEKING = 20;
const PROGRESS_BAR_PADDING = 16;

export default function VideoPlayer({ videoUrl, isActive, libraryId, is2x = false, onLoad, onError }: VideoPlayerProps) {
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekTime, setSeekTime] = useState(0);
  const [handlePosition, setHandlePosition] = useState(0);

  const isActiveRef = useRef(isActive);
  const mountedRef = useRef(true);
  const barWidth = useRef(0);
  const barPageX = useRef(0);
  const barAnimHeight = useRef(new Animated.Value(BAR_HEIGHT_NORMAL)).current;
  const isSeekingRef = useRef(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (!isActive) {
      setIsPaused(false);
      setCurrentTime(0);
    }
  }, [isActive]);

  useEffect(() => {
    hasLoadedRef.current = false;
  }, [playbackUrl]);

  // Generate playback URL
  useEffect(() => {
    if (!mountedRef.current) return;

    if (!videoUrl || videoUrl === '' || videoUrl === 'undefined' || videoUrl === 'null' || typeof videoUrl !== 'string') {
      if (mountedRef.current) setHasError(true);
      if (mountedRef.current) setErrorMessage('Invalid video URL');
      if (mountedRef.current) setLoading(false);
      if (onError) onError('Invalid video URL');
      return;
    }

    const url = getPlaybackUrlFromVideo(videoUrl, libraryId);
    if (!url) {
      if (mountedRef.current) setPlaybackUrl(null);
      if (mountedRef.current) setHasError(false);
      if (mountedRef.current) setLoading(true);

      const retryTimer = setTimeout(() => {
        if (!mountedRef.current) return;
        const retryUrl = getPlaybackUrlFromVideo(videoUrl, libraryId);
        if (!retryUrl) {
          if (mountedRef.current) setHasError(true);
          if (mountedRef.current) setErrorMessage('CDN configuration not loaded');
          if (mountedRef.current) setLoading(false);
          if (onError) onError('CDN configuration not loaded');
        } else {
          if (mountedRef.current) setPlaybackUrl(retryUrl);
          if (mountedRef.current) setHasError(false);
          if (mountedRef.current) setLoading(true);
        }
      }, 500);

      return () => clearTimeout(retryTimer);
    }

    if (mountedRef.current) setPlaybackUrl(url);
    if (mountedRef.current) setHasError(false);
    if (mountedRef.current) setLoading(true);
  }, [videoUrl, libraryId]);

  const getPlaybackUrlFromVideo = (url: string | undefined | null, libId?: number): string | null => {
    if (!url || typeof url !== 'string' || url === 'undefined' || url === 'null' || url.trim() === '') return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const playbackUrl = getVideoPlaybackUrl(url, libId);
    return playbackUrl || null;
  };

  const player = useVideoPlayer(playbackUrl, (player) => {
    if (playbackUrl) {
      player.loop = true;
      player.muted = false;
      player.volume = 1.0;
      player.bufferOptions = {
        minBufferForPlayback: 2,
        preferredForwardBufferDuration: 10,
      };
    }
  });

  // Track current time for progress bar
  useEffect(() => {
    if (!player || !isActive || !playbackUrl) return;

    const interval = setInterval(() => {
      if (!mountedRef.current || isSeekingRef.current) return;
      try {
        const time = player.currentTime || 0;
        const dur = player.duration || 0;
        if (mountedRef.current) {
          setCurrentTime(time);
          if (dur > 0) setDuration(dur);
        }
      } catch (e) {}
    }, 250);

    return () => clearInterval(interval);
  }, [player, isActive, playbackUrl]);

  // Control playback based on isActive
  useEffect(() => {
    if (!playbackUrl || hasError || !player) return;
    if (typeof player.play !== 'function') return;
    if (!mountedRef.current) return;

    if (isActive) {
      try {
        player.muted = false;
        player.volume = 1.0;
        if (!isPaused) player.play();
      } catch (error) {}
    } else {
      try {
        player.pause();
        player.muted = true;
        player.volume = 0;
        player.currentTime = 0;
      } catch (error) {}
    }
  }, [isActive, playbackUrl, hasError, player]);

  // 2x speed
  useEffect(() => {
    if (!player || !isActive) return;
    try { player.playbackRate = is2x ? 2.0 : 1.0; } catch (e) {}
  }, [is2x, player, isActive]);

  // Cleanup
  useEffect(() => {
    return () => {
      try {
        if (player && typeof player.pause === 'function') {
          player.pause();
          player.muted = true;
          player.volume = 0;
        }
      } catch (error) {}
    };
  }, []);

  // Tap to pause/resume
  const handleTap = useCallback(() => {
    if (!player || !isActive || !playbackUrl || isSeekingRef.current) return;
    try {
      if (isPaused) {
        player.play();
        setIsPaused(false);
      } else {
        player.pause();
        setIsPaused(true);
      }
    } catch (e) {}
  }, [player, isActive, isPaused, playbackUrl]);

  // Format time as M:SS
  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Expand bar animation
  const expandBar = () => {
    Animated.spring(barAnimHeight, {
      toValue: BAR_HEIGHT_SEEKING,
      useNativeDriver: false,
      speed: 40,
      bounciness: 0,
    }).start();
  };

  // Shrink bar animation
  const shrinkBar = () => {
    Animated.spring(barAnimHeight, {
      toValue: BAR_HEIGHT_NORMAL,
      useNativeDriver: false,
      speed: 40,
      bounciness: 0,
    }).start();
  };

  // Calculate seek position from pageX
  const getSeekRatio = (pageX: number): number => {
    const relX = pageX - barPageX.current;
    return Math.max(0, Math.min(1, relX / barWidth.current));
  };

  // Progress bar touch handlers
  const onProgressTouchStart = (evt: GestureResponderEvent) => {
    if (!isActive || !duration) return;
    isSeekingRef.current = true;
    setIsSeeking(true);
    expandBar();
    try { player?.pause(); } catch (e) {}

    const ratio = getSeekRatio(evt.nativeEvent.pageX);
    const time = ratio * duration;
    setSeekTime(time);
    setHandlePosition(ratio);
    try { if (player) player.currentTime = time; } catch (e) {}
  };

  const onProgressTouchMove = (evt: GestureResponderEvent) => {
    if (!isSeekingRef.current || !duration) return;

    const ratio = getSeekRatio(evt.nativeEvent.pageX);
    const time = ratio * duration;
    setSeekTime(time);
    setHandlePosition(ratio);
    setCurrentTime(time);
    try { if (player) player.currentTime = time; } catch (e) {}
  };

  const onProgressTouchEnd = () => {
    if (!isSeekingRef.current) return;
    isSeekingRef.current = false;
    setIsSeeking(false);
    shrinkBar();
    if (!isPaused) {
      try { player?.play(); } catch (e) {}
    }
  };

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const displayTime = isSeeking ? seekTime : currentTime;
  const displayProgress = isSeeking ? handlePosition : progress;


  const handleLoad = () => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    setLoading(false);
    setHasError(false);
    if (onLoad) onLoad();
  };

  const handleError = (error: any) => {
    setLoading(false);
    setHasError(true);
    let errorMsg = 'Failed to load video';
    if (error?.error?.code === -1102 || error?.error?.domain === 'NSURLErrorDomain') {
      errorMsg = 'Video access denied (403)';
    }
    setErrorMessage(errorMsg);
    if (onError) onError(errorMsg);
  };

  const handleManualRetry = () => {
    setHasError(false);
    setLoading(true);
    if (videoUrl) {
      const url = getPlaybackUrlFromVideo(videoUrl, libraryId);
      if (url) setPlaybackUrl(url + `?retry=${Date.now()}`);
    }
  };

  if (!videoUrl || videoUrl === '' || videoUrl === 'undefined' || videoUrl === 'null' || typeof videoUrl !== 'string') {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌</Text>
          <Text style={styles.errorMessage}>Invalid video URL</Text>
        </View>
      </View>
    );
  }

  if (!playbackUrl) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>Preparing video...</Text>
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
              <Text style={styles.errorDetails}>This video is blocked by security settings</Text>
              <Text style={styles.errorFix}>Fix: Disable Token Authentication in Bunny.net Stream settings</Text>
            </>
          ) : (
            <Text style={styles.errorDetails}>Check your internet connection</Text>
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
      {/* Video */}
      <View style={StyleSheet.absoluteFill}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="cover"
          nativeControls={false}
          onFirstFrameRender={handleLoad}
        />
      </View>

      {/* Tap to pause — excludes bottom area where progress bar lives */}
      <Pressable
        style={styles.tapArea}
        onPress={handleTap}
      />

      {/* Pause dim overlay */}
      {isPaused && isActive && (
        <View style={styles.pauseDimOverlay} pointerEvents="none" />
      )}

      {/* Loading */}
      {loading && (
        <View style={styles.loadingContainer} pointerEvents="none">
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>Loading video...</Text>
        </View>
      )}

      {/* 2x speed indicator */}
      {is2x && isActive && (
        <View style={styles.speedIndicator} pointerEvents="none">
          <Text style={styles.speedIndicatorText}>2x</Text>
        </View>
      )}

      {/* Progress bar — full width, above tab bar */}
      {isActive && !loading && (
        <View
          style={styles.progressBarOuter}
          onLayout={(e) => {
            barWidth.current = e.nativeEvent.layout.width - PROGRESS_BAR_PADDING * 2;
          }}
          ref={(ref) => {
            if (ref) {
              ref.measure((_x, _y, _w, _h, pageX) => {
                barPageX.current = pageX + PROGRESS_BAR_PADDING;
              });
            }
          }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={onProgressTouchStart}
          onResponderMove={onProgressTouchMove}
          onResponderRelease={onProgressTouchEnd}
          onResponderTerminate={onProgressTouchEnd}
        >
          {/* Time label — shows when seeking */}
          {isSeeking && (
            <View
              style={[
                styles.timeLabel,
                { left: PROGRESS_BAR_PADDING + displayProgress * barWidth.current - 28 }
              ]}
              pointerEvents="none"
            >
              <Text style={styles.timeLabelText}>
                {formatTime(displayTime)} / {formatTime(duration)}
              </Text>
            </View>
          )}

          {/* Track */}
          <Animated.View style={[styles.progressTrack, { height: barAnimHeight }]}>
            {/* Fill */}
            <View
              style={[
                styles.progressFill,
                { width: `${displayProgress * 100}%` }
              ]}
            />
            {/* Handle — only visible when seeking */}
            {isSeeking && (
              <View
                style={[
                  styles.progressHandle,
                  { left: `${displayProgress * 100}%` }
                ]}
              />
            )}
          </Animated.View>
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
  tapArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: TAB_BAR_HEIGHT + 40,
    zIndex: 5,
  },
  pauseDimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 4,
    bottom: TAB_BAR_HEIGHT + 40,
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
    zIndex: 10,
  },
  speedIndicatorText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  progressBarOuter: {
    position: 'absolute',
    bottom: TAB_BAR_HEIGHT + 26,
    left: 0,
    right: 0,
    paddingHorizontal: PROGRESS_BAR_PADDING,
    paddingVertical: 16,
    zIndex: 200,
    justifyContent: 'flex-end',
  },
  progressTrack: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 10,
    overflow: 'visible',
    justifyContent: 'center',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },
  progressHandle: {
    position: 'absolute',
    top: '50%',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    marginTop: -9,
    marginLeft: -9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  timeLabel: {
    position: 'absolute',
    top: -32,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 56,
  },
  timeLabelText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});