import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { mediumImpact } from '../../utils/haptics';
import getInitial from '../../utils/getInitial';
import api from '../../services/api';

export default function WorkspaceMembersScreen({ route, navigation }) {
  const { workspaceId } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();

  const [members, setMembers] = useState([]);
  const [blockedIds, setBlockedIds] = useState(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Action sheet
  const [selectedMember, setSelectedMember] = useState(null);
  const [showActions, setShowActions] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Remove confirmation
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [postAction, setPostAction] = useState('keep');

  useEffect(() => {
    api.getBlockedUsers().then(blocks => {
      setBlockedIds(new Set(blocks.map(b => b.blockedUserId)));
    }).catch(() => {});
  }, []);

  const loadMembers = useCallback(async () => {
    try {
      const ws = await api.getWorkspace(workspaceId);
      setMembers(ws.members || []);
      const me = (ws.members || []).find(m => m.userId === user?.id);
      setIsAdmin(me?.role === 'ADMIN');
    } catch (err) {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadMembers();
  }, [loadMembers]);

  const handleToggleRole = useCallback(async () => {
    if (!selectedMember) return;
    const newRole = selectedMember.role === 'ADMIN' ? 'MEMBER' : 'ADMIN';
    setUpdating(true);
    try {
      await api.updateMemberRole(workspaceId, selectedMember.userId, newRole);
      setShowActions(false);
      setSelectedMember(null);
      loadMembers();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update role');
    } finally {
      setUpdating(false);
    }
  }, [selectedMember, workspaceId, loadMembers]);

  const handleRemoveMember = useCallback(async () => {
    if (!selectedMember) return;
    setUpdating(true);
    try {
      await api.removeMember(workspaceId, selectedMember.userId, postAction);
      setShowRemoveConfirm(false);
      setShowActions(false);
      setSelectedMember(null);
      loadMembers();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to remove member');
    } finally {
      setUpdating(false);
    }
  }, [selectedMember, workspaceId, postAction, loadMembers]);

  const openRemoveConfirm = useCallback(() => {
    setPostAction('keep');
    setShowRemoveConfirm(true);
  }, []);

  const renderMember = useCallback(({ item }) => {
    const displayName = item.user?.displayName || 'Unknown';
    const email = item.user?.email || '';
    const isCurrentUser = item.userId === user?.id;
    return (
      <TouchableOpacity
        style={[styles.memberCard, { backgroundColor: colors.bgSecondary }]}
        onPress={() => navigation.navigate('MemberProfile', {
          workspaceId,
          userId: item.userId,
          displayName: item.user?.displayName,
        })}
        onLongPress={() => {
          if (!isCurrentUser && isAdmin) {
            mediumImpact();
            setSelectedMember(item);
            setShowActions(true);
          }
        }}
        delayLongPress={400}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{getInitial(displayName)}</Text>
        </View>
        <View style={styles.memberInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.memberName, { color: colors.textPrimary }]}>
              {displayName}
              {isCurrentUser ? ' (You)' : ''}
            </Text>
            <View style={[styles.roleBadge, {
              backgroundColor: item.role === 'ADMIN' ? colors.primary + '20' : colors.bgTertiary,
            }]}>
              <Text style={[styles.roleText, {
                color: item.role === 'ADMIN' ? colors.primary : colors.textSecondary,
              }]}>
                {item.role === 'ADMIN' ? 'Admin' : 'Member'}
              </Text>
            </View>
          </View>
          <Text style={[styles.memberEmail, { color: colors.textSecondary }]}>{email}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [colors, user?.id]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      <View style={[styles.countBar, { backgroundColor: colors.bgSecondary }]}>
        <Text style={[styles.countText, { color: colors.textSecondary }]}>
          {members.filter(m => !blockedIds.has(m.userId)).length} member{members.filter(m => !blockedIds.has(m.userId)).length !== 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={members.filter(m => !blockedIds.has(m.userId))}
        keyExtractor={(item) => item.userId}
        renderItem={renderMember}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />

      {/* Action Sheet */}
      <Modal visible={showActions} transparent animationType="slide" onRequestClose={() => { setShowActions(false); setSelectedMember(null); }}>
        <TouchableOpacity
          style={styles.actionOverlay}
          activeOpacity={1}
          onPress={() => { setShowActions(false); setSelectedMember(null); }}
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.actionHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {selectedMember?.user?.displayName || 'Member'}
            </Text>

            <TouchableOpacity
              style={styles.actionItem}
              onPress={handleToggleRole}
              disabled={updating}
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>
                {selectedMember?.role === 'ADMIN' ? 'Demote to Member' : 'Promote to Admin'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionItem}
              onPress={openRemoveConfirm}
              disabled={updating}
            >
              <Text style={[styles.actionText, { color: '#ef4444' }]}>Remove from Workspace</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionItem, styles.actionCancel]}
              onPress={() => { setShowActions(false); setSelectedMember(null); }}
            >
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Remove Confirmation Modal */}
      <Modal visible={showRemoveConfirm} transparent animationType="fade" onRequestClose={() => setShowRemoveConfirm(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Remove Member</Text>
            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              Remove {selectedMember?.user?.displayName || 'this member'} from the workspace?
            </Text>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>
              What should happen to their messages?
            </Text>
            {['keep', 'anonymize', 'delete'].map(action => (
              <TouchableOpacity
                key={action}
                style={[
                  styles.radioRow,
                  postAction === action && { backgroundColor: colors.bgTertiary },
                ]}
                onPress={() => setPostAction(action)}
                activeOpacity={0.6}
              >
                <View style={[styles.radio, { borderColor: colors.border }]}>
                  {postAction === action && <View style={[styles.radioFill, { backgroundColor: colors.primary }]} />}
                </View>
                <Text style={[styles.radioLabel, { color: colors.textPrimary }]}>
                  {action === 'keep' ? 'Keep messages' : action === 'anonymize' ? 'Anonymize messages' : 'Delete messages'}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => setShowRemoveConfirm(false)}
                disabled={updating}
              >
                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: '#ef4444' }]}
                onPress={handleRemoveMember}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextWhite}>Remove</Text>
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  countBar: { paddingHorizontal: 16, paddingVertical: 10 },
  countText: { fontSize: 14, fontWeight: '600' },
  listContent: { padding: 12, paddingBottom: 20 },
  // Member card
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  memberInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberName: { fontSize: 15, fontWeight: '600', flex: 1 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  roleText: { fontSize: 12, fontWeight: '600' },
  memberEmail: { fontSize: 13, marginTop: 2 },
  // Action sheet
  actionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 12,
  },
  actionHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  actionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  actionItem: { paddingVertical: 16, alignItems: 'center' },
  actionText: { fontSize: 17 },
  actionCancel: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: { borderRadius: 12, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  modalDesc: { fontSize: 15, marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: '500', marginBottom: 10 },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radioFill: { width: 10, height: 10, borderRadius: 5 },
  radioLabel: { fontSize: 15 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 15, fontWeight: '600' },
  modalButtonTextWhite: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
});
