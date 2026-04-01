import React from 'react';
import { View, Image, StyleSheet, Text } from 'react-native';
import defaultAvatar from '../assets/images/default-avatar.png';
import { Ionicons } from '@expo/vector-icons';

interface PremiumAvatarProps {
  avatarUrl: string | null;
  size?: number;
  isPremium?: boolean;
}

export const PremiumAvatar: React.FC<PremiumAvatarProps> = ({
  avatarUrl,
  size = 40,
  isPremium = false,
}) => {
  const borderWidth = 3;
  const glowSize = 8;

  if (isPremium) {
    return (
      <View style={{ width: size + glowSize * 2, height: size + glowSize * 2 }}>
        {/* Glow effect */}
        <View
          style={[
            styles.glow,
            {
              width: size + glowSize * 2,
              height: size + glowSize * 2,
              borderRadius: (size + glowSize * 2) / 2,
            },
          ]}
        />
        
        {/* Golden border - solid color */}
        <View
          style={[
            { backgroundColor: '#B8860B' }, // Darker solid gold
            styles.gradientBorder,
            {
              width: size + borderWidth * 2,
              height: size + borderWidth * 2,
              borderRadius: (size + borderWidth * 2) / 2,
              top: glowSize - borderWidth,
              left: glowSize - borderWidth,
            },
          ]}
        >
          {/* Inner white border for better definition */}
          <View
            style={[
              styles.innerBorder,
              {
                width: size + borderWidth,
                height: size + borderWidth,
                borderRadius: (size + borderWidth) / 2,
              },
            ]}
          >
            {/* Avatar image */}
            <Image
              source={avatarUrl ? { uri: avatarUrl } : defaultAvatar}
              style={[
                styles.avatar,
                {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                },
              ]}
            />
          </View>
        </View>

        {/* Golden crown badge */}
        <View style={styles.starBadge}>
          <Text style={styles.crownEmoji}>👑</Text>
        </View>
      </View>
    );
  }

  // Non-premium avatar (simple)
  return (
    <Image
      source={avatarUrl ? { uri: avatarUrl } : defaultAvatar}
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    />
  );
};

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  gradientBorder: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerBorder: {
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    backgroundColor: '#f0f0f0',
  },
starBadge: {
  position: 'absolute',
  top: 0,
  right: 0,
  backgroundColor: '#fff',
  borderRadius: 20,
  padding: 2,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.3,
  shadowRadius: 2,
  elevation: 3,
},
crownEmoji: {
  fontSize: 12,
},
});