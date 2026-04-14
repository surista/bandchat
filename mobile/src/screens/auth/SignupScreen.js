import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { APP_BASE_URL } from '../../utils/constants';
import { useLayout } from '../../hooks/useLayout';
import PressableRow from '../../components/PressableRow';

export default function SignupScreen({ navigation }) {
  const { signup, googleLogin, appleLogin } = useAuth()
  const { isTablet, contentMaxWidth } = useLayout();
  const { colors } = useTheme();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: Constants.expoConfig?.extra?.googleWebClientId,
      iosClientId: Constants.expoConfig?.extra?.googleIosClientId,
    });
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices();
      }
      const response = await GoogleSignin.signIn();
      const idToken = response?.data?.idToken;
      if (!idToken) throw new Error('No ID token received from Google');
      await googleLogin(idToken);
    } catch (error) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (error.code === statusCodes.IN_PROGRESS) return;
      if (error.message?.includes('ACCOUNT_EXISTS') || error.response?.data?.code === 'ACCOUNT_EXISTS') {
        setError('This email is already registered. Please sign in with your password.');
      } else {
        setError(error.message || 'Google sign-in failed');
      }
    }
  };

  const handleAppleSignIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const fullName = credential.fullName?.givenName
        ? { givenName: credential.fullName.givenName, familyName: credential.fullName.familyName || '' }
        : null;
      await appleLogin(credential.identityToken, fullName);
    } catch (error) {
      if (error.code === 'ERR_REQUEST_CANCELED') return;
      if (error.message?.includes('ACCOUNT_EXISTS') || error.response?.data?.code === 'ACCOUNT_EXISTS') {
        setError('This email is already registered. Please sign in with your password.');
      } else {
        setError(error.message || 'Apple sign-in failed');
      }
    }
  };

  const handleSubmit = async () => {
    if (!displayName.trim() || !email.trim() || !password) return;
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must be at least 8 characters with uppercase, lowercase, and a number');
      return;
    }
    setError('');
    setLoading(true);

    try {
      await signup(email.trim(), password, displayName.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.sidebar }, isTablet && styles.tabletContainer]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">BandChat</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Create your account
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
            {error ? (
              <View style={[styles.errorBox, { borderColor: colors.error }]} accessibilityLiveRegion="polite">
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            ) : null}

            <Text style={[styles.label, { color: colors.textSecondary }]}>Display Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Your name"
              placeholderTextColor={colors.textSecondary}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              editable={!loading}
              accessibilityLabel="Display name"
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="you@example.com"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              editable={!loading}
              accessibilityLabel="Email address"
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={[styles.input, styles.passwordInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Min 8, upper + lower + number"
                placeholderTextColor={colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                textContentType="newPassword"
                editable={!loading}
                accessibilityLabel="Password"
              />
              <TouchableOpacity
                style={styles.showHideButton}
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Text style={[styles.showHideText, { color: colors.textSecondary }]}>
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Confirm Password</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Repeat password"
              placeholderTextColor={colors.textSecondary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              editable={!loading}
              onSubmitEditing={handleSubmit}
              returnKeyType="go"
              accessibilityLabel="Confirm password"
            />

            <TouchableOpacity
              style={styles.termsRow}
              onPress={() => setAgreedToTerms(!agreedToTerms)}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreedToTerms }}
              accessibilityLabel="Agree to Terms of Service and Privacy Policy"
            >
              <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: agreedToTerms ? colors.primary : 'transparent' }]}>
                {agreedToTerms && <Ionicons name="checkmark" size={14} color={colors.primaryText} />}
              </View>
              <Text style={[styles.termsText, { color: colors.textSecondary }]}>
                I agree to the{' '}
                <Text
                  style={{ color: colors.primary }}
                  onPress={() => Linking.openURL(`${APP_BASE_URL}/terms`)}
                >
                  Terms of Service
                </Text>
                {' '}and{' '}
                <Text
                  style={{ color: colors.primary }}
                  onPress={() => Linking.openURL(`${APP_BASE_URL}/privacy`)}
                >
                  Privacy Policy
                </Text>
              </Text>
            </TouchableOpacity>

            <PressableRow
              style={[styles.button, { backgroundColor: colors.primary }, (loading || !agreedToTerms) && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading || !agreedToTerms}
              rippleColor="rgba(255,255,255,0.2)"
              accessibilityRole="button"
              accessibilityLabel="Create account"
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryText} size="small" />
              ) : (
                <Text style={[styles.buttonText, { color: colors.primaryText }]}>Create Account</Text>
              )}
            </PressableRow>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.navigate('Login')}
              accessibilityRole="button"
              accessibilityLabel="Go to sign in"
            >
              <Text style={[styles.linkText, { color: colors.textSecondary }]}>
                Already have an account?{' '}
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Sign In</Text>
              </Text>
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textSecondary }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            <TouchableOpacity
              onPress={handleGoogleSignIn}
              style={[styles.socialButton, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Sign up with Google"
            >
              <Text style={[styles.socialButtonText, { color: colors.textPrimary }]}>
                Sign up with Google
              </Text>
            </TouchableOpacity>

            {Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={8}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            )}
          </View>

          <View style={styles.footer}>
            <View style={styles.footerLinks}>
              <TouchableOpacity onPress={() => Linking.openURL(`${APP_BASE_URL}/privacy`)} accessibilityRole="link" accessibilityLabel="Privacy Policy">
                <Text style={[styles.footerLink, { color: colors.textSecondary }]}>Privacy</Text>
              </TouchableOpacity>
              <Text style={[styles.footerDot, { color: colors.textSecondary }]}>{'\u00B7'}</Text>
              <TouchableOpacity onPress={() => Linking.openURL(`${APP_BASE_URL}/terms`)} accessibilityRole="link" accessibilityLabel="Terms of Service">
                <Text style={[styles.footerLink, { color: colors.textSecondary }]}>Terms</Text>
              </TouchableOpacity>
              <Text style={[styles.footerDot, { color: colors.textSecondary }]}>{'\u00B7'}</Text>
              <TouchableOpacity onPress={() => Linking.openURL(`${APP_BASE_URL}/support`)} accessibilityRole="link" accessibilityLabel="Support">
                <Text style={[styles.footerLink, { color: colors.textSecondary }]}>Support</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.footerVersion, { color: colors.textSecondary }]}>
              v{Constants.expoConfig?.version || '1.0.0'}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 500, width: '100%', alignSelf: 'center' },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: { fontSize: 16 },
  card: {
    borderRadius: 12,
    padding: 24,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: '#fca5a5', fontSize: 14 },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: { fontSize: 14 },
  passwordWrapper: { position: 'relative' },
  passwordInput: { paddingRight: 56 },
  showHideButton: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 16,
    justifyContent: 'center',
  },
  showHideText: { fontSize: 14, fontWeight: '500' },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    marginRight: 10,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerLink: { fontSize: 13 },
  footerDot: { fontSize: 13 },
  footerVersion: { fontSize: 12, marginTop: 8, opacity: 0.6 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 12, fontSize: 14 },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  socialButtonText: { fontSize: 16, fontWeight: '600' },
  appleButton: { height: 48, width: '100%' },
});
