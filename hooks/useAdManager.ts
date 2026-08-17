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
    // ✅ Call MobileAds() to get the instance
    MobileAds = adsModule.default();
  }
} catch (error) {
  console.warn('⚠️ AdMob not available:', error);
}

const STORAGE_KEY = 'videos_watched_since_ad';

let moduleAd: any = null;
let moduleAdLoaded = false;
let moduleAdMobInitialized = false;
let moduleAdMobInitializing = false;

// ✅ Outside the hook
const createAd = () => {
  if (!InterstitialAd || !AdEventType) return;
  if (moduleAd) return;

  console.log('🎬 Creating interstitial ad...');
  console.log('📋 Ad unit ID:', AdMobConfig.interstitialAdUnitId);

  try {
    const ad = InterstitialAd.createForAdRequest(
      AdMobConfig.interstitialAdUnitId,
      {
        requestNonPersonalizedAdsOnly: false,
        keywords: ['social', 'video', 'entertainment'],
      }
    );

    moduleAd = ad;

    ad.addAdEventListener(AdEventType.LOADED, () => {
      console.log('✅ Interstitial ad LOADED successfully');
      moduleAdLoaded = true;
    });

    ad.addAdEventListener(AdEventType.CLOSED, () => {
      console.log('🔄 Ad closed - reloading for next time');
      moduleAdLoaded = false;
      AsyncStorage.setItem(STORAGE_KEY, '0').catch(() => {});
      setTimeout(() => {
        if (moduleAd) {
          console.log('🔄 Reloading ad after close...');
          moduleAd.load();
        }
      }, 1000);
    });

    ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
      console.error('❌ Ad FAILED to load:', JSON.stringify(error));
      moduleAdLoaded = false;
      setTimeout(() => {
        if (moduleAd) {
          console.log('🔄 Retrying ad load after error...');
          moduleAd.load();
        }
      }, 30000);
    });

    console.log('📡 Calling ad.load()...');
    ad.load();

  } catch (e) {
    console.error('❌ Ad creation error:', e);
    moduleAd = null;
  }
};

// ✅ Outside the hook
const initAdMob = () => {
  if (moduleAdMobInitialized) {
    if (!moduleAd) {
      createAd();
    } else if (!moduleAdLoaded) {
      console.log('🔄 AdMob already init, reloading ad...');
      moduleAd.load();
    }
    return;
  }

  if (moduleAdMobInitializing) return;

if (!MobileAds || typeof MobileAds.initialize !== 'function') {
  console.error('❌ MobileAds.initialize is not a function:', MobileAds);
  return;
}

  moduleAdMobInitializing = true;

  console.log('🚀 Initializing AdMob...');
  MobileAds.initialize()
    .then(() => {
      console.log('✅ AdMob SDK initialized');
      moduleAdMobInitialized = true;
      moduleAdMobInitializing = false;
      createAd();
    })
    .catch((e: any) => {
      console.error('❌ AdMob init error:', e);
      moduleAdMobInitializing = false;
      setTimeout(initAdMob, 10000);
    });
};

export const useAdManager = (isPremium: boolean = false) => {
  const videosWatchedRef = useRef(0);
  const effectsRan = useRef(false);
  const isPremiumRef = useRef(isPremium);

  isPremiumRef.current = isPremium;

  useEffect(() => {
    if (effectsRan.current) return;
    effectsRan.current = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved) videosWatchedRef.current = parseInt(saved, 10) || 0;
      })
      .catch(() => {});

    if (!MobileAds || isExpoGo) {
      console.log('📱 AdMob not available');
      return;
    }

    if (isPremiumRef.current) return;

    try {
      initAdMob();
    } catch (e) {
      console.error('❌ initAdMob threw:', e);
    }
  }, []);

  const trackVideoView = () => {
    try {
      if (isPremiumRef.current) return;

      videosWatchedRef.current += 1;
      const count = videosWatchedRef.current;

      AsyncStorage.setItem(STORAGE_KEY, String(count)).catch(() => {});
      console.log(`📹 Video watched: ${count}/${AdMobConfig.videosBeforeAd}`);
      console.log(`📊 Ad state - loaded: ${moduleAdLoaded}, ad exists: ${!!moduleAd}, initialized: ${moduleAdMobInitialized}`);

      if (count >= AdMobConfig.videosBeforeAd) {
        if (moduleAdLoaded && moduleAd) {
          console.log('🎬 Showing interstitial ad...');
          moduleAd.show()
            .then(() => {
              console.log('✅ Ad shown successfully');
              moduleAdLoaded = false;
              videosWatchedRef.current = 0;
              AsyncStorage.setItem(STORAGE_KEY, '0').catch(() => {});
            })
            .catch((e: any) => {
              console.error('❌ Error showing ad:', e);
              videosWatchedRef.current = 0;
              AsyncStorage.setItem(STORAGE_KEY, '0').catch(() => {});
            });
        } else {
          console.log('⚠️ Ad not ready:');
          console.log(`   - moduleAdLoaded: ${moduleAdLoaded}`);
          console.log(`   - moduleAd exists: ${!!moduleAd}`);
          console.log(`   - AdMob initialized: ${moduleAdMobInitialized}`);
          videosWatchedRef.current = 0;
          AsyncStorage.setItem(STORAGE_KEY, '0').catch(() => {});

          if (moduleAdMobInitialized && moduleAd && !moduleAdLoaded) {
            console.log('🔄 Attempting ad reload...');
            moduleAd.load();
          } else if (moduleAdMobInitialized && !moduleAd) {
            console.log('🔄 Attempting ad recreation...');
            createAd();
          }
        }
      }
    } catch (e) {
      console.error('❌ trackVideoView error:', e);
    }
  };

  return { trackVideoView };
};