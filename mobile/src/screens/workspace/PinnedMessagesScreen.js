import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import ErrorState from '../../components/ErrorState';
import api from '../../services/api';
import { format } from 'date-fns';

export default function PinnedMessagesScreen({ route }) {
  const { channelId } = route.params;
  const { colors } = useTheme();
  const { socket } = useSocket();

  const [pins, setPins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPins = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getPinnedMessages(channelId);
      setPins(data);
    } catch (err) {
      setError(err.message || 'Failed to load pinned messages');
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    loadPins();
  }, [loadPins]);

  // Listen for pin/unpin events
  useEffect(() => {
    if (!socket) return;

    const handlePinned = (data) => {
      if (data.channelId === channelId) {
        setPins(prev => [data, ...prev]);
      }
    };

    const handleUnpinned = (data) => {
      if (data.channelId === channelId) {
        setPins(prev => prev.filter(p => p.messageId !== data.messageId));
      }
    };

    socket.on('message:pinned', handlePinned);
    socket.on('message:unpinned', handleUnpinned);

    return () => {
      socket.off('message:pinned', handlePinned);
      socket.off('message:unpinned', handleUnpinned);
    };
  }, [socket, channelId]);

  const renderPin = useCallback(({ item }) => {
    const msg = item.message;
    if (!msg) return null;

    return (
      <View style={[styles.pinCard, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
        <View style={styles.pinHeader}>
          <Text style={[styles.authorName, { color: colors.textPrimary }]} numberOfLines={1}>
            {msg.author?.displayName || 'Unknown'}
          </Text>
          <Text style={[styles.pinDate, { color: colors.textSecondary }]}>
            {item.createdAt ? format(new Date(item.createdAt), 'MMM d, yyyy') : ''}
          </Text>
        </View>
        {msg.content ? (
          <Text style={[styles.messageContent, { color: colors.textPrimary }]} numberOfLines={4}>
            {msg.content}
          </Text>
        ) : null}
        {msg.attachments?.length > 0 && (
          <Text style={[styles.attachmentHint, { color: colors.textSecondary }]}>
            {msg.attachments.length} attachment{msg.attachments.length > 1 ? 's' : ''}
          </Text>
        )}
        {item.pinnedBy && (
          <Text style={[styles.pinnedBy, { color: colors.textSecondary }]}>
            Pinned by {item.pinnedBy.displayName}
          </Text>
        )}
      </View>
    );
  }, [colors]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <ErrorState message={error} onRetry={loadPins} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      <FlatList
        data={pins}
        keyExtractor={(item) => item.id || item.messageId}
        renderItem={renderPin}
        contentContainerStyle={pins.length === 0 ? styles.centered : styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>{'\uD83D\uDCCC'}</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No pinned messages</Text>
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
              Long press a message and tap Pin to save it here
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
  listContent: { padding: 12, gap: 10 },
  pinCard: {
    borderRadius: 10,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pinHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  authorName: { fontSize: 14, fontWeight: '700', flex: 1 },
  pinDate: { fontSize: 12, marginLeft: 8 },
  messageContent: { fontSize: 15, lineHeight: 21 },
  attachmentHint: { fontSize: 13, marginTop: 4, fontStyle: 'italic' },
  pinnedBy: { fontSize: 12, marginTop: 8 },
  emptyContainer: { alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptyHint: { fontSize: 14, textAlign: 'center', maxWidth: 280, lineHeight: 20 },
});
