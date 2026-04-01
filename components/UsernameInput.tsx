import React, { useState, useEffect } from 'react';
import { View, TextInput, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { validateUsername, checkUsernameAvailability } from '@/utils/validation';
import { IconSymbol } from './IconSymbol';

interface UsernameInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onValidationChange: (isValid: boolean) => void;
  currentUsername?: string;
}

export default function UsernameInput({ 
  value, 
  onChangeText, 
  currentUsername,
  onValidationChange 
}: UsernameInputProps) {
  const [error, setError] = useState<string>('');
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isCurrentUsername, setIsCurrentUsername] = useState(false);

  useEffect(() => {
    const checkUsername = async () => {
      // Check if this is the current username
      if (currentUsername && value.toLowerCase() === currentUsername.toLowerCase()) {
        setError('');
        setIsAvailable(true);
        setIsCurrentUsername(true);
        setIsChecking(false);
        onValidationChange?.(true);
        return;
      }

      setIsCurrentUsername(false);

      // Validate format first
      const validation = validateUsername(value);
      
      if (!validation.isValid) {
        setError(validation.error || '');
        setIsAvailable(null);
        onValidationChange?.(false);
        return;
      }

      // Check availability
      setIsChecking(true);
      setError('');
      
      const { available, error: availError } = await checkUsernameAvailability(
        value,
        undefined
      );

      setIsChecking(false);

      if (availError) {
        setError(availError);
        setIsAvailable(null);
        onValidationChange?.(false);
      } else if (!available) {
        setError('Username is already taken');
        setIsAvailable(false);
        onValidationChange?.(false);
      } else {
        setError('');
        setIsAvailable(true);
        onValidationChange?.(true);
      }
    };

    if (value.length >= 3) {
      const timer = setTimeout(checkUsername, 500); // Debounce
      return () => clearTimeout(timer);
    } else if (value.length > 0) {
      setError('Username must be at least 3 characters');
      setIsAvailable(null);
      setIsCurrentUsername(false);
      onValidationChange?.(false);
    } else {
      setError('');
      setIsAvailable(null);
      setIsCurrentUsername(false);
    }
  }, [value, currentUsername]);

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <Text style={styles.prefix}>@</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(text) => onChangeText(text.toLowerCase())}
          placeholder="username"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={30}
        />
        {isChecking && (
          <ActivityIndicator size="small" color={colors.primary} />
        )}
        {!isChecking && isAvailable === true && (
          <IconSymbol 
            ios_icon_name="checkmark.circle.fill" 
            android_material_icon_name="check_circle" 
            size={20} 
            color="#10B981" 
          />
        )}
        {!isChecking && isAvailable === false && (
          <IconSymbol 
            ios_icon_name="xmark.circle.fill" 
            android_material_icon_name="cancel" 
            size={20} 
            color="#EF4444" 
          />
        )}
      </View>
      
      {error && <Text style={styles.errorText}>{error}</Text>}
      
      {!error && isCurrentUsername && (
        <Text style={styles.successText}>This is your current username</Text>
      )}
      
      {!error && !isChecking && !isCurrentUsername && value.length >= 3 && (
        <Text style={styles.helperText}>
          Username can only contain lowercase letters, numbers, underscore and period
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  prefix: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 14,
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
    marginTop: 6,
    marginLeft: 4,
  },
  successText: {
    fontSize: 13,
    color: '#10B981',
    marginTop: 6,
    marginLeft: 4,
  },
  helperText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    marginLeft: 4,
  },
});