import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Switch,
  Share,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';
import * as LocalAuthentication from 'expo-local-authentication';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import { errorNotification } from '../../utils/haptics';
import { useLayout } from '../../hooks/useLayout';

export default function SecurityScreen() {
  const { user, updateUser, logout, biometricEnabled, setBiometricEnabled } = useAuth()
  const { isTablet, contentMaxWidth } = useLayout();
  const { colors } = useTheme();
  const headerHeight = useHeaderHeight();

  const hasPassword = user?.hasPassword !== false;
  const hasGoogle = !!user?.googleId;
  const hasApple = !!user?.appleId;
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [linkingApple, setLinkingApple] = useState(false);

  // Biometric state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometric Unlock');
  const [togglingBiometric, setTogglingBiometric] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        if (!hasHardware) return;
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!isEnrolled) return;
        setBiometricAvailable(true);
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        const hasFaceId = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
        const hasFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
        if (hasFaceId) {
          setBiometricLabel('Face ID');
        } else if (hasFingerprint) {
          setBiometricLabel(Platform.OS === 'ios' ? 'Touch ID' : 'Biometric Unlock');
        }
      } catch {
        // No biometrics available
      }
    })();
  }, []);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: Constants.expoConfig?.extra?.googleWebClientId,
      iosClientId: Constants.expoConfig?.extra?.googleIosClientId,
    });
  }, []);

  const handleLinkGoogle = useCallback(async () => {
    setLinkingGoogle(true);
    try {
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices();
      }
      const response = await GoogleSignin.signIn();
      const idToken = response?.data?.idToken;
      if (!idToken) throw new Error('No ID token received from Google');
      const data = await api.linkGoogle(idToken);
      updateUser(data.user);
      Alert.alert('Success', 'Google account linked successfully');
    } catch (error) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (error.code === statusCodes.IN_PROGRESS) return;
      Alert.alert('Error', error.message || 'Failed to link Google account');
    } finally {
      setLinkingGoogle(false);
    }
  }, [updateUser]);

  const handleLinkApple = useCallback(async () => {
    setLinkingApple(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const data = await api.linkApple(credential.identityToken);
      updateUser(data.user);
      Alert.alert('Success', 'Apple account linked successfully');
    } catch (error) {
      if (error.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Error', error.message || 'Failed to link Apple account');
    } finally {
      setLinkingApple(false);
    }
  }, [updateUser]);

  const handleToggleBiometric = useCallback(async (value) => {
    setTogglingBiometric(true);
    try {
      if (value) {
        // Verify biometric works before enabling
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: `Confirm ${biometricLabel}`,
          disableDeviceFallback: true,
          cancelLabel: 'Cancel',
        });
        if (result.success) {
          await setBiometricEnabled(true);
        }
      } else {
        await setBiometricEnabled(false);
      }
    } catch {
      Alert.alert('Error', 'Failed to update biometric setting');
    } finally {
      setTogglingBiometric(false);
    }
  }, [biometricLabel, setBiometricEnabled]);

  // Change password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Change email modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);

  // Export & Delete
  const [exporting, setExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert('Required', 'Please fill in all password fields');
      return;
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      Alert.alert('Invalid', 'Password must be at least 8 characters with uppercase, lowercase, and a number');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New passwords do not match');
      return;
    }

    setChangingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      Alert.alert('Success', 'Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  const handleChangeEmail = useCallback(async () => {
    if (!newEmail.trim() || !emailPassword) {
      Alert.alert('Required', 'Please fill in all fields');
      return;
    }

    setChangingEmail(true);
    try {
      await api.requestEmailChange(newEmail.trim(), emailPassword);
      Alert.alert('Check Your Email', 'A verification link has been sent to your new email address.');
      setShowEmailModal(false);
      setNewEmail('');
      setEmailPassword('');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to request email change');
    } finally {
      setChangingEmail(false);
    }
  }, [newEmail, emailPassword]);

  const getProviderLabel = () => {
    const providers = [];
    if (user?.authProvider === 'local' || user?.authProvider === 'both') providers.push('Local');
    if (hasGoogle) providers.push('Google');
    if (hasApple) providers.push('Apple');
    return providers.length > 0 ? providers.join(' + ') : 'Local';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.content, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]} keyboardShouldPersistTaps="handled">
        {/* Change Password */}
        {hasPassword && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]} accessibilityRole="header">CHANGE PASSWORD</Text>
            <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Current password"
                placeholderTextColor={colors.textSecondary}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                accessibilityLabel="Current password"
              />
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="New password"
                placeholderTextColor={colors.textSecondary}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                accessibilityLabel="New password"
              />
              <TextInput
                style={[styles.input, styles.lastInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Confirm new password"
                placeholderTextColor={colors.textSecondary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                accessibilityLabel="Confirm new password"
              />
              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.primary }]}
                onPress={handleChangePassword}
                disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Update password"
              >
                {changingPassword ? (
                  <ActivityIndicator color={colors.primaryText} size="small" />
                ) : (
                  <Text style={[styles.buttonText, { color: colors.primaryText }]}>Update Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Email */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]} accessibilityRole="header">EMAIL</Text>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Current</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{user?.email || 'N/A'}</Text>
          </View>
          {user?.pendingEmail && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Pending</Text>
              <Text style={[styles.infoValue, { color: '#f59e0b' }]}>{user.pendingEmail}</Text>
            </View>
          )}
          {hasPassword && (
            <TouchableOpacity
              style={[styles.outlineButton, { borderColor: colors.primary }]}
              onPress={() => setShowEmailModal(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Change email"
            >
              <Text style={[styles.outlineButtonText, { color: colors.primary }]}>Change Email</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Auth Provider */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]} accessibilityRole="header">LINKED ACCOUNTS</Text>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Sign-in methods</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{getProviderLabel()}</Text>
          </View>
          {!hasGoogle && (
            <TouchableOpacity
              style={[styles.outlineButton, { borderColor: colors.border }]}
              onPress={handleLinkGoogle}
              disabled={linkingGoogle}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Link Google account"
            >
              {linkingGoogle ? (
                <ActivityIndicator color={colors.textPrimary} size="small" />
              ) : (
                <Text style={[styles.outlineButtonText, { color: colors.textPrimary }]}>Link Google Account</Text>
              )}
            </TouchableOpacity>
          )}
          {!hasApple && Platform.OS === 'ios' && (
            <TouchableOpacity
              style={[styles.outlineButton, { borderColor: colors.border, marginTop: 8 }]}
              onPress={handleLinkApple}
              disabled={linkingApple}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Link Apple account"
            >
              {linkingApple ? (
                <ActivityIndicator color={colors.textPrimary} size="small" />
              ) : (
                <Text style={[styles.outlineButtonText, { color: colors.textPrimary }]}>Link Apple Account</Text>
              )}
            </TouchableOpacity>
          )}
          {hasGoogle && (
            <View style={[styles.infoRow, { marginTop: 4 }]}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Google</Text>
              <Text style={[styles.linkedBadge, { color: '#22c55e' }]}>Linked</Text>
            </View>
          )}
          {hasApple && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Apple</Text>
              <Text style={[styles.linkedBadge, { color: '#22c55e' }]}>Linked</Text>
            </View>
          )}
        </View>

        {/* Biometric Unlock */}
        {biometricAvailable && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]} accessibilityRole="header">BIOMETRIC UNLOCK</Text>
            <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
              <View style={styles.biometricRow}>
                <View style={styles.biometricInfo}>
                  <Text style={[styles.biometricTitle, { color: colors.textPrimary }]}>{biometricLabel}</Text>
                  <Text style={[styles.biometricDesc, { color: colors.textSecondary }]}>
                    Require {biometricLabel} to unlock BandChat
                  </Text>
                </View>
                {togglingBiometric ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Switch
                    value={biometricEnabled}
                    onValueChange={handleToggleBiometric}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    accessibilityLabel={`Toggle ${biometricLabel}`}
                  />
                )}
              </View>
            </View>
          </>
        )}

        {/* Export My Data */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]} accessibilityRole="header">MY DATA</Text>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          <Text style={[styles.desc, { color: colors.textSecondary }]}>
            Download all your data as a JSON file including your profile, messages, and content you created.
          </Text>
          <TouchableOpacity
            style={[styles.outlineButton, { borderColor: colors.primary }]}
            onPress={async () => {
              setExporting(true);
              try {
                const data = await api.exportUserData();
                const json = JSON.stringify(data, null, 2);
                const file = new File(Paths.cache, 'bandchat-export.json');
                await file.write(json);
                await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
              } catch (err) {
                Alert.alert('Error', err.message || 'Failed to export data');
              } finally {
                setExporting(false);
              }
            }}
            disabled={exporting}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Export my data"
          >
            {exporting ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={[styles.outlineButtonText, { color: colors.primary }]}>Export My Data</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Delete Account */}
        <Text style={[styles.sectionHeader, { color: '#ef4444' }]} accessibilityRole="header">DANGER ZONE</Text>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          <Text style={[styles.desc, { color: colors.textSecondary }]}>
            This will permanently delete your account across all workspaces. Your messages will be anonymized and your profile data removed. This cannot be undone. If you just want to leave this workspace, you can find that under the Workspace tab.
          </Text>
          <TouchableOpacity
            style={[styles.dangerButton]}
            onPress={() => { errorNotification(); setShowDeleteModal(true); }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Delete my account"
          >
            <Text style={styles.dangerButtonText}>Delete My Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Change Email Modal */}
      <Modal visible={showEmailModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowEmailModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]} accessibilityRole="header">Change Email</Text>
            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              A verification link will be sent to your new email address.
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="New email address"
              placeholderTextColor={colors.textSecondary}
              value={newEmail}
              onChangeText={setNewEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              autoFocus
              accessibilityLabel="New email address"
            />
            <TextInput
              style={[styles.input, styles.lastInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Current password"
              placeholderTextColor={colors.textSecondary}
              value={emailPassword}
              onChangeText={setEmailPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              accessibilityLabel="Current password for email change"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => { setShowEmailModal(false); setNewEmail(''); setEmailPassword(''); }}
                disabled={changingEmail}
                accessibilityRole="button"
                accessibilityLabel="Cancel email change"
              >
                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleChangeEmail}
                disabled={changingEmail || !newEmail.trim() || !emailPassword}
                accessibilityRole="button"
                accessibilityLabel="Send verification email"
              >
                {changingEmail ? (
                  <ActivityIndicator color={colors.primaryText} size="small" />
                ) : (
                  <Text style={[styles.modalButtonTextWhite, { color: colors.primaryText }]}>Send Verification</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* Delete Account Modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { setShowDeleteModal(false); setDeletePassword(''); }}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: '#ef4444' }]} accessibilityRole="header">Delete Account</Text>
            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              This will permanently delete your account. Your messages will show as "Deleted User" and your profile data will be removed. This cannot be undone.
            </Text>
            {hasPassword && (
              <TextInput
                style={[styles.deletePasswordInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Enter your password to confirm"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry
                value={deletePassword}
                onChangeText={setDeletePassword}
                autoComplete="current-password"
                textContentType="password"
                accessibilityLabel="Password confirmation for account deletion"
              />
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => { setShowDeleteModal(false); setDeletePassword(''); }}
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel="Cancel account deletion"
              >
                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#ef4444', opacity: (hasPassword && !deletePassword) ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Delete account permanently"
                onPress={async () => {
                  if (hasPassword && !deletePassword) return;
                  setDeleting(true);
                  try {
                    await api.deleteAccount(hasPassword ? deletePassword : undefined);
                    setShowDeleteModal(false);
                    setDeletePassword('');
                    logout();
                  } catch (err) {
                    Alert.alert('Error', err.message || 'Failed to delete account');
                  } finally {
                    setDeleting(false);
                  }
                }}
                disabled={deleting || (hasPassword && !deletePassword)}
              >
                {deleting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextWhite}>Delete Forever</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 12,
    padding: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  lastInput: { marginBottom: 16 },
  button: {
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  outlineButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    marginTop: 4,
  },
  outlineButtonText: { fontSize: 15, fontWeight: '600' },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: '600' },
  linkedBadge: { fontSize: 13, fontWeight: '600' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: { borderRadius: 12, padding: 24, maxWidth: 500, width: '100%' },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  modalDesc: { fontSize: 14, marginBottom: 20 },
  deletePasswordInput: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 15, marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 15, fontWeight: '600' },
  modalButtonTextWhite: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
  desc: { fontSize: 14, marginBottom: 12, lineHeight: 20 },
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  biometricInfo: { flex: 1, marginRight: 12 },
  biometricTitle: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  biometricDesc: { fontSize: 13 },
  dangerButton: {
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#ef4444',
  },
  dangerButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
