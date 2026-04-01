import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  
  // 👁️ NEW: Password visibility states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function handleAuth() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    if (isSignUp) {
      // Sign up validations
      
      // Check password confirmation
      if (password !== confirmPassword) {
        Alert.alert('Password Mismatch', 'Passwords do not match. Please try again.');
        return;
      }

      // Check password strength
      if (password.length < 6) {
        Alert.alert('Weak Password', 'Password must be at least 6 characters long');
        return;
      }

      // Check terms agreement
      if (!agreedToTerms) {
        Alert.alert('Terms Required', 'Please agree to the Terms & Conditions to create an account');
        return;
      }
    }

    setLoading(true);
    try {
      if (isSignUp) {
        // Sign Up
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        
        if (error) throw error;
        
        // Check if email is already registered
        if (data?.user?.identities?.length === 0) {
          Alert.alert('Email Already Registered', 'This email is already in use. Please sign in instead.');
          setIsSignUp(false);
        } else {
          // Success - update profile to mark as incomplete
          if (data?.user) {
            // Wait a moment for the trigger to create the profile
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Update the profile that was created by trigger
            const { error: profileError } = await supabase
              .from('users')
              .update({
                profile_completed: false, // Mark as incomplete for onboarding
              })
              .eq('id', data.user.id);

            if (profileError) {
              console.error('Error updating profile:', profileError);
            }
          }
          
          Alert.alert('Success', 'Account created successfully!');
          // User is automatically signed in and will be redirected to edit-profile
        }
      } else {
        // Sign In
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            Alert.alert('Invalid Credentials', 'Email or password is incorrect. Please try again.');
          } else {
            throw error;
          }
          return;
        }
        
        // Navigation handled by _layout.tsx auth listener
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    // On Android, use the email from the input field since Alert.prompt is iOS-only
    if (Platform.OS === 'android') {
      if (!email || !email.trim()) {
        Alert.alert('Reset Password', 'Please enter your email address in the email field above, then tap Forgot Password again.');
        return;
      }

      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: 'https://popnow.world/reset-callback',
        });

        if (error) throw error;

        Alert.alert(
          'Check Your Email',
          `We've sent a password reset link to ${email}. Please check your inbox.`
        );
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to send reset link');
      }
    } else {
      // iOS - use Alert.prompt
      Alert.prompt(
        'Reset Password',
        'Enter your email address to receive a password reset link',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Send Link',
            onPress: async (promptEmail) => {
              if (!promptEmail || !promptEmail.trim()) {
                Alert.alert('Error', 'Please enter your email address');
                return;
              }

              try {
                const { error } = await supabase.auth.resetPasswordForEmail(promptEmail.trim(), {
                  redirectTo: 'https://popnow.world/reset-callback',
                });

                if (error) throw error;

                Alert.alert(
                  'Check Your Email',
                  `We've sent a password reset link to ${promptEmail}. Please check your inbox.`
                );
              } catch (error: any) {
                Alert.alert('Error', error.message || 'Failed to send reset link');
              }
            },
          },
        ],
        'plain-text'
      );
    }
  }

const handleGoogleSignIn = async () => {
  try {
    console.log('🔵 Google Sign-In initiated');
    setLoading(true);

    const redirectUrl = Linking.createURL('auth/callback');
    console.log('📎 Redirect URL:', redirectUrl);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) {
      console.error('Google sign-in error:', error);
      Alert.alert('Error', 'Failed to sign in with Google');
      return;
    }

    if (data?.url) {
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      console.log('🌐 Browser result:', result.type);

      if (result.type === 'success' && result.url) {
        console.log('📎 Full callback URL:', result.url);
        
        // Extract tokens from the URL fragment
        const hashPart = result.url.split('#')[1];
        if (hashPart) {
          const hashParams = new URLSearchParams(hashPart);
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          console.log('🔑 Access token found:', !!accessToken);
          console.log('🔑 Refresh token found:', !!refreshToken);

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error('❌ Error setting session:', error);
              Alert.alert('Error', 'Failed to complete sign in');
            } else {
              console.log('✅ Google sign-in session set successfully');
              // _layout.tsx auth listener will handle navigation
            }
            return;
          }
        }

        // No tokens in fragment, check if session was set automatically
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          console.log('✅ Session detected automatically');
          return;
        }

        console.log('⚠️ No tokens found in callback URL');
      }
    }
  } catch (error) {
    console.error('Google sign-in error:', error);
    Alert.alert('Error', 'An unexpected error occurred');
  } finally {
    setLoading(false);
  }
};

const handleFacebookSignIn = async () => {
  try {
    console.log('🔵 Facebook Sign-In initiated');
    setLoading(true);

    const redirectUrl = Linking.createURL('auth/callback');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) {
      console.error('Facebook sign-in error:', error);
      Alert.alert('Error', 'Failed to sign in with Facebook');
      return;
    }

    if (data?.url) {
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      console.log('🌐 Browser result:', result.type);

      if (result.type === 'success' && result.url) {
        console.log('📎 Full callback URL:', result.url);

        const hashPart = result.url.split('#')[1];
        if (hashPart) {
          const hashParams = new URLSearchParams(hashPart);
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          console.log('🔑 Access token found:', !!accessToken);
          console.log('🔑 Refresh token found:', !!refreshToken);

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error('❌ Error setting session:', error);
              Alert.alert('Error', 'Failed to complete sign in');
            } else {
              console.log('✅ Facebook sign-in session set successfully');
            }
            return;
          }
        }

        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          console.log('✅ Session detected automatically');
          return;
        }

        console.log('⚠️ No tokens found in callback URL');
      }
    }
  } catch (error) {
    console.error('Facebook sign-in error:', error);
    Alert.alert('Error', 'An unexpected error occurred');
  } finally {
    setLoading(false);
  }
};

const handleAppleSignIn = async () => {
  try {
    console.log('🍎 Apple Sign-In initiated');
    setLoading(true);

    const redirectUrl = Linking.createURL('auth/callback');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) {
      console.error('Apple sign-in error:', error);
      Alert.alert('Error', 'Failed to sign in with Apple');
      return;
    }

    if (data?.url) {
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      console.log('🌐 Browser result:', result.type);

      if (result.type === 'success' && result.url) {
        console.log('📎 Full callback URL:', result.url);

        const hashPart = result.url.split('#')[1];
        if (hashPart) {
          const hashParams = new URLSearchParams(hashPart);
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          console.log('🔑 Access token found:', !!accessToken);
          console.log('🔑 Refresh token found:', !!refreshToken);

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error('❌ Error setting session:', error);
              Alert.alert('Error', 'Failed to complete sign in');
            } else {
              console.log('✅ Apple sign-in session set successfully');
            }
            return;
          }
        }

        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          console.log('✅ Session detected automatically');
          return;
        }

        console.log('⚠️ No tokens found in callback URL');
      }
    }
  } catch (error) {
    console.error('Apple sign-in error:', error);
    Alert.alert('Error', 'An unexpected error occurred');
  } finally {
    setLoading(false);
  }
};

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        style={styles.gradient}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <Image
                source={require('@/assets/images/c0094095-1590-4e08-8fc2-5f1e6e841f91.png')}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.tagline}>
                Live moments. Real places. Right now.
              </Text>
            </View>

            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="rgba(255,255,255,0.6)"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              
              {/* 👁️ PASSWORD WITH VISIBILITY TOGGLE */}
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Password"
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <IconSymbol
  ios_icon_name={showPassword ? "eye.slash.fill" : "eye.fill"}
  android_material_icon_name={showPassword ? "visibility-off" : "visibility"}
  size={20}
  color="rgba(255,255,255,0.8)"
/>
                </Pressable>
              </View>

              {/* 👁️ CONFIRM PASSWORD WITH VISIBILITY TOGGLE - Only show during Sign Up */}
              {isSignUp && (
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Confirm Password"
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                  />
                  <Pressable
                    style={styles.eyeButton}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    <IconSymbol
  ios_icon_name={showConfirmPassword ? "eye.slash.fill" : "eye.fill"}
  android_material_icon_name={showConfirmPassword ? "visibility-off" : "visibility"}
  size={20}
  color="rgba(255,255,255,0.8)"
/>
                  </Pressable>
                </View>
              )}

              {/* Terms and Conditions Agreement - Only show during Sign Up */}
              {isSignUp && (
                <View style={styles.termsContainer}>
                  <Pressable
                    style={styles.checkboxContainer}
                    onPress={() => setAgreedToTerms(!agreedToTerms)}
                  >
                    <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
                      {agreedToTerms && (
  <IconSymbol 
    ios_icon_name="checkmark" 
    android_material_icon_name="check" 
    size={16} 
    color="#FFFFFF" 
  />
)}
                    </View>
                    <Text style={styles.termsText}>
                      I agree to the{' '}
                      <Text
                        style={styles.termsLink}
                        onPress={() => router.push('/terms')}
                      >
                        Terms & Conditions
                      </Text>
                      {' '}and{' '}
                      <Text
                        style={styles.termsLink}
                        onPress={() => router.push('/privacy')}
                      >
                        Privacy Policy
                      </Text>
                    </Text>
                  </Pressable>
                </View>
              )}

              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleAuth}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>
                    {isSignUp ? 'Sign Up' : 'Sign In'}
                  </Text>
                )}
              </Pressable>

              <Pressable
                style={styles.switchButton}
                onPress={() => {
                  setIsSignUp(!isSignUp);
                  setConfirmPassword(''); // Clear confirm password when switching
                  setShowPassword(false); // Reset visibility
                  setShowConfirmPassword(false); // Reset visibility
                }}
                disabled={loading}
              >
                <Text style={styles.switchText}>
  {isSignUp
    ? 'Already have an account? '
    : "Don't have an account? "}
  <Text style={styles.switchTextLink}>
    {isSignUp ? 'Sign In' : 'Sign Up'}
  </Text>
</Text>
              </Pressable>

              {/* Forgot Password - Only show on Sign In */}
              {!isSignUp && (
                <Pressable
                  style={styles.forgotPasswordButton}
                  onPress={handleForgotPassword}
                  disabled={loading}
                >
                  <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                </Pressable>
              )}

              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Social Login Buttons */}
              <View style={styles.socialButtonsContainer}>
                {/* Google Sign In */}
                <Pressable
                  style={styles.socialButton}
                  onPress={handleGoogleSignIn}
                >
                  <FontAwesome name="google" size={20} color="#4285F4" />
                  <Text style={styles.socialButtonText}>Continue with Google</Text>
                </Pressable>

                {/* Facebook Sign In */}
                <Pressable
                  style={styles.socialButton}
                  onPress={handleFacebookSignIn}
                >
                  <FontAwesome name="facebook" size={20} color="#1877F2" />
                  <Text style={styles.socialButtonText}>Continue with Facebook</Text>
                </Pressable>

                {/* Apple Sign In - iOS only */}
                {Platform.OS === 'ios' && (
                  <Pressable
                    style={[styles.socialButton, styles.appleButton]}
                    onPress={handleAppleSignIn}
                  >
                    <IconSymbol 
  ios_icon_name="apple.logo" 
  android_material_icon_name="apple" 
  size={20} 
  color="#FFFFFF" 
/>
                    <Text style={[styles.socialButtonText, { color: '#FFFFFF' }]}>
                      Continue with Apple
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
  flexGrow: 1,
  justifyContent: 'center',
  paddingHorizontal: 32,
  paddingTop: 20,
  paddingBottom: 40,
},
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    width: 400,
    height: 400,
    marginBottom: 24,
  },
  tagline: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 26,
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
    color: '#fff',
  },
  // 👁️ NEW: Password container with eye button
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    marginBottom: 16,
    paddingRight: 12,
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#fff',
  },
  eyeButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '600',
  },
  switchButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  switchText: {
    color: '#fff',
    fontSize: 14,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  socialButtonsContainer: {
    gap: 12,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 12,
  },
  appleButton: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  termsContainer: {
    marginVertical: 16,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    color: '#fff',
    lineHeight: 18,
  },
  termsLink: {
    color: '#fff',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  forgotPasswordButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  forgotPasswordText: {
    color: '#fff',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  switchTextLink: {
  color: '#fff',
  fontSize: 14,
  fontWeight: 'bold',
  textDecorationLine: 'underline',
},
});