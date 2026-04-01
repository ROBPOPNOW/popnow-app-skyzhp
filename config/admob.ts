import { Platform } from 'react-native';

/**
 * AdMob Configuration
 * 
 * IMPORTANT:
 * - In development (__DEV__ = true): Uses TEST IDs (safe for testing)
 * - In production (__DEV__ = false): Uses REAL IDs (earns real money)
 * 
 * DO NOT use real IDs during development - you'll get banned for invalid clicks!
 */

// ========================================
// TEST AD UNIT IDS (Google's official test IDs)
// ========================================
const TEST_AD_UNITS = {
  ios: {
    appId: 'ca-app-pub-3940256099942544~1458002511',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
  },
  android: {
    appId: 'ca-app-pub-3940256099942544~3347511713',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
  },
};

// ========================================
// PRODUCTION AD UNIT IDS (Your real IDs from AdMob)
// TODO: Get these from AdMob dashboard before publishing
// ========================================
const PRODUCTION_AD_UNITS = {
  ios: {
    appId: 'ca-app-pub-3481504201675982~4971866166',
    interstitial: 'ca-app-pub-3481504201675982/9189370829', // TODO: Create iOS Interstitial Ad Unit in AdMob
  },
  android: {
    appId: 'ca-app-pub-3481504201675982~9460833565',
    interstitial: 'ca-app-pub-3481504201675982/7705840716', // TODO: Create Android Interstitial Ad Unit in AdMob
  },
};

// ========================================
// AUTOMATIC SELECTION (Dev vs Production)
// ========================================
const AD_UNITS = __DEV__ ? TEST_AD_UNITS : PRODUCTION_AD_UNITS;

// ========================================
// EXPORTED CONFIGURATION
// ========================================
export const AdMobConfig = {
  // App ID (for initialization)
  appId: Platform.select({
    ios: AD_UNITS.ios.appId,
    android: AD_UNITS.android.appId,
    default: AD_UNITS.ios.appId,
  })!,

  // Interstitial Ad Unit ID
  interstitialAdUnitId: Platform.select({
    ios: AD_UNITS.ios.interstitial,
    android: AD_UNITS.android.interstitial,
    default: AD_UNITS.ios.interstitial,
  })!,

  // Ad display settings
  videosBeforeAd: 10, // Show ad after every 10 videos (for free users)
  
  // Development mode flag
  isTestMode: __DEV__,
};

// Log configuration on load (helps debugging)
if (__DEV__) {
  console.log('📱 AdMob Config Loaded:');
  console.log('  Platform:', Platform.OS);
  console.log('  Mode:', __DEV__ ? 'TEST (Development)' : 'PRODUCTION');
  console.log('  App ID:', AdMobConfig.appId);
  console.log('  Interstitial ID:', AdMobConfig.interstitialAdUnitId);
  console.log('  Videos before ad:', AdMobConfig.videosBeforeAd);
}