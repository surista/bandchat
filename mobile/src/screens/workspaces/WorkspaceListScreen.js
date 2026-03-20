import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  StyleSheet,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme, themes } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import Constants from 'expo-constants';
import api from '../../services/api';

export default function WorkspaceListScreen({ navigation, route }) {
  const { user, logout } = useAuth();
  const { colors, getWorkspaceTheme, globalTheme } = useTheme();
  const toast = useToast();
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await api.getWorkspaces();
      setWorkspaces(data);
      // Auto-navigate if exactly one workspace, no invite code, and not explicitly returning here
      if (data.length === 1 && !route.params?.inviteCode && !route.params?.showList) {
        navigation.replace('Workspace', { id: data[0].id, name: data[0].name });
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast, navigation, route.params?.inviteCode, route.params?.showList]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  // Handle invite deep link
  useEffect(() => {
    const code = route.params?.inviteCode;
    if (code && /^[a-zA-Z0-9_-]+$/.test(code) && code.length <= 100) {
      setInviteCode(code);
      setShowJoin(true);
    }
  }, [route.params?.inviteCode]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadWorkspaces();
  }, [loadWorkspaces]);

  const handleJoinWorkspace = async () => {
    if (!inviteCode.trim()) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      const workspace = await api.joinWorkspace(inviteCode.trim());
      setWorkspaces(prev => [...prev, workspace]);
      setShowJoin(false);
      setInviteCode('');
      toast.success('Joined workspace!');
      navigation.navigate('Workspace', { id: workspace.id, name: workspace.name });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderWorkspace = ({ item }) => {
    const wsThemeId = getWorkspaceTheme(item.id) || globalTheme;
    const wsTheme = themes[wsThemeId] || themes.default;
    return (
    <TouchableOpacity
      style={[styles.workspaceItem, { backgroundColor: colors.bgSecondary }]}
      onPress={() => {
        setWorkspaces(prev => prev.map(w => w.id === item.id ? { ...w, unreadCount: 0 } : w));
        navigation.navigate('Workspace', { id: item.id, name: item.name });
      }}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.name} workspace, ${item._count?.members || 0} members${item.unreadCount > 0 ? `, ${item.unreadCount} unread` : ''}`}
    >
      <View style={[styles.workspaceAvatar, { backgroundColor: wsTheme.primary }]}>
        <Text style={styles.workspaceAvatarText}>
          {item.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.workspaceInfo}>
        <Text style={[styles.workspaceName, { color: colors.textPrimary }]}>
          {item.name}
        </Text>
        <Text style={[styles.workspaceMeta, { color: colors.textSecondary }]}>
          {item._count?.members || 0} member{(item._count?.members || 0) !== 1 ? 's' : ''}
        </Text>
      </View>
      <View style={styles.workspaceRight}>
        {item.unreadCount > 0 && (
          <View style={[styles.unreadBadge, { backgroundColor: wsTheme.primary }]}>
            <Text style={styles.unreadBadgeText}>
              {item.unreadCount > 99 ? '99+' : item.unreadCount}
            </Text>
          </View>
        )}
        <Text style={[styles.chevron, { color: colors.textSecondary }]}>{'\u203a'}</Text>
      </View>
    </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={[styles.emptyContainer, { backgroundColor: colors.bgSecondary }]}>
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
        No workspaces yet
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
        Create a new workspace for your band or join one with an invite code.
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.sidebar }]}>
        <View>
          <Text style={styles.headerTitle} accessibilityRole="header">BandChat</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {user?.displayName}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: logout },
            ]);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={[styles.signOut, { color: colors.textSecondary }]}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.bgTertiary }]}
          onPress={() => setShowJoin(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Join workspace"
        >
          <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Join Workspace</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate('OnboardingWizard')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Create workspace"
        >
          <Text style={styles.actionButtonTextWhite}>Create Workspace</Text>
        </TouchableOpacity>
      </View>

      {/* Workspace List */}
      <FlatList
        data={workspaces}
        keyExtractor={(item) => item.id}
        renderItem={renderWorkspace}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={workspaces.length === 0 ? styles.emptyList : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />

      {/* Version */}
      <Text style={[styles.versionText, { color: colors.textSecondary }]}>
        v{Constants.expoConfig?.version || '1.0.0'}
      </Text>

      </KeyboardAvoidingView>

      {/* Join Workspace Modal */}
      <Modal visible={showJoin} transparent animationType="fade" onRequestClose={() => setShowJoin(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]} accessibilityRole="header">Join a Workspace</Text>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Invite Code</Text>
            <TextInput
              style={[styles.modalInput, styles.codeInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="ABC123"
              placeholderTextColor={colors.textSecondary}
              value={inviteCode}
              onChangeText={(text) => setInviteCode(text.toUpperCase())}
              autoCapitalize="characters"
              maxLength={8}
              autoFocus
              editable={!submitting}
              accessibilityLabel="Invite code"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => { setShowJoin(false); setInviteCode(''); }}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Cancel joining workspace"
              >
                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleJoinWorkspace}
                disabled={submitting || !inviteCode.trim()}
                accessibilityRole="button"
                accessibilityLabel="Join workspace"
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextWhite}>Join</Text>
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
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  signOut: {
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonTextWhite: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  listContent: {
    padding: 20,
    gap: 10,
  },
  emptyList: {
    flexGrow: 1,
    padding: 20,
  },
  workspaceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 10,
  },
  workspaceAvatar: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  workspaceAvatarText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  workspaceInfo: {
    flex: 1,
  },
  workspaceName: {
    fontSize: 16,
    fontWeight: '600',
  },
  workspaceMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  workspaceRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 24,
    fontWeight: '300',
  },
  emptyContainer: {
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 12,
    padding: 24,
    maxWidth: 500,
    width: '100%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  codeInput: {
    fontFamily: Platform?.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 18,
    letterSpacing: 4,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalButtonTextWhite: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  versionText: {
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 8,
    opacity: 0.6,
  },
});
