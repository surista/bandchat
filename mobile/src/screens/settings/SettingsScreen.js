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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { successNotification } from '../../utils/haptics';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import getInitial from '../../utils/getInitial';
import api from '../../services/api';
import { APP_BASE_URL } from '../../utils/constants';
import { useLayout } from '../../hooks/useLayout';

const CURRENCIES = ['USD', 'GBP', 'EUR', 'JPY', 'AUD', 'CAD', 'NZD', 'CHF', 'ZAR'];
const EVENT_TYPES = [
  { value: 'GIG', label: 'Gig' },
  { value: 'REHEARSAL', label: 'Rehearsal' },
  { value: 'RECORDING', label: 'Recording' },
  { value: 'OTHER', label: 'Other' },
];

function SettingsRow({ icon, label, subtitle, onPress, color, colors, showArrow = true }) {
  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.bgSecondary }]}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens setting"
    >
      <View style={styles.rowIconContainer}>
        <Ionicons name={icon} size={20} color={color || colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: color || colors.textPrimary }]}>{label}</Text>
        {subtitle ? <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {showArrow && (
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
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
  const { user, logout } = useAuth()
  const { isTablet, contentMaxWidth } = useLayout();
  const { colors, messageDensity, setMessageDensity } = useTheme();
  const [isAdmin, setIsAdmin] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [effectivePlan, setEffectivePlan] = useState('FREE');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Workspace defaults state
  const [showDefaultsModal, setShowDefaultsModal] = useState(false);
  const [wsCurrency, setWsCurrency] = useState('USD');
  const [wsEventType, setWsEventType] = useState('GIG');
  const [wsStartTime, setWsStartTime] = useState('19:00');
  const [wsEndTime, setWsEndTime] = useState('21:00');
  const [wsVenue, setWsVenue] = useState('');
  const [savingDefaults, setSavingDefaults] = useState(false);

  useEffect(() => {
    const checkRole = async () => {
      try {
        const ws = await api.getWorkspace(workspaceId);
        setWorkspaceName(ws.name || '');
        const membership = ws.members?.find(m => m.userId === user?.id);
        setIsAdmin(membership?.role === 'ADMIN');
        // Load workspace defaults
        setWsCurrency(ws.currency || 'USD');
        setWsEventType(ws.defaultEventType || 'GIG');
        setWsStartTime(ws.defaultStartTime || '19:00');
        setWsEndTime(ws.defaultEndTime || '21:00');
        setWsVenue(ws.defaultVenue || '');
        setEffectivePlan(ws.effectivePlan || 'FREE');
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

  const handleRenameWorkspace = useCallback(async () => {
    const trimmed = renameText.trim();
    if (!trimmed || trimmed === workspaceName) {
      setShowRenameModal(false);
      return;
    }
    setRenaming(true);
    try {
      await api.updateWorkspace(workspaceId, { name: trimmed });
      setWorkspaceName(trimmed);
      navigation.setParams({ name: trimmed });
      setShowRenameModal(false);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to rename workspace');
    } finally {
      setRenaming(false);
    }
  }, [workspaceId, renameText, workspaceName, navigation]);

  const handleSaveDefaults = useCallback(async () => {
    setSavingDefaults(true);
    try {
      await api.updateWorkspace(workspaceId, {
        currency: wsCurrency,
        defaultEventType: wsEventType,
        defaultStartTime: wsStartTime,
        defaultEndTime: wsEndTime,
        defaultVenue: wsVenue || null,
      });
      successNotification();
      Alert.alert('Saved', 'Workspace defaults updated');
      setShowDefaultsModal(false);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save defaults');
    } finally {
      setSavingDefaults(false);
    }
  }, [workspaceId, wsCurrency, wsEventType, wsStartTime, wsEndTime, wsVenue]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      <ScrollView contentContainerStyle={[styles.content, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
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
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Subscription */}
        <SectionHeader title="SUBSCRIPTION" colors={colors} />
        <View style={styles.group}>
          <SettingsRow
            icon="star-outline"
            label={effectivePlan === 'PRO' ? 'Pro Plan' : 'Upgrade to Pro'}
            onPress={() => navigation.navigate('Upgrade', { workspaceId })}
            colors={colors}
          />
        </View>

        {/* Account */}
        <SectionHeader title="ACCOUNT" colors={colors} />
        <View style={styles.group}>
          <SettingsRow
            icon="person-outline"
            label="Profile"
            onPress={() => navigation.navigate('EditProfile')}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon="lock-closed-outline"
            label="Security"
            onPress={() => navigation.navigate('Security')}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon="ban-outline"
            label="Blocked Users"
            onPress={() => navigation.navigate('BlockedUsers')}
            colors={colors}
          />
        </View>

        {/* Preferences */}
        <SectionHeader title="PREFERENCES" colors={colors} />
        <View style={styles.group}>
          <SettingsRow
            icon="color-palette-outline"
            label="Appearance"
            onPress={() => navigation.navigate('Appearance', { workspaceId })}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon="notifications-outline"
            label="Notifications"
            onPress={() => navigation.navigate('Notifications', { workspaceId })}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon="options-outline"
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
                icon="pencil-outline"
                label="Rename Workspace"
                subtitle={workspaceName}
                onPress={() => {
                  setRenameText(workspaceName);
                  setShowRenameModal(true);
                }}
                colors={colors}
              />
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
              <SettingsRow
                icon="people-outline"
                label="Members"
                onPress={() => navigation.navigate('WorkspaceMembers', { workspaceId })}
                colors={colors}
              />
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
              <SettingsRow
                icon="download-outline"
                label="Export Workspace"
                onPress={async () => {
                  try {
                    const data = await api.exportWorkspaceData(workspaceId);
                    const json = JSON.stringify(data, null, 2);
                    const file = new File(Paths.cache, 'bandchat-workspace-export.json');
                    await file.write(json);
                    await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
                  } catch (err) {
                    Alert.alert('Error', err.message || 'Failed to export workspace');
                  }
                }}
                colors={colors}
              />
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
              <SettingsRow
                icon="cloud-upload-outline"
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
                icon="person-add-outline"
                label="Invite People"
                onPress={() => navigation.navigate('Invite', { workspaceId })}
                colors={colors}
              />
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
              <SettingsRow
                icon="settings-outline"
                label="Workspace Defaults"
                onPress={() => setShowDefaultsModal(true)}
                colors={colors}
              />
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
              <SettingsRow
                icon="globe-outline"
                label="Band Website"
                onPress={() => navigation.navigate('WebsiteSettings', { workspaceId, workspaceName })}
                colors={colors}
              />
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
            </>
          )}
          <SettingsRow
            icon="exit-outline"
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
                icon="trash-outline"
                label="Delete Workspace"
                onPress={() => { setDeleteConfirmText(''); setShowDeleteModal(true); }}
                color="#ef4444"
                colors={colors}
                showArrow={false}
              />
            </>
          )}
        </View>

        {/* Support */}
        <SectionHeader title="SUPPORT" colors={colors} />
        <View style={styles.group}>
          <SettingsRow
            icon="mail-outline"
            label="Contact Support"
            subtitle="admin@bandchat.app"
            onPress={() => Linking.openURL('mailto:admin@bandchat.app?subject=BandChat Support')}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => Linking.openURL(`${APP_BASE_URL}/privacy`)}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => Linking.openURL(`${APP_BASE_URL}/terms`)}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon="chatbubble-outline"
            label="Send Feedback"
            onPress={() => Linking.openURL('mailto:admin@bandchat.app?subject=BandChat Feedback')}
            colors={colors}
          />
        </View>

        {/* App */}
        <SectionHeader title="APP" colors={colors} />
        <View style={styles.group}>
          <SettingsRow
            icon="log-out-outline"
            label="Log Out"
            onPress={handleLogout}
            color="#ef4444"
            colors={colors}
            showArrow={false}
          />
        </View>

        <Text style={[styles.version, { color: colors.textSecondary }]} accessibilityRole="text">
          BandChat v{Constants.expoConfig?.version || '1.0.0'}
        </Text>
      </ScrollView>

      {/* Rename Workspace Modal */}
      <Modal visible={showRenameModal} transparent animationType="fade" onRequestClose={() => setShowRenameModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Rename Workspace</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="Workspace name"
              placeholderTextColor={colors.textSecondary}
              maxLength={100}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={handleRenameWorkspace}
              accessibilityLabel="New workspace name"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => setShowRenameModal(false)}
                disabled={renaming}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#22c55e' }, (!renameText.trim() || renameText.trim() === workspaceName) && { opacity: 0.5 }]}
                onPress={handleRenameWorkspace}
                disabled={renaming || !renameText.trim() || renameText.trim() === workspaceName}
                accessibilityRole="button"
                accessibilityLabel="Save new name"
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>{renaming ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

      {/* Workspace Defaults Modal */}
      <Modal visible={showDefaultsModal} transparent animationType="fade" onRequestClose={() => setShowDefaultsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Workspace Defaults</Text>

            {/* Currency */}
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Currency</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {CURRENCIES.map(cur => (
                <TouchableOpacity
                  key={cur}
                  style={[styles.chip, { backgroundColor: wsCurrency === cur ? colors.primary : colors.bgTertiary }]}
                  onPress={() => setWsCurrency(cur)}
                  disabled={savingDefaults}
                >
                  <Text style={[styles.chipText, { color: wsCurrency === cur ? '#ffffff' : colors.textPrimary }]}>{cur}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Event Type */}
            <Text style={[styles.modalLabel, { color: colors.textSecondary, marginTop: 16 }]}>Default Event Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {EVENT_TYPES.map(et => (
                <TouchableOpacity
                  key={et.value}
                  style={[styles.chip, { backgroundColor: wsEventType === et.value ? colors.primary : colors.bgTertiary }]}
                  onPress={() => setWsEventType(et.value)}
                  disabled={savingDefaults}
                >
                  <Text style={[styles.chipText, { color: wsEventType === et.value ? '#ffffff' : colors.textPrimary }]}>{et.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Default Times */}
            <View style={styles.timeRow}>
              <View style={styles.timeCol}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Start Time</Text>
                <TextInput
                  style={[styles.timeInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                  value={wsStartTime}
                  onChangeText={setWsStartTime}
                  placeholder="19:00"
                  placeholderTextColor={colors.textSecondary}
                  editable={!savingDefaults}
                />
              </View>
              <View style={styles.timeCol}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>End Time</Text>
                <TextInput
                  style={[styles.timeInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                  value={wsEndTime}
                  onChangeText={setWsEndTime}
                  placeholder="21:00"
                  placeholderTextColor={colors.textSecondary}
                  editable={!savingDefaults}
                />
              </View>
            </View>

            {/* Default Venue */}
            <Text style={[styles.modalLabel, { color: colors.textSecondary, marginTop: 8 }]}>Default Venue</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              value={wsVenue}
              onChangeText={setWsVenue}
              placeholder="Leave blank for none"
              placeholderTextColor={colors.textSecondary}
              editable={!savingDefaults}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => setShowDefaultsModal(false)}
                disabled={savingDefaults}
              >
                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleSaveDefaults}
                disabled={savingDefaults}
              >
                {savingDefaults ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextWhite}>Save</Text>
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
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
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
  rowIconContainer: { width: 30, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 16, marginLeft: 4 },
  rowSubtitle: { fontSize: 13, marginLeft: 4, marginTop: 2 },
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
  modalContent: { borderRadius: 12, padding: 24, maxWidth: 500, width: '100%' },
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
  modalLabel: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  // Chip styles for currency/event type
  chipScroll: { marginBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
  // Time row
  timeRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  timeCol: { flex: 1 },
  timeInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    textAlign: 'center',
  },
});
