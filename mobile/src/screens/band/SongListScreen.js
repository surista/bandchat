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
  LayoutAnimation,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { SkeletonList } from '../../components/SkeletonLoader';
import { successNotification, selectionFeedback, mediumImpact } from '../../utils/haptics';
import api from '../../services/api';
import { getLocalSongs, upsertSongs, deleteLocalSong } from '../../services/database';
import { Ionicons } from '@expo/vector-icons';
import ErrorState from '../../components/ErrorState';
import { formatDuration } from '../../utils/formatDuration';
import useDebounce from '../../hooks/useDebounce';
import { useLayout } from '../../hooks/useLayout';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildSongListHTML } from '../../utils/buildSongListHTML';
import PressableRow from '../../components/PressableRow';

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
  const { workspaceId, workspaceName } = route.params;
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();

  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300); // Debounce search by 300ms
  const [sortBy, setSortBy] = useState('title');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'compact'
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

  const viewModeRef = useRef(viewMode);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Pre-load songs from SQLite for instant display
  useEffect(() => {
    getLocalSongs(workspaceId).then(cached => {
      if (cached.length > 0) {
        setSongs(cached);
        setLoading(false);
      }
    }).catch(() => {});
  }, [workspaceId]);

  // Header buttons
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity
            onPress={() => setShowMoreMenu(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('SongDetail', { workspaceId })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Add song"
            accessibilityHint="Create a new song"
          >
            <Ionicons name="add" size={28} color={colors.primary} />
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
      setLoadError(null);
      // Persist to SQLite for offline access
      upsertSongs(data, workspaceId).catch(() => {});
    } catch (err) {
      setSongs(prev => { if (prev.length === 0) setLoadError('Could not load songs'); return prev; });
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
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
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
  }, [songs, debouncedSearch, sortBy]);

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

  const handlePrintSongs = useCallback(async () => {
    setShowMoreMenu(false);
    try {
      const html = buildSongListHTML(filteredSongs, {
        bandName: workspaceName,
        searchQuery: debouncedSearch || undefined,
      });
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Song List PDF' });
    } catch (err) {
      if (err.message !== 'User cancelled') {
        Alert.alert('Error', 'Could not generate PDF');
      }
    }
  }, [filteredSongs, workspaceName, debouncedSearch]);

  const handleLongPress = useCallback((song) => {
    mediumImpact();
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
            deleteLocalSong(selectedSong.id).catch(() => {});
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

  const renderItem = useCallback(({ item, index }) => {
    if (viewModeRef.current === 'compact') {
      return (
        <PressableRow
          style={[styles.compactRow, { borderBottomColor: colors.border }]}
          onPress={() => navigation.navigate('SongDetail', { songId: item.id, workspaceId })}
          onLongPress={() => handleLongPress(item)}
          delayLongPress={400}
          accessibilityRole="button"
          accessibilityLabel={`${index + 1}. ${item.title}${item.artist ? ` by ${item.artist}` : ''}${item.key ? `, key of ${item.key}` : ''}${item.bpm ? `, ${item.bpm} BPM` : ''}${item.duration ? `, ${formatDuration(item.duration)}` : ''}`}
          accessibilityHint="Tap for details, long press for options"
        >
          <Text style={[styles.compactNum, { color: colors.textSecondary }]}>{index + 1}</Text>
          <View style={styles.compactInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.compactTitle, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
                {item.title}
              </Text>
              {item.hasAudio ? <Ionicons name="musical-notes-outline" size={14} color={colors.textSecondary} /> : null}
            </View>
            {item.artist ? (
              <Text style={[styles.compactArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.artist}
              </Text>
            ) : null}
          </View>
          <View style={styles.compactMeta}>
            {item.key ? <Text style={[styles.compactMetaText, { color: colors.badgeKey }]}>{item.key}</Text> : null}
            {item.bpm ? <Text style={[styles.compactMetaText, { color: colors.badgeBpm }]}>{item.bpm}</Text> : null}
            {item.duration ? <Text style={[styles.compactMetaText, { color: colors.textSecondary }]}>{formatDuration(item.duration)}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} style={{ opacity: 0.4, marginLeft: 4 }} />
        </PressableRow>
      );
    }

    return (
      <PressableRow
        style={[styles.songCard, { backgroundColor: colors.bgSecondary }]}
        onPress={() => navigation.navigate('SongDetail', { songId: item.id, workspaceId })}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}${item.artist ? ` by ${item.artist}` : ''}`}
        accessibilityHint="Tap for details, long press for options"
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
          {item.key ? <Badge label={`Key: ${item.key}`} color={colors.badgeKey} bgColor={colors.badgeKeyBg} /> : null}
          {item.bpm ? <Badge label={`${item.bpm} BPM`} color={colors.badgeBpm} bgColor={colors.badgeBpmBg} /> : null}
          {item.duration ? <Badge label={formatDuration(item.duration)} color={colors.badgeDuration} bgColor={colors.badgeDurationBg} /> : null}
          {item.hasAudio ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="musical-notes-outline" size={12} color={colors.textSecondary} />
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>Audio</Text>
            </View>
          ) : null}
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
      </PressableRow>
    );
  }, [colors, navigation, workspaceId, handleLongPress, practiceSummary]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <SkeletonList count={8} lines={2} />
      </SafeAreaView>
    );
  }

  if (loadError && songs.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <ErrorState iconName="musical-notes-outline" title="Couldn't load songs" message={loadError} onRetry={loadSongs} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
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
          accessibilityHint="Change sort order"
        >
          <Text style={[styles.sortButtonText, { color: colors.textSecondary }]}>
            {SORT_OPTIONS.find(o => o.key === sortBy)?.label}
          </Text>
        </TouchableOpacity>
        <View style={[styles.segmentedControl, { backgroundColor: colors.bgTertiary }]} accessibilityRole="tabbar">
          <TouchableOpacity
            style={[styles.segmentButton, viewMode === 'cards' && { backgroundColor: colors.primary }]}
            onPress={() => {
              if (viewMode !== 'cards') {
                selectionFeedback();
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setViewMode('cards');
              }
            }}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel="Card view"
            accessibilityState={{ selected: viewMode === 'cards' }}
          >
            <Ionicons name="grid-outline" size={16} color={viewMode === 'cards' ? colors.primaryText : colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentButton, viewMode === 'compact' && { backgroundColor: colors.primary }]}
            onPress={() => {
              if (viewMode !== 'compact') {
                selectionFeedback();
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setViewMode('compact');
              }
            }}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel="List view"
            accessibilityState={{ selected: viewMode === 'compact' }}
          >
            <Ionicons name="list-outline" size={16} color={viewMode === 'compact' ? colors.primaryText : colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={filteredSongs}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        extraData={viewMode}
        removeClippedSubviews={Platform.OS === 'android'}
        windowSize={10}
        contentContainerStyle={[styles.listContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
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
            <Ionicons name="musical-notes-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {search ? 'No matching songs' : 'No songs yet'}
            </Text>
            {!search && (
              <>
                <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                  Tap + to add songs or use bulk import
                </Text>
                <TouchableOpacity
                  style={[styles.emptyButton, { backgroundColor: colors.primary }]}
                  onPress={() => navigation.navigate('SongDetail', { workspaceId })}
                  accessibilityRole="button"
                  accessibilityLabel="Add song"
                >
                  <Text style={[styles.emptyButtonText, { color: colors.primaryText }]}>+ Add Song</Text>
                </TouchableOpacity>
              </>
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
                onPress={() => { selectionFeedback(); setSortBy(opt.key); setShowSortModal(false); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: sortBy === opt.key }}
                accessibilityLabel={`Sort by ${opt.label}`}
              >
                <Text style={[styles.sortOptionText, { color: colors.textPrimary }]}>{opt.label}</Text>
                {sortBy === opt.key && <Ionicons name="checkmark" size={20} color={colors.primary} />}
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
              style={[styles.actionItem, filteredSongs.length === 0 && { opacity: 0.4 }]}
              onPress={filteredSongs.length > 0 ? handlePrintSongs : undefined}
              disabled={filteredSongs.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Share song list as PDF"
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Share as PDF</Text>
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
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}>
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
                  <Text style={[styles.bulkResultLine, { color: colors.badgeBpm }]}>
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
                  {fetchMetadata && <Text style={[styles.checkmark, { color: colors.primaryText }]}>{'\u2713'}</Text>}
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
                  <ActivityIndicator color={colors.primaryText} size="small" />
                ) : (
                  <Text style={[styles.bulkButtonText, { color: colors.primaryText }]}>Import {parsedSongs.length} Song{parsedSongs.length !== 1 ? 's' : ''}</Text>
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
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
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
    minHeight: 44,
  },
  sortButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    minHeight: 44,
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
  // Compact view
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  compactNum: { minWidth: 28, fontSize: 13, textAlign: 'center' },
  compactInfo: { flex: 1, marginHorizontal: 8 },
  compactTitle: { fontSize: 15, fontWeight: '600' },
  compactArtist: { fontSize: 13, marginTop: 1 },
  compactMeta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  compactMetaText: { fontSize: 12, fontWeight: '600' },
  // Segmented control
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
  },
  segmentButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 15 },
  emptyHint: { fontSize: 13, marginTop: 6, textAlign: 'center', opacity: 0.7 },
  emptyButton: { backgroundColor: '#16a34a', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 16 },
  emptyButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
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
  actionCancel: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.3)' },
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
  checkmark: { fontSize: 14, fontWeight: '700' },
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
