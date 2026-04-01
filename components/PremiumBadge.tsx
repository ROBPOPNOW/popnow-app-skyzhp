import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface PremiumBadgeProps {
  isPremium: boolean;
  premiumExpiresAt?: string | null;
  onManageSubscription?: () => void;
}

export const PremiumBadge: React.FC<PremiumBadgeProps> = ({
  isPremium,
  premiumExpiresAt,
  onManageSubscription,
}) => {
  if (!isPremium) {
    return null;
  }

  const formatExpiryDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Active';
    
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    };
    return date.toLocaleDateString('en-US', options);
  };

  const handleManageSubscription = () => {
    if (onManageSubscription) {
      onManageSubscription();
      return;
    }

    // Default: Open App Store / Play Store subscription management
    const url = Platform.select({
      ios: 'https://apps.apple.com/account/subscriptions',
      android: 'https://play.google.com/store/account/subscriptions',
    });

    if (url) {
      Linking.openURL(url);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFD700', '#FFA500']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.badge}
      >
        <Ionicons name="star" size={18} color="#fff" style={styles.icon} />
        <Text style={styles.badgeText}>Premium Member</Text>
      </LinearGradient>

      <View style={styles.infoContainer}>
        <Text style={styles.expiryText}>
          Active until {formatExpiryDate(premiumExpiresAt)}
        </Text>
        
        <TouchableOpacity
          style={styles.manageButton}
          onPress={handleManageSubscription}
        >
          <Text style={styles.manageButtonText}>Manage Subscription</Text>
          <Ionicons name="chevron-forward" size={16} color="#666" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
    paddingHorizontal: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  icon: {
    marginRight: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoContainer: {
    marginTop: 12,
    paddingHorizontal: 4,
  },
  expiryText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  manageButtonText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
});
