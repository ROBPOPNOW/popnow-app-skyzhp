// components/InsufficientCoinsModal.tsx - Modal for insufficient coins

import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@/styles/commonStyles';
import { router } from 'expo-router';

interface InsufficientCoinsModalProps {
  visible: boolean;
  onClose: () => void;
  currentCoins: number;
  requiredCoins: number;
}

export default function InsufficientCoinsModal({
  visible,
  onClose,
  currentCoins,
  requiredCoins,
}: InsufficientCoinsModalProps) {
  const coinsNeeded = requiredCoins - currentCoins;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <LinearGradient
            colors={['#ef4444', '#dc2626']}
            style={styles.gradient}
          >
            <MaterialCommunityIcons
              name="alert-circle"
              size={80}
              color="#fff"
              style={styles.icon}
            />

            <Text style={styles.title}>Not Enough Coins</Text>

            <View style={styles.coinsContainer}>
              <View style={styles.coinRow}>
                <Text style={styles.label}>You have:</Text>
                <View style={styles.coinBadge}>
                  <Text style={styles.coinEmoji}>🍿</Text>
                  <Text style={styles.coinAmount}>{currentCoins}</Text>
                </View>
              </View>

              <View style={styles.coinRow}>
                <Text style={styles.label}>You need:</Text>
                <View style={styles.coinBadge}>
                  <Text style={styles.coinEmoji}>🍿</Text>
                  <Text style={styles.coinAmount}>{requiredCoins}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.coinRow}>
                <Text style={styles.labelBold}>Short by:</Text>
                <View style={[styles.coinBadge, styles.coinBadgeHighlight]}>
                  <Text style={styles.coinEmoji}>🍿</Text>
                  <Text style={styles.coinAmountHighlight}>{coinsNeeded}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.message}>
              Earn coins by:
              {'\n'}• Daily login (+50 coins)
              {'\n'}• Fulfilling requests (+100 coins)
            </Text>

            <View style={styles.buttons}>
              <Pressable
                style={styles.buttonSecondary}
                onPress={() => {
                  onClose();
                  router.push('/coin-history');
                }}
              >
                <Text style={styles.buttonSecondaryText}>View History</Text>
              </Pressable>

              <Pressable style={styles.buttonPrimary} onPress={onClose}>
                <Text style={styles.buttonPrimaryText}>Got it</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: width * 0.85,
    maxWidth: 400,
    borderRadius: 20,
    overflow: 'hidden',
  },
  gradient: {
    padding: 30,
    alignItems: 'center',
  },
  icon: {
    marginBottom: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 20,
  },
  coinsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 20,
    borderRadius: 15,
    width: '100%',
    marginBottom: 20,
  },
  coinRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  labelBold: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  coinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    gap: 6,
  },
  coinBadgeHighlight: {
    backgroundColor: '#fff',
  },
  coinEmoji: {
    fontSize: 20,
  },
  coinAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  coinAmountHighlight: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ef4444',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginVertical: 12,
  },
  message: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 22,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  buttonPrimary: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
  },
  buttonPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ef4444',
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  buttonSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});