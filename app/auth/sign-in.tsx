
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { requestLocationPermission } from '@/utils/permissions';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        console.log('User already signed in, checking profile completion...');
        
        // Check if profile is completed
        const { data: userData } = await supabase
          .from('users')
          .select('profile_completed')
          .eq('id', session.user.id)
          .single();

        if (userData && !userData.profile_completed) {
          // Redirect to profile to complete
          router.replace('/(tabs)/profile');
        } else {
          // Profile completed, go to home
          router.replace('/(tabs)/(home)/');
        }
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  };

  const handleEmailAuth = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        // Sign up
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: 'https://natively.dev/email-confirmed'
          }
        });

        if (error) {
          Alert.alert('Sign Up Failed', error.message);
        } else if (data.user) {
          Alert.alert(
            'Success!',
            'Please check your email to verify your account before signing in.',
            [{ 
              text: 'OK', 
              onPress: async () => {
                setIsSignUp(false);
                // Request location permission for new users
                await requestLocationPermission();
              }
            }]
          );
        }
      } else {
        // Sign in
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          Alert.alert('Sign In Failed', error.message);
        } else if (data.session) {
          console.log('Sign in successful, checking profile completion...');
          
          // Check if profile is completed
          const { data: userData } = await supabase
            .from('users')
            .select('profile_completed')
            .eq('id', data.session.user.id)
            .single();

          // Request location permission on first sign in
          await requestLocationPermission();

          if (userData && !userData.profile_completed) {
            // Redirect to profile to complete
            router.replace('/(tabs)/profile');
          } else {
            // Profile completed, go to home
            router.replace('/(tabs)/(home)/');
          }
        }
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            {/* Logo */}
            <View style={styles.logoContainer}>
              <Image
                source={require('@/assets/images/4c504ad6-f83b-45c5-9c5c-b15178283d26.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.title}>Welcome to POPNOW</Text>
            <Text style={styles.subtitle}>
              Discover and share 30-second moments happening around you
            </Text>

            {/* Email/Password Form */}
            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <IconSymbol name="envelope.fill" size={20} color={colors.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!loading}
                />
              </View>

              <View style={styles.inputContainer}>
                <IconSymbol name="lock.fill" size={20} color={colors.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={colors.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  editable={!loading}
                />
              </View>

              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleEmailAuth}
                disabled={loading}
              >
                <LinearGradient
                  colors={loading ? [colors.textSecondary, colors.textSecondary] : [colors.primary, colors.secondary]}
                  style={styles.buttonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.card} />
                  ) : (
                    <Text style={styles.buttonText}>
                      {isSignUp ? 'Sign Up' : 'Sign In'}
                    </Text>
                  )}
                </LinearGradient>
              </Pressable>

              <Pressable
                style={styles.switchButton}
                onPress={() => setIsSignUp(!isSignUp)}
                disabled={loading}
              >
                <Text style={styles.switchButtonText}>
                  {isSignUp
                    ? 'Already have an account? Sign In'
                    : "Don't have an account? Sign Up"}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 200,
    height: 200,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 12,
  },
  button: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.card,
    fontSize: 18,
    fontWeight: '700',
  },
  switchButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  switchButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
});
