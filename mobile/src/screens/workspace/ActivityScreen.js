import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Image,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import { useLayout } from '../../hooks/useLayout';
import ErrorState from '../../components/ErrorState';
import PressableRow from '../../components/PressableRow';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const ICONS = {
  reaction: 'heart-outline',
  mention: 'at-outline',
  thread_reply: 'chatbubble-outline',
};

export default function ActivityScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // id of the thread_reply item currently being opened — ThreadScreen needs a
  // full parent message object (every other navigator to it already has one
  // in memory), but an activity row only carries `parentId`/`parentContent`,
  // so we fetch the real parent first. Tracked per-row so only the tapped
  // row shows a spinner while the fetch is in flight.
  const [openingThreadId, setOpeningThreadId] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getActivity(workspaceId);
      setItems(data.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load activity');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const getDescription = (item) => {
    if (item.type === 'reaction') return `reacted ${item.emoji} to your message`;
    if (item.type === 'mention') return `mentioned you`;
    if (item.type === 'thread_reply') return `replied to a thread`;
    return '';
  };

  const handlePress = useCallback(async (item) => {
    const channel = {
      id: item.channelId,
      name: item.channelName,
      isDM: item.isDirect || false,
    };
    if (item.type === 'thread_reply' && item.parentId) {
      if (openingThreadId) return; // already opening one, ignore extra taps
      setOpeningThreadId(item.id);
      try {
        const data = await api.getReplies(item.parentId);
        if (!data?.parent) throw new Error('Thread not found');
        navigation.navigate('Thread', {
          parentMessage: data.parent,
          channelId: item.channelId,
          workspaceId,
        });
      } catch (err) {
        toast.error('Could not open thread — the message may have been deleted.');
      } finally {
        setOpeningThreadId(null);
      }
    } else {
      navigation.navigate('Channel', {
        channel,
        workspaceId,
      });
    }
  }, [navigation, workspaceId, openingThreadId, toast]);

  const renderItem = useCallback(({ item }) => (
    <PressableRow
      style={[styles.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
      onPress={() => handlePress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.actor?.displayName} ${getDescription(item)} in ${item.channelName}`}
    >
      <View style={styles.row}>
        <View style={[styles.iconBg, { backgroundColor: colors.bgTertiary }]}>
          {openingThreadId === item.id ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name={ICONS[item.type] || 'notifications-outline'} size={18} color={colors.primary} />
          )}
        </View>
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={[styles.actorName, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.actor?.displayName || 'Someone'}
            </Text>
            <Text style={[styles.time, { color: colors.textSecondary }]}>{formatDate(item.createdAt)}</Text>
          </View>
          <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={1}>
            {getDescription(item)} in #{item.channelName}
          </Text>
          {item.message?.content ? (
            <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.message.content}
            </Text>
          ) : null}
        </View>
      </View>
    </PressableRow>
  ), [colors, handlePress, openingThreadId]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <ErrorState message={error} onRetry={load} iconName="alert-circle-outline" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No activity yet</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Reactions, mentions, and thread replies will appear here.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 12, gap: 8 },
  card: { borderRadius: 10, borderWidth: 1, padding: 12, minHeight: 60 },
  row: { flexDirection: 'row', gap: 10 },
  iconBg: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  actorName: { fontSize: 14, fontWeight: '600', flex: 1 },
  time: { fontSize: 12, marginLeft: 8 },
  description: { fontSize: 13, marginBottom: 2 },
  preview: { fontSize: 12, fontStyle: 'italic' },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 260 },
});
