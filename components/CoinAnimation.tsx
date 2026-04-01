// components/CoinAnimation.tsx - Floating coin change animation

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface CoinAnimationProps {
  amount: number; // +100, -100, etc.
  onComplete?: () => void;
}

export default function CoinAnimation({ amount, onComplete }: CoinAnimationProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Animate upward and fade out
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -60, // Float up 60 pixels
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (onComplete) onComplete();
    });
  }, []);

  const isPositive = amount > 0;
  const displayAmount = isPositive ? `+${amount}` : `${amount}`;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <Text style={[styles.text, isPositive ? styles.positive : styles.negative]}>
        {displayAmount}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 1000,
  },
  text: {
    fontSize: 32,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  positive: {
    color: '#10B981', // Green
  },
  negative: {
    color: '#EF4444', // Red
  },
});