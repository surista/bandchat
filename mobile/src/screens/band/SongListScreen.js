import { useState, useEffect, useCallback, useMemo, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { SkeletonList } from '../../components/SkeletonLoader';
import { successNotification } from '../../utils/haptics';
import api from '../../services/api';
import { formatDuration } from '../../utils/formatDuration';

const SORT_OPTIONS = [
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'recent', label: 'Recent' },
];

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

  // Practice summary
  const [practiceSummary, setPracticeSummary] = useState(null);

  // Action sheet
  const [selectedSong, setSelectedSong] = useState(null);
  const [showActions, setShowActions] = useState(false);

  // More menu
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Bulk import
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [fetchMetadata, setFetchMetadata] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Enrichment
  const [enriching, setEnriching] = useState(false);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Header buttons
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity
            onPress={() => setShowMoreMenu(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <Text style={{ color: colors.primary, fontSize: 20, fontWeight: '700' }}>{'\u22EF'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('SongDetail', { workspaceId })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Add song"
          >
            <Text style={{ color: colors.primary, fontSize: 28, fontWeight: '300', lineHeight: 30 }}>+</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, workspaceId, colors.primary]);

  const loadSongs = useCallback(async () => {
    try {
      const [data, summary] = await Promise.all([
        api.getSongs(workspaceId),
        api.getPracticeSummary(workspaceId).catch(() => null),
      ]);
      setSongs(data);
      if (summary) setPracticeSummary(summary);
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

  const parseBulkText = useCallback((text) => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const parts = line.split(/\s*[-|]\s*/);
        return {
          title: parts[0]?.trim() || line,
          artist: parts[1]?.trim() || null,
        };
      })
      .filter(s => s.title);
  }, []);

  const parsedSongs = useMemo(() => parseBulkText(bulkText), [bulkText, parseBulkText]);

  const handleBulkImport = useCallback(async () => {
    if (parsedSongs.length === 0) return;
    setImporting(true);
    try {
      const result = await api.bulkImportSongs(workspaceId, parsedSongs, fetchMetadata);
      setImportResult(result);
      loadSongs();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to import songs');
    } finally {
      setImporting(false);
    }
  }, [parsedSongs, workspaceId, fetchMetadata, loadSongs]);

  const handleEnrich = useCallback(async () => {
    setShowMoreMenu(false);
    setEnriching(true);
    try {
      const result = await api.enrichSongs(workspaceId);
      Alert.alert(
        'Metadata Updated',
        `Updated ${result.updated || 0} of ${result.processed || 0} songs.`
      );
      loadSongs();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to fetch metadata');
    } finally {
      setEnriching(false);
    }
  }, [workspaceId, loadSongs]);

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
            successNotification();
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
      accessibilityRole="button"
      accessibilityLabel={`${item.title}${item.artist ? ` by ${item.artist}` : ''}. Long press for options`}
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
      {(() => {
        const stat = practiceSummary?.songStats?.find(s => s.songId === item.id);
        if (stat?.lastPracticedAt) {
          const days = Math.floor((Date.now() - new Date(stat.lastPracticedAt).getTime()) / (1000 * 60 * 60 * 24));
          return (
            <Text style={[styles.practiceInfo, { color: colors.textSecondary }]}>
              {days === 0 ? 'Practiced today' : `Practiced ${days}d ago`}
            </Text>
          );
        }
        return (
          <Text style={[styles.practiceInfo, { color: colors.textSecondary, opacity: 0.6 }]}>
            Never practiced
          </Text>
        );
      })()}
    </TouchableOpacity>
  ), [colors, navigation, workspaceId, handleLongPress, practiceSummary]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <SkeletonList count={8} lines={2} />
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
          accessibilityLabel="Search songs"
        />
        <TouchableOpacity
          style={[styles.sortButton, { backgroundColor: colors.bgTertiary }]}
          onPress={() => setShowSortModal(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${SORT_OPTIONS.find(o => o.key === sortBy)?.label}`}
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
            <Text style={styles.emptyIcon}>{'\uD83C\uDFB5'}</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {search ? 'No matching songs' : 'No songs yet'}
            </Text>
            {!search && (
              <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                Tap + to add songs or use bulk import
              </Text>
            )}
          </View>
        }
      />

      {/* Sort Modal */}
      <Modal visible={showSortModal} transparent animationType="fade" onRequestClose={() => setShowSortModal(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSortModal(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss sort options"
        >
          <View style={[styles.sortModalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.sortModalTitle, { color: colors.textPrimary }]} accessibilityRole="header">Sort by</Text>
            {SORT_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.sortOption, sortBy === opt.key && { backgroundColor: colors.bgTertiary }]}
                onPress={() => { setSortBy(opt.key); setShowSortModal(false); }}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${opt.label}${sortBy === opt.key ? ', selected' : ''}`}
              >
                <Text style={[styles.sortOptionText, { color: colors.textPrimary }]}>{opt.label}</Text>
                {sortBy === opt.key && <Text style={{ color: colors.primary }}>{'\u2713'}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Enriching overlay */}
      {enriching && (
        <View style={styles.enrichingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.enrichingText}>Fetching metadata...</Text>
        </View>
      )}

      {/* More Menu */}
      <Modal visible={showMoreMenu} transparent animationType="fade" onRequestClose={() => setShowMoreMenu(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMoreMenu(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss menu"
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.actionHandle, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                setShowMoreMenu(false);
                setBulkText('');
                setImportResult(null);
                setShowBulkImport(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Bulk import songs"
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Bulk Import</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleEnrich} accessibilityRole="button" accessibilityLabel="Fetch missing metadata">
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Fetch Missing Data</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionCancel]}
              onPress={() => setShowMoreMenu(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Bulk Import Modal */}
      <Modal visible={showBulkImport} animationType="slide" onRequestClose={() => setShowBulkImport(false)}>
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
          <View style={[styles.bulkHeader, { backgroundColor: colors.bgSecondary }]}>
            <TouchableOpacity onPress={() => setShowBulkImport(false)} accessibilityRole="button" accessibilityLabel="Cancel bulk import">
              <Text style={{ color: colors.primary, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.bulkTitle, { color: colors.textPrimary }]} accessibilityRole="header">Bulk Import</Text>
            <View style={{ width: 60 }} />
          </View>

          {importResult ? (
            <ScrollView contentContainerStyle={styles.bulkContent}>
              <Text style={[styles.bulkResultTitle, { color: colors.textPrimary }]}>Import Complete</Text>
              <View style={[styles.bulkResultCard, { backgroundColor: colors.bgSecondary }]}>
                <Text style={[styles.bulkResultLine, { color: '#22c55e' }]}>
                  Created: {importResult.created?.length || 0}
                </Text>
                {(importResult.skipped?.length || 0) > 0 && (
                  <Text style={[styles.bulkResultLine, { color: '#eab308' }]}>
                    Skipped (duplicates): {importResult.skipped.length}
                  </Text>
                )}
                {(importResult.errors?.length || 0) > 0 && (
                  <Text style={[styles.bulkResultLine, { color: '#ef4444' }]}>
                    Errors: {importResult.errors.length}
                  </Text>
                )}
                {importResult.metadataMatches > 0 && (
                  <Text style={[styles.bulkResultLine, { color: '#60a5fa' }]}>
                    Metadata found: {importResult.metadataMatches}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.bulkButton, { backgroundColor: colors.primary }]}
                onPress={() => setShowBulkImport(false)}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={styles.bulkButtonText}>Done</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.bulkContent} keyboardShouldPersistTaps="handled">
              <Text style={[styles.bulkHint, { color: colors.textSecondary }]}>
                Paste your song list below, one per line.{'\n'}Format: Title - Artist
              </Text>
              <TextInput
                style={[styles.bulkInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                multiline
                placeholder={'Yesterday - The Beatles\nHotel California - Eagles\nBohemian Rhapsody - Queen'}
                placeholderTextColor={colors.textSecondary}
                value={bulkText}
                onChangeText={setBulkText}
                textAlignVertical="top"
                autoFocus
                accessibilityLabel="Song list, one per line"
              />
              {bulkText.trim() ? (
                <Text style={[styles.bulkCount, { color: colors.primary }]}>
                  {parsedSongs.length} song{parsedSongs.length !== 1 ? 's' : ''} detected
                </Text>
              ) : null}
              <TouchableOpacity
                style={styles.metadataToggle}
                onPress={() => setFetchMetadata(prev => !prev)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Auto-fetch metadata${fetchMetadata ? ', enabled' : ', disabled'}`}
              >
                <View style={[styles.checkbox, { borderColor: colors.border, backgroundColor: fetchMetadata ? colors.primary : 'transparent' }]}>
                  {fetchMetadata && <Text style={styles.checkmark}>{'\u2713'}</Text>}
                </View>
                <Text style={[styles.metadataLabel, { color: colors.textPrimary }]}>
                  Auto-fetch metadata (BPM, key, duration)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bulkButton, { backgroundColor: colors.primary }, (importing || parsedSongs.length === 0) && { opacity: 0.5 }]}
                onPress={handleBulkImport}
                disabled={importing || parsedSongs.length === 0}
                accessibilityRole="button"
                accessibilityLabel={`Import ${parsedSongs.length} songs`}
              >
                {importing ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.bulkButtonText}>Import {parsedSongs.length} Song{parsedSongs.length !== 1 ? 's' : ''}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Action Sheet */}
      <Modal visible={showActions} transparent animationType="slide" onRequestClose={() => setShowActions(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setShowActions(false); setSelectedSong(null); }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss action sheet"
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
              accessibilityRole="button"
              accessibilityLabel="Edit song"
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Delete song">
              <Text style={[styles.actionText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionCancel]}
              onPress={() => { setShowActions(false); setSelectedSong(null); }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
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
  practiceInfo: { fontSize: 11, marginTop: 4 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 15 },
  emptyHint: { fontSize: 13, marginTop: 6, textAlign: 'center', opacity: 0.7 },
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
  // Bulk import
  bulkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bulkTitle: { fontSize: 17, fontWeight: '700' },
  bulkContent: { padding: 16, paddingBottom: 40 },
  bulkHint: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  bulkInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 200,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  bulkCount: { fontSize: 14, fontWeight: '600', marginTop: 8, marginBottom: 4 },
  metadataToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12, paddingVertical: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  checkmark: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  metadataLabel: { fontSize: 15 },
  bulkButton: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  bulkButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  bulkResultTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  bulkResultCard: { borderRadius: 10, padding: 16, marginBottom: 20 },
  bulkResultLine: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  // Enriching overlay
  enrichingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  enrichingText: { color: '#ffffff', fontSize: 16, fontWeight: '600', marginTop: 12 },
});
