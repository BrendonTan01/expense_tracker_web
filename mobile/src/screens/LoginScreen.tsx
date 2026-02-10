import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { getSavedCredentials } from '../utils/api';
import { loadFromStorage, saveToStorage, removeFromStorage } from '../utils/storage';

export default function LoginScreen() {
  const { theme } = useTheme();
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [useBiometrics, setUseBiometrics] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometrics');
  const hasAutoPrompted = useRef(false);

  // Check biometric hardware and load saved preferences on mount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Check if device supports biometrics
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const available = compatible && enrolled;

      if (!cancelled) setBiometricsAvailable(available);

      if (available) {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (!cancelled) {
          if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
            setBiometricType('Face ID');
          } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
            setBiometricType('Fingerprint');
          }
        }
      }

      // Load saved preferences
      const savedRememberMe = await loadFromStorage<boolean>('remember_me', false);
      const savedBiometrics = await loadFromStorage<boolean>('biometrics_enabled', false);

      if (!cancelled) {
        setRememberMe(savedRememberMe);
        setUseBiometrics(savedBiometrics && available);
      }

      // Check for saved credentials and auto-prompt biometric
      const credentials = await getSavedCredentials();
      if (credentials && !cancelled) {
        setHasSavedCredentials(true);
        setEmail(credentials.email);

        // Auto-prompt biometric authentication on launch
        if (savedBiometrics && available && !hasAutoPrompted.current) {
          hasAutoPrompted.current = true;
          try {
            const result = await LocalAuthentication.authenticateAsync({
              promptMessage: 'Sign in to Expense Tracker',
              cancelLabel: 'Use Password',
              disableDeviceFallback: true,
            });

            if (result.success && !cancelled) {
              setLoading(true);
              try {
                await login(credentials.email, credentials.password, true);
              } catch {
                if (!cancelled) {
                  setLoading(false);
                  Alert.alert('Login Failed', 'Please sign in with your password.');
                }
              }
            }
          } catch (err) {
            console.error('Biometric auto-prompt error:', err);
          }
        }
      }
    })();

    return () => { cancelled = true; };
  }, [login]);

  const handleBiometricLogin = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Sign in with ${biometricType}`,
        cancelLabel: 'Cancel',
        disableDeviceFallback: true,
      });

      if (result.success) {
        const credentials = await getSavedCredentials();
        if (credentials) {
          setLoading(true);
          try {
            await login(credentials.email, credentials.password, true);
          } catch (err: any) {
            Alert.alert('Login Failed', err.message || 'Please sign in with your password.');
          } finally {
            setLoading(false);
          }
        } else {
          Alert.alert('Error', 'No saved credentials found. Please sign in with your password.');
        }
      }
    } catch (err) {
      console.error('Biometric auth error:', err);
    }
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (isRegister && password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    if (isRegister && password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      if (isRegister) {
        await register(email.trim(), password);
      } else {
        await login(email.trim(), password, rememberMe);
        // Save biometric preference when remember me is on
        if (rememberMe && useBiometrics) {
          await saveToStorage('biometrics_enabled', true);
        } else {
          await removeFromStorage('biometrics_enabled');
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(theme);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.appName}>Expense Tracker</Text>
          <Text style={styles.subtitle}>
            {isRegister ? 'Create your account' : 'Welcome back'}
          </Text>
        </View>

        <View style={styles.form}>
          {/* Biometric login button - shown when credentials are saved and biometrics enabled */}
          {!isRegister && hasSavedCredentials && useBiometrics && biometricsAvailable && (
            <>
              <TouchableOpacity
                style={[styles.biometricButton, loading && styles.buttonDisabled]}
                onPress={handleBiometricLogin}
                disabled={loading}
                activeOpacity={0.7}
              >
                {loading ? (
                  <ActivityIndicator color={theme.colors.primary} />
                ) : (
                  <Text style={styles.biometricButtonText}>
                    Sign in with {biometricType}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or sign in with password</Text>
                <View style={styles.dividerLine} />
              </View>
            </>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              placeholderTextColor={theme.colors.textTertiary}
              secureTextEntry
              editable={!loading}
            />
          </View>

          {isRegister && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
                placeholderTextColor={theme.colors.textTertiary}
                secureTextEntry
                editable={!loading}
              />
            </View>
          )}

          {/* Remember Me & Biometric checkboxes - only shown in login mode */}
          {!isRegister && (
            <View style={styles.optionsContainer}>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => {
                  const newVal = !rememberMe;
                  setRememberMe(newVal);
                  if (!newVal) setUseBiometrics(false);
                }}
                disabled={loading}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                  {rememberMe && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Remember me</Text>
              </TouchableOpacity>

              {rememberMe && biometricsAvailable && (
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setUseBiometrics(!useBiometrics)}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, useBiometrics && styles.checkboxChecked]}>
                    {useBiometrics && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>Use {biometricType} to sign in</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isRegister ? 'Create Account' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => {
              setIsRegister(!isRegister);
              setConfirmPassword('');
            }}
            disabled={loading}
          >
            <Text style={styles.switchText}>
              {isRegister ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={styles.switchTextBold}>
                {isRegister ? 'Sign In' : 'Create Account'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: theme.spacing.xl,
    },
    header: {
      alignItems: 'center',
      marginBottom: theme.spacing.xxl,
    },
    appName: {
      fontSize: theme.fontSize.xxxl,
      fontWeight: '700',
      color: theme.colors.primary,
      marginBottom: theme.spacing.sm,
    },
    subtitle: {
      fontSize: theme.fontSize.lg,
      color: theme.colors.textSecondary,
    },
    form: {
      width: '100%',
    },
    inputGroup: {
      marginBottom: theme.spacing.lg,
    },
    label: {
      fontSize: theme.fontSize.sm,
      fontWeight: '600',
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xs,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      fontSize: theme.fontSize.md,
      color: theme.colors.text,
    },
    optionsContainer: {
      marginBottom: theme.spacing.sm,
    },
    checkboxRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingVertical: theme.spacing.sm,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: theme.colors.border,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: theme.spacing.sm,
    },
    checkboxChecked: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    checkmark: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '700' as const,
      lineHeight: 16,
    },
    checkboxLabel: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.text,
    },
    biometricButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: theme.colors.surface,
      borderWidth: 1.5,
      borderColor: theme.colors.primary,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
    },
    biometricButtonText: {
      fontSize: theme.fontSize.md,
      fontWeight: '600' as const,
      color: theme.colors.primary,
    },
    dividerContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginBottom: theme.spacing.lg,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: theme.colors.border,
    },
    dividerText: {
      marginHorizontal: theme.spacing.md,
      fontSize: theme.fontSize.sm,
      color: theme.colors.textTertiary,
    },
    button: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.lg,
      alignItems: 'center' as const,
      marginTop: theme.spacing.md,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: '#ffffff',
      fontSize: theme.fontSize.lg,
      fontWeight: '600' as const,
    },
    switchButton: {
      marginTop: theme.spacing.xl,
      alignItems: 'center' as const,
    },
    switchText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.textSecondary,
    },
    switchTextBold: {
      color: theme.colors.primary,
      fontWeight: '600' as const,
    },
  });
}
