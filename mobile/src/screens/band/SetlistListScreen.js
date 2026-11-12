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
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import Badge from '../../components/Badge';
import { SkeletonList } from '../../components/SkeletonLoader';
import { successNotification, selectionFeedback } from '../../utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import ErrorState from '../../components/ErrorState';
import PressableRow from '../../components/PressableRow';
import ActionSheet from '../../components/ActionSheet';
import useDebounce from '../../hooks/useDebounce';
import api from '../../services/api';
import { computeSetlistDuration, formatSetlistDuration, getEffectiveSetBreakCount } from '../../utils/setlistDuration';
import { buildSetlistHTML } from '../../utils/buildSetlistHTML';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useLayout } from '../../hooks/useLayout';
import OptionalDateField from '../../components/OptionalDateField';
import VenueField from '../../components/VenueField';
import { useToast } from '../../context/ToastContext';
import { MIN_TOUCH_TARGET } from '../../utils/touchTarget';
import { formatDateOnly, toDateOnlyString } from '../../utils/formatDate';

export default function SetlistListScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();
  const toast = useToast();

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
  const [newDate, setNewDate] = useState(null); // local Date or null
  const [newVenue, setNewVenue] = useState('');
  const [creating, setCreating] = useState(false);

  // Action sheet
  const [selectedSetlist, setSelectedSetlist] = useState(null);
  const [showActions, setShowActions] = useState(false);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // loadSetlists is memoized on workspaceId only, so it can't read `setlists`
  // directly (it would always see the first render's empty array, and a failed
  // background refresh would replace a loaded list with the error screen).
  const hasSetlistsRef = useRef(false);
  useEffect(() => { hasSetlistsRef.current = setlists.length > 0; }, [setlists]);

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
      if (!hasSetlistsRef.current) setError(err.message || 'Failed to load setlists');
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

  const resetCreateForm = useCallback(() => {
    setNewName('');
    setNewDescription('');
    setNewDate(null);
    setNewVenue('');
  }, []);

  // A new setlist opens straight into edit mode with the song picker up. On
  // iOS that picker is itself a modal, and iOS can't present a modal while the
  // create sheet is still animating away — so navigate from the sheet's
  // onDismiss there. Android has no such restriction.
  const pendingCreatedIdRef = useRef(null);
  const openCreatedSetlist = useCallback((setlistId) => {
    if (Platform.OS === 'ios') {
      pendingCreatedIdRef.current = setlistId;
      setShowCreate(false);
    } else {
      setShowCreate(false);
      navigation.navigate('SetlistDetail', { setlistId, workspaceId, editing: true, addSongs: true });
    }
  }, [navigation, workspaceId]);
  const handleCreateSheetDismissed = useCallback(() => {
    const setlistId = pendingCreatedIdRef.current;
    if (!setlistId) return;
    pendingCreatedIdRef.current = null;
    navigation.navigate('SetlistDetail', { setlistId, workspaceId, editing: true, addSongs: true });
  }, [navigation, workspaceId]);

  const cancelCreate = useCallback(() => {
    setShowCreate(false);
    resetCreateForm();
  }, [resetCreateForm]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await api.createSetlist(workspaceId, {
        name,
        description: newDescription.trim() || null,
        performedAt: toDateOnlyString(newDate),
        venue: newVenue.trim() || null,
      });
      successNotification();
      resetCreateForm();
      openCreatedSetlist(created.id);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create setlist');
    } finally {
      setCreating(false);
    }
  }, [newName, newDescription, newDate, newVenue, workspaceId, resetCreateForm, openCreatedSetlist]);

  const handleDuplicate = useCallback(async () => {
    if (!selectedSetlist) return;
    try {
      const copy = await api.duplicateSetlist(selectedSetlist.id);
      successNotification();
      toast.success(`Duplicated as "${copy?.name || `Copy of ${selectedSetlist.name}`}"`);
      loadSetlists();
    } catch (err) {
      Alert.alert("Couldn't duplicate", err.message || 'Failed to duplicate setlist');
    }
    setShowActions(false);
    setSelectedSetlist(null);
  }, [selectedSetlist, loadSetlists, toast]);

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
          const wanted = selectedSetlist.venue.trim().toLowerCase();
          const match = venues.find(v => v.name?.trim().toLowerCase() === wanted);
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
      const html = buildSetlistHTML(selectedSetlist.name, items, {
        venueLogoUrl,
        transitionPaddingSecs,
        notes,
        // Header shows the performance date (as the web export does), not today.
        date: selectedSetlist.performedAt ? formatDateOnly(selectedSetlist.performedAt, 'EEEE, dd-MMM-yyyy') : undefined,
      });
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export Setlist' });
    } catch (err) {
      // Tolerant of whichever cancel phrasing the platform/SDK actually
      // throws — see SongListScreen.js's identical PDF-export catch for why.
      if (!/cancel|did not share/i.test(err.message || '')) {
        Alert.alert('Error', 'Failed to export PDF');
      }
    }
    setShowActions(false);
    setSelectedSetlist(null);
  }, [selectedSetlist, workspaceId, transitionPaddingSecs]);

  const openActions = useCallback((item) => {
    selectionFeedback();
    setSelectedSetlist(item);
    setShowActions(true);
  }, []);

  const renderSetlist = useCallback(({ item }) => {
    const songs = (item.songs || []).filter(s => s.type === 'SONG' || (!s.type && s.song));
    const songCount = songs.length;
    const effectiveBreaks = getEffectiveSetBreakCount(item.songs || []);
    const setCount = effectiveBreaks + 1;
    const { actualSecs: totalActualSecs, paddedSecs: totalPaddedSecs, paddingSecs: itemPaddingSecs } = computeSetlistDuration(item.songs, transitionPaddingSecs);
    const itemHasPadding = itemPaddingSecs > 0 && totalPaddedSecs !== totalActualSecs;
    const preview = songs.slice(0, 4).map((s, i) => s.song?.title || s.label || `Song ${i + 1}`);
    const remaining = songCount - preview.length;

    return (
      <PressableRow
        style={[styles.setlistCard, { backgroundColor: colors.bgSecondary }]}
        onPress={() => navigation.navigate('SetlistDetail', { setlistId: item.id, workspaceId })}
        onLongPress={() => openActions(item)}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}${songCount > 0 ? `, ${songCount} songs` : ''}`}
        accessibilityActions={[{ name: 'more', label: 'More options' }]}
        onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'more') openActions(item); }}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.setlistName, { color: colors.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.5}>
            {item.name}
          </Text>
          <Pressable
            onPress={() => openActions(item)}
            hitSlop={6}
            style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
        {(item.performedAt || item.venue) && (
          <Text style={[styles.setlistMeta, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.5}>
            {item.performedAt ? formatDateOnly(item.performedAt) : ''}
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
  }, [colors, navigation, workspaceId, transitionPaddingSecs, openActions]);

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
              <>
                <Text style={[styles.emptyHint, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>
                  Build the running order for a gig or rehearsal, then take it on stage with Live Mode.
                </Text>
                <Pressable
                  onPress={() => setShowCreate(true)}
                  style={({ pressed }) => [styles.emptyButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Create setlist"
                >
                  <Text style={[styles.emptyButtonText, { color: colors.primaryText }]} maxFontSizeMultiplier={1.5}>+ New Setlist</Text>
                </Pressable>
              </>
            )}
          </View>
        }
      />

      {/* Create Setlist sheet: a native page sheet on iOS (swipe down to
          dismiss keeps the draft; Cancel clears it), full-screen on Android. */}
      <Modal
        visible={showCreate}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { if (!creating) setShowCreate(false); }}
        onDismiss={handleCreateSheetDismissed}
      >
        <KeyboardAvoidingView
          style={[styles.sheet, { backgroundColor: colors.bgPrimary }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          accessibilityViewIsModal
        >
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <Pressable
              onPress={cancelCreate}
              disabled={creating}
              hitSlop={8}
              style={({ pressed }) => [styles.sheetHeaderButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.sheetHeaderText, { color: colors.primary }]} maxFontSizeMultiplier={1.4}>Cancel</Text>
            </Pressable>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]} accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.4}>
              New Setlist
            </Text>
            <Pressable
              onPress={handleCreate}
              disabled={creating || !newName.trim()}
              hitSlop={8}
              style={({ pressed }) => [styles.sheetHeaderButton, styles.sheetHeaderButtonRight, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Create setlist"
              accessibilityState={{ disabled: creating || !newName.trim(), busy: creating }}
            >
              {creating ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text
                  style={[styles.sheetHeaderText, styles.sheetHeaderTextBold, { color: newName.trim() ? colors.primary : colors.textSecondary }]}
                  maxFontSizeMultiplier={1.4}
                >
                  Create
                </Text>
              )}
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.sheetBody}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>Name</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Friday at The Crown"
              placeholderTextColor={colors.textSecondary}
              autoFocus
              maxLength={200}
              returnKeyType="done"
              enablesReturnKeyAutomatically
              onSubmitEditing={() => { if (newName.trim() && !creating) handleCreate(); }}
              accessibilityLabel="Setlist name, required"
            />
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>Date</Text>
            <View style={styles.dateField}>
              <OptionalDateField value={newDate} onChange={setNewDate} label="Performance date" />
            </View>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>Venue</Text>
            <VenueField
              workspaceId={workspaceId}
              value={newVenue}
              onChangeText={setNewVenue}
              inputStyle={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            />
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>Description</Text>
            <TextInput
              style={[styles.modalInput, styles.multilineInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Optional"
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={5000}
              accessibilityLabel="Setlist description"
            />
          </ScrollView>
        </KeyboardAvoidingView>
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
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginTop: -10, marginRight: -10 },
  setlistName: { flex: 1, fontSize: 16, fontWeight: '700', marginTop: 10, marginBottom: 2 },
  moreButton: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  setlistMeta: { fontSize: 13, marginBottom: 6 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  previewList: { marginTop: 4 },
  previewItem: { fontSize: 13, lineHeight: 20 },
  previewMore: { fontSize: 13, fontStyle: 'italic', marginTop: 2 },
  emptyText: { fontSize: 15 },
  emptyHint: { fontSize: 13, marginTop: 6, textAlign: 'center', maxWidth: 280, lineHeight: 18 },
  emptyButton: { marginTop: 20, paddingHorizontal: 24, minHeight: MIN_TOUCH_TARGET, borderRadius: 10, justifyContent: 'center' },
  emptyButtonText: { fontSize: 15, fontWeight: '600' },
  // Create sheet
  sheet: { flex: 1 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetHeaderButton: { minWidth: 72, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: 8 },
  sheetHeaderButtonRight: { alignItems: 'flex-end' },
  sheetHeaderText: { fontSize: 17 },
  sheetHeaderTextBold: { fontWeight: '600' },
  sheetTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  sheetBody: { padding: 16, paddingBottom: 40 },
  multilineInput: { minHeight: 88, textAlignVertical: 'top' },
  pressed: { opacity: 0.6 },
  dateField: { marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: '500', marginBottom: 6 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
});
