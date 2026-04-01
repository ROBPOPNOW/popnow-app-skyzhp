// components/DailyBonusPopup.tsx - Daily login bonus modal

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

interface DailyBonusPopupProps {
  visible: boolean;
  onClose: () => void;
}

export default function DailyBonusPopup({ visible, onClose }: DailyBonusPopupProps) {
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
            colors={[colors.primary, colors.secondary]}
            style={styles.gradient}
          >
            <MaterialCommunityIcons
              name="gift"
              size={80}
              color="#FFD700"
              style={styles.icon}
            />
            
            <Text style={styles.title}>Daily Bonus!</Text>
            
            <View style={styles.coinContainer}>
              <Text style={{ fontSize: 40 }}>🍿</Text>
              <Text style={styles.coinAmount}>+50</Text>
            </View>
            
            <Text style={styles.message}>
              Come back tomorrow for more coins!
            </Text>
            
            <Pressable style={styles.button} onPress={onClose}>
              <Text style={styles.buttonText}>Awesome!</Text>
            </Pressable>
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
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 20,
  },
  coinContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 30,
    marginBottom: 20,
  },
  coinAmount: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFD700',
    marginLeft: 10,
  },
  message: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 25,
  },
  button: {
    backgroundColor: '#fff',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 25,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
});