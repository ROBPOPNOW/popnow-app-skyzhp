import { useEffect, useRef } from 'react';
import Constants from 'expo-constants';
import { AdMobConfig } from '@/config/admob';
import AsyncStorage from '@react-native-async-storage/async-storage';

const isExpoGo = Constants.appOwnership === 'expo';

let InterstitialAd: any = null;
let AdEventType: any = null;
let MobileAds: any = null;

try {
  if (!isExpoGo) {
    const adsModule = require('react-native-google-mobile-ads');
    InterstitialAd = adsModule.InterstitialAd;
    AdEventType = adsModule.AdEventType;
    MobileAds = adsModule.default;
  }
} catch (error) {
  console.warn('⚠️ AdMob not available:', error);
}

const STORAGE_KEY = 'videos_watched_since_ad';

// ✅ Module-level flag — persists across reconnects
let globalInitialized = false;

export const useAdManager = (isPremium: boolean = false) => {
  const interstitialRef = useRef<any>(null);
  const isAdLoadedRef = useRef(false);
  const videosWatchedRef = useRef(0);
  const isInitialized = useRef(false);
  const adMobReadyRef = useRef(false);
  const isPremiumRef = useRef(isPremium);
  const effectsRan = useRef(false);

  // ✅ Runs on every render safely — just a ref assignment, no setState
  isPremiumRef.current = isPremium;

  // ✅ Single guarded useEffect for all initialization
  useEffect(() => {
    if (effectsRan.current) return;
    effectsRan.current = true;

    // Load saved count from AsyncStorage on mount
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved) {
          videosWatchedRef.current = parseInt(saved, 10) || 0;
        }
      })
      .catch(() => {});

    // Initialize AdMob
    if (!MobileAds) {
      console.log('📱 AdMob not available');
      return;
    }

    if (globalInitialized) return;
    globalInitialized = true;

    MobileAds.initialize()
      .then(() => {
        console.log('✅ AdMob ready');
        adMobReadyRef.current = true;
        initAd();
      })
      .catch((e: any) => {
        console.error('❌ AdMob init error:', e);
        globalInitialized = false;
      });
  }, []);

  const initAd = () => {
    if (isInitialized.current) return;
    if (!adMobReadyRef.current) return;
    if (!InterstitialAd || !AdEventType) return;
    if (isPremiumRef.current) return;

    isInitialized.current = true;

    try {
      const interstitial = InterstitialAd.createForAdRequest(
        AdMobConfig.interstitialAdUnitId,
        { requestNonPersonalizedAdsOnly: false }
      );

      interstitialRef.current = interstitial;

      interstitial.addAdEventListener(AdEventType.LOADED, () => {
        console.log('✅ Ad loaded');
        isAdLoadedRef.current = true;
      });

      interstitial.addAdEventListener(AdEventType.CLOSED, () => {
        console.log('🔄 Ad closed, resetting counter');
        isAdLoadedRef.current = false;
        videosWatchedRef.current = 0;
        AsyncStorage.setItem(STORAGE_KEY, '0').catch(() => {});
        interstitial.load();
      });

      interstitial.addAdEventListener(AdEventType.ERROR, (e: any) => {
        console.error('❌ Ad error:', e);
        isAdLoadedRef.current = false;
        setTimeout(() => {
          if (interstitialRef.current) {
            interstitialRef.current.load();
          }
        }, 5000);
      });

      interstitial.load();
      console.log('✅ Ad creation complete');
    } catch (e) {
      console.error('❌ Ad creation error:', e);
    }
  };

  const trackVideoView = () => {
    try {
      if (isPremiumRef.current) {
        console.log('⭐ Premium user - skipping ad tracking');
        return;
      }

      videosWatchedRef.current += 1;
      const count = videosWatchedRef.current;

      AsyncStorage.setItem(STORAGE_KEY, String(count)).catch(() => {});

      console.log(`📹 Video watched: ${count}/${AdMobConfig.videosBeforeAd}`);

      if (count >= AdMobConfig.videosBeforeAd) {
        if (isAdLoadedRef.current && interstitialRef.current) {
          console.log('🎬 Showing ad...');
          interstitialRef.current.show()
            .then(() => {
              isAdLoadedRef.current = false;
              videosWatchedRef.current = 0;
            })
            .catch((e: any) => {
              console.error('❌ Error showing ad:', e);
              videosWatchedRef.current = 0;
              AsyncStorage.setItem(STORAGE_KEY, '0').catch(() => {});
            });
        } else {
          console.log('⚠️ Ad not ready, resetting counter');
          videosWatchedRef.current = 0;
          AsyncStorage.setItem(STORAGE_KEY, '0').catch(() => {});
        }
      }
    } catch (e) {
      console.error('❌ trackVideoView error:', e);
    }
  };

  return { trackVideoView };
};