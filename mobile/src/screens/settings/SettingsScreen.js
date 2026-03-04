import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  Linking,
  Image,
  StyleSheet,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import getInitial from '../../utils/getInitial';
import api from '../../services/api';
import { APP_BASE_URL } from '../../utils/constants';

function SettingsRow({ icon, label, onPress, color, colors, showArrow = true }) {
  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.bgSecondary }]}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={[styles.rowLabel, { color: color || colors.textPrimary }]}>{label}</Text>
      {showArrow && (
        <Text style={[styles.rowArrow, { color: colors.textSecondary }]}>{'\u203A'}</Text>
      )}
    </TouchableOpacity>
  );
}

function SectionHeader({ title, colors }) {
  return (
    <Text style={[styles.sectionHeader, { color: colors.textSecondary }]} accessibilityRole="header">{title}</Text>
  );
}

export default function SettingsScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { user, logout } = useAuth();
  const { colors, messageDensity, setMessageDensity } = useTheme();
  const [isAdmin, setIsAdmin] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const checkRole = async () => {
      try {
        const ws = await api.getWorkspace(workspaceId);
        setWorkspaceName(ws.name || '');
        const membership = ws.members?.find(m => m.userId === user?.id);
        setIsAdmin(membership?.role === 'ADMIN');
      } catch {
        // Default to non-admin
      }
    };
    checkRole();
  }, [workspaceId, user?.id]);

  const handleLogout = useCallback(() => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  }, [logout]);

  const handleLeaveWorkspace = useCallback(() => {
    Alert.alert(
      'Leave Workspace',
      `Are you sure you want to leave "${workspaceName}"? You will lose access to all channels and messages.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.leaveWorkspace(workspaceId);
              navigation.reset({ index: 0, routes: [{ name: 'WorkspaceList' }] });
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to leave workspace');
            }
          },
        },
      ]
    );
  }, [workspaceId, workspaceName, navigation]);

  const handleDeleteWorkspace = useCallback(async () => {
    if (deleteConfirmText.trim() !== workspaceName) {
      Alert.alert('Error', 'Workspace name does not match');
      return;
    }
    setDeleting(true);
    try {
      await api.deleteWorkspace(workspaceId);
      setShowDeleteModal(false);
      navigation.reset({ index: 0, routes: [{ name: 'WorkspaceList' }] });
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to delete workspace');
    } finally {
      setDeleting(false);
    }
  }, [workspaceId, workspaceName, deleteConfirmText, navigation]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* User Card */}
        <TouchableOpacity
          style={[styles.userCard, { backgroundColor: colors.bgSecondary }]}
          onPress={() => navigation.navigate('EditProfile')}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
        >
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatarImg} accessibilityLabel={`${user?.displayName || 'User'} avatar`} />
          ) : (
            <View style={[styles.avatarImg, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{getInitial(user?.displayName)}</Text>
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: colors.textPrimary }]}>
              {user?.displayName || 'User'}
            </Text>
            <Text style={[styles.userEmail, { color: colors.textSecondary }]}>
              {user?.email || ''}
            </Text>
          </View>
          <Text style={[styles.rowArrow, { color: colors.textSecondary }]}>{'\u203A'}</Text>
        </TouchableOpacity>

        {/* Account */}
        <SectionHeader title="ACCOUNT" colors={colors} />
        <View style={styles.group}>
          <SettingsRow
            icon={'\uD83D\uDC64'}
            label="Profile"
            onPress={() => navigation.navigate('EditProfile')}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon={'\uD83D\uDD12'}
            label="Security"
            onPress={() => navigation.navigate('Security')}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon={'\uD83D\uDEAB'}
            label="Blocked Users"
            onPress={() => navigation.navigate('BlockedUsers')}
            colors={colors}
          />
        </View>

        {/* Preferences */}
        <SectionHeader title="PREFERENCES" colors={colors} />
        <View style={styles.group}>
          <SettingsRow
            icon={'\uD83C\uDFA8'}
            label="Appearance"
            onPress={() => navigation.navigate('Appearance')}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon={'\uD83D\uDD14'}
            label="Notifications"
            onPress={() => navigation.navigate('Notifications', { workspaceId })}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon={'\u2630'}
            label={`Message Density (${messageDensity.charAt(0).toUpperCase() + messageDensity.slice(1)})`}
            onPress={() => {
              Alert.alert('Message Density', 'Choose how much space messages take up.', [
                { text: 'Comfortable', onPress: () => setMessageDensity('comfortable') },
                { text: 'Default', onPress: () => setMessageDensity('default') },
                { text: 'Compact', onPress: () => setMessageDensity('compact') },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }}
            colors={colors}
          />
        </View>

        {/* Workspace */}
        <SectionHeader title="WORKSPACE" colors={colors} />
        <View style={styles.group}>
          {isAdmin && (
            <>
              <SettingsRow
                icon={'\uD83D\uDC65'}
                label="Members"
                onPress={() => navigation.navigate('WorkspaceMembers', { workspaceId })}
                colors={colors}
              />
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
              <SettingsRow
                icon={'\uD83D\uDCE5'}
                label="Export Workspace"
                onPress={async () => {
                  try {
                    const data = await api.exportWorkspaceData(workspaceId);
                    const json = JSON.stringify(data, null, 2);
                    const path = `${FileSystem.cacheDirectory}bandchat-workspace-export.json`;
                    await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
                    await Sharing.shareAsync(path, { mimeType: 'application/json' });
                  } catch (err) {
                    Alert.alert('Error', err.message || 'Failed to export workspace');
                  }
                }}
                colors={colors}
              />
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
              <SettingsRow
                icon={'\uD83D\uDCE8'}
                label="Import from Slack"
                onPress={() => Alert.alert(
                  'Desktop Feature',
                  `Slack workspace import is available on the web app at ${APP_BASE_URL}`,
                  [{ text: 'OK' }]
                )}
                colors={colors}
              />
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
              <SettingsRow
                icon={'\u2709\uFE0F'}
                label="Invite People"
                onPress={() => navigation.navigate('Invite', { workspaceId })}
                colors={colors}
              />
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
            </>
          )}
          <SettingsRow
            icon={'\uD83D\uDEAA'}
            label="Leave Workspace"
            onPress={handleLeaveWorkspace}
            color="#f59e0b"
            colors={colors}
            showArrow={false}
          />
          {isAdmin && (
            <>
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
              <SettingsRow
                icon={'\uD83D\uDDD1\uFE0F'}
                label="Delete Workspace"
                onPress={() => { setDeleteConfirmText(''); setShowDeleteModal(true); }}
                color="#ef4444"
                colors={colors}
                showArrow={false}
              />
            </>
          )}
        </View>

        {/* Legal */}
        <SectionHeader title="LEGAL" colors={colors} />
        <View style={styles.group}>
          <SettingsRow
            icon={'\uD83D\uDD12'}
            label="Privacy Policy"
            onPress={() => Linking.openURL(`${APP_BASE_URL}/privacy`)}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon={'\uD83D\uDCC4'}
            label="Terms of Service"
            onPress={() => Linking.openURL(`${APP_BASE_URL}/terms`)}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon={'\u2709\uFE0F'}
            label="Send Feedback"
            onPress={() => Linking.openURL('mailto:admin@bandchat.app?subject=BandChat Feedback')}
            colors={colors}
          />
        </View>

        {/* App */}
        <SectionHeader title="APP" colors={colors} />
        <View style={styles.group}>
          <SettingsRow
            icon={'\uD83D\uDEAA'}
            label="Log Out"
            onPress={handleLogout}
            color="#ef4444"
            colors={colors}
            showArrow={false}
          />
        </View>

        <Text style={[styles.version, { color: colors.textSecondary }]} accessibilityRole="text">
          BandChat Mobile v{Constants.expoConfig?.version || '1.0.0'}
        </Text>
      </ScrollView>

      {/* Delete Workspace Confirmation Modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Delete Workspace</Text>
            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              This will permanently delete "{workspaceName}" and all its data. Type the workspace name to confirm:
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder={workspaceName}
              placeholderTextColor={colors.textSecondary}
              autoFocus
              accessibilityLabel="Type workspace name to confirm deletion"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => setShowDeleteModal(false)}
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#ef4444' }, deleteConfirmText.trim() !== workspaceName && { opacity: 0.5 }]}
                onPress={handleDeleteWorkspace}
                disabled={deleting || deleteConfirmText.trim() !== workspaceName}
                accessibilityRole="button"
                accessibilityLabel="Delete workspace"
              >
                {deleting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextWhite}>Delete</Text>
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
  // User card
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  avatarImg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { color: '#ffffff', fontSize: 22, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  userEmail: { fontSize: 14 },
  // Section
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  group: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowIcon: { fontSize: 18, width: 30, textAlign: 'center' },
  rowLabel: { fontSize: 16, flex: 1, marginLeft: 4 },
  rowArrow: { fontSize: 22, fontWeight: '300' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 50 },
  version: { fontSize: 13, textAlign: 'center', marginTop: 32 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: { borderRadius: 12, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  modalDesc: { fontSize: 15, marginBottom: 16, lineHeight: 22 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 15, fontWeight: '600' },
  modalButtonTextWhite: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
});
