
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Camera } from 'expo-camera';
import { Alert, Linking, Platform } from 'react-native';

/**
 * Permission Management Utility for POPNOW
 * 
 * This utility provides centralized permission handling with user-friendly
 * pop-up dialogs for location, camera, and media library access.
 */

export interface PermissionResult {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
}

/**
 * Request location permission with user-friendly dialog
 * Used when: User first signs up or opens the map
 */
export const requestLocationPermission = async (): Promise<PermissionResult> => {
  try {
    console.log('Requesting location permission...');
    
    // Check current permission status
    const { status: currentStatus, canAskAgain } = await Location.getForegroundPermissionsAsync();
    
    if (currentStatus === 'granted') {
      console.log('✅ Location permission already granted');
      return { granted: true, canAskAgain: true, status: currentStatus };
    }

    // If permission was permanently denied, show settings dialog
    if (currentStatus === 'denied' && !canAskAgain) {
      console.log('⚠️ Location permission permanently denied');
      
      return new Promise((resolve) => {
        Alert.alert(
          'Location Permission Required',
          'POPNOW needs access to your location to show videos near you and display them on the map.\n\nPlease enable location access in your device settings.',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve({ granted: false, canAskAgain: false, status: currentStatus }),
            },
            {
              text: 'Open Settings',
              onPress: () => {
                Linking.openSettings();
                resolve({ granted: false, canAskAgain: false, status: currentStatus });
              },
            },
          ]
        );
      });
    }

    // Request permission with custom dialog
    return new Promise((resolve) => {
      Alert.alert(
        'Enable Location Access',
        'POPNOW would like to access your location to:\n\n• Show videos happening near you\n• Display your videos on the map\n• Help others discover local content',
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => resolve({ granted: false, canAskAgain: true, status: 'denied' }),
          },
          {
            text: 'Allow',
            onPress: async () => {
              const { status, canAskAgain: canAsk } = await Location.requestForegroundPermissionsAsync();
              const granted = status === 'granted';
              console.log(granted ? '✅ Location permission granted' : '❌ Location permission denied');
              resolve({ granted, canAskAgain: canAsk, status });
            },
          },
        ]
      );
    });
  } catch (error) {
    console.error('Error requesting location permission:', error);
    return { granted: false, canAskAgain: true, status: 'error' };
  }
};

/**
 * Request camera permission with user-friendly dialog
 * Used when: User clicks '+' to record video or fulfill a request
 */
export const requestCameraPermission = async (): Promise<PermissionResult> => {
  try {
    console.log('Requesting camera permission...');
    
    // Check current permission status
    const { status: currentStatus, canAskAgain } = await Camera.getCameraPermissionsAsync();
    
    if (currentStatus === 'granted') {
      console.log('✅ Camera permission already granted');
      return { granted: true, canAskAgain: true, status: currentStatus };
    }

    // If permission was permanently denied, show settings dialog
    if (currentStatus === 'denied' && !canAskAgain) {
      console.log('⚠️ Camera permission permanently denied');
      
      return new Promise((resolve) => {
        Alert.alert(
          'Camera Permission Required',
          'POPNOW needs access to your camera to record videos.\n\nPlease enable camera access in your device settings.',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve({ granted: false, canAskAgain: false, status: currentStatus }),
            },
            {
              text: 'Open Settings',
              onPress: () => {
                Linking.openSettings();
                resolve({ granted: false, canAskAgain: false, status: currentStatus });
              },
            },
          ]
        );
      });
    }

    // Request permission with custom dialog
    return new Promise((resolve) => {
      Alert.alert(
        'Enable Camera Access',
        'POPNOW would like to access your camera to:\n\n• Record 30-second videos\n• Capture moments happening around you\n• Share your experiences with others',
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => resolve({ granted: false, canAskAgain: true, status: 'denied' }),
          },
          {
            text: 'Allow',
            onPress: async () => {
              const { status, canAskAgain: canAsk } = await Camera.requestCameraPermissionsAsync();
              const granted = status === 'granted';
              console.log(granted ? '✅ Camera permission granted' : '❌ Camera permission denied');
              resolve({ granted, canAskAgain: canAsk, status });
            },
          },
        ]
      );
    });
  } catch (error) {
    console.error('Error requesting camera permission:', error);
    return { granted: false, canAskAgain: true, status: 'error' };
  }
};

/**
 * Request media library (photo album) permission for reading/selecting images
 * Used when: User clicks to upload avatar or select existing video
 */
export const requestMediaLibraryPermission = async (): Promise<PermissionResult> => {
  try {
    console.log('Requesting media library permission...');
    
    // Check current permission status
    const { status: currentStatus, canAskAgain } = await ImagePicker.getMediaLibraryPermissionsAsync();
    
    if (currentStatus === 'granted') {
      console.log('✅ Media library permission already granted');
      return { granted: true, canAskAgain: true, status: currentStatus };
    }

    // If permission was permanently denied, show settings dialog
    if (currentStatus === 'denied' && !canAskAgain) {
      console.log('⚠️ Media library permission permanently denied');
      
      return new Promise((resolve) => {
        Alert.alert(
          'Photo Library Permission Required',
          'POPNOW needs access to your photo library to select photos.\n\nPlease enable photo library access in your device settings.',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve({ granted: false, canAskAgain: false, status: currentStatus }),
            },
            {
              text: 'Open Settings',
              onPress: () => {
                Linking.openSettings();
                resolve({ granted: false, canAskAgain: false, status: currentStatus });
              },
            },
          ]
        );
      });
    }

    // Request permission with custom dialog
    return new Promise((resolve) => {
      Alert.alert(
        'Enable Photo Library Access',
        'POPNOW would like to access your photo library to:\n\n• Upload profile pictures\n• Select photos for your avatar\n• Choose existing videos to share',
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => resolve({ granted: false, canAskAgain: true, status: 'denied' }),
          },
          {
            text: 'Allow',
            onPress: async () => {
              const { status, canAskAgain: canAsk } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              const granted = status === 'granted';
              console.log(granted ? '✅ Media library permission granted' : '❌ Media library permission denied');
              resolve({ granted, canAskAgain: canAsk, status });
            },
          },
        ]
      );
    });
  } catch (error) {
    console.error('Error requesting media library permission:', error);
    return { granted: false, canAskAgain: true, status: 'error' };
  }
};

/**
 * Request media library permission for saving/writing (downloading videos)
 * Used when: User tries to download a video to their device
 */
export const requestMediaLibrarySavePermission = async (): Promise<PermissionResult> => {
  try {
    console.log('Requesting media library save permission...');
    
    // Request write-only permission (writeOnly: true)
    const { status: currentStatus, canAskAgain, accessPrivileges } = await MediaLibrary.getPermissionsAsync(true);
    
    if (currentStatus === 'granted') {
      console.log('✅ Media library save permission already granted');
      return { granted: true, canAskAgain: true, status: currentStatus };
    }

    // If permission was permanently denied, show settings dialog
    if (currentStatus === 'denied' && !canAskAgain) {
      console.log('⚠️ Media library save permission permanently denied');
      
      return new Promise((resolve) => {
        Alert.alert(
          'Photo Library Access Required',
          Platform.OS === 'ios'
            ? 'POPNOW needs permission to save videos to your photo library.\n\nPlease go to Settings > POPNOW > Photos and select "Add Photos Only" or "All Photos".'
            : 'POPNOW needs permission to save videos to your photo library.\n\nPlease enable photo library access in your device settings.',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve({ granted: false, canAskAgain: false, status: currentStatus }),
            },
            {
              text: 'Open Settings',
              onPress: () => {
                Linking.openSettings();
                resolve({ granted: false, canAskAgain: false, status: currentStatus });
              },
            },
          ]
        );
      });
    }

    // Request permission with custom dialog
    return new Promise((resolve) => {
      Alert.alert(
        'Save Videos to Photo Library',
        Platform.OS === 'ios'
          ? 'POPNOW would like to save videos to your photo library.\n\nYou can choose:\n• "Add Photos Only" - POPNOW can only save new videos\n• "All Photos" - Full access to your library'
          : 'POPNOW would like to save videos to your photo library so you can:\n\n• Download videos you love\n• Keep them in your camera roll\n• Share them with friends',
        [
          {
            text: 'Not Now',
            style: 'cancel',
            onPress: () => resolve({ granted: false, canAskAgain: true, status: 'denied' }),
          },
          {
            text: 'Allow',
            onPress: async () => {
              const { status, canAskAgain: canAsk } = await MediaLibrary.requestPermissionsAsync(true);
              const granted = status === 'granted';
              console.log(granted ? '✅ Media library save permission granted' : '❌ Media library save permission denied');
              resolve({ granted, canAskAgain: canAsk, status });
            },
          },
        ]
      );
    });
  } catch (error) {
    console.error('Error requesting media library save permission:', error);
    return { granted: false, canAskAgain: true, status: 'error' };
  }
};

/**
 * Request all camera-related permissions at once (camera + media library)
 * Used when: Opening camera for video recording
 */
export const requestCameraAndMediaPermissions = async (): Promise<{
  camera: PermissionResult;
  mediaLibrary: PermissionResult;
}> => {
  console.log('Requesting camera and media library permissions...');
  
  // Request both permissions in parallel for speed
  const [cameraResult, mediaResult] = await Promise.all([
    requestCameraPermission(),
    requestMediaLibraryPermission(),
  ]);
  
  return {
    camera: cameraResult,
    mediaLibrary: mediaResult,
  };
};

/**
 * Check if location permission is granted (without requesting)
 */
export const hasLocationPermission = async (): Promise<boolean> => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error checking location permission:', error);
    return false;
  }
};

/**
 * Check if camera permission is granted (without requesting)
 */
export const hasCameraPermission = async (): Promise<boolean> => {
  try {
    const { status } = await Camera.getCameraPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error checking camera permission:', error);
    return false;
  }
};

/**
 * Check if media library permission is granted (without requesting)
 */
export const hasMediaLibraryPermission = async (): Promise<boolean> => {
  try {
    const { status } = await ImagePicker.getMediaLibraryPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error checking media library permission:', error);
    return false;
  }
};

/**
 * Check if media library save permission is granted (without requesting)
 */
export const hasMediaLibrarySavePermission = async (): Promise<boolean> => {
  try {
    const { status } = await MediaLibrary.getPermissionsAsync(true);
    return status === 'granted';
  } catch (error) {
    console.error('Error checking media library save permission:', error);
    return false;
  }
};
