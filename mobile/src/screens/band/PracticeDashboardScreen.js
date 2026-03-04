import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

function formatMinutes(totalMinutes) {
  if (!totalMinutes) return '0 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDateHeader(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === yesterday.getTime()) return 'Yesterday';
  return format(date, 'EEE, dd-MMM-yyyy');
}

function groupByDate(sessions) {
  const groups = [];
  let currentDate = null;
  let currentGroup = null;

  for (const session of sessions) {
    const d = new Date(session.practicedAt);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString();

    if (key !== currentDate) {
      currentDate = key;
      currentGroup = { date: session.practicedAt, data: [] };
      groups.push(currentGroup);
    }
    currentGroup.data.push(session);
  }

  return groups;
}

export default function PracticeDashboardScreen({ route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();

  const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [practiceData, summaryData] = await Promise.all([
        api.getMyPractice(workspaceId),
        api.getPracticeSummary(workspaceId),
      ]);
      setSessions(practiceData.sessions);
      setNextCursor(practiceData.nextCursor);
      setSummary(summaryData);
    } catch (err) {
      console.error('Failed to load practice data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await api.getMyPractice(workspaceId, nextCursor);
      setSessions(prev => [...prev, ...data.sessions]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      console.error('Failed to load more sessions:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [workspaceId, nextCursor, loadingMore]);

  const handleDelete = useCallback((session) => {
    Alert.alert(
      'Delete Session',
      `Delete this practice session for "${session.song?.title || 'Unknown'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deletePracticeSession(session.id);
              setSessions(prev => prev.filter(s => s.id !== session.id));
              // Reload summary
              const summaryData = await api.getPracticeSummary(workspaceId);
              setSummary(summaryData);
            } catch (err) {
              Alert.alert('Error', 'Failed to delete session');
            }
          },
        },
      ]
    );
  }, [workspaceId]);

  const grouped = groupByDate(sessions);

  // Build flat list data with section headers
  const listData = [];
  for (const group of grouped) {
    listData.push({ type: 'header', date: group.date, id: `header-${group.date}` });
    for (const session of group.data) {
      listData.push({ type: 'session', ...session });
    }
  }

  const renderItem = useCallback(({ item }) => {
    if (item.type === 'header') {
      return (
        <Text style={[styles.dateHeader, { color: colors.textSecondary }]}>
          {formatDateHeader(item.date)}
        </Text>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.sessionCard, { backgroundColor: colors.bgSecondary }]}
        onLongPress={() => handleDelete(item)}
        delayLongPress={500}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${item.song?.title || 'Unknown'}, ${item.duration} minutes. Long press to delete`}
      >
        <View style={styles.sessionMain}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sessionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.song?.title || 'Unknown'}
            </Text>
            {item.song?.artist ? (
              <Text style={[styles.sessionArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.song.artist}
              </Text>
            ) : null}
            {item.notes ? (
              <Text style={[styles.sessionNotes, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.notes}
              </Text>
            ) : null}
          </View>
          <View style={styles.sessionMeta}>
            <Text style={[styles.sessionDuration, { color: colors.primary }]}>
              {formatMinutes(item.duration)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [colors, handleDelete]);

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
      {/* Stats header */}
      <View style={[styles.statsContainer, { backgroundColor: colors.bgSecondary }]}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              {summary?.streak || 0}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Day Streak
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              {formatMinutes(summary?.totalMinutes || 0)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Total Time
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              {summary?.totalSessions || 0}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Sessions
            </Text>
          </View>
        </View>
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loadingMore ? (
          <ActivityIndicator style={{ padding: 16 }} color={colors.primary} />
        ) : null}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No practice sessions yet.
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Start practicing!
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  statsContainer: {
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 36,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  dateHeader: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sessionCard: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
  },
  sessionMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  sessionArtist: {
    fontSize: 13,
    marginTop: 2,
  },
  sessionNotes: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  sessionMeta: {
    marginLeft: 12,
    alignItems: 'flex-end',
  },
  sessionDuration: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
  },
});
