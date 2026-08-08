// components/UpdateAvailableModal.tsx - Dismissible "update available" nudge

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

interface UpdateAvailableModalProps {
  visible: boolean;
  latestVersion: string;
  onUpdate: () => void;
  onLater: () => void;
}

export default function UpdateAvailableModal({
  visible,
  latestVersion,
  onUpdate,
  onLater,
}: UpdateAvailableModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onLater}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            style={styles.gradient}
          >
            <MaterialCommunityIcons
              name="rocket-launch"
              size={80}
              color="#fff"
              style={styles.icon}
            />

            <Text style={styles.title}>Update Available</Text>

            <Text style={styles.message}>
              A new version of POPNOW is available. Update for the latest
              features and improvements.
            </Text>

            <View style={styles.versionBadge}>
              <Text style={styles.versionText}>Version {latestVersion}</Text>
            </View>

            <View style={styles.buttons}>
              <Pressable style={styles.buttonSecondary} onPress={onLater}>
                <Text style={styles.buttonSecondaryText}>Later</Text>
              </Pressable>

              <Pressable style={styles.buttonPrimary} onPress={onUpdate}>
                <Text style={styles.buttonPrimaryText}>Update</Text>
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
    marginBottom: 15,
  },
  message: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: 22,
  },
  versionBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 15,
    marginBottom: 25,
  },
  versionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
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
    color: colors.primary,
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
