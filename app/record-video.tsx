
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, CameraType, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { GestureHandlerRootView, PinchGestureHandler, State } from 'react-native-gesture-handler';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function RecordVideoScreen() {
  const params = useLocalSearchParams();
  const requestId = params.requestId as string | undefined;
  const requestDescription = params.requestDescription as string | undefined;

  const [facing, setFacing] = useState<CameraType>('back');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const cameraRef = useRef<CameraView>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Pinch-to-zoom state
  const baseZoomRef = useRef(0);
  const lastScaleRef = useRef(1);

  useEffect(() => {
    checkPermissions();
    
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const checkPermissions = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera permission is required to record videos');
        router.back();
        return;
      }
    }

    if (!microphonePermission?.granted) {
      const result = await requestMicrophonePermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Microphone permission is required to record videos with audio');
        router.back();
        return;
      }
    }
  };

  const toggleCameraFacing = () => {
    if (isRecording) {
      Alert.alert('Cannot Switch', 'Cannot switch camera while recording');
      return;
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFacing(current => (current === 'back' ? 'front' : 'back'));
    // Reset zoom when switching cameras
    setZoom(0);
    baseZoomRef.current = 0;
    lastScaleRef.current = 1;
  };

  const handlePinchGesture = (event: any) => {
    if (event.nativeEvent.state === State.ACTIVE) {
      const scale = event.nativeEvent.scale;
      
      // Calculate new zoom level
      // Scale is relative to the last gesture, so we need to track it
      const zoomDelta = (scale - lastScaleRef.current) * 0.5; // Sensitivity factor
      let newZoom = baseZoomRef.current + zoomDelta;
      
      // Clamp zoom between 0 and 1
      newZoom = Math.max(0, Math.min(1, newZoom));
      
      setZoom(newZoom);
      
      // Provide haptic feedback at certain zoom levels
      if (Math.abs(newZoom - 0) < 0.05 || Math.abs(newZoom - 0.5) < 0.05 || Math.abs(newZoom - 1) < 0.05) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } else if (event.nativeEvent.state === State.END) {
      // Update base zoom when gesture ends
      baseZoomRef.current = zoom;
      lastScaleRef.current = 1;
    }
  };

  const startRecording = async () => {
    if (!cameraRef.current || isRecording) return;

    try {
      console.log('Starting video recording...');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      
      setIsRecording(true);
      setRecordingDuration(0);

      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev + 1;
          
          // Auto-stop at 30 seconds
          if (newDuration >= 30) {
            stopRecording();
            return 30;
          }
          
          return newDuration;
        });
      }, 1000);

      const video = await cameraRef.current.recordAsync({
        maxDuration: 30,
      });

      if (video && video.uri) {
        console.log('Video recorded:', video.uri);
        
        // Navigate to upload screen with video
        router.replace({
          pathname: '/upload',
          params: {
            videoUri: video.uri,
            requestId: requestId || '',
            requestDescription: requestDescription || '',
          },
        });
      }
    } catch (error) {
      console.error('Error recording video:', error);
      Alert.alert('Error', 'Failed to record video. Please try again.');
      setIsRecording(false);
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const stopRecording = async () => {
    if (!cameraRef.current || !isRecording) return;

    try {
      console.log('Stopping video recording...');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      cameraRef.current.stopRecording();
      setIsRecording(false);
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getZoomPercentage = (): string => {
    return `${Math.round(zoom * 100)}%`;
  };

  if (!cameraPermission || !microphonePermission) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading camera...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!cameraPermission.granted || !microphonePermission.granted) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.permissionContainer}>
          <IconSymbol ios_icon_name="camera.fill" android_material_icon_name="camera" size={64} color={colors.textSecondary} />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            We need access to your camera and microphone to record videos
          </Text>
          <Pressable style={styles.permissionButton} onPress={checkPermissions}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <PinchGestureHandler
          onGestureEvent={handlePinchGesture}
          onHandlerStateChange={handlePinchGesture}
        >
          <View style={{ flex: 1 }}>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing={facing}
              mode="video"
              videoQuality="1080p"
              zoom={zoom}
            >
              {/* Top Bar */}
              <View style={styles.topBar}>
                <Pressable
                  style={styles.closeButton}
                  onPress={() => {
                    if (isRecording) {
                      Alert.alert(
                        'Stop Recording?',
                        'Do you want to stop recording and go back?',
                        [
                          { text: 'Continue Recording', style: 'cancel' },
                          {
                            text: 'Stop & Go Back',
                            style: 'destructive',
                            onPress: () => {
                              if (isRecording) {
                                stopRecording();
                              }
                              router.back();
                            },
                          },
                        ]
                      );
                    } else {
                      router.back();
                    }
                  }}
                >
                  <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={28} color="#FFFFFF" />
                </Pressable>

                {isRecording && (
                  <View style={styles.recordingIndicator}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingText}>REC</Text>
                    <Text style={styles.durationText}>{formatDuration(recordingDuration)}</Text>
                  </View>
                )}

                <Pressable
                  style={[styles.switchButton, isRecording && styles.switchButtonDisabled]}
                  onPress={toggleCameraFacing}
                  disabled={isRecording}
                >
                  <IconSymbol ios_icon_name="arrow.triangle.2.circlepath.camera" android_material_icon_name="flip-camera-android" size={28} color="#FFFFFF" />
                </Pressable>
              </View>

              {/* Zoom Indicator */}
              {zoom > 0 && (
                <View style={styles.zoomIndicator}>
                  <IconSymbol ios_icon_name="plus.magnifyingglass" android_material_icon_name="zoom-in" size={20} color="#FFFFFF" />
                  <Text style={styles.zoomText}>{getZoomPercentage()}</Text>
                </View>
              )}

              {/* Pinch to Zoom Hint */}
              {!isRecording && zoom === 0 && (
                <View style={styles.zoomHint}>
                  <Text style={styles.zoomHintText}>Pinch to zoom</Text>
                </View>
              )}

              {/* Bottom Controls */}
              <View style={styles.bottomControls}>
                {requestDescription && (
                  <View style={styles.requestBanner}>
                    <IconSymbol ios_icon_name="video.badge.plus" android_material_icon_name="video-call" size={20} color="#FFFFFF" />
                    <Text style={styles.requestText} numberOfLines={2}>
                      {requestDescription}
                    </Text>
                  </View>
                )}

                <View style={styles.controlsRow}>
                  <View style={{ width: 60 }} />

                  <Pressable
                    style={[styles.recordButton, isRecording && styles.recordButtonActive]}
                    onPress={isRecording ? stopRecording : startRecording}
                  >
                    <View style={[styles.recordButtonInner, isRecording && styles.recordButtonInnerActive]} />
                  </Pressable>

                  <View style={styles.infoContainer}>
                    <Text style={styles.infoText}>
                      {isRecording ? `${30 - recordingDuration}s` : '30s max'}
                    </Text>
                  </View>
                </View>
              </View>
            </CameraView>
          </View>
        </PinchGestureHandler>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#FFFFFF',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    backgroundColor: '#000000',
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  permissionButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    marginBottom: 16,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cancelButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  camera: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 92, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  recordingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  durationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  switchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchButtonDisabled: {
    opacity: 0.5,
  },
  zoomIndicator: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  zoomText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  zoomHint: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  zoomHintText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  requestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
  },
  requestText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  recordButtonActive: {
    backgroundColor: 'rgba(255, 59, 92, 0.3)',
  },
  recordButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF3B5C',
  },
  recordButtonInnerActive: {
    borderRadius: 8,
    width: 40,
    height: 40,
  },
  infoContainer: {
    width: 60,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
