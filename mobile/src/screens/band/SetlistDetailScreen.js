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
import { formatDuration } from '../../utils/formatDuration';

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

  // Performers
  const [performers, setPerformers] = useState([]);
  const [bandMembers, setBandMembers] = useState([]);
  const [showPerformerPicker, setShowPerformerPicker] = useState(false);
  const [selectedPerformerIds, setSelectedPerformerIds] = useState([]);
  const [savingPerformers, setSavingPerformers] = useState(false);

  const loadSetlist = useCallback(async () => {
    try {
      const [data, perfs] = await Promise.all([
        api.getSetlist(setlistId),
        api.getSetlistPerformers(setlistId).catch(() => []),
      ]);
      setSetlist(data);
      setPerformers(perfs);
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
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Done editing' : 'Edit setlist'}
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

  // Performers
  const openPerformerPicker = useCallback(async () => {
    setSelectedPerformerIds(performers.map(p => p.bandMemberId || p.id));
    setShowPerformerPicker(true);
    try {
      const members = await api.getBandMembers(workspaceId);
      setBandMembers(members.filter(m => m.status === 'CURRENT'));
    } catch (err) {
      console.error('Failed to load band members:', err);
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

  const renderItem = useCallback(({ item, index }) => {
    // Determine if we need a set header above this item
    let setHeader = null;
    if (item.type !== 'SET_BREAK') {
      // Count set breaks before this index to determine the set number
      let setNumber = 1;
      for (let i = 0; i < index; i++) {
        if (items[i].type === 'SET_BREAK') setNumber++;
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
          {setHeader}
          <View style={[styles.itemRow, { backgroundColor: colors.bgSecondary }]}>
            {editing && (
              <View style={styles.reorderButtons}>
                <TouchableOpacity onPress={() => moveItem(index, -1)} disabled={index === 0} accessibilityRole="button" accessibilityLabel="Move MC up">
                  <Text style={[styles.reorderArrow, { color: index === 0 ? colors.border : colors.textSecondary }]}>{'\u25B2'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => moveItem(index, 1)} disabled={index === items.length - 1} accessibilityRole="button" accessibilityLabel="Move MC down">
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
        {setHeader}
        <View style={[styles.itemRow, { backgroundColor: colors.bgSecondary }]}>
          {editing && (
            <View style={styles.reorderButtons}>
              <TouchableOpacity onPress={() => moveItem(index, -1)} disabled={index === 0} accessibilityRole="button" accessibilityLabel={`Move ${item.song?.title || 'song'} up`}>
                <Text style={[styles.reorderArrow, { color: index === 0 ? colors.border : colors.textSecondary }]}>{'\u25B2'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => moveItem(index, 1)} disabled={index === items.length - 1} accessibilityRole="button" accessibilityLabel={`Move ${item.song?.title || 'song'} down`}>
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
            <TouchableOpacity onPress={() => removeItem(item)} style={styles.removeButton} accessibilityRole="button" accessibilityLabel={`Remove ${item.song?.title || 'song'}`}>
              <Text style={styles.removeText}>{'\u2715'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </>
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
          <TouchableOpacity onPress={openEditDetails} accessibilityRole="button" accessibilityLabel="Edit setlist details">
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Edit Details</Text>
          </TouchableOpacity>
        )}
      </View>

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
          <TouchableOpacity style={[styles.toolbarButton, { backgroundColor: colors.primary }]} onPress={openSongPicker} accessibilityRole="button" accessibilityLabel="Add song">
            <Text style={styles.toolbarButtonText}>+ Song</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toolbarButton, { backgroundColor: colors.bgTertiary }]} onPress={addSetBreak} accessibilityRole="button" accessibilityLabel="Add set break">
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
                style={[styles.detailsButton, { backgroundColor: colors.primary }]}
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
                  style={[styles.detailsButton, { backgroundColor: colors.primary }]}
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
