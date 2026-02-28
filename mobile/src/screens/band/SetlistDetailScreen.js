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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

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

export default function SetlistDetailScreen({ navigation, route }) {
  const { setlistId, workspaceId, editing: startEditing } = route.params;
  const { colors } = useTheme();

  const [setlist, setSetlist] = useState(null);
  const [loading, setLoading] = useState(true);
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

  const loadSetlist = useCallback(async () => {
    try {
      const data = await api.getSetlist(setlistId);
      setSetlist(data);
    } catch (err) {
      console.error('Failed to load setlist:', err);
      Alert.alert('Error', 'Failed to load setlist');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [setlistId, navigation]);

  useEffect(() => {
    loadSetlist();
  }, [loadSetlist]);

  useLayoutEffect(() => {
    if (setlist) {
      navigation.setOptions({ title: setlist.name || 'Setlist' });
    }
  }, [navigation, setlist]);

  // Header buttons
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setEditing(prev => !prev)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>
            {editing ? 'Done' : 'Edit'}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, editing, colors.primary]);

  const items = setlist?.songs || [];
  const songItems = items.filter(s => s.type === 'SONG' || (!s.type && s.song));
  const setBreaks = items.filter(s => s.type === 'SET_BREAK');
  const totalDuration = items.reduce((sum, s) => sum + (s.song?.duration || s.duration || 0), 0);

  // Reorder
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

  const removeItem = useCallback(async (item) => {
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
      console.error('Failed to load songs:', err);
    } finally {
      setLoadingSongs(false);
    }
  }, [workspaceId]);

  const addSong = useCallback(async (song) => {
    setShowSongPicker(false);
    try {
      await api.addSongToSetlist(setlistId, song.id);
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
      setShowEditDetails(false);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update setlist');
    } finally {
      setSavingDetails(false);
    }
  }, [setlistId, editName, editVenue]);

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

  const renderItem = useCallback(({ item, index }) => {
    if (item.type === 'SET_BREAK') {
      return (
        <View style={[styles.setBreakRow, { borderColor: colors.border }]}>
          <Text style={[styles.setBreakText, { color: colors.primary }]}>
            {item.label || 'Set Break'}
          </Text>
          {editing && (
            <TouchableOpacity onPress={() => removeItem(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.removeText}>{'\u2715'}</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (item.type === 'MC') {
      return (
        <View style={[styles.itemRow, { backgroundColor: colors.bgSecondary }]}>
          {editing && (
            <View style={styles.reorderButtons}>
              <TouchableOpacity onPress={() => moveItem(index, -1)} disabled={index === 0}>
                <Text style={[styles.reorderArrow, { color: index === 0 ? colors.border : colors.textSecondary }]}>{'\u25B2'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => moveItem(index, 1)} disabled={index === items.length - 1}>
                <Text style={[styles.reorderArrow, { color: index === items.length - 1 ? colors.border : colors.textSecondary }]}>{'\u25BC'}</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.mcIcon}>{'\uD83C\uDFA4'}</Text>
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
            <TouchableOpacity onPress={() => removeItem(item)} style={styles.removeButton}>
              <Text style={styles.removeText}>{'\u2715'}</Text>
            </TouchableOpacity>
          )}
        </View>
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
      <View style={[styles.itemRow, { backgroundColor: colors.bgSecondary }]}>
        {editing && (
          <View style={styles.reorderButtons}>
            <TouchableOpacity onPress={() => moveItem(index, -1)} disabled={index === 0}>
              <Text style={[styles.reorderArrow, { color: index === 0 ? colors.border : colors.textSecondary }]}>{'\u25B2'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => moveItem(index, 1)} disabled={index === items.length - 1}>
              <Text style={[styles.reorderArrow, { color: index === items.length - 1 ? colors.border : colors.textSecondary }]}>{'\u25BC'}</Text>
            </TouchableOpacity>
          </View>
        )}
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
          <Badge label={item.song.key} color="#c084fc" bgColor="rgba(192,132,252,0.15)" />
        ) : null}
        {item.song?.duration ? (
          <Text style={[styles.itemDuration, { color: colors.textSecondary }]}>
            {formatDuration(item.song.duration)}
          </Text>
        ) : null}
        {editing && (
          <TouchableOpacity onPress={() => removeItem(item)} style={styles.removeButton}>
            <Text style={styles.removeText}>{'\u2715'}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [colors, editing, items, moveItem, removeItem]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Stats header */}
      <View style={styles.statsRow}>
        <Badge label={`${songItems.length} songs`} color="#60a5fa" bgColor="rgba(96,165,250,0.15)" />
        {setBreaks.length > 0 && (
          <Badge label={`${setBreaks.length + 1} sets`} color="#c084fc" bgColor="rgba(192,132,252,0.15)" />
        )}
        {totalDuration > 0 && (
          <Badge label={formatDuration(totalDuration)} color="#9ca3af" bgColor="rgba(156,163,175,0.15)" />
        )}
        {setlist?.venue && (
          <Badge label={setlist.venue} color="#fbbf24" bgColor="rgba(251,191,36,0.15)" />
        )}
        {editing && (
          <TouchableOpacity onPress={openEditDetails}>
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Edit Details</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Setlist items */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No songs in this setlist
            </Text>
          </View>
        }
      />

      {/* Edit mode toolbar */}
      {editing && (
        <View style={[styles.editToolbar, { backgroundColor: colors.bgSecondary, borderTopColor: colors.border }]}>
          <TouchableOpacity style={[styles.toolbarButton, { backgroundColor: colors.primary }]} onPress={openSongPicker}>
            <Text style={styles.toolbarButtonText}>+ Song</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toolbarButton, { backgroundColor: colors.bgTertiary }]} onPress={addSetBreak}>
            <Text style={[styles.toolbarButtonTextDark, { color: colors.textPrimary }]}>+ Set Break</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toolbarButton, { backgroundColor: colors.bgTertiary }]} onPress={addMC}>
            <Text style={[styles.toolbarButtonTextDark, { color: colors.textPrimary }]}>+ MC</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Song Picker Modal */}
      <Modal visible={showSongPicker} animationType="slide">
        <SafeAreaView style={[styles.pickerContainer, { backgroundColor: colors.bgPrimary }]}>
          <View style={[styles.pickerHeader, { backgroundColor: colors.bgSecondary }]}>
            <TouchableOpacity onPress={() => setShowSongPicker(false)}>
              <Text style={{ color: colors.primary, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>Add Song</Text>
            <View style={{ width: 60 }} />
          </View>
          <TextInput
            style={[styles.pickerSearch, { backgroundColor: colors.bgTertiary, color: colors.textPrimary }]}
            placeholder="Search songs..."
            placeholderTextColor={colors.textSecondary}
            value={songSearch}
            onChangeText={setSongSearch}
            autoFocus
          />
          {loadingSongs ? (
            <ActivityIndicator style={{ marginTop: 40 }} size="large" color={colors.primary} />
          ) : (
            <FlatList
              data={filteredPickerSongs}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                  onPress={() => addSong(item)}
                  activeOpacity={0.6}
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
                    <Badge label={item.key} color="#c084fc" bgColor="rgba(192,132,252,0.15)" />
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

      {/* Edit Details Modal */}
      <Modal visible={showEditDetails} transparent animationType="fade">
        <View style={styles.detailsOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.detailsContent, { backgroundColor: colors.modalBg }]}>
              <Text style={[styles.detailsTitle, { color: colors.textPrimary }]}>Edit Details</Text>
              <Text style={[styles.detailsLabel, { color: colors.textSecondary }]}>Name</Text>
              <TextInput
                style={[styles.detailsInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={editName}
                onChangeText={setEditName}
                autoFocus
              />
              <Text style={[styles.detailsLabel, { color: colors.textSecondary }]}>Venue</Text>
              <TextInput
                style={[styles.detailsInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={editVenue}
                onChangeText={setEditVenue}
                placeholder="Venue name"
                placeholderTextColor={colors.textSecondary}
              />
              <View style={styles.detailsActions}>
                <TouchableOpacity
                  style={[styles.detailsButton, { backgroundColor: colors.bgTertiary }]}
                  onPress={() => setShowEditDetails(false)}
                >
                  <Text style={[styles.detailsButtonText, { color: colors.textPrimary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.detailsButton, { backgroundColor: colors.primary }]}
                  onPress={saveDetails}
                  disabled={savingDetails}
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
  setBreakText: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
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
  emptyText: { fontSize: 15 },
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
  detailsActions: { flexDirection: 'row', gap: 10 },
  detailsButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  detailsButtonText: { fontSize: 15, fontWeight: '600' },
  detailsButtonTextWhite: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
});
