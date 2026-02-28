import { useState, useEffect, useCallback, useMemo, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

const SORT_OPTIONS = [
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'recent', label: 'Recent' },
];

function formatDuration(seconds) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function Badge({ label, color, bgColor }) {
  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export default function SongListScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();

  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('title');
  const [showSortModal, setShowSortModal] = useState(false);

  // Action sheet
  const [selectedSong, setSelectedSong] = useState(null);
  const [showActions, setShowActions] = useState(false);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Header "+" button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('SongDetail', { workspaceId })}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ color: colors.primary, fontSize: 28, fontWeight: '300', lineHeight: 30 }}>+</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, workspaceId, colors.primary]);

  const loadSongs = useCallback(async () => {
    try {
      const data = await api.getSongs(workspaceId);
      setSongs(data);
    } catch (err) {
      console.error('Failed to load songs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  // Reload when returning from detail screen
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loadingRef.current) loadSongs();
    });
    return unsubscribe;
  }, [navigation, loadSongs]);

  const filteredSongs = useMemo(() => {
    let list = [...songs];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        s =>
          s.title?.toLowerCase().includes(q) ||
          s.artist?.toLowerCase().includes(q) ||
          s.shortName?.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'artist') return (a.artist || '').localeCompare(b.artist || '');
      if (sortBy === 'recent') return new Date(b.createdAt) - new Date(a.createdAt);
      return 0;
    });
    return list;
  }, [songs, search, sortBy]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadSongs();
  }, [loadSongs]);

  const handleLongPress = useCallback((song) => {
    setSelectedSong(song);
    setShowActions(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedSong) return;
    Alert.alert('Delete Song', `Delete "${selectedSong.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteSong(selectedSong.id);
            setSongs(prev => prev.filter(s => s.id !== selectedSong.id));
          } catch (err) {
            Alert.alert('Error', 'Failed to delete song');
          }
          setShowActions(false);
          setSelectedSong(null);
        },
      },
    ]);
  }, [selectedSong]);

  const renderSong = useCallback(({ item }) => (
    <TouchableOpacity
      style={[styles.songCard, { backgroundColor: colors.bgSecondary }]}
      onPress={() => navigation.navigate('SongDetail', { songId: item.id, workspaceId })}
      onLongPress={() => handleLongPress(item)}
      delayLongPress={400}
      activeOpacity={0.7}
    >
      <Text style={[styles.songTitle, { color: colors.textPrimary }]} numberOfLines={1}>
        {item.title}
      </Text>
      {item.artist ? (
        <Text style={[styles.songArtist, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.artist}
        </Text>
      ) : null}
      {item.shortName ? (
        <Text style={[styles.songShortName, { color: colors.textSecondary }]} numberOfLines={1}>
          aka "{item.shortName}"
        </Text>
      ) : null}
      <View style={styles.badgeRow}>
        {item.key ? <Badge label={`Key: ${item.key}`} color="#c084fc" bgColor="rgba(192,132,252,0.15)" /> : null}
        {item.bpm ? <Badge label={`${item.bpm} BPM`} color="#60a5fa" bgColor="rgba(96,165,250,0.15)" /> : null}
        {item.duration ? <Badge label={formatDuration(item.duration)} color="#9ca3af" bgColor="rgba(156,163,175,0.15)" /> : null}
      </View>
      {item._count?.setlistSongs > 0 ? (
        <Text style={[styles.setlistCount, { color: colors.textSecondary }]}>
          In {item._count.setlistSongs} setlist{item._count.setlistSongs !== 1 ? 's' : ''}
        </Text>
      ) : null}
    </TouchableOpacity>
  ), [colors, navigation, workspaceId, handleLongPress]);

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
      {/* Search + Sort */}
      <View style={styles.toolbar}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary }]}
          placeholder="Search songs..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={[styles.sortButton, { backgroundColor: colors.bgTertiary }]}
          onPress={() => setShowSortModal(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.sortButtonText, { color: colors.textSecondary }]}>
            {SORT_OPTIONS.find(o => o.key === sortBy)?.label}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredSongs}
        keyExtractor={(item) => item.id}
        renderItem={renderSong}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {search ? 'No matching songs' : 'No songs yet'}
            </Text>
          </View>
        }
      />

      {/* Sort Modal */}
      <Modal visible={showSortModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSortModal(false)}
        >
          <View style={[styles.sortModalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.sortModalTitle, { color: colors.textPrimary }]}>Sort by</Text>
            {SORT_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.sortOption, sortBy === opt.key && { backgroundColor: colors.bgTertiary }]}
                onPress={() => { setSortBy(opt.key); setShowSortModal(false); }}
              >
                <Text style={[styles.sortOptionText, { color: colors.textPrimary }]}>{opt.label}</Text>
                {sortBy === opt.key && <Text style={{ color: colors.primary }}>{'\u2713'}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Action Sheet */}
      <Modal visible={showActions} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setShowActions(false); setSelectedSong(null); }}
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.actionHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {selectedSong?.title}
            </Text>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                setShowActions(false);
                navigation.navigate('SongDetail', { songId: selectedSong?.id, workspaceId, editing: true });
                setSelectedSong(null);
              }}
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleDelete}>
              <Text style={[styles.actionText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionCancel]}
              onPress={() => { setShowActions(false); setSelectedSong(null); }}
            >
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  sortButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sortButtonText: { fontSize: 14, fontWeight: '600' },
  listContent: { paddingHorizontal: 12, paddingBottom: 20 },
  songCard: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  songTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  songArtist: { fontSize: 14, marginBottom: 2 },
  songShortName: { fontSize: 13, fontStyle: 'italic', marginBottom: 6 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  setlistCount: { fontSize: 12, marginTop: 6 },
  emptyText: { fontSize: 15 },
  // Sort modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sortModalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
  },
  sortModalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  sortOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  sortOptionText: { fontSize: 16 },
  // Action sheet
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
});
