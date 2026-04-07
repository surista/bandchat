import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  Switch,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import { format } from 'date-fns';
import { useLayout } from '../../hooks/useLayout';

export default function ChannelSettingsScreen({ navigation, route }) {
  const { channel, workspaceId } = route.params;
  const { user } = useAuth()
  const { isTablet, contentMaxWidth } = useLayout();
  const { colors } = useTheme();

  const [channelData, setChannelData] = useState(channel);
  const [channelMembers, setChannelMembers] = useState([]);
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMuted, setIsMuted] = useState(channel.isMuted || false);
  const [loading, setLoading] = useState(true);

  // Edit name state
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(channel.name || '');
  const [saving, setSaving] = useState(false);

  // Add member modal
  const [showAddMember, setShowAddMember] = useState(false);

  // Ensure back button is always visible
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ marginRight: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [ch, ws] = await Promise.all([
          api.getChannel(channel.id),
          api.getWorkspace(workspaceId),
        ]);
        setChannelData(ch);
        setChannelMembers(ch.members || []);
        setIsMuted(ch.isMuted || false);
        setWorkspaceMembers(ws.members || []);
        const membership = ws.members?.find(m => m.userId === user?.id);
        setIsAdmin(membership?.role === 'ADMIN');
      } catch (err) {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [channel.id, workspaceId, user?.id]);

  const isGeneral = channelData.name === 'general';

  // Mute toggle
  const handleMuteToggle = useCallback(async () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    try {
      await api.muteChannel(channel.id, newMuted);
    } catch (err) {
      setIsMuted(!newMuted);
    }
  }, [isMuted, channel.id]);

  // Edit channel name
  const handleSaveName = useCallback(async () => {
    if (saving) return;
    const name = newName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name || name === channelData.name) {
      setEditingName(false);
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateChannel(channel.id, { name });
      setChannelData(updated);
      setNewName(updated.name);
      setEditingName(false);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update channel name');
    } finally {
      setSaving(false);
    }
  }, [saving, newName, channelData.name, channel.id]);

  // Leave channel
  const handleLeave = useCallback(() => {
    Alert.alert('Leave Channel', `Are you sure you want to leave #${channelData.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.removeChannelMember(channel.id, user.id);
            navigation.navigate('Workspace', { id: workspaceId });
          } catch (err) {
            Alert.alert('Error', err.message || 'Failed to leave channel');
          }
        },
      },
    ]);
  }, [channelData.name, channel.id, user?.id, navigation, workspaceId]);

  // Delete channel
  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Channel',
      `Are you sure you want to delete #${channelData.name}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteChannel(channel.id);
              navigation.navigate('Workspace', { id: workspaceId });
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to delete channel');
            }
          },
        },
      ]
    );
  }, [channelData.name, channel.id, navigation, workspaceId]);

  // Add member
  const handleAddMember = useCallback(async (userId) => {
    try {
      await api.addChannelMember(channel.id, userId);
      const ch = await api.getChannel(channel.id);
      setChannelMembers(ch.members || []);
      setShowAddMember(false);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to add member');
    }
  }, [channel.id]);

  // Remove member
  const handleRemoveMember = useCallback((userId, displayName) => {
    Alert.alert(
      'Remove Member',
      `Remove ${displayName} from #${channelData.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.removeChannelMember(channel.id, userId);
              setChannelMembers(prev => prev.filter(m => m.userId !== userId));
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to remove member');
            }
          },
        },
      ]
    );
  }, [channelData.name, channel.id]);

  // Members not in channel (for add member modal)
  const availableMembers = workspaceMembers.filter(
    wm => !channelMembers.some(cm => cm.userId === wm.userId)
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.content, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]} keyboardDismissMode="on-drag">
        {/* Channel Info Card */}
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          <View style={styles.channelIconRow}>
            <View style={[styles.channelIcon, { backgroundColor: colors.primary + '22' }]}>
              <Text style={styles.channelIconText}>
                {channelData.isPrivate ? <Ionicons name="lock-closed" size={22} color={colors.textPrimary} /> : '#'}
              </Text>
            </View>
            <View style={styles.channelInfoText}>
              {editingName ? (
                <View style={styles.editNameRow}>
                  <TextInput
                    style={[styles.editNameInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgTertiary }]}
                    value={newName}
                    onChangeText={setNewName}
                    autoFocus
                    autoCapitalize="none"
                    onSubmitEditing={handleSaveName}
                  />
                  <TouchableOpacity
                    style={[styles.editNameButton, { backgroundColor: colors.primary }]}
                    onPress={handleSaveName}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.editNameButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editNameButton, { backgroundColor: colors.bgTertiary }]}
                    onPress={() => { setEditingName(false); setNewName(channelData.name); }}
                  >
                    <Text style={[styles.editNameCancelText, { color: colors.textPrimary }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={[styles.channelName, { color: colors.textPrimary }]}>
                  {channelData.name}
                </Text>
              )}
              <Text style={[styles.channelType, { color: colors.textSecondary }]}>
                {channelData.isPrivate ? 'Private channel' : 'Public channel'}
              </Text>
              {channelData.createdAt && (
                <Text style={[styles.channelCreated, { color: colors.textSecondary }]}>
                  Created {format(new Date(channelData.createdAt), 'dd-MMM-yyyy')}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Actions Section */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>Actions</Text>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          {/* Mute toggle */}
          <View style={styles.actionRow}>
            <View style={styles.actionIcon}><Ionicons name="notifications-outline" size={18} color={colors.textPrimary} /></View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>Mute Channel</Text>
            <Switch
              value={isMuted}
              onValueChange={handleMuteToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#ffffff"
            />
          </View>

          {/* Edit name (admin only) */}
          {isAdmin && !isGeneral && (
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => setEditingName(true)}
              activeOpacity={0.6}
            >
              <View style={styles.actionIcon}><Ionicons name="pencil-outline" size={18} color={colors.textPrimary} /></View>
              <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>Edit Channel Name</Text>
              <Text style={[styles.actionArrow, { color: colors.textSecondary }]}>{'\u203A'}</Text>
            </TouchableOpacity>
          )}

          {/* Leave channel (not general) */}
          {!isGeneral && (
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleLeave}
              activeOpacity={0.6}
            >
              <View style={styles.actionIcon}><Ionicons name="exit-outline" size={18} color="#EF4444" /></View>
              <Text style={[styles.actionLabel, { color: '#EF4444' }]}>Leave Channel</Text>
            </TouchableOpacity>
          )}

          {/* Delete channel (admin, not general) */}
          {isAdmin && !isGeneral && (
            <TouchableOpacity
              style={[styles.actionRow, styles.lastRow]}
              onPress={handleDelete}
              activeOpacity={0.6}
            >
              <View style={styles.actionIcon}><Ionicons name="trash-outline" size={18} color="#EF4444" /></View>
              <Text style={[styles.actionLabel, { color: '#EF4444' }]}>Delete Channel</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Members Section */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
          Members ({channelMembers.length})
        </Text>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          {channelMembers.map((member, index) => {
            const displayName = member.user?.displayName || 'Unknown';
            const initial = displayName.charAt(0).toUpperCase();
            const isLast = index === channelMembers.length - 1 && !isAdmin;

            return (
              <View
                key={member.userId}
                style={[styles.memberRow, isLast && styles.lastRow]}
              >
                <View style={[styles.memberAvatar, { backgroundColor: colors.primary }]}>
                  <Text style={styles.memberAvatarText}>{initial}</Text>
                </View>
                <Text style={[styles.memberName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {displayName}
                </Text>
                {member.userId === user?.id && (
                  <Text style={[styles.youBadge, { color: colors.textSecondary }]}>you</Text>
                )}
                {isAdmin && member.userId !== user?.id && (
                  <TouchableOpacity
                    onPress={() => handleRemoveMember(member.userId, displayName)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.removeText, { color: '#EF4444' }]}>{'\u2715'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* Add Member button */}
          {isAdmin && (
            <TouchableOpacity
              style={[styles.addMemberRow, styles.lastRow]}
              onPress={() => setShowAddMember(true)}
              activeOpacity={0.6}
            >
              <View style={[styles.memberAvatar, { backgroundColor: colors.bgTertiary }]}>
                <Text style={[styles.addMemberIcon, { color: colors.primary }]}>+</Text>
              </View>
              <Text style={[styles.addMemberText, { color: colors.primary }]}>Add Member</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Add Member Modal */}
      <Modal visible={showAddMember} transparent animationType="fade" onRequestClose={() => setShowAddMember(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Add Member</Text>
            {availableMembers.length === 0 ? (
              <Text style={[styles.modalEmpty, { color: colors.textSecondary }]}>
                All workspace members are already in this channel.
              </Text>
            ) : (
              <FlatList
                data={availableMembers}
                keyExtractor={(item) => item.userId}
                style={styles.memberList}
                renderItem={({ item }) => {
                  const name = item.user?.displayName || 'Unknown';
                  return (
                    <TouchableOpacity
                      style={styles.modalMemberRow}
                      onPress={() => handleAddMember(item.userId)}
                      activeOpacity={0.6}
                    >
                      <View style={[styles.memberAvatar, { backgroundColor: colors.primary }]}>
                        <Text style={styles.memberAvatarText}>
                          {name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.memberName, { color: colors.textPrimary }]}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
            <TouchableOpacity
              style={[styles.modalCloseButton, { backgroundColor: colors.bgTertiary }]}
              onPress={() => setShowAddMember(false)}
            >
              <Text style={[styles.modalCloseText, { color: colors.textPrimary }]}>Close</Text>
            </TouchableOpacity>
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
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  channelIconRow: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  channelIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  channelIconText: {
    fontSize: 22,
    fontWeight: '700',
  },
  channelInfoText: {
    flex: 1,
  },
  channelName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  channelType: {
    fontSize: 13,
  },
  channelCreated: {
    fontSize: 12,
    marginTop: 2,
  },
  editNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  editNameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
  },
  editNameButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  editNameButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  editNameCancelText: {
    fontWeight: '600',
    fontSize: 14,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.15)',
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  actionIcon: {
    marginRight: 12,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 15,
    flex: 1,
  },
  actionArrow: {
    fontSize: 22,
    fontWeight: '300',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.15)',
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  memberAvatarText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  memberName: {
    fontSize: 15,
    flex: 1,
  },
  youBadge: {
    fontSize: 12,
    fontStyle: 'italic',
    marginLeft: 8,
  },
  removeText: {
    fontSize: 14,
    fontWeight: '600',
    padding: 4,
  },
  addMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addMemberIcon: {
    fontSize: 20,
    fontWeight: '600',
  },
  addMemberText: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 12,
    padding: 24,
    maxHeight: '70%',
    maxWidth: 500,
    width: '100%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  modalEmpty: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  memberList: {
    maxHeight: 300,
    marginBottom: 16,
  },
  modalMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  modalCloseButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
