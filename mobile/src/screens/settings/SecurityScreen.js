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
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as LocalAuthentication from 'expo-local-authentication';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

export default function SecurityScreen() {
  const { user, logout, biometricEnabled, setBiometricEnabled } = useAuth();
  const { colors } = useTheme();

  const isGoogleOnly = user?.authProvider === 'google';

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
          setBiometricLabel(Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint');
        }
      } catch {
        // No biometrics available
      }
    })();
  }, []);

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
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

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
    if (user?.authProvider === 'google') return 'Google';
    if (user?.authProvider === 'both') return 'Local + Google';
    return 'Local';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Change Password */}
        {!isGoogleOnly && (
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
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Update Password</Text>
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
          {!isGoogleOnly && (
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
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]} accessibilityRole="header">AUTH PROVIDER</Text>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Type</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{getProviderLabel()}</Text>
          </View>
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
                const path = `${FileSystem.cacheDirectory}bandchat-export.json`;
                await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
                await Sharing.shareAsync(path, { mimeType: 'application/json' });
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
            Permanently delete your account. Your messages will be anonymized and your profile data removed. This cannot be undone.
          </Text>
          <TouchableOpacity
            style={[styles.dangerButton]}
            onPress={() => setShowDeleteModal(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Delete my account"
          >
            <Text style={styles.dangerButtonText}>Delete My Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Change Email Modal */}
      <Modal visible={showEmailModal} transparent animationType="fade" onRequestClose={() => setShowEmailModal(false)}>
        <View style={styles.modalOverlay}>
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
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextWhite}>Send Verification</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Delete Account Modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: '#ef4444' }]} accessibilityRole="header">Delete Account</Text>
            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              This will permanently delete your account. Your messages will show as "Deleted User" and your profile data will be removed.
            </Text>
            {!isGoogleOnly && (
              <TextInput
                style={[styles.input, styles.lastInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Enter your password to confirm"
                placeholderTextColor={colors.textSecondary}
                value={deletePassword}
                onChangeText={setDeletePassword}
                secureTextEntry
                autoCapitalize="none"
                accessibilityLabel="Password to confirm account deletion"
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
                style={[styles.modalButton, { backgroundColor: '#ef4444' }]}
                accessibilityRole="button"
                accessibilityLabel="Delete account permanently"
                onPress={async () => {
                  setDeleting(true);
                  try {
                    await api.deleteAccount(deletePassword || undefined);
                    setShowDeleteModal(false);
                    logout();
                  } catch (err) {
                    Alert.alert('Error', err.message || 'Failed to delete account');
                  } finally {
                    setDeleting(false);
                  }
                }}
                disabled={deleting || (!isGoogleOnly && !deletePassword)}
              >
                {deleting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextWhite}>Delete Forever</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: { borderRadius: 12, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  modalDesc: { fontSize: 14, marginBottom: 20 },
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
