import { useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import { formatDuration } from '../../utils/formatDuration';
import { buildSetlistHTML } from '../../utils/buildSetlistHTML';
import { successNotification, mediumImpact } from '../../utils/haptics';
import DraggableList from '../../components/DraggableList';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useLayout } from '../../hooks/useLayout';
import { Ionicons } from '@expo/vector-icons';
import ErrorState from '../../components/ErrorState';
import { SkeletonList } from '../../components/SkeletonLoader';

function Badge({ label, color, bgColor }) {
  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export default function SetlistDetailScreen({ navigation, route }) {
  const { setlistId, workspaceId, editing: startEditing } = route.params;
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();
  const insets = useSafeAreaInsets();

  const [setlist, setSetlist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(startEditing || false);

  // Song picker
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [allSongs, setAllSongs] = useState([]);
  const [songSearch, setSongSearch] = useState('');
  const [loadingSongs, setLoadingSongs] = useState(false);

  // Edit details modal
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [editName, setEditName] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  // Performers
  const [performers, setPerformers] = useState([]);
  const [bandMembers, setBandMembers] = useState([]);
  const [showPerformerPicker, setShowPerformerPicker] = useState(false);
  const [selectedPerformerIds, setSelectedPerformerIds] = useState([]);
  const [savingPerformers, setSavingPerformers] = useState(false);

  const loadSetlist = useCallback(async () => {
    setLoadError(null);
    try {
      const [data, perfs] = await Promise.all([
        api.getSetlist(setlistId),
        api.getSetlistPerformers(setlistId).catch(() => []),
      ]);
      setSetlist(data);
      setPerformers(perfs);
    } catch (err) {
      setLoadError(err.message || 'Failed to load setlist');
    } finally {
      setLoading(false);
    }
  }, [setlistId]);

  useEffect(() => {
    loadSetlist();
  }, [loadSetlist]);

  useLayoutEffect(() => {
    if (setlist) {
      navigation.setOptions({ title: setlist.name || 'Setlist' });
    }
  }, [navigation, setlist]);

  // Export PDF
  const handleExportPDF = useCallback(async () => {
    try {
      let venueLogoUrl = null;
      if (setlist?.venue) {
        try {
          const venues = await api.getVenues(workspaceId);
          const match = venues.find(v => v.name === setlist.venue);
          if (match?.imageUrl) venueLogoUrl = match.imageUrl;
        } catch (e) {
          console.error('Failed to fetch venue logo for setlist print:', e);
        }
      }
      const html = buildSetlistHTML(setlist?.name || 'Setlist', setlist?.songs || [], { venueLogoUrl });
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export Setlist' });
    } catch (err) {
      if (err.message !== 'User canceled') {
        Alert.alert('Error', 'Failed to export PDF');
      }
    }
  }, [setlist]);

  // Header buttons
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity
            onPress={handleExportPDF}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Export setlist as PDF"
          >
            <Ionicons name="download-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setEditing(prev => !prev)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={editing ? 'Done editing' : 'Edit setlist'}
          >
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>
              {editing ? 'Done' : 'Edit'}
            </Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, editing, colors.primary, handleExportPDF]);

  const items = setlist?.songs || [];
  const songItems = items.filter(s => s.type === 'SONG' || (!s.type && s.song));
  const setBreaks = items.filter(s => s.type === 'SET_BREAK');
  // Count only breaks that actually separate sets (skip leading breaks before any content)
  const firstContentIdx = items.findIndex(s => s.type !== 'SET_BREAK');
  const effectiveBreaks = firstContentIdx >= 0
    ? items.filter((s, i) => s.type === 'SET_BREAK' && i > firstContentIdx).length
    : 0;
  const totalDuration = items.reduce((sum, s) => sum + (s.song?.duration || s.duration || 0), 0);

  // Reorder (arrow buttons - used in non-drag mode)
  const moveItem = useCallback(async (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= items.length) return;
    const newItems = [...items];
    const temp = newItems[index];
    newItems[index] = newItems[newIndex];
    newItems[newIndex] = temp;
    setSetlist(prev => ({ ...prev, songs: newItems }));
    try {
      await api.reorderSetlistItems(setlistId, newItems.map(i => i.id));
    } catch (err) {
      loadSetlist(); // revert on error
    }
  }, [items, setlistId, loadSetlist]);

  // Drag-and-drop reorder
  const handleDragReorder = useCallback(async (newItems) => {
    setSetlist(prev => ({ ...prev, songs: newItems }));
    try {
      await api.reorderSetlistItems(setlistId, newItems.map(i => i.id));
    } catch (err) {
      loadSetlist(); // revert on error
    }
  }, [setlistId, loadSetlist]);

  const removeItem = useCallback(async (item) => {
    mediumImpact();
    setSetlist(prev => ({
      ...prev,
      songs: prev.songs.filter(s => s.id !== item.id),
    }));
    try {
      await api.removeSetlistItem(setlistId, item.id);
    } catch (err) {
      Alert.alert('Error', 'Failed to remove item');
      loadSetlist();
    }
  }, [setlistId, loadSetlist]);

  // Add song
  const openSongPicker = useCallback(async () => {
    setShowSongPicker(true);
    setSongSearch('');
    setLoadingSongs(true);
    try {
      const songs = await api.getSongs(workspaceId);
      setAllSongs(songs);
    } catch (err) {
      // silently fail
    } finally {
      setLoadingSongs(false);
    }
  }, [workspaceId]);

  const addSong = useCallback(async (song) => {
    setShowSongPicker(false);
    try {
      await api.addSongToSetlist(setlistId, song.id);
      mediumImpact();
      loadSetlist();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to add song');
    }
  }, [setlistId, loadSetlist]);

  const addSetBreak = useCallback(async () => {
    try {
      await api.addSetBreakToSetlist(setlistId);
      loadSetlist();
    } catch (err) {
      Alert.alert('Error', 'Failed to add set break');
    }
  }, [setlistId, loadSetlist]);

  const addMC = useCallback(async () => {
    try {
      await api.addMCToSetlist(setlistId);
      loadSetlist();
    } catch (err) {
      Alert.alert('Error', 'Failed to add MC');
    }
  }, [setlistId, loadSetlist]);

  // Edit details
  const openEditDetails = useCallback(() => {
    setEditName(setlist?.name || '');
    setEditVenue(setlist?.venue || '');
    setShowEditDetails(true);
  }, [setlist]);

  const saveDetails = useCallback(async () => {
    if (!editName.trim()) {
      Alert.alert('Required', 'Setlist name is required');
      return;
    }
    setSavingDetails(true);
    try {
      const updated = await api.updateSetlist(setlistId, {
        name: editName.trim(),
        venue: editVenue.trim() || null,
      });
      setSetlist(updated);
      successNotification();
      setShowEditDetails(false);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update setlist');
    } finally {
      setSavingDetails(false);
    }
  }, [setlistId, editName, editVenue]);

  // Performers
  const openPerformerPicker = useCallback(async () => {
    setSelectedPerformerIds(performers.map(p => p.bandMemberId || p.id));
    setShowPerformerPicker(true);
    try {
      const members = await api.getBandMembers(workspaceId);
      setBandMembers(members.filter(m => m.status === 'CURRENT'));
    } catch (err) {
      // silently fail
    }
  }, [performers, workspaceId]);

  const togglePerformer = useCallback((memberId) => {
    setSelectedPerformerIds(prev =>
      prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]
    );
  }, []);

  const savePerformers = useCallback(async () => {
    setSavingPerformers(true);
    try {
      await api.updateSetlistPerformers(setlistId, selectedPerformerIds);
      const perfs = await api.getSetlistPerformers(setlistId);
      setPerformers(perfs);
      setShowPerformerPicker(false);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update performers');
    } finally {
      setSavingPerformers(false);
    }
  }, [setlistId, selectedPerformerIds]);

  // Songs already in setlist (for filtering picker)
  const existingSongIds = useMemo(
    () => new Set(songItems.map(s => s.song?.id).filter(Boolean)),
    [songItems]
  );
  const filteredPickerSongs = useMemo(() => allSongs.filter(s => {
    if (existingSongIds.has(s.id)) return false;
    if (!songSearch.trim()) return true;
    const q = songSearch.toLowerCase();
    return s.title?.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q);
  }), [allSongs, existingSongIds, songSearch]);

  // Render function for standard FlatList (view mode) and draggable (edit mode)
  const renderSetlistItem = useCallback(({ item, index, isDragItem = false }) => {
    // Determine if we need a set header above this item
    let setHeader = null;
    if (item.type !== 'SET_BREAK') {
      // Count set breaks before this index to determine the set number
      // Skip leading breaks (before any content) — they don't separate sets
      let setNumber = 1;
      let hasContent = false;
      for (let i = 0; i < index; i++) {
        if (items[i].type !== 'SET_BREAK') hasContent = true;
        if (items[i].type === 'SET_BREAK' && hasContent) setNumber++;
      }
      // Show header if this is the first item, or the previous item was a set break
      const isFirstItem = index === 0;
      const prevIsBreak = index > 0 && items[index - 1].type === 'SET_BREAK';
      if (isFirstItem || prevIsBreak) {
        setHeader = (
          <View style={styles.setHeaderRow}>
            <View style={[styles.setHeaderLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.setHeaderText, { color: colors.primary }]}>Set {setNumber}</Text>
            <View style={[styles.setHeaderLine, { backgroundColor: colors.border }]} />
          </View>
        );
      }
    }

    if (item.type === 'SET_BREAK') {
      return (
        <View style={[styles.setBreakRow, { borderColor: colors.border }]}>
          <Text style={[styles.setBreakText, { color: colors.textSecondary }]}>
            {item.label || 'Break'}
          </Text>
          {editing && (
            <TouchableOpacity onPress={() => removeItem(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={`Remove ${item.label || 'break'}`}>
              <Text style={styles.removeText}>{'\u2715'}</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (item.type === 'MC') {
      return (
        <>
          {!isDragItem && setHeader}
          <View style={[styles.itemRow, { backgroundColor: colors.bgSecondary }]}>
            <Ionicons name="mic-outline" size={16} color={colors.textSecondary} style={styles.mcIcon} />
            <View style={styles.itemContent}>
              <Text style={[styles.mcLabel, { color: colors.textSecondary }]}>
                {item.label || 'MC'}
              </Text>
            </View>
            {item.duration ? (
              <Text style={[styles.itemDuration, { color: colors.textSecondary }]}>
                {formatDuration(item.duration)}
              </Text>
            ) : null}
            {editing && (
              <TouchableOpacity onPress={() => removeItem(item)} style={styles.removeButton} accessibilityRole="button" accessibilityLabel="Remove MC">
                <Text style={styles.removeText}>{'\u2715'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      );
    }

    // Song item
    // Calculate song number (count of SONG items up to this index)
    let songNumber = 0;
    for (let i = 0; i <= index; i++) {
      const s = items[i];
      if (s.type === 'SONG' || (!s.type && s.song)) songNumber++;
    }

    return (
      <>
        {!isDragItem && setHeader}
        <View style={[styles.itemRow, { backgroundColor: colors.bgSecondary }]} accessible accessibilityLabel={`${songNumber}. ${item.song?.title || 'Unknown'}${item.song?.artist ? ` by ${item.song.artist}` : ''}`} accessibilityHint={editing ? 'Drag to reorder' : undefined}>
          <Text style={[styles.songNumber, { color: colors.textSecondary }]}>{songNumber}</Text>
          <View style={styles.itemContent}>
            <Text style={[styles.songTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.song?.title || 'Unknown'}
            </Text>
            {item.song?.artist ? (
              <Text style={[styles.songArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.song.artist}
              </Text>
            ) : null}
          </View>
          {item.song?.key ? (
            <Badge label={item.song.key} color={colors.badgeKey} bgColor={colors.badgeKeyBg} />
          ) : null}
          {item.song?.duration ? (
            <Text style={[styles.itemDuration, { color: colors.textSecondary }]}>
              {formatDuration(item.song.duration)}
            </Text>
          ) : null}
          {editing && (
            <TouchableOpacity onPress={() => removeItem(item)} style={styles.removeButton} accessibilityRole="button" accessibilityLabel={`Remove ${item.song?.title || 'song'}`}>
              <Text style={styles.removeText}>{'\u2715'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </>
    );
  }, [colors, editing, items, removeItem]);

  const renderItem = useCallback(({ item, index }) => {
    return renderSetlistItem({ item, index });
  }, [renderSetlistItem]);

  const renderDraggableItem = useCallback(({ item, index }) => {
    return renderSetlistItem({ item, index, isDragItem: true });
  }, [renderSetlistItem]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}>
        <SkeletonList count={3} lines={3} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}>
        <ErrorState iconName="list-outline" title="Couldn't load setlist" message={loadError} onRetry={loadSetlist} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}>
      {/* Stats header */}
      <View style={styles.statsRow}>
        <Badge label={`${songItems.length} songs`} color={colors.badgeBpm} bgColor={colors.badgeBpmBg} />
        {effectiveBreaks > 0 && (
          <Badge label={`${effectiveBreaks + 1} sets`} color={colors.badgeKey} bgColor={colors.badgeKeyBg} />
        )}
        {totalDuration > 0 && (
          <Badge label={formatDuration(totalDuration)} color={colors.badgeDuration} bgColor={colors.badgeDurationBg} />
        )}
        {setlist?.venue && (
          <Badge label={setlist.venue} color={colors.badgeVenue} bgColor="rgba(251,191,36,0.15)" />
        )}
        {editing && (
          <TouchableOpacity onPress={openEditDetails} accessibilityRole="button" accessibilityLabel="Edit setlist details">
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Edit Details</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Live Mode button */}
      {!editing && items.length > 0 && (
        <TouchableOpacity
          style={styles.liveModeButton}
          onPress={() => navigation.navigate('LiveMode', { setlistItems: items, setlistName: setlist?.name || 'Setlist' })}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Start live mode"
        >
          <Text style={styles.liveModeButtonText}>Live Mode</Text>
        </TouchableOpacity>
      )}

      {/* Performers */}
      {(performers.length > 0 || editing) && (
        <View style={styles.performersSection}>
          <View style={styles.performersHeader}>
            <Text style={[styles.performersLabel, { color: colors.textSecondary }]}>Performers</Text>
            {editing && (
              <TouchableOpacity onPress={openPerformerPicker} accessibilityRole="button" accessibilityLabel={performers.length > 0 ? 'Edit performers' : 'Add performers'}>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
                  {performers.length > 0 ? 'Edit' : '+ Add'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {performers.length > 0 ? (
            <View style={styles.performerChips}>
              {performers.map(p => (
                <View key={p.bandMemberId || p.id} style={[styles.performerChip, { backgroundColor: colors.bgSecondary }]}>
                  <Text style={[styles.performerName, { color: colors.textPrimary }]}>
                    {p.bandMember?.name || p.name || 'Unknown'}
                  </Text>
                </View>
              ))}
            </View>
          ) : editing ? (
            <Text style={[styles.noPerformers, { color: colors.textSecondary }]}>No performers assigned</Text>
          ) : null}
        </View>
      )}

      {/* Setlist items */}
      {editing ? (
        <ScrollView contentContainerStyle={[styles.listContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
          {items.length === 0 ? (
            <View style={styles.centered}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No songs in this setlist
              </Text>
            </View>
          ) : (
            <DraggableList
              items={items}
              keyExtractor={(item) => item.id}
              renderItem={renderDraggableItem}
              onReorder={handleDragReorder}
              itemHeight={56}
            />
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="list-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 12 }} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No songs in this setlist
              </Text>
              <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                Switch to edit mode to add songs
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => { setEditing(true); openSongPicker(); }}
                accessibilityRole="button"
                accessibilityLabel="Add song to setlist"
              >
                <Text style={styles.emptyButtonText}>+ Add Song</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Edit mode toolbar */}
      {editing && (
        <View style={[styles.editToolbar, { backgroundColor: colors.bgSecondary, borderTopColor: colors.border, paddingBottom: insets.bottom + 10 }]}>
          <TouchableOpacity style={[styles.toolbarButton, { backgroundColor: colors.primary }]} onPress={openSongPicker} accessibilityRole="button" accessibilityLabel="Add song" accessibilityHint="Add a song to this setlist">
            <Text style={styles.toolbarButtonText}>+ Song</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toolbarButton, { backgroundColor: colors.bgTertiary }]} onPress={addSetBreak} accessibilityRole="button" accessibilityLabel="Add set break" accessibilityHint="Add a set break">
            <Text style={[styles.toolbarButtonTextDark, { color: colors.textPrimary }]}>+ Set Break</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toolbarButton, { backgroundColor: colors.bgTertiary }]} onPress={addMC} accessibilityRole="button" accessibilityLabel="Add MC">
            <Text style={[styles.toolbarButtonTextDark, { color: colors.textPrimary }]}>+ MC</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Song Picker Modal */}
      <Modal visible={showSongPicker} animationType="slide" onRequestClose={() => setShowSongPicker(false)}>
        <SafeAreaView style={[styles.pickerContainer, { backgroundColor: colors.bgPrimary }]}>
          <View style={[styles.pickerHeader, { backgroundColor: colors.bgSecondary }]}>
            <TouchableOpacity onPress={() => setShowSongPicker(false)} accessibilityRole="button" accessibilityLabel="Cancel adding song">
              <Text style={{ color: colors.primary, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.pickerTitle, { color: colors.textPrimary }]} accessibilityRole="header">Add Song</Text>
            <View style={{ width: 60 }} />
          </View>
          <TextInput
            style={[styles.pickerSearch, { backgroundColor: colors.bgTertiary, color: colors.textPrimary }]}
            placeholder="Search songs..."
            placeholderTextColor={colors.textSecondary}
            value={songSearch}
            onChangeText={setSongSearch}
            autoFocus
            accessibilityLabel="Search songs"
          />
          {loadingSongs ? (
            <ActivityIndicator style={{ marginTop: 40 }} size="large" color={colors.primary} />
          ) : (
            <FlatList
              data={filteredPickerSongs}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ paddingBottom: 120 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                  onPress={() => addSong(item)}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${item.title}${item.artist ? ` by ${item.artist}` : ''}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickerSongTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.artist ? (
                      <Text style={[styles.pickerSongArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.artist}
                      </Text>
                    ) : null}
                  </View>
                  {item.key ? (
                    <Badge label={item.key} color={colors.badgeKey} bgColor={colors.badgeKeyBg} />
                  ) : null}
                  {item.duration ? (
                    <Text style={[styles.pickerDuration, { color: colors.textSecondary }]}>
                      {formatDuration(item.duration)}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: colors.textSecondary, textAlign: 'center', marginTop: 40 }]}>
                  {songSearch ? 'No matching songs' : 'All songs already added'}
                </Text>
              }
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Performer Picker Modal */}
      <Modal visible={showPerformerPicker} transparent animationType="fade" onRequestClose={() => setShowPerformerPicker(false)}>
        <View style={styles.detailsOverlay}>
          <View style={[styles.detailsContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.detailsTitle, { color: colors.textPrimary }]} accessibilityRole="header">Select Performers</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {bandMembers.map(member => {
                const selected = selectedPerformerIds.includes(member.id);
                return (
                  <TouchableOpacity
                    key={member.id}
                    style={[styles.performerPickerRow, selected && { backgroundColor: colors.bgTertiary }]}
                    onPress={() => togglePerformer(member.id)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={`${member.name}${selected ? ', selected' : ''}`}
                  >
                    <View style={[styles.performerCheckbox, { borderColor: colors.border, backgroundColor: selected ? colors.primary : 'transparent' }]}>
                      {selected && <Text style={styles.performerCheckmark}>{'\u2713'}</Text>}
                    </View>
                    <Text style={[styles.performerPickerName, { color: colors.textPrimary }]}>{member.name}</Text>
                    {member.instruments && member.instruments.length > 0 && (
                      <Text style={[styles.performerInstrument, { color: colors.textSecondary }]}>
                        {member.instruments.join(', ')}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
              {bandMembers.length === 0 && (
                <Text style={[styles.noPerformers, { color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 }]}>
                  No band members found
                </Text>
              )}
            </ScrollView>
            <View style={styles.detailsActions}>
              <TouchableOpacity
                style={[styles.detailsButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => setShowPerformerPicker(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.detailsButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.detailsButton, { backgroundColor: colors.primary }, savingPerformers && { opacity: 0.5 }]}
                onPress={savePerformers}
                disabled={savingPerformers}
                accessibilityRole="button"
                accessibilityLabel="Save performers"
              >
                {savingPerformers ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.detailsButtonTextWhite}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Details Modal */}
      <Modal visible={showEditDetails} transparent animationType="fade" onRequestClose={() => setShowEditDetails(false)}>
        <View style={styles.detailsOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.detailsContent, { backgroundColor: colors.modalBg }]}>
              <Text style={[styles.detailsTitle, { color: colors.textPrimary }]} accessibilityRole="header">Edit Details</Text>
              <Text style={[styles.detailsLabel, { color: colors.textSecondary }]}>Name</Text>
              <TextInput
                style={[styles.detailsInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={editName}
                onChangeText={setEditName}
                autoFocus
                accessibilityLabel="Setlist name"
              />
              <Text style={[styles.detailsLabel, { color: colors.textSecondary }]}>Venue</Text>
              <TextInput
                style={[styles.detailsInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={editVenue}
                onChangeText={setEditVenue}
                placeholder="Venue name"
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel="Venue name"
              />
              <View style={styles.detailsActions}>
                <TouchableOpacity
                  style={[styles.detailsButton, { backgroundColor: colors.bgTertiary }]}
                  onPress={() => setShowEditDetails(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={[styles.detailsButtonText, { color: colors.textPrimary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.detailsButton, { backgroundColor: colors.primary }, savingDetails && { opacity: 0.5 }]}
                  onPress={saveDetails}
                  disabled={savingDetails}
                  accessibilityRole="button"
                  accessibilityLabel="Save details"
                >
                  {savingDetails ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.detailsButtonTextWhite}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  liveModeButton: {
    marginHorizontal: 14,
    marginBottom: 8,
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  liveModeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  listContent: { paddingHorizontal: 8, paddingBottom: 80 },
  // Item rows
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 2,
    borderRadius: 8,
    gap: 8,
  },
  songNumber: { width: 24, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  itemContent: { flex: 1 },
  songTitle: { fontSize: 15, fontWeight: '600' },
  songArtist: { fontSize: 13, marginTop: 1 },
  itemDuration: { fontSize: 13, marginLeft: 8 },
  mcIcon: { fontSize: 16, width: 24, textAlign: 'center' },
  mcLabel: { fontSize: 14, fontStyle: 'italic' },
  // Set break
  setBreakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginVertical: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    gap: 12,
  },
  setBreakText: { fontSize: 13, fontWeight: '600' },
  // Set header
  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 10,
  },
  setHeaderLine: { flex: 1, height: 1 },
  setHeaderText: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  // Reorder
  reorderButtons: { marginRight: 4 },
  reorderArrow: { fontSize: 12, padding: 4 },
  removeButton: { marginLeft: 4, padding: 4 },
  removeText: { color: '#ef4444', fontSize: 16, fontWeight: '700' },
  // Edit toolbar
  editToolbar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  toolbarButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  toolbarButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  toolbarButtonTextDark: { fontSize: 14, fontWeight: '600' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 15 },
  emptyHint: { fontSize: 13, marginTop: 6, textAlign: 'center', opacity: 0.7 },
  emptyButton: { backgroundColor: '#16a34a', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 16 },
  emptyButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  // Song picker
  pickerContainer: { flex: 1 },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  pickerTitle: { fontSize: 17, fontWeight: '700' },
  pickerSearch: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  pickerSongTitle: { fontSize: 15, fontWeight: '600' },
  pickerSongArtist: { fontSize: 13, marginTop: 1 },
  pickerDuration: { fontSize: 13, marginLeft: 8 },
  // Edit details modal
  detailsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  detailsContent: {
    borderRadius: 12,
    padding: 24,
  },
  detailsTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20 },
  detailsLabel: { fontSize: 14, fontWeight: '500', marginBottom: 6 },
  detailsInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  detailsActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  detailsButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  detailsButtonText: { fontSize: 15, fontWeight: '600' },
  detailsButtonTextWhite: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
  // Performers
  performersSection: { paddingHorizontal: 14, paddingBottom: 8 },
  performersHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  performersLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  performerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  performerChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  performerName: { fontSize: 13, fontWeight: '600' },
  noPerformers: { fontSize: 13 },
  performerPickerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8, gap: 10 },
  performerCheckbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  performerCheckmark: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  performerPickerName: { fontSize: 15, fontWeight: '600', flex: 1 },
  performerInstrument: { fontSize: 13 },
});
