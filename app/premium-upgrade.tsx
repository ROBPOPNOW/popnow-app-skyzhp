// app/premium-upgrade.tsx - Premium subscription upgrade screen

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import { supabase } from '@/lib/supabase';

export const unstable_settings = {
  headerShown: false,
};

// FloatingTabBar visual height, excluding the safe-area inset (added below via
// insets.bottom). Matches the constant in app/(tabs)/search.tsx.
const TAB_BAR_HEIGHT = 48;

export default function PremiumUpgradeScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = TAB_BAR_HEIGHT + insets.bottom;
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [isPurchasing, setIsPurchasing] = useState(false);

  useEffect(() => {
    loadOfferings();
  }, []);

  const loadOfferings = async () => {
    try {
      setLoading(true);
      console.log('📦 Loading RevenueCat offerings...');
      
      const offerings = await Purchases.getOfferings();
      
      if (offerings.current && offerings.current.availablePackages.length > 0) {
        setPackages(offerings.current.availablePackages);
        console.log('✅ Loaded packages:', offerings.current.availablePackages.length);
      } else {
        console.warn('⚠️ No offerings found');
        Alert.alert(
          'No Subscriptions Available',
          'Premium subscriptions are not available at this time. Please try again later.'
        );
      }
    } catch (error) {
      console.error('❌ Error loading offerings:', error);
      Alert.alert(
        'Error',
        'Failed to load subscription options. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const PREMIUM_SYNC_POLL_ATTEMPTS = 8;
  const PREMIUM_SYNC_POLL_INTERVAL_MS = 1500;

  // revenuecat-webhook is what actually marks the user premium in the DB now
  // (RevenueCat: usually delivered within 5-60s). This screen no longer
  // writes is_premium itself — it waits briefly for that write to land so
  // "Welcome to Premium" doesn't show before the rest of the app can see it.
  const waitForPremiumSync = async (): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    for (let attempt = 0; attempt < PREMIUM_SYNC_POLL_ATTEMPTS; attempt++) {
      const { data } = await supabase
        .from('users')
        .select('is_premium')
        .eq('id', user.id)
        .single();

      if (data?.is_premium) return true;

      await new Promise((resolve) => setTimeout(resolve, PREMIUM_SYNC_POLL_INTERVAL_MS));
    }

    return false;
  };

  const handleSubscribe = async () => {
    if (packages.length === 0) {
      Alert.alert('Error', 'No subscription packages available');
      return;
    }

    try {
      setIsPurchasing(true);
      console.log('🛒 Starting purchase...');

      const packageToPurchase = packages[0];
      console.log('📦 Package:', packageToPurchase.identifier);

      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);

      console.log('✅ Purchase successful!');

      if (customerInfo.entitlements.active['premium']) {
        console.log('🎉 Premium activated with RevenueCat — waiting for webhook to sync...');

        const synced = await waitForPremiumSync();

        if (synced) {
          Alert.alert(
            'Welcome to Premium! 🎉',
            'Your premium subscription is now active. Enjoy unlimited features!',
            [
              {
                text: 'Start Exploring',
                onPress: () => router.back(),
              },
            ]
          );
        } else {
          Alert.alert(
            'Purchase Successful! 🎉',
            "Your payment went through. Premium features may take a minute to activate — pull to refresh if you don't see them shortly.",
            [
              {
                text: 'OK',
                onPress: () => router.back(),
              },
            ]
          );
        }
      } else {
        console.log('⚠️ No premium entitlement found after purchase');
      }
    } catch (error: any) {
      console.error('❌ Purchase error:', error);

      if (error.userCancelled) {
        console.log('🚫 User cancelled purchase');
      } else {
        Alert.alert(
          'Purchase Failed',
          error.message || 'An error occurred during purchase. Please try again.'
        );
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    try {
      setIsPurchasing(true);
      console.log('🔄 Restoring purchases...');

      const customerInfo = await Purchases.restorePurchases();

      console.log('✅ Restore complete');

      if (customerInfo.entitlements.active['premium']) {
        // Sync status only — restorePurchases() fires no webhook, so this is
        // the only recovery path if the original purchase webhook never ran.
        // NEVER coins/coin_transactions/notifications here — that 30-day
        // window was the farming hole this whole rebuild exists to close.
        try {
          const entitlement = customerInfo.entitlements.active['premium'];

          const { data: { user } } = await supabase.auth.getUser();

          if (user) {
            const { error: updateError } = await supabase.from('users').update({
              is_premium: true,
              premium_expires_at: entitlement.expirationDate || null,
              premium_platform: Platform.OS === 'ios' ? 'apple' : 'google',
              revenuecat_user_id: customerInfo.originalAppUserId || null,
              premium_product_id: entitlement.productIdentifier || null,
            }).eq('id', user.id);

            if (updateError) {
              console.error('❌ Supabase update ERROR:', JSON.stringify(updateError));
            } else {
              console.log('✅ Premium status synced on restore (no coins granted)');
            }
          }
        } catch (dbError) {
          console.error('⚠️ Failed to sync premium status on restore:', dbError);
        }

        Alert.alert(
          'Purchases Restored! 🎉',
          'Your premium subscription has been restored.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else {
        Alert.alert(
          'No Purchases Found',
          'We couldn\'t find any premium subscriptions associated with this account.'
        );
      }
    } catch (error: any) {
      console.error('❌ Restore error:', error);
      Alert.alert(
        'Restore Failed',
        error.message || 'Failed to restore purchases. Please try again.'
      );
    } finally {
      setIsPurchasing(false);
    }
  };

  // Show loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#FFD700', '#FFA500']} style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="xmark" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={styles.crownContainer}>
            <Text style={styles.crownIcon}>👑</Text>
          </View>
          <Text style={styles.headerTitle}>Upgrade to Premium</Text>
          <Text style={styles.headerSubtitle}>Loading subscription options...</Text>
        </LinearGradient>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Get pricing from package
  const monthlyPackage = packages[0];
  const priceString = monthlyPackage?.product.priceString || '$4.99';

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#FFD700', '#FFA500']} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="xmark" size={24} color="#FFFFFF" />
        </Pressable>
        
        <View style={styles.crownContainer}>
          <Text style={styles.crownIcon}>👑</Text>
        </View>
        
        <Text style={styles.headerTitle}>Upgrade to Premium</Text>
        <Text style={styles.headerSubtitle}>Unlock the full POPNOW experience</Text>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Benefits List */}
        <View style={styles.benefitsContainer}>
          <BenefitItem
            icon="🍿"
            title="1000 POPCoins instantly"
            description="Get started with a massive coin boost"
          />
          <BenefitItem
            icon="🎥"
            title="No watermarks"
            description="Your videos, your way. No branding."
          />
          <BenefitItem
            icon="⭐"
            title="Golden avatar ring"
            description="Stand out with exclusive premium badge"
          />
          <BenefitItem
            icon="🚀"
            title="Unlimited requests"
            description="No daily limits on video requests"
          />
          <BenefitItem
            icon="📹"
            title="Unlimited uploads"
            description="Share as many videos as you want"
          />
          <BenefitItem
            icon="🚫"
            title="Ad-free experience"
            description="Enjoy POPNOW without interruptions"
          />
        </View>

        {/* Pricing */}
        <View style={styles.pricingContainer}>
          <Text style={styles.pricingAmount}>{priceString}</Text>
          <Text style={styles.pricingPeriod}>/month</Text>
        </View>

        {/* Subscribe Button */}
        <Pressable 
          onPress={handleSubscribe}
          disabled={isPurchasing || packages.length === 0}
        >
          <LinearGradient
            colors={isPurchasing ? ['#CCC', '#999'] : ['#FFD700', '#FFA500']}
            style={styles.subscribeButton}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.subscribeButtonText}>Subscribe Now</Text>
            )}
          </LinearGradient>
        </Pressable>

        {/* Restore Purchases Link */}
        <Pressable 
          onPress={handleRestore} 
          style={styles.restoreButton}
          disabled={isPurchasing}
        >
          <Text style={[styles.restoreText, isPurchasing && { opacity: 0.5 }]}>
            Restore Purchases
          </Text>
        </Pressable>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Cancel anytime</Text>
          <Text style={styles.footerDivider}>•</Text>
          <Pressable onPress={() => router.push('/terms')}>
            <Text style={styles.footerLink}>Terms</Text>
          </Pressable>
          <Text style={styles.footerDivider}>•</Text>
          <Pressable onPress={() => router.push('/privacy')}>
            <Text style={styles.footerLink}>Privacy</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Benefit Item Component
function BenefitItem({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <View style={styles.benefitItem}>
      <View style={styles.benefitIcon}>
        <Text style={styles.benefitEmoji}>{icon}</Text>
      </View>
      <View style={styles.benefitContent}>
        <View style={styles.benefitTitleRow}>
          <IconSymbol name="checkmark.circle.fill" size={20} color="#10B981" />
          <Text style={styles.benefitTitle}>{title}</Text>
        </View>
        <Text style={styles.benefitDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background, // ← Dark background
  },
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 40,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  crownContainer: {
    marginBottom: 16,
  },
  crownIcon: {
    fontSize: 80,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary, // ← Light gray
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  benefitsContainer: {
    marginTop: 32,
    marginBottom: 32,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
    backgroundColor: colors.card, // ← Dark card
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border, // ← Dark border
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background, // ← Dark background
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  benefitEmoji: {
    fontSize: 28,
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  benefitTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text, // ← White text
  },
  benefitDescription: {
    fontSize: 14,
    color: colors.textSecondary, // ← Light gray
    lineHeight: 20,
    marginLeft: 28,
  },
  pricingContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 24,
  },
  pricingAmount: {
    fontSize: 56,
    fontWeight: '900',
    color: colors.text, // ← White text
  },
  pricingPeriod: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textSecondary, // ← Light gray
    marginLeft: 4,
  },
  subscribeButton: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    minHeight: 56,
  },
  subscribeButtonText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  restoreButton: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  restoreText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    flexWrap: 'wrap',
  },
  footerText: {
    fontSize: 13,
    color: colors.textSecondary, // ← Light gray
  },
  footerDivider: {
    fontSize: 13,
    color: colors.textSecondary, // ← Light gray
    marginHorizontal: 8,
  },
  footerLink: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
});