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
  Alert,
  Image,
} from 'react-native';
import { mediumImpact, successNotification, errorNotification } from '../../utils/haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import { getLocalChannels, upsertChannels, upsertMembers } from '../../services/database';
import ChannelItem from '../../components/ChannelItem';
import ErrorState from '../../components/ErrorState';
import WorkspaceSwitcher from '../../components/WorkspaceSwitcher';
import { useLayout } from '../../hooks/useLayout';
import { mediumImpact } from '../../utils/haptics';

const BAND_CATEGORIES = [
  {
    key: 'band-music', label: 'Music', icon: 'musical-notes-outline',
    items: [
      { id: 'band-songs', key: 'songs', label: 'Songs', icon: 'musical-notes-outline' },
      { id: 'band-setlists', key: 'setlists', label: 'Setlists', icon: 'list-outline' },
      { id: 'band-medleys', key: 'medleys', label: 'Medleys', icon: 'layers-outline' },
      { id: 'band-recordings', key: 'recordings', label: 'Recordings', icon: 'mic-outline' },
      { id: 'band-practice', key: 'practice', label: 'Practice', icon: 'stopwatch-outline' },
      { id: 'band-intelligence', key: 'intelligence', label: 'Song Intelligence', icon: 'bulb-outline' },
    ],
  },
  {
    key: 'band-gigs', label: 'Gigs', icon: 'calendar-outline',
    items: [
      { id: 'band-calendar', key: 'calendar', label: 'Calendar', icon: 'calendar-outline' },
      { id: 'band-stats', key: 'stats', label: 'Stats', icon: 'stats-chart-outline' },
      { id: 'band-stage-plots', key: 'stageplots', label: 'Stage Plots', icon: 'map-outline' },
      { id: 'band-venues', key: 'venues', label: 'Venues', icon: 'location-outline' },
    ],
  },
  {
    key: 'band-people', label: 'People', icon: 'people-outline',
    items: [
      { id: 'band-members', key: 'members', label: 'Members', icon: 'people-outline' },
      { id: 'band-contacts', key: 'contacts', label: 'Contacts', icon: 'book-outline' },
      { id: 'band-achievements', key: 'achievements', label: 'Achievements', icon: 'trophy-outline' },
      { id: 'band-timeline', key: 'timeline', label: 'Timeline', icon: 'time-outline' },
    ],
  },
  {
    key: 'band-community', label: 'Community', icon: 'megaphone-outline',
    items: [
      { id: 'band-announcements', key: 'announcements', label: 'Announcements', icon: 'megaphone-outline' },
      { id: 'band-polls', key: 'polls', label: 'Polls', icon: 'checkbox-outline' },
      { id: 'band-kitty', key: 'kitty', label: 'Band Kitty', icon: 'wallet-outline' },
    ],
  },
];

export default function ChannelListScreen({ navigation, route }) {
  const { id: workspaceId, name: workspaceName } = route.params;
  const { user } = useAuth();
  const { colors, setActiveWorkspaceId } = useTheme();
  const { socket, joinWorkspace } = useSocket();
  const { isTablet, contentMaxWidth } = useLayout();

  const [workspace, setWorkspace] = useState(null);
  const [channels, setChannels] = useState([]);
  const [channelGroups, setChannelGroups] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [collapsedBand, setCollapsedBand] = useState(false);
  const [collapsedBandCats, setCollapsedBandCats] = useState({});
  const [collapsedDMs, setCollapsedDMs] = useState(false);
  const [collapsedQuickLinks, setCollapsedQuickLinks] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [nextGig, setNextGig] = useState(null);
  const [allWorkspaces, setAllWorkspaces] = useState([]);
  const [showWorkspaceSwitcher, setShowWorkspaceSwitcher] = useState(false);

  // Channel group management (admin)
  const [showGroupActions, setShowGroupActions] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState(null);
  const [savingGroup, setSavingGroup] = useState(false);

  // Load persisted collapse state
  useEffect(() => {
    const load = async () => {
      try {
        const [savedGroups, savedBand, savedBandCats, savedDMs, savedQuickLinks, savedStarred] = await Promise.all([
          AsyncStorage.getItem(`collapsedGroups:${workspaceId}`),
          AsyncStorage.getItem(`collapsedBand:${workspaceId}`),
          AsyncStorage.getItem(`collapsedBandCats:${workspaceId}`),
          AsyncStorage.getItem(`collapsedDMs:${workspaceId}`),
          AsyncStorage.getItem(`collapsedQuickLinks:${workspaceId}`),
          AsyncStorage.getItem(`collapsedStarred:${workspaceId}`),
        ]);
        if (savedGroups) setCollapsedGroups(JSON.parse(savedGroups));
        if (savedBand) setCollapsedBand(JSON.parse(savedBand));
        if (savedBandCats) setCollapsedBandCats(JSON.parse(savedBandCats));
        if (savedDMs) setCollapsedDMs(JSON.parse(savedDMs));
        if (savedQuickLinks) setCollapsedQuickLinks(JSON.parse(savedQuickLinks));
        if (savedStarred) setCollapsedStarred(JSON.parse(savedStarred));
      } catch (e) {
        console.error('Failed to load collapsed section state:', e);
      }
    };
    load();
  }, [workspaceId]);

  // Fetch all workspaces for workspace switcher
  useEffect(() => {
    api.getWorkspaces().then(setAllWorkspaces).catch(console.error);
  }, []);

  // Persist collapse state on change
  useEffect(() => {
    AsyncStorage.setItem(`collapsedGroups:${workspaceId}`, JSON.stringify(collapsedGroups)).catch(() => {});
  }, [collapsedGroups, workspaceId]);
  useEffect(() => {
    AsyncStorage.setItem(`collapsedBand:${workspaceId}`, JSON.stringify(collapsedBand)).catch(() => {});
  }, [collapsedBand, workspaceId]);
  useEffect(() => {
    AsyncStorage.setItem(`collapsedBandCats:${workspaceId}`, JSON.stringify(collapsedBandCats)).catch(() => {});
  }, [collapsedBandCats, workspaceId]);
  useEffect(() => {
    AsyncStorage.setItem(`collapsedDMs:${workspaceId}`, JSON.stringify(collapsedDMs)).catch(() => {});
  }, [collapsedDMs, workspaceId]);
  useEffect(() => {
    AsyncStorage.setItem(`collapsedQuickLinks:${workspaceId}`, JSON.stringify(collapsedQuickLinks)).catch(() => {});
  }, [collapsedQuickLinks, workspaceId]);
  useEffect(() => {
    AsyncStorage.setItem(`collapsedStarred:${workspaceId}`, JSON.stringify(collapsedStarred)).catch(() => {});
  }, [collapsedStarred, workspaceId]);

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

  const [showChannelActions, setShowChannelActions] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [collapsedStarred, setCollapsedStarred] = useState(false);


  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <TouchableOpacity
          onPress={() => {
            mediumImpact();
            setShowWorkspaceSwitcher(true);
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Switch workspace"
          accessibilityRole="button"
        >
          <View style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {workspace?.avatarUrl ? (
              <Image source={{ uri: workspace.avatarUrl }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                {workspaceName?.charAt(0).toUpperCase() || '?'}
              </Text>
            )}
          </View>
          <Text style={{ color: colors.textPrimary, fontWeight: '600', fontSize: 17 }} numberOfLines={1}>
            {workspaceName}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      ),
      headerLeft: () => null,
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Search', { workspaceId })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="search-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings', { workspaceId })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="settings-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, workspaceId, workspaceName, workspace?.avatarUrl, colors]);

  // Pre-load channels from SQLite for instant display
  useEffect(() => {
    getLocalChannels(workspaceId).then(cached => {
      if (cached.length > 0) {
        setChannels(cached.filter(c => !c.isDirect && !c.isDM));
        setDirectMessages(cached.filter(c => c.isDirect || c.isDM));
        setLoading(false);
      }
    }).catch(() => {});
  }, [workspaceId]);

  // Set active workspace for per-band theme
  useEffect(() => {
    setActiveWorkspaceId(workspaceId);
  }, [workspaceId, setActiveWorkspaceId]);

  // Clear when leaving workspace entirely
  useEffect(() => {
    return () => setActiveWorkspaceId(null);
  }, [setActiveWorkspaceId]);

  const loadData = useCallback(async () => {
    try {
      const [ws, ch, groups, dms, gig] = await Promise.all([
        api.getWorkspace(workspaceId),
        api.getChannels(workspaceId),
        api.getChannelGroups(workspaceId),
        api.getDMs(workspaceId),
        api.getNextGig(workspaceId).catch(() => null),
      ]);
      setWorkspace(ws);
      setChannels(ch);
      setChannelGroups(groups);
      setDirectMessages(dms);
      setNextGig(gig);
      // Check admin status
      const membership = ws.members?.find(m => m.userId === user?.id);
      setIsAdmin(membership?.role === 'ADMIN');
      // Persist to SQLite for offline access
      upsertChannels([...ch, ...dms], workspaceId).catch(() => {});
      if (ws.members) upsertMembers(ws.members, workspaceId).catch(() => {});
      setLoadError(null);
    } catch (err) {
      if (channels.length === 0) setLoadError('Could not load channels');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId, user?.id]);

  useEffect(() => {
    loadData();
    joinWorkspace(workspaceId);
    // Persist last workspace for quick actions
    AsyncStorage.setItem('lastWorkspaceId', workspaceId);
    if (workspaceName) AsyncStorage.setItem('lastWorkspaceName', workspaceName);
  }, [loadData, joinWorkspace, workspaceId, workspaceName]);

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

    const handlePlanUpdated = (data) => {
      setWorkspace(prev => prev ? { ...prev, effectivePlan: data.effectivePlan, plan: data.plan, planLimits: data.planLimits } : prev);
    };

    socket.on('channel:created', handleChannelCreated);
    socket.on('channel:deleted', handleChannelDeleted);
    socket.on('dm:created', handleDMCreated);
    socket.on('member:joined', handleMemberJoined);
    socket.on('member:removed', handleMemberRemoved);
    socket.on('message:new', handleNewMessage);
    socket.on('message:reply', handleReplyMessage);
    socket.on('connect', handleReconnect);
    socket.on('plan:updated', handlePlanUpdated);

    return () => {
      socket.off('channel:created', handleChannelCreated);
      socket.off('channel:deleted', handleChannelDeleted);
      socket.off('dm:created', handleDMCreated);
      socket.off('member:joined', handleMemberJoined);
      socket.off('member:removed', handleMemberRemoved);
      socket.off('message:new', handleNewMessage);
      socket.off('message:reply', handleReplyMessage);
      socket.off('connect', handleReconnect);
      socket.off('plan:updated', handlePlanUpdated);
    };
  }, [socket, workspaceId, user?.id, loadData, joinWorkspace, navigation]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const getDMDisplayName = useCallback((dm) => {
    // Server sends otherMembers (mapped user objects) and members (raw ChannelMember with nested user)
    if (dm.otherMembers?.length > 0) {
      return dm.otherMembers.map(m => m.displayName || 'Unknown').join(', ');
    }
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
      Alert.alert('Error', err.message || 'Failed to create channel');
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
      Alert.alert('Error', err.message || 'Failed to load members');
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
      Alert.alert('Error', err.message || 'Failed to create conversation');
    } finally {
      setCreating(false);
    }
  }, [selectedMemberIds, workspaceId, handleChannelPress]);

  const toggleMember = useCallback((userId) => {
    setSelectedMemberIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  }, []);

  // Channel Group CRUD handlers
  const handleCreateGroup = useCallback(async () => {
    const name = groupName.trim();
    if (!name) return;
    setSavingGroup(true);
    try {
      await api.createChannelGroup(workspaceId, name);
      successNotification();
      setShowGroupModal(false);
      setGroupName('');
      loadData();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create section');
    } finally {
      setSavingGroup(false);
    }
  }, [groupName, workspaceId, loadData]);

  const handleRenameGroup = useCallback(async () => {
    const name = groupName.trim();
    if (!name || !editingGroup) return;
    setSavingGroup(true);
    try {
      await api.updateChannelGroup(editingGroup.id, { name });
      successNotification();
      setShowGroupModal(false);
      setGroupName('');
      setEditingGroup(null);
      loadData();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to rename section');
    } finally {
      setSavingGroup(false);
    }
  }, [groupName, editingGroup, loadData]);

  const handleDeleteGroup = useCallback(async () => {
    if (!selectedGroup) return;
    errorNotification();
    Alert.alert(
      'Delete Section',
      `Delete "${selectedGroup.name}"? Channels in this section will become ungrouped.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteChannelGroup(selectedGroup.id);
              successNotification();
              loadData();
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to delete section');
            }
            setShowGroupActions(false);
            setSelectedGroup(null);
          },
        },
      ]
    );
  }, [selectedGroup, loadData]);

  const openGroupRenameModal = useCallback(() => {
    if (!selectedGroup) return;
    setEditingGroup(selectedGroup);
    setGroupName(selectedGroup.name);
    setShowGroupActions(false);
    setShowGroupModal(true);
  }, [selectedGroup]);

  const openNewGroupModal = useCallback(() => {
    setEditingGroup(null);
    setGroupName('');
    setShowGroupModal(true);
  }, []);

  // Channel long-press → show action sheet
  const handleChannelLongPress = useCallback((channel) => {
    mediumImpact();
    setSelectedChannel(channel);
    setShowChannelActions(true);
  }, []);

  // Star/unstar channel
  const handleToggleStar = useCallback(async () => {
    if (!selectedChannel) return;
    const newStarred = !selectedChannel.starred;
    try {
      await api.starChannel(selectedChannel.id, newStarred);
      setChannels(prev => prev.map(c => c.id === selectedChannel.id ? { ...c, starred: newStarred } : c));
      successNotification();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update star');
    }
    setShowChannelActions(false);
    setSelectedChannel(null);
  }, [selectedChannel]);

  const PRO_ONLY_FEATURES = ['kitty', 'stats', 'intelligence', 'practice', 'timeline', 'achievements'];

  const handleBandItemPress = useCallback((key) => {
    // Gate pro-only features
    if (PRO_ONLY_FEATURES.includes(key) && workspace?.effectivePlan !== 'PRO') {
      navigation.navigate('Upgrade', { workspaceId });
      return;
    }

    const screenMap = {
      songs: 'SongList',
      setlists: 'SetlistList',
      calendar: 'GigList',
      stats: 'Stats',
      members: 'BandMembers',
      contacts: 'Contacts',
      announcements: 'Announcements',
      polls: 'Polls',
      medleys: 'MedleyList',
      recordings: 'RecordingList',
      timeline: 'Timeline',
      achievements: 'Achievements',
      kitty: 'Kitty',
      intelligence: 'SongIntelligence',
      practice: 'PracticeDashboard',
      stageplots: 'StagePlotList',
      venues: 'Venues',
    };
    const params = { workspaceId };
    if (key === 'songs') params.workspaceName = workspace?.name;
    navigation.navigate(screenMap[key], params);
  }, [navigation, workspaceId, workspace?.effectivePlan, workspace?.name]);

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

    // Always show "Channels" section with create button (even if all channels are in groups)
    channelSections.unshift({
      title: 'Channels',
      showCreate: true,
      data: ungrouped.map(c => ({ ...c, _type: 'channel' })),
    });

    const dmSection = {
      title: 'Direct Messages',
      showNewDM: true,
      isDM: true,
      data: collapsedDMs ? [] : directMessages.map(dm => ({ ...dm, _type: 'dm' })),
    };

    // Build band items: category headers + their items (if not collapsed)
    const bandData = [];
    if (!collapsedBand) {
      for (const cat of BAND_CATEGORIES) {
        bandData.push({ id: cat.key, _type: 'band-category', label: cat.label, icon: cat.icon, catKey: cat.key });
        if (!collapsedBandCats[cat.key]) {
          for (const item of cat.items) {
            bandData.push({ ...item, _type: 'band' });
          }
        }
      }
    }

    const bandSection = {
      title: 'Band',
      isBand: true,
      data: bandData,
    };

    // Unread section — DMs first, then channels
    const unreadDMs = directMessages.filter(dm => (dm.unreadCount || 0) > 0).map(dm => ({ ...dm, _type: 'dm' }));
    const unreadChannels = channels.filter(c => !c.starred && !c.muted && (c.unreadCount || 0) > 0).map(c => ({ ...c, _type: 'channel' }));
    const unreadItems = [...unreadDMs, ...unreadChannels];
    const unreadSection = unreadItems.length > 0 ? [{
      title: 'Unread',
      isUnread: true,
      data: unreadItems,
    }] : [];

    // Starred channels section
    const starredChannels = channels.filter(c => c.starred);
    const starredSection = starredChannels.length > 0 ? [{
      title: 'Starred',
      isStarred: true,
      data: collapsedStarred ? [] : starredChannels.map(c => ({ ...c, _type: 'channel' })),
    }] : [];

    return [...unreadSection, ...starredSection, ...channelSections, dmSection, bandSection];
  }, [channels, channelGroups, directMessages, collapsedGroups, collapsedBand, collapsedBandCats, collapsedDMs, collapsedStarred]);

  const toggleBandCat = useCallback((catKey) => {
    setCollapsedBandCats(prev => ({ ...prev, [catKey]: !prev[catKey] }));
  }, []);

  const renderItem = useCallback(({ item }) => {
    if (item._type === 'band-category') {
      const isCollapsed = collapsedBandCats[item.catKey];
      return (
        <TouchableOpacity
          style={styles.bandCategoryHeader}
          onPress={() => toggleBandCat(item.catKey)}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={`${item.label}, ${isCollapsed ? 'collapsed' : 'expanded'}`}
          accessibilityHint="Open section"
        >
          <Ionicons name={item.icon} size={18} color={colors.channelListText} style={styles.bandCategoryIcon} />
          <Text style={[styles.bandCategoryLabel, { color: colors.channelListText }]}>{item.label}</Text>
          <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={14} color={colors.channelListText} style={styles.bandCategoryArrow} />
        </TouchableOpacity>
      );
    }
    if (item._type === 'band') {
      return (
        <TouchableOpacity
          style={styles.bandItem}
          onPress={() => handleBandItemPress(item.key)}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityHint="Open section"
        >
          <Ionicons name={item.icon} size={16} color={colors.channelListTextBold} style={styles.bandItemIcon} />
          <Text style={[styles.bandItemLabel, { color: colors.channelListTextBold }]}>{item.label}</Text>
          {PRO_ONLY_FEATURES.includes(item.key) && workspace?.effectivePlan !== 'PRO' && (
            <Text style={[styles.bandItemArrow, { color: colors.channelListText, marginRight: 4 }]}>PRO</Text>
          )}
          <Text style={[styles.bandItemArrow, { color: colors.channelListText }]}>{'\u203A'}</Text>
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
        onLongPress={!isDM ? handleChannelLongPress : undefined}
        unreadCount={item.unreadCount || 0}
      />
    );
  }, [getDMDisplayName, handleChannelPress, handleChannelLongPress, handleBandItemPress, colors, collapsedBandCats, toggleBandCat]);

  const renderSectionHeader = useCallback(({ section }) => {
    const isCollapsible = section.isGroup || section.isBand || section.isDM || section.isStarred;
    const isCollapsed = section.isGroup ? collapsedGroups[section.groupId] : section.isBand ? collapsedBand : section.isDM ? collapsedDMs : section.isStarred ? collapsedStarred : false;
    const handlePress = section.isGroup
      ? () => toggleGroup(section.groupId)
      : section.isBand
        ? () => setCollapsedBand(prev => !prev)
        : section.isDM
          ? () => setCollapsedDMs(prev => !prev)
          : section.isStarred
            ? () => setCollapsedStarred(prev => !prev)
            : undefined;
    const handleLongPress = section.isGroup && isAdmin
      ? () => {
          mediumImpact();
          setSelectedGroup({ id: section.groupId, name: section.title });
          setShowGroupActions(true);
        }
      : undefined;
    return (
      <View style={styles.sectionHeaderRow}>
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={400}
          activeOpacity={isCollapsible ? 0.6 : 1}
          disabled={!isCollapsible}
        >
          {isCollapsible && (
            <Text style={[styles.collapseIcon, { color: colors.channelListText }]}>
              {isCollapsed ? '\u25B6' : '\u25BC'}
            </Text>
          )}
          <Text style={[styles.sectionTitle, { color: colors.channelListText }]} accessibilityRole="header">
            {section.title}
          </Text>
        </TouchableOpacity>
        {section.showCreate && (
          <View style={styles.headerButtons}>
            {isAdmin && (
              <TouchableOpacity
                style={styles.addButton}
                onPress={openNewGroupModal}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Create section"
              >
                <Text style={[styles.addIcon, { color: colors.channelListText }]}>{'\uD83D\uDCC1'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowCreateChannel(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.addIcon, { color: colors.channelListText }]}>+</Text>
            </TouchableOpacity>
          </View>
        )}
        {section.showNewDM && !isCollapsed && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={openNewDM}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.addIcon, { color: colors.channelListText }]}>+</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [collapsedGroups, collapsedBand, collapsedDMs, collapsedStarred, toggleGroup, colors, openNewDM, isAdmin, openNewGroupModal]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.channelListBg }]} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError && channels.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.channelListBg }]} edges={['bottom']}>
        <ErrorState iconName="chatbubbles-outline" title="Couldn't load channels" message={loadError} onRetry={loadData} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.channelListBg }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      {/* Collapsible: Next upcoming event banner + Calendar + Saved Messages */}
      <View style={[styles.stickyHeader, { backgroundColor: colors.channelListBg, borderBottomColor: colors.border }, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
        <TouchableOpacity
          style={styles.quickLinksToggle}
          onPress={() => setCollapsedQuickLinks(prev => !prev)}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={`Quick links, ${collapsedQuickLinks ? 'collapsed' : 'expanded'}`}
        >
          <Text style={[styles.collapseIcon, { color: colors.channelListText }]}>
            {collapsedQuickLinks ? '\u25B6' : '\u25BC'}
          </Text>
          <Text style={[styles.sectionTitle, { color: colors.channelListText }]}>Quick Links</Text>
        </TouchableOpacity>
        {!collapsedQuickLinks && (
          <>
            {nextGig && (
              <TouchableOpacity
                style={[
                  styles.nextGigBanner,
                  {
                    backgroundColor: nextGig.type === 'GIG' ? 'rgba(34,197,94,0.15)' : nextGig.type === 'REHEARSAL' ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)',
                    borderColor: nextGig.type === 'GIG' ? 'rgba(34,197,94,0.3)' : nextGig.type === 'REHEARSAL' ? 'rgba(59,130,246,0.3)' : 'rgba(168,85,247,0.3)',
                  },
                ]}
                onPress={() => navigation.navigate('GigDetail', { workspaceId, gigId: nextGig.id })}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Next event: ${nextGig.title}`}
              >
                <View style={styles.nextGigRow}>
                  <Ionicons
                    name={nextGig.type === 'GIG' ? 'musical-notes' : nextGig.type === 'REHEARSAL' ? 'musical-notes' : 'calendar'}
                    size={14}
                    color={nextGig.type === 'GIG' ? '#22c55e' : nextGig.type === 'REHEARSAL' ? '#3b82f6' : '#a855f7'}
                  />
                  <Text style={[styles.nextGigTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {nextGig.title}
                  </Text>
                </View>
                <View style={styles.nextGigRow}>
                  <Text style={[styles.nextGigMeta, { color: colors.textSecondary }]}>
                    {new Date(nextGig.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    {(() => {
                      const gigDate = new Date(nextGig.date);
                      const displayTime = nextGig.performanceStartTime || nextGig.eventStartTime ||
                        (gigDate.getHours() !== 0 || gigDate.getMinutes() !== 0
                          ? gigDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                          : null);
                      return displayTime ? ` · ${displayTime}` : '';
                    })()}
                    {nextGig.venue ? ` · ${nextGig.venue}` : ''}
                  </Text>
                </View>
                {nextGig.notes ? (
                  <Text style={[styles.nextGigNotes, { color: colors.textSecondary }]} numberOfLines={1}>
                    {nextGig.notes}
                  </Text>
                ) : null}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.calendarShortcut}
              onPress={() => navigation.navigate('GigList', { workspaceId })}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Calendar"
            >
              <Ionicons name="calendar-outline" size={16} color={colors.channelListTextBold} />
              <Text style={[styles.calendarShortcutLabel, { color: colors.channelListTextBold }]}>Calendar</Text>
              <Text style={[styles.bandItemArrow, { color: colors.channelListText }]}>{'\u203A'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.calendarShortcut}
              onPress={() => navigation.navigate('SavedMessages', { workspaceId })}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Saved Messages"
            >
              <Ionicons name="bookmark-outline" size={16} color={colors.channelListTextBold} />
              <Text style={[styles.calendarShortcutLabel, { color: colors.channelListTextBold }]}>Saved Messages</Text>
              <Text style={[styles.bandItemArrow, { color: colors.channelListText }]}>{'\u203A'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.calendarShortcut}
              onPress={() => navigation.navigate('MessagesTimeline', { workspaceId })}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="All Messages"
            >
              <Ionicons name="chatbubbles-outline" size={16} color={colors.channelListTextBold} />
              <Text style={[styles.calendarShortcutLabel, { color: colors.channelListTextBold }]}>All Messages</Text>
              <Text style={[styles.bandItemArrow, { color: colors.channelListText }]}>{'\u203A'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.calendarShortcut}
              onPress={() => navigation.navigate('Activity', { workspaceId })}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Activity"
            >
              <Ionicons name="notifications-outline" size={16} color={colors.channelListTextBold} />
              <Text style={[styles.calendarShortcutLabel, { color: colors.channelListTextBold }]}>Activity</Text>
              <Text style={[styles.bandItemArrow, { color: colors.channelListText }]}>{'\u203A'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[styles.listContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
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
      <Modal visible={showCreateChannel} transparent animationType="fade" onRequestClose={() => setShowCreateChannel(false)}>
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
      <Modal visible={showNewDM} transparent animationType="fade" onRequestClose={() => setShowNewDM(false)}>
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

      {/* Channel Actions Modal (Star/Unstar) */}
      <Modal visible={showChannelActions} transparent animationType="fade" onRequestClose={() => setShowChannelActions(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowChannelActions(false)}
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.actionSheetTitle, { color: colors.textPrimary }]}>
              #{selectedChannel?.name}
            </Text>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={handleToggleStar}
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>
                {selectedChannel?.starred ? 'Unstar Channel' : 'Star Channel'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.cancelAction, { borderTopColor: colors.border }]}
              onPress={() => setShowChannelActions(false)}
            >
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Group Actions Modal (Rename/Delete) */}
      <Modal visible={showGroupActions} transparent animationType="fade" onRequestClose={() => setShowGroupActions(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowGroupActions(false)}
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.actionSheetTitle, { color: colors.textPrimary }]}>
              {selectedGroup?.name}
            </Text>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={openGroupRenameModal}
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Rename Section</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={handleDeleteGroup}
            >
              <Text style={[styles.actionText, { color: '#ef4444' }]}>Delete Section</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.cancelAction, { borderTopColor: colors.border }]}
              onPress={() => setShowGroupActions(false)}
            >
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Group Create/Edit Modal */}
      <Modal visible={showGroupModal} transparent animationType="fade" onRequestClose={() => setShowGroupModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {editingGroup ? 'Rename Section' : 'New Section'}
            </Text>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Section Name</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="e.g., Projects"
              placeholderTextColor={colors.textSecondary}
              value={groupName}
              onChangeText={setGroupName}
              autoFocus
              autoCapitalize="words"
              editable={!savingGroup}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => { setShowGroupModal(false); setGroupName(''); setEditingGroup(null); }}
                disabled={savingGroup}
              >
                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={editingGroup ? handleRenameGroup : handleCreateGroup}
                disabled={savingGroup || !groupName.trim()}
              >
                {savingGroup ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextWhite}>{editingGroup ? 'Save' : 'Create'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Workspace Switcher */}
      <WorkspaceSwitcher
        visible={showWorkspaceSwitcher}
        currentWorkspace={workspace || { id: workspaceId, name: workspaceName }}
        workspaces={allWorkspaces}
        onSelect={(ws) => {
          setShowWorkspaceSwitcher(false);
          navigation.navigate('Workspace', { id: ws.id, name: ws.name });
        }}
        onManageAll={() => {
          setShowWorkspaceSwitcher(false);
          navigation.navigate('WorkspaceList', { showList: true });
        }}
        onClose={() => setShowWorkspaceSwitcher(false)}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabletContainer: {
    alignItems: 'center',
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
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Action sheet styles
  actionSheet: {
    borderRadius: 12,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  actionSheetTitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.3)',
  },
  actionItem: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionText: {
    fontSize: 17,
    fontWeight: '500',
  },
  cancelAction: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
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
  // Band categories
  bandCategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  bandCategoryIcon: {
    fontSize: 14,
    width: 24,
    textAlign: 'center',
  },
  bandCategoryLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  bandCategoryArrow: {
    fontSize: 10,
  },
  // Band items
  bandItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 28,
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
  stickyHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 4,
  },
  quickLinksToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  nextGigBanner: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  nextGigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nextGigIcon: {
    fontSize: 14,
  },
  nextGigTitle: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  nextGigMeta: {
    fontSize: 12,
    marginTop: 2,
    marginLeft: 20,
  },
  nextGigNotes: {
    fontSize: 11,
    marginTop: 3,
    marginLeft: 20,
    fontStyle: 'italic',
    opacity: 0.8,
  },
  calendarShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
  },
  calendarShortcutIcon: {
    fontSize: 16,
  },
  calendarShortcutLabel: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
});
