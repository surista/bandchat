import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import { format, isToday, isYesterday } from 'date-fns';

function formatTimestamp(dateStr) {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMM d');
}

export default function SearchScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Filters
  const [channels, setChannels] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState(null);
  const [selectedAuthorId, setSelectedAuthorId] = useState(null);

  const searchTimeout = useRef(null);
  const inputRef = useRef(null);

  // Load channels and members for filters
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [ch, ws] = await Promise.all([
          api.getChannels(workspaceId),
          api.getWorkspace(workspaceId),
        ]);
        setChannels(ch);
        setMembers(ws.members || []);
      } catch (err) {
        console.error('Failed to load filters:', err);
      }
    };
    loadFilters();
  }, [workspaceId]);

  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  // Auto-focus search input
  useEffect(() => {
    const timeout = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(timeout);
  }, []);

  const performSearch = useCallback(async (searchQuery, channelId, authorId) => {
    const q = searchQuery.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const data = await api.searchMessages(workspaceId, q, channelId, authorId);
      setResults(data);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const handleQueryChange = useCallback((text) => {
    setQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      performSearch(text, selectedChannelId, selectedAuthorId);
    }, 400);
  }, [performSearch, selectedChannelId, selectedAuthorId]);

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearched(false);
    inputRef.current?.focus();
  }, []);

  const handleChannelFilter = useCallback((channelId) => {
    const newId = channelId === selectedChannelId ? null : channelId;
    setSelectedChannelId(newId);
    if (query.trim()) {
      performSearch(query, newId, selectedAuthorId);
    }
  }, [selectedChannelId, query, performSearch, selectedAuthorId]);

  const handleAuthorFilter = useCallback((authorId) => {
    const newId = authorId === selectedAuthorId ? null : authorId;
    setSelectedAuthorId(newId);
    if (query.trim()) {
      performSearch(query, selectedChannelId, newId);
    }
  }, [selectedAuthorId, query, performSearch, selectedChannelId]);

  const handleResultPress = useCallback((item) => {
    // Find the channel from our loaded channels
    const channel = channels.find(c => c.id === item.channelId);
    if (channel) {
      navigation.navigate('Channel', { channel, workspaceId });
    }
  }, [channels, navigation, workspaceId]);

  // Highlight search terms in text
  const renderHighlightedText = useCallback((text, colors) => {
    if (!query.trim() || !text) {
      return <Text style={[styles.resultContent, { color: colors.textPrimary }]}>{text}</Text>;
    }

    const q = query.trim().toLowerCase();
    const lowerText = text.toLowerCase();
    const parts = [];
    let lastIndex = 0;

    let searchFrom = 0;
    while (searchFrom < lowerText.length) {
      const idx = lowerText.indexOf(q, searchFrom);
      if (idx === -1) break;
      if (idx > lastIndex) {
        parts.push({ text: text.slice(lastIndex, idx), highlight: false });
      }
      parts.push({ text: text.slice(idx, idx + q.length), highlight: true });
      lastIndex = idx + q.length;
      searchFrom = lastIndex;
    }
    if (lastIndex < text.length) {
      parts.push({ text: text.slice(lastIndex), highlight: false });
    }

    if (parts.length === 0) {
      return <Text style={[styles.resultContent, { color: colors.textPrimary }]}>{text}</Text>;
    }

    return (
      <Text style={[styles.resultContent, { color: colors.textPrimary }]} numberOfLines={2}>
        {parts.map((part, i) => (
          <Text
            key={i}
            style={part.highlight ? [styles.highlight, { backgroundColor: colors.primary + '33' }] : undefined}
          >
            {part.text}
          </Text>
        ))}
      </Text>
    );
  }, [query]);

  const renderResult = useCallback(({ item }) => {
    const channel = channels.find(c => c.id === item.channelId);
    const channelName = channel?.name || 'unknown';
    const prefix = channel?.isPrivate ? '\uD83D\uDD12 ' : '# ';

    return (
      <TouchableOpacity
        style={[styles.resultItem, { backgroundColor: colors.bgSecondary }]}
        onPress={() => handleResultPress(item)}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={`Message by ${item.author?.displayName || 'Unknown'} in ${channelName}`}
      >
        <View style={styles.resultHeader}>
          <View style={[styles.channelBadge, { backgroundColor: colors.bgTertiary }]}>
            <Text style={[styles.channelBadgeText, { color: colors.textSecondary }]}>
              {prefix}{channelName}
            </Text>
          </View>
          <Text style={[styles.resultTimestamp, { color: colors.textSecondary }]}>
            {formatTimestamp(item.createdAt)}
          </Text>
        </View>
        <Text style={[styles.resultAuthor, { color: colors.textSecondary }]}>
          {item.author?.displayName || 'Unknown'}
        </Text>
        {renderHighlightedText(item.content, colors)}
      </TouchableOpacity>
    );
  }, [channels, colors, handleResultPress, renderHighlightedText]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      {/* Search Input */}
      <View style={[styles.searchBar, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.border }]}>
        <Text style={styles.searchIcon}>{'\uD83D\uDD0D'}</Text>
        <TextInput
          ref={inputRef}
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search messages..."
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={handleQueryChange}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search messages"
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={handleClear}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Text style={[styles.clearButton, { color: colors.textSecondary }]}>{'\u2715'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Channel filter */}
      <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ id: null, name: 'All Channels' }, ...channels]}
          keyExtractor={(item) => item.id || 'all'}
          contentContainerStyle={styles.filterContent}
          renderItem={({ item }) => {
            const isActive = item.id === selectedChannelId;
            return (
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  { backgroundColor: isActive ? colors.primary : colors.bgTertiary },
                ]}
                onPress={() => handleChannelFilter(item.id)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${item.id ? item.name : 'all channels'}${isActive ? ', selected' : ''}`}
              >
                <Text style={[
                  styles.filterChipText,
                  { color: isActive ? '#ffffff' : colors.textSecondary },
                ]}>
                  {item.id ? `# ${item.name}` : item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Author filter */}
      <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[{ userId: null, user: { displayName: 'All Members' } }, ...members]}
          keyExtractor={(item) => item.userId || 'all'}
          contentContainerStyle={styles.filterContent}
          renderItem={({ item }) => {
            const isActive = item.userId === selectedAuthorId;
            return (
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  { backgroundColor: isActive ? colors.primary : colors.bgTertiary },
                ]}
                onPress={() => handleAuthorFilter(item.userId)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${item.user?.displayName || 'all members'}${isActive ? ', selected' : ''}`}
              >
                <Text style={[
                  styles.filterChipText,
                  { color: isActive ? '#ffffff' : colors.textSecondary },
                ]}>
                  {item.user?.displayName || 'Unknown'}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Results */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !searched ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>{'\uD83D\uDD0D'}</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Search messages
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Find messages across all channels
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No results found
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Try a different search term
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderResult}
          contentContainerStyle={styles.resultsList}
          keyboardDismissMode="on-drag"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
  clearButton: {
    fontSize: 16,
    padding: 4,
  },
  filterRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  resultsList: {
    padding: 12,
    gap: 8,
  },
  resultItem: {
    borderRadius: 10,
    padding: 14,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  channelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  channelBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  resultTimestamp: {
    fontSize: 12,
  },
  resultAuthor: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  resultContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  highlight: {
    fontWeight: '700',
    borderRadius: 2,
  },
});
