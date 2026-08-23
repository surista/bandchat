import { useState, useEffect, useCallback, useLayoutEffect, useRef, useMemo } from 'react';
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
import { format } from 'date-fns';
import { useTheme } from '../../context/ThemeContext';
import Badge from '../../components/Badge';
import { SkeletonList } from '../../components/SkeletonLoader';
import { successNotification } from '../../utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import ErrorState from '../../components/ErrorState';
import PressableRow from '../../components/PressableRow';
import ActionSheet from '../../components/ActionSheet';
import useDebounce from '../../hooks/useDebounce';
import api from '../../services/api';
import { formatDuration } from '../../utils/formatDuration';
import { computeSetlistDuration, formatSetlistDuration } from '../../utils/setlistDuration';
import { buildSetlistHTML } from '../../utils/buildSetlistHTML';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useLayout } from '../../hooks/useLayout';

export default function SetlistListScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();

  const [setlists, setSetlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [transitionPaddingSecs, setTransitionPaddingSecs] = useState(15);

  useEffect(() => {
    let cancelled = false;
    api.getWorkspace(workspaceId)
      .then(ws => { if (!cancelled && typeof ws?.transitionPaddingSecs === 'number') setTransitionPaddingSecs(ws.transitionPaddingSecs); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [workspaceId]);

  const filteredSetlists = useMemo(() => {
    if (!debouncedSearch.trim()) return setlists;
    const q = debouncedSearch.toLowerCase();
    return setlists.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q)
    );
  }, [setlists, debouncedSearch]);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newVenue, setNewVenue] = useState('');
  const [creating, setCreating] = useState(false);

  // Action sheet
  const [selectedSetlist, setSelectedSetlist] = useState(null);
  const [showActions, setShowActions] = useState(false);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Header "+" button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setShowCreate(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Create setlist"
        >
          <Ionicons name="add" size={28} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.primary]);

  const loadSetlists = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getSetlists(workspaceId);
      setSetlists(data);
    } catch (err) {
      if (!setlists.length) setError(err.message || 'Failed to load setlists');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadSetlists();
  }, [loadSetlists]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loadingRef.current) loadSetlists();
    });
    return unsubscribe;
  }, [navigation, loadSetlists]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadSetlists();
  }, [loadSetlists]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await api.createSetlist(workspaceId, {
        name,
        description: newDescription.trim() || null,
        performedAt: newDate.trim() || null,
        venue: newVenue.trim() || null,
      });
      successNotification();
      setShowCreate(false);
      setNewName('');
      setNewDescription('');
      setNewDate('');
      setNewVenue('');
      navigation.navigate('SetlistDetail', { setlistId: created.id, workspaceId });
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create setlist');
    } finally {
      setCreating(false);
    }
  }, [newName, newDescription, newDate, newVenue, workspaceId, navigation]);

  const handleDuplicate = useCallback(async () => {
    if (!selectedSetlist) return;
    try {
      await api.duplicateSetlist(selectedSetlist.id);
      loadSetlists();
    } catch (err) {
      Alert.alert('Error', 'Failed to duplicate setlist');
    }
    setShowActions(false);
    setSelectedSetlist(null);
  }, [selectedSetlist, loadSetlists]);

  const handleDelete = useCallback(() => {
    if (!selectedSetlist) return;
    Alert.alert('Delete Setlist', `Delete "${selectedSetlist.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteSetlist(selectedSetlist.id);
            setSetlists(prev => prev.filter(s => s.id !== selectedSetlist.id));
            successNotification();
          } catch (err) {
            Alert.alert('Error', 'Failed to delete setlist');
          }
          setShowActions(false);
          setSelectedSetlist(null);
        },
      },
    ]);
  }, [selectedSetlist]);

  const handleExportPDF = useCallback(async () => {
    if (!selectedSetlist) return;
    try {
      const items = selectedSetlist.songs || [];
      let venueLogoUrl = null;
      if (selectedSetlist.venue) {
        try {
          const venues = await api.getVenues(workspaceId);
          const match = venues.find(v => v.name === selectedSetlist.venue);
          if (match?.imageUrl) venueLogoUrl = match.imageUrl;
        } catch (e) {
          console.error('Failed to fetch venue logo for setlist print:', e);
        }
      }
      // Personal notes are per-user and non-essential to the export — a failure
      // here should never block the print.
      let notes = {};
      try {
        notes = (await api.getMySetlistNotes(selectedSetlist.id)) || {};
      } catch (e) {
        console.error('Failed to load setlist notes for export:', e);
      }
      const html = buildSetlistHTML(selectedSetlist.name, items, { venueLogoUrl, transitionPaddingSecs, notes });
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export Setlist' });
    } catch (err) {
      if (err.message !== 'User canceled') {
        Alert.alert('Error', 'Failed to export PDF');
      }
    }
    setShowActions(false);
    setSelectedSetlist(null);
  }, [selectedSetlist]);

  const renderSetlist = useCallback(({ item }) => {
    const songs = (item.songs || []).filter(s => s.type === 'SONG' || (!s.type && s.song));
    const songCount = songs.length;
    const allItems = item.songs || [];
    const setBreaks = allItems.filter(s => s.type === 'SET_BREAK');
    const firstContentIdx = allItems.findIndex(s => s.type !== 'SET_BREAK');
    const effectiveBreaks = firstContentIdx >= 0
      ? allItems.filter((s, i) => s.type === 'SET_BREAK' && i > firstContentIdx).length
      : 0;
    const setCount = effectiveBreaks + 1;
    const { actualSecs: totalActualSecs, paddedSecs: totalPaddedSecs, paddingSecs: itemPaddingSecs } = computeSetlistDuration(item.songs, transitionPaddingSecs);
    const itemHasPadding = itemPaddingSecs > 0 && totalPaddedSecs !== totalActualSecs;
    const preview = songs.slice(0, 4).map((s, i) => s.song?.title || s.label || `Song ${i + 1}`);
    const remaining = songCount - preview.length;

    return (
      <PressableRow
        style={[styles.setlistCard, { backgroundColor: colors.bgSecondary }]}
        onPress={() => navigation.navigate('SetlistDetail', { setlistId: item.id, workspaceId })}
        onLongPress={() => { setSelectedSetlist(item); setShowActions(true); }}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}${songCount > 0 ? `, ${songCount} songs` : ''}. Long press for options`}
      >
        <Text style={[styles.setlistName, { color: colors.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.5}>
          {item.name}
        </Text>
        {(item.performedAt || item.venue) && (
          <Text style={[styles.setlistMeta, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.5}>
            {item.performedAt ? format(new Date(item.performedAt), 'dd-MMM-yyyy') : ''}
            {item.performedAt && item.venue ? ' \u00B7 ' : ''}
            {item.venue || ''}
          </Text>
        )}
        <View style={styles.badgeRow}>
          {songCount > 0 && <Badge label={`${songCount} songs`} color={colors.badgeBpm} bgColor={colors.badgeBpmBg} />}
          {effectiveBreaks > 0 && <Badge label={`${setCount} sets`} color={colors.badgeKey} bgColor={colors.badgeKeyBg} />}
          {totalActualSecs > 0 && (
            <Badge
              label={itemHasPadding
                ? `${formatSetlistDuration(totalActualSecs)} (${formatSetlistDuration(totalPaddedSecs)} w/ ${itemPaddingSecs}s gaps)`
                : formatSetlistDuration(totalActualSecs)}
              color={colors.badgeDuration}
              bgColor={colors.badgeDurationBg}
            />
          )}
        </View>
        {preview.length > 0 && (
          <View style={styles.previewList}>
            {preview.map((title, i) => (
              <Text key={i} style={[styles.previewItem, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.5}>
                {i + 1}. {title}
              </Text>
            ))}
            {remaining > 0 && (
              <Text style={[styles.previewMore, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>
                +{remaining} more...
              </Text>
            )}
          </View>
        )}
      </PressableRow>
    );
  }, [colors, navigation, workspaceId]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <SkeletonList count={6} lines={2} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <ErrorState
          iconName="list-outline"
          title="Couldn't load setlists"
          message={error}
          onRetry={() => { setLoading(true); loadSetlists(); }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search setlists..."
          placeholderTextColor={colors.textSecondary}
          autoCorrect={false}
          accessibilityLabel="Search setlists"
        />
      </View>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={filteredSetlists}
        keyExtractor={(item) => item.id}
        renderItem={renderSetlist}
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
            <Ionicons name="list-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>{search ? 'No matching setlists' : 'No setlists yet'}</Text>
            {!search && (
              <Text style={[styles.emptyHint, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>
                Tap + to create your first setlist
              </Text>
            )}
          </View>
        }
      />

      {/* Create Setlist Modal */}
      <Modal visible={showCreate} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]} accessibilityViewIsModal>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]} accessibilityRole="header" maxFontSizeMultiplier={1.6}>New Setlist</Text>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>Name *</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              value={newName}
              onChangeText={setNewName}
              placeholder="Setlist name"
              placeholderTextColor={colors.textSecondary}
              autoFocus
              accessibilityLabel="Setlist name"
            />
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>Description</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Optional description"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Setlist description"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>Date</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                  value={newDate}
                  onChangeText={setNewDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                  accessibilityLabel="Performance date"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>Venue</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                  value={newVenue}
                  onChangeText={setNewVenue}
                  placeholder="Venue name"
                  placeholderTextColor={colors.textSecondary}
                  accessibilityLabel="Venue"
                />
              </View>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => { setShowCreate(false); setNewName(''); setNewDescription(''); setNewDate(''); setNewVenue(''); }}
                disabled={creating}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.5}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleCreate}
                disabled={creating || !newName.trim()}
                accessibilityRole="button"
                accessibilityLabel="Create setlist"
              >
                {creating ? (
                  <ActivityIndicator color={colors.primaryText} size="small" />
                ) : (
                  <Text style={[styles.modalButtonTextWhite, { color: colors.primaryText }]} maxFontSizeMultiplier={1.5}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ActionSheet
        visible={showActions}
        title={selectedSetlist?.name}
        actions={[
          {
            label: 'Edit',
            onPress: () => navigation.navigate('SetlistDetail', { setlistId: selectedSetlist?.id, workspaceId, editing: true }),
          },
          { label: 'Duplicate', onPress: handleDuplicate },
          { label: 'Export PDF', onPress: handleExportPDF },
          { label: 'Delete', destructive: true, onPress: handleDelete },
        ]}
        onClose={() => { setShowActions(false); setSelectedSetlist(null); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  toolbar: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  searchInput: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  listContent: { padding: 12, paddingBottom: 20 },
  setlistCard: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  setlistName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  setlistMeta: { fontSize: 13, marginBottom: 6 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  previewList: { marginTop: 4 },
  previewItem: { fontSize: 13, lineHeight: 20 },
  previewMore: { fontSize: 13, fontStyle: 'italic', marginTop: 2 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 15 },
  emptyHint: { fontSize: 13, marginTop: 6, textAlign: 'center', opacity: 0.7 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 12,
    padding: 24,
    maxWidth: 500,
    width: '100%',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20 },
  modalLabel: { fontSize: 14, fontWeight: '500', marginBottom: 6 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 15, fontWeight: '600' },
  modalButtonTextWhite: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
});
