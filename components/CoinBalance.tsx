// components/CoinBalance.tsx - SIMPLIFIED VERSION
import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Animated } from 'react-native';
import { useEffect, useRef } from 'react';

interface CoinBalanceProps {
  coins: number;
  loading?: boolean;
  size?: 'small' | 'medium' | 'large';
  onPress?: () => void;
  showIcon?: boolean;
}

export default function CoinBalance({ 
  coins, 
  loading = false, 
  size = 'medium',
  onPress,
  showIcon = true 
}: CoinBalanceProps) {
  const sizeStyles = {
    small: { fontSize: 14, iconSize: 16 },
    medium: { fontSize: 16, iconSize: 20 },
    large: { fontSize: 24, iconSize: 28 },
  };

  // Bounce animation when coins change
  const bounceAnim = useRef(new Animated.Value(1)).current;
  const prevCoins = useRef(coins);

  useEffect(() => {
    if (prevCoins.current !== coins) {
      // Trigger bounce animation
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1.2,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
      
      prevCoins.current = coins;
    }
  }, [coins]);

  const Container = onPress ? Pressable : View;
  return (
    <Container
      style={[
        styles.container,
        size === 'large' && styles.containerLarge,
      ]}
      onPress={onPress}
    >
      {showIcon && (
  <Animated.Text 
    style={[
      styles.icon, 
      { 
        fontSize: sizeStyles[size].iconSize,
        transform: [{ scale: bounceAnim }]
      }
    ]}
  >
    🍿
  </Animated.Text>
)}
      {loading ? (
        <ActivityIndicator size="small" color="#667eea" />
      ) : (
        <Text style={[styles.coinText, { fontSize: sizeStyles[size].fontSize }]}>
          {formatCoins(coins)}
        </Text>
      )}
    </Container>
  );
}

function formatCoins(coins: number): string {
  if (coins < 1000) {
    return coins.toString();
  } else if (coins < 1000000) {
    return (coins / 1000).toFixed(1).replace('.0', '') + 'K';
  } else {
    return (coins / 1000000).toFixed(1).replace('.0', '') + 'M';
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  containerLarge: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
  },
  icon: {
    marginRight: 6,
  },
  coinText: {
    fontWeight: '700',
    color: '#FFFFFF',  // ← Changed from #333 to white
  },
});