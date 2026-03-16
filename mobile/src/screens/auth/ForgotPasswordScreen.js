import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import { useLayout } from '../../hooks/useLayout';

export default function ForgotPasswordScreen({ navigation }) {
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setError('');
    setLoading(true);

    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.sidebar }, isTablet && styles.tabletContainer]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">BandChat</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Reset your password
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
            {sent ? (
              <>
                <View style={styles.successBox}>
                  <Text style={styles.successText}>
                    If an account exists with that email, we've sent password reset instructions.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: colors.primary }]}
                  onPress={() => navigation.navigate('Login')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Back to sign in"
                >
                  <Text style={styles.buttonText}>Back to Sign In</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Text style={[styles.description, { color: colors.textSecondary }]}>
                  Enter the email address associated with your account and we'll send you a link to reset your password.
                </Text>

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
                  onSubmitEditing={handleSubmit}
                  returnKeyType="go"
                  autoFocus
                  accessibilityLabel="Email address"
                />

                <TouchableOpacity
                  style={[styles.button, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
                  onPress={handleSubmit}
                  disabled={loading || !email.trim()}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Send reset link"
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.buttonText}>Send Reset Link</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => navigation.goBack()}
                  accessibilityRole="button"
                  accessibilityLabel="Back to sign in"
                >
                  <Text style={[styles.linkText, { color: colors.primary }]}>Back to Sign In</Text>
                </TouchableOpacity>
              </>
            )}
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
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: { fontSize: 16 },
  card: {
    borderRadius: 12,
    padding: 24,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
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
  successBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: '#22c55e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  successText: { color: '#86efac', fontSize: 14, lineHeight: 20 },
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
  linkText: { fontSize: 14, fontWeight: '600' },
});
