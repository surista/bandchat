import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import ErrorState from '../../components/ErrorState';
import api from '../../services/api';
import { format } from 'date-fns';
import { useLayout } from '../../hooks/useLayout';

export default function SavedMessagesScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();
  const [savedMessages, setSavedMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    navigation.setOptions({
      title: 'Saved Messages',
      headerStyle: { backgroundColor: colors.bgPrimary },
      headerTintColor: colors.textPrimary,
    });
  }, [navigation, colors]);

  const loadSaved = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await api.getSavedMessages(workspaceId);
      setSavedMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      setLoadError('Could not load saved messages');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  // Refetch on focus — without this, saving a message in another screen
  // wouldn't appear here until the screen was unmounted and remounted.
  // useFocusEffect fires on every navigation back to this screen.
  useFocusEffect(
    useCallback(() => {
      loadSaved();
    }, [loadSaved])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadSaved();
  }, [loadSaved]);

  const handleUnsave = useCallback(async (messageId) => {
    try {
      await api.unsaveMessage(messageId);
      setSavedMessages(prev => prev.filter(s => s.messageId !== messageId));
    } catch (err) {
      Alert.alert('Error', 'Failed to unsave message');
    }
  }, []);

  const renderItem = useCallback(({ item }) => {
    const msg = item.message;
    if (!msg) return null;

    return (
      <View style={[styles.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
        <View style={styles.header}>
          <View style={styles.authorRow}>
            {msg.author?.avatarUrl ? (
              <Image source={{ uri: msg.author.avatarUrl }} style={styles.avatar} accessibilityLabel={`${msg.author.displayName || 'User'} avatar`} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: '#16a34a' }]}>
                <Text style={styles.avatarText}>{msg.author?.displayName?.[0] || '?'}</Text>
              </View>
            )}
            <View style={styles.authorInfo}>
              <Text style={[styles.authorName, { color: colors.textPrimary }]}>
                {msg.author?.displayName || 'Unknown'}
              </Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {format(new Date(msg.createdAt), 'EEE, MMM d, h:mm a')}
                {msg.channel?.name ? ` in #${msg.channel.name}` : ''}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => handleUnsave(msg.id)}
            style={styles.unsaveButton}
            accessibilityRole="button"
            accessibilityLabel="Unsave message"
          >
            <Ionicons name="bookmark" size={20} color="#3b82f6" />
          </TouchableOpacity>
        </View>
        {msg.content ? (
          <Text style={[styles.content, { color: colors.textPrimary }]}>{msg.content}</Text>
        ) : null}
        {msg.attachments?.length > 0 && (
          <View style={styles.attachments}>
            {msg.attachments.map((att) => (
              att.type === 'IMAGE' ? (
                <Image
                  key={att.id}
                  source={{ uri: att.thumbnailUrl || att.url }}
                  style={styles.attachmentImage}
                  contentFit="cover"
                  accessibilityLabel={att.filename ? `Image attachment: ${att.filename}` : 'Image attachment'}
                />
              ) : (
                <Text key={att.id} style={[styles.attachmentFile, { color: colors.textSecondary }]}>
                  <Ionicons name="attach" size={13} color={colors.textSecondary} /> {att.filename}
                </Text>
              )
            ))}
          </View>
        )}
      </View>
    );
  }, [colors, handleUnsave]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (loadError && savedMessages.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <ErrorState
          iconName="bookmark-outline"
          title="Couldn't load saved messages"
          message={loadError}
          onRetry={() => { setLoadError(null); loadSaved(); }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}>
      {savedMessages.length > 0 && (
        <Text style={[styles.count, { color: colors.textSecondary }]}>
          {savedMessages.length} saved message{savedMessages.length !== 1 ? 's' : ''}
        </Text>
      )}
      <FlatList
        data={savedMessages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={savedMessages.length === 0 ? styles.emptyListContent : styles.list}
        // Always render via FlatList (with ListEmptyComponent for empty
        // state) so pull-to-refresh works even when the list is empty —
        // user can manually retry if they just saved something elsewhere.
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="bookmark-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No saved messages yet</Text>
            <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
              Save important messages to find them quickly later. Long-press any message and tap &quot;Save Message&quot;.
            </Text>
            <Text style={[styles.emptyDescription, { color: colors.textSecondary, marginTop: 8, fontSize: 12 }]}>
              Pull down to refresh.
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      />
    </View>
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 80,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  count: {
    fontSize: 13,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  list: {
    padding: 12,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  authorInfo: {
    marginLeft: 8,
    flex: 1,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    fontSize: 11,
    marginTop: 1,
  },
  unsaveButton: {
    padding: 4,
  },
  bookmarkIcon: {
    fontSize: 20,
  },
  content: {
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  attachments: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  attachmentImage: {
    width: 150,
    height: 100,
    borderRadius: 8,
  },
  attachmentFile: {
    fontSize: 12,
  },
});
