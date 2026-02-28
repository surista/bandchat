import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import {
  View,
  Text,
  SectionList,
  FlatList,
  TextInput,
  Modal,
  AppState,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import ChannelItem from '../../components/ChannelItem';

const BAND_ITEMS = [
  { id: 'band-songs', key: 'songs', label: 'Songs', icon: '\uD83C\uDFB5', _type: 'band' },
  { id: 'band-setlists', key: 'setlists', label: 'Setlists', icon: '\uD83C\uDFB6', _type: 'band' },
  { id: 'band-calendar', key: 'calendar', label: 'Calendar', icon: '\uD83D\uDCC5', _type: 'band' },
  { id: 'band-stats', key: 'stats', label: 'Stats', icon: '\uD83D\uDCCA', _type: 'band' },
  { id: 'band-members', key: 'members', label: 'Members', icon: '\uD83D\uDC65', _type: 'band' },
  { id: 'band-availability', key: 'availability', label: 'Availability', icon: '\uD83D\uDDD3\uFE0F', _type: 'band' },
  { id: 'band-contacts', key: 'contacts', label: 'Contacts', icon: '\uD83D\uDCD2', _type: 'band' },
  { id: 'band-announcements', key: 'announcements', label: 'Announcements', icon: '\uD83D\uDCE2', _type: 'band' },
  { id: 'band-polls', key: 'polls', label: 'Polls', icon: '\uD83D\uDDF3\uFE0F', _type: 'band' },
  { id: 'band-medleys', key: 'medleys', label: 'Medleys', icon: '\uD83C\uDFB6', _type: 'band' },
  { id: 'band-recordings', key: 'recordings', label: 'Recordings', icon: '\uD83C\uDFA4', _type: 'band' },
  { id: 'band-timeline', key: 'timeline', label: 'Timeline', icon: '\uD83D\uDCDC', _type: 'band' },
  { id: 'band-achievements', key: 'achievements', label: 'Achievements', icon: '\uD83C\uDFC6', _type: 'band' },
  { id: 'band-kitty', key: 'kitty', label: 'Band Kitty', icon: '\uD83D\uDCB0', _type: 'band' },
  { id: 'band-intelligence', key: 'intelligence', label: 'Song Intelligence', icon: '\uD83E\uDDE0', _type: 'band' },
];

export default function ChannelListScreen({ navigation, route }) {
  const { id: workspaceId, name: workspaceName } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const { socket, joinWorkspace } = useSocket();

  const [workspace, setWorkspace] = useState(null);
  const [channels, setChannels] = useState([]);
  const [channelGroups, setChannelGroups] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  // Create channel modal
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [creating, setCreating] = useState(false);

  // New DM modal
  const [showNewDM, setShowNewDM] = useState(false);
  const [members, setMembers] = useState([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);

  const activeChannelRef = useRef(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Search', { workspaceId })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ fontSize: 20 }}>{'\uD83D\uDD0D'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings', { workspaceId })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ fontSize: 22 }}>{'\u2699\uFE0F'}</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, workspaceId]);

  const loadData = useCallback(async () => {
    try {
      const [ws, ch, groups, dms] = await Promise.all([
        api.getWorkspace(workspaceId),
        api.getChannels(workspaceId),
        api.getChannelGroups(workspaceId),
        api.getDMs(workspaceId),
      ]);
      setWorkspace(ws);
      setChannels(ch);
      setChannelGroups(groups);
      setDirectMessages(dms);
    } catch (err) {
      console.error('Failed to load workspace data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
    joinWorkspace(workspaceId);
  }, [loadData, joinWorkspace, workspaceId]);

  // Refresh data when app returns to foreground
  useEffect(() => {
    const lastRefresh = { current: Date.now() };
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && Date.now() - lastRefresh.current > 30000) {
        lastRefresh.current = Date.now();
        loadData();
      }
    });
    return () => subscription.remove();
  }, [loadData]);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const handleChannelCreated = (channel) => {
      if (channel.workspaceId === workspaceId) {
        setChannels(prev => {
          if (prev.some(c => c.id === channel.id)) return prev;
          return [...prev, channel];
        });
      }
    };

    const handleChannelDeleted = ({ channelId }) => {
      setChannels(prev => prev.filter(c => c.id !== channelId));
    };

    const handleDMCreated = (dm) => {
      setDirectMessages(prev => {
        if (prev.some(d => d.id === dm.id)) return prev;
        return [...prev, dm];
      });
    };

    const handleMemberJoined = ({ userId, workspaceId: wsId }) => {
      if (wsId === workspaceId) loadData();
    };

    const handleMemberRemoved = ({ userId: removedId, workspaceId: wsId }) => {
      if (wsId === workspaceId && removedId === user?.id) {
        navigation.goBack();
      }
    };

    const handleNewMessage = (message) => {
      if (message.author?.id === user?.id) return;
      if (message.channelId === activeChannelRef.current) return;

      setChannels(prev =>
        prev.map(c =>
          c.id === message.channelId ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c
        )
      );
      setDirectMessages(prev =>
        prev.map(dm =>
          dm.id === message.channelId ? { ...dm, unreadCount: (dm.unreadCount || 0) + 1 } : dm
        )
      );
    };

    const handleReplyMessage = ({ parentId, message: reply }) => {
      if (reply.author?.id === user?.id) return;
      if (reply.channelId === activeChannelRef.current) return;

      setChannels(prev =>
        prev.map(c =>
          c.id === reply.channelId ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c
        )
      );
      setDirectMessages(prev =>
        prev.map(dm =>
          dm.id === reply.channelId ? { ...dm, unreadCount: (dm.unreadCount || 0) + 1 } : dm
        )
      );
    };

    const handleReconnect = () => {
      joinWorkspace(workspaceId);
      loadData();
    };

    socket.on('channel:created', handleChannelCreated);
    socket.on('channel:deleted', handleChannelDeleted);
    socket.on('dm:created', handleDMCreated);
    socket.on('member:joined', handleMemberJoined);
    socket.on('member:removed', handleMemberRemoved);
    socket.on('message:new', handleNewMessage);
    socket.on('message:reply', handleReplyMessage);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('channel:created', handleChannelCreated);
      socket.off('channel:deleted', handleChannelDeleted);
      socket.off('dm:created', handleDMCreated);
      socket.off('member:joined', handleMemberJoined);
      socket.off('member:removed', handleMemberRemoved);
      socket.off('message:new', handleNewMessage);
      socket.off('message:reply', handleReplyMessage);
      socket.off('connect', handleReconnect);
    };
  }, [socket, workspaceId, user?.id, loadData, joinWorkspace, navigation]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const getDMDisplayName = useCallback((dm) => {
    if (!dm.members) return 'Direct Message';
    const otherMembers = dm.members.filter(m => m.userId !== user?.id);
    if (otherMembers.length === 0) {
      return dm.members[0]?.user?.displayName || 'You';
    }
    return otherMembers.map(m => m.user?.displayName || 'Unknown').join(', ');
  }, [user?.id]);

  const handleChannelPress = useCallback((channel, isDM) => {
    activeChannelRef.current = channel.id;
    if (isDM) {
      setDirectMessages(prev =>
        prev.map(dm => dm.id === channel.id ? { ...dm, unreadCount: 0 } : dm)
      );
    } else {
      setChannels(prev =>
        prev.map(c => c.id === channel.id ? { ...c, unreadCount: 0 } : c)
      );
    }
    const channelData = isDM
      ? { ...channel, displayName: getDMDisplayName(channel), isDM: true }
      : channel;
    navigation.navigate('Channel', { channel: channelData, workspaceId });
  }, [navigation, workspaceId, getDMDisplayName]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      activeChannelRef.current = null;
    });
    return unsubscribe;
  }, [navigation]);

  const toggleGroup = useCallback((groupId) => {
    setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  // Create channel
  const handleCreateChannel = useCallback(async () => {
    const name = newChannelName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) return;
    setCreating(true);
    try {
      const channel = await api.createChannel(workspaceId, { name, isPrivate: newChannelPrivate });
      setShowCreateChannel(false);
      setNewChannelName('');
      setNewChannelPrivate(false);
      handleChannelPress(channel, false);
    } catch (err) {
      console.error('Failed to create channel:', err);
    } finally {
      setCreating(false);
    }
  }, [newChannelName, newChannelPrivate, workspaceId, handleChannelPress]);

  // New DM
  const openNewDM = useCallback(async () => {
    setShowNewDM(true);
    setSelectedMemberIds([]);
    try {
      const ws = await api.getWorkspace(workspaceId);
      setMembers((ws.members || []).filter(m => m.userId !== user?.id));
    } catch (err) {
      console.error('Failed to load members:', err);
    }
  }, [workspaceId, user?.id]);

  const handleCreateDM = useCallback(async () => {
    if (selectedMemberIds.length === 0) return;
    setCreating(true);
    try {
      const dm = await api.createOrGetDM(workspaceId, selectedMemberIds);
      setShowNewDM(false);
      setSelectedMemberIds([]);
      handleChannelPress(dm, true);
    } catch (err) {
      console.error('Failed to create DM:', err);
    } finally {
      setCreating(false);
    }
  }, [selectedMemberIds, workspaceId, handleChannelPress]);

  const toggleMember = useCallback((userId) => {
    setSelectedMemberIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  }, []);

  const handleBandItemPress = useCallback((key) => {
    const screenMap = {
      songs: 'SongList',
      setlists: 'SetlistList',
      calendar: 'GigList',
      stats: 'Stats',
      members: 'BandMembers',
      availability: 'Availability',
      contacts: 'Contacts',
      announcements: 'Announcements',
      polls: 'Polls',
      medleys: 'MedleyList',
      recordings: 'RecordingList',
      timeline: 'Timeline',
      achievements: 'Achievements',
      kitty: 'Kitty',
      intelligence: 'SongIntelligence',
    };
    navigation.navigate(screenMap[key], { workspaceId });
  }, [navigation, workspaceId]);

  // Organize channels into groups
  const sections = useMemo(() => {
    const sortedGroups = [...channelGroups].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const channelSections = [];

    for (const group of sortedGroups) {
      const groupChannels = channels
        .filter(c => c.groupId === group.id)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (groupChannels.length > 0) {
        channelSections.push({
          title: group.name,
          groupId: group.id,
          isGroup: true,
          data: collapsedGroups[group.id] ? [] : groupChannels.map(c => ({ ...c, _type: 'channel' })),
        });
      }
    }

    const ungrouped = channels
      .filter(c => !c.groupId)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (ungrouped.length > 0 || channelSections.length === 0) {
      channelSections.unshift({
        title: 'Channels',
        showCreate: true,
        data: ungrouped.map(c => ({ ...c, _type: 'channel' })),
      });
    }

    const dmSection = {
      title: 'Direct Messages',
      showNewDM: true,
      data: directMessages.map(dm => ({ ...dm, _type: 'dm' })),
    };

    const bandSection = {
      title: 'Band',
      data: BAND_ITEMS,
    };

    return [...channelSections, dmSection, bandSection];
  }, [channels, channelGroups, directMessages, collapsedGroups]);

  const renderItem = useCallback(({ item }) => {
    if (item._type === 'band') {
      return (
        <TouchableOpacity
          style={styles.bandItem}
          onPress={() => handleBandItemPress(item.key)}
          activeOpacity={0.6}
        >
          <Text style={styles.bandItemIcon}>{item.icon}</Text>
          <Text style={[styles.bandItemLabel, { color: colors.textPrimary }]}>{item.label}</Text>
          <Text style={[styles.bandItemArrow, { color: colors.textSecondary }]}>{'\u203A'}</Text>
        </TouchableOpacity>
      );
    }
    const isDM = item._type === 'dm';
    return (
      <ChannelItem
        channel={item}
        isDM={isDM}
        dmMembers={isDM ? getDMDisplayName(item) : null}
        onPress={() => handleChannelPress(item, isDM)}
        unreadCount={item.unreadCount || 0}
      />
    );
  }, [getDMDisplayName, handleChannelPress, handleBandItemPress, colors]);

  const renderSectionHeader = useCallback(({ section }) => {
    const isCollapsed = section.isGroup && collapsedGroups[section.groupId];
    return (
      <View style={styles.sectionHeaderRow}>
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={section.isGroup ? () => toggleGroup(section.groupId) : undefined}
          activeOpacity={section.isGroup ? 0.6 : 1}
          disabled={!section.isGroup}
        >
          {section.isGroup && (
            <Text style={[styles.collapseIcon, { color: colors.textSecondary }]}>
              {isCollapsed ? '\u25B6' : '\u25BC'}
            </Text>
          )}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {section.title}
          </Text>
        </TouchableOpacity>
        {section.showCreate && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowCreateChannel(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.addIcon, { color: colors.textSecondary }]}>+</Text>
          </TouchableOpacity>
        )}
        {section.showNewDM && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={openNewDM}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.addIcon, { color: colors.textSecondary }]}>+</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [collapsedGroups, toggleGroup, colors, openNewDM]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
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

      {/* Create Channel Modal */}
      <Modal visible={showCreateChannel} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Create Channel</Text>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Channel Name</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="e.g., gig-planning"
              placeholderTextColor={colors.textSecondary}
              value={newChannelName}
              onChangeText={setNewChannelName}
              autoFocus
              autoCapitalize="none"
              editable={!creating}
            />
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setNewChannelPrivate(prev => !prev)}
              activeOpacity={0.6}
            >
              <View style={[styles.checkbox, { borderColor: colors.border }, newChannelPrivate && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                {newChannelPrivate && <Text style={styles.checkmark}>{'\u2713'}</Text>}
              </View>
              <Text style={[styles.checkboxLabel, { color: colors.textPrimary }]}>Private channel</Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => { setShowCreateChannel(false); setNewChannelName(''); }}
                disabled={creating}
              >
                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleCreateChannel}
                disabled={creating || !newChannelName.trim()}
              >
                {creating ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextWhite}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* New DM Modal */}
      <Modal visible={showNewDM} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>New Message</Text>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Select members</Text>
            <FlatList
              data={members}
              keyExtractor={(item) => item.userId}
              style={styles.memberList}
              renderItem={({ item }) => {
                const selected = selectedMemberIds.includes(item.userId);
                return (
                  <TouchableOpacity
                    style={[styles.memberRow, selected && { backgroundColor: colors.bgTertiary }]}
                    onPress={() => toggleMember(item.userId)}
                    activeOpacity={0.6}
                  >
                    <View style={[styles.memberAvatar, { backgroundColor: colors.primary }]}>
                      <Text style={styles.memberAvatarText}>
                        {(item.user?.displayName || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.memberName, { color: colors.textPrimary }]}>
                      {item.user?.displayName || 'Unknown'}
                    </Text>
                    {selected && (
                      <Text style={[styles.selectedCheck, { color: colors.primary }]}>{'\u2713'}</Text>
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <ActivityIndicator style={{ padding: 20 }} color={colors.primary} />
              }
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => { setShowNewDM(false); setSelectedMemberIds([]); }}
                disabled={creating}
              >
                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleCreateDM}
                disabled={creating || selectedMemberIds.length === 0}
              >
                {creating ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextWhite}>Start</Text>
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
  listContent: {
    paddingBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
  },
  collapseIcon: {
    fontSize: 10,
    marginRight: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addButton: {
    marginTop: 14,
  },
  addIcon: {
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 24,
  },
  // Modal styles
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
    marginBottom: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  checkboxLabel: {
    fontSize: 15,
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
  memberList: {
    maxHeight: 250,
    marginBottom: 16,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
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
  selectedCheck: {
    fontSize: 18,
    fontWeight: '700',
  },
  // Band items
  bandItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  bandItemIcon: {
    fontSize: 16,
    width: 28,
    textAlign: 'center',
  },
  bandItemLabel: {
    fontSize: 15,
    flex: 1,
  },
  bandItemArrow: {
    fontSize: 22,
    fontWeight: '300',
  },
});
