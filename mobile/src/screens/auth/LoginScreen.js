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
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { APP_BASE_URL } from '../../utils/constants';
import { useLayout } from '../../hooks/useLayout';
import PressableRow from '../../components/PressableRow';

// Whether the build was compiled with the right Google OAuth client ID for
// this platform. Used to skip the configure() call on mount (which would
// otherwise warn) and to swap the raw SDK error ("GoogleService-Info.plist
// was not found...") for a clean user-facing message if someone taps Google
// before the env is set. We deliberately still SHOW the button — Google
// Sign-In is a required option, and the fix is to set GOOGLE_IOS_CLIENT_ID
// (or GOOGLE_CLIENT_ID for Android) in mobile/.env / EAS env and rebuild.
const GOOGLE_SIGN_IN_AVAILABLE =
  (Platform.OS === 'ios' && !!Constants.expoConfig?.extra?.googleIosClientId) ||
  (Platform.OS === 'android' && !!Constants.expoConfig?.extra?.googleWebClientId);

export default function LoginScreen({ navigation }) {
  const { login, googleLogin, appleLogin } = useAuth()
  const { isTablet, contentMaxWidth } = useLayout();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!GOOGLE_SIGN_IN_AVAILABLE) return;
    GoogleSignin.configure({
      webClientId: Constants.expoConfig?.extra?.googleWebClientId,
      iosClientId: Constants.expoConfig?.extra?.googleIosClientId,
    });
  }, []);

  const handleGoogleSignIn = async () => {
    if (!GOOGLE_SIGN_IN_AVAILABLE) {
      setError('Google Sign-In isn\'t configured in this build. Please use email or Apple, or contact support.');
      return;
    }
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
      } else if (error.message?.includes('determine clientID') || error.message?.includes('GoogleService-Info')) {
        // SDK's raw error when the build lacks GOOGLE_IOS_CLIENT_ID; swap
        // for something a user can actually act on.
        setError('Google Sign-In isn\'t configured in this build. Please use email or Apple.');
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
    if (!email.trim() || !password) return;
    setError('');
    setLoading(true);

    try {
      await login(email.trim(), password);
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
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header" maxFontSizeMultiplier={1.6}>BandChat</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.6}>
              Sign in to your workspace
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
            {error ? (
              <View style={styles.errorBox} accessibilityLiveRegion="polite">
                <Text style={styles.errorText} maxFontSizeMultiplier={1.5}>{error}</Text>
              </View>
            ) : null}

            <Text style={[styles.label, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.6}>Email</Text>
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

            <Text style={[styles.label, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.6}>Password</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={[styles.input, styles.passwordInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Your password"
                placeholderTextColor={colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
                textContentType="password"
                editable={!loading}
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
                accessibilityLabel="Password"
              />
              <TouchableOpacity
                style={styles.showHideButton}
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Text style={[styles.showHideText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>

            <PressableRow
              style={[styles.button, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              rippleColor="rgba(255,255,255,0.2)"
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryText} size="small" />
              ) : (
                <Text style={[styles.buttonText, { color: colors.primaryText }]} maxFontSizeMultiplier={1.5}>Sign In</Text>
              )}
            </PressableRow>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.navigate('ForgotPassword')}
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
            >
              <Text style={[styles.linkText, { color: colors.primary }]} maxFontSizeMultiplier={1.5}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => navigation.navigate('Signup')}
              accessibilityRole="button"
              accessibilityLabel="Go to sign up"
            >
              <Text style={[styles.linkText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>
                Don't have an account?{' '}
                <Text style={{ color: colors.primary, fontWeight: '600' }} maxFontSizeMultiplier={1.5}>Sign Up</Text>
              </Text>
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            {/* Apple first on iOS — App Store Guideline 4.8 wants Sign in
                with Apple offered with equivalent prominence to any other
                third-party login; convention is to put it on top. */}
            {Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={8}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            )}

            <TouchableOpacity
              onPress={handleGoogleSignIn}
              style={[styles.socialButton, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Google"
            >
              <Text style={[styles.socialButtonText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.5}>
                Sign in with Google
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <View style={styles.footerLinks}>
              <TouchableOpacity onPress={() => Linking.openURL(`${APP_BASE_URL}/privacy`)} accessibilityRole="link" accessibilityLabel="Privacy Policy">
                <Text style={[styles.footerLink, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>Privacy</Text>
              </TouchableOpacity>
              <Text style={[styles.footerDot, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>{'\u00B7'}</Text>
              <TouchableOpacity onPress={() => Linking.openURL(`${APP_BASE_URL}/terms`)} accessibilityRole="link" accessibilityLabel="Terms of Service">
                <Text style={[styles.footerLink, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>Terms</Text>
              </TouchableOpacity>
              <Text style={[styles.footerDot, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>{'\u00B7'}</Text>
              <TouchableOpacity onPress={() => Linking.openURL(`${APP_BASE_URL}/support`)} accessibilityRole="link" accessibilityLabel="Support">
                <Text style={[styles.footerLink, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>Support</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.footerVersion, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>
              v{Constants.expoConfig?.version || '1.0.0'}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabletContainer: { maxWidth: 500, width: '100%', alignSelf: 'center' },
  flex: {
    flex: 1,
  },
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
  subtitle: {
    fontSize: 16,
  },
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
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
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
  buttonDisabled: {
    opacity: 0.6,
  },
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
