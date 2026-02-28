import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
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

  const activeChannelRef = useRef(null);

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

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const handleChannelCreated = (channel) => {
      if (channel.workspaceId === workspaceId) {
        setChannels(prev => [...prev, channel]);
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
      if (wsId === workspaceId) {
        loadData();
      }
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
          c.id === message.channelId
            ? { ...c, unreadCount: (c.unreadCount || 0) + 1 }
            : c
        )
      );
      setDirectMessages(prev =>
        prev.map(dm =>
          dm.id === message.channelId
            ? { ...dm, unreadCount: (dm.unreadCount || 0) + 1 }
            : dm
        )
      );
    };

    const handleReplyMessage = ({ parentId, message: reply }) => {
      if (reply.author?.id === user?.id) return;
      if (reply.channelId === activeChannelRef.current) return;

      setChannels(prev =>
        prev.map(c =>
          c.id === reply.channelId
            ? { ...c, unreadCount: (c.unreadCount || 0) + 1 }
            : c
        )
      );
      setDirectMessages(prev =>
        prev.map(dm =>
          dm.id === reply.channelId
            ? { ...dm, unreadCount: (dm.unreadCount || 0) + 1 }
            : dm
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
    // Clear unread for this channel locally
    if (isDM) {
      setDirectMessages(prev =>
        prev.map(dm => dm.id === channel.id ? { ...dm, unreadCount: 0 } : dm)
      );
    } else {
      setChannels(prev =>
        prev.map(c => c.id === channel.id ? { ...c, unreadCount: 0 } : c)
      );
    }
    // For DMs, pass a friendly display name for the header
    const channelData = isDM
      ? { ...channel, displayName: getDMDisplayName(channel), isDM: true }
      : channel;
    navigation.navigate('Channel', { channel: channelData, workspaceId });
  }, [navigation, workspaceId, getDMDisplayName]);

  // When returning from a channel, clear the active ref
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      activeChannelRef.current = null;
    });
    return unsubscribe;
  }, [navigation]);

  const toggleGroup = useCallback((groupId) => {
    setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  // Organize channels into groups
  const sections = useMemo(() => {
    const sortedGroups = [...channelGroups].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const channelSections = [];

    // Add grouped channels
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

    // Ungrouped channels
    const ungrouped = channels
      .filter(c => !c.groupId)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (ungrouped.length > 0 || channelSections.length === 0) {
      channelSections.unshift({
        title: 'Channels',
        data: ungrouped.map(c => ({ ...c, _type: 'channel' })),
      });
    }

    // DMs section
    const dmSection = {
      title: 'Direct Messages',
      data: directMessages.map(dm => ({ ...dm, _type: 'dm' })),
    };

    return [...channelSections, dmSection];
  }, [channels, channelGroups, directMessages, collapsedGroups]);

  const renderItem = useCallback(({ item }) => {
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
  }, [getDMDisplayName, handleChannelPress]);

  const renderSectionHeader = useCallback(({ section }) => {
    const isCollapsed = section.isGroup && collapsedGroups[section.groupId];
    return (
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
    );
  }, [collapsedGroups, toggleGroup, colors]);

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
});
