import { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useTheme } from '../../context/ThemeContext';
import Badge from '../../components/Badge';
import PressableRow from '../../components/PressableRow';
import api from '../../services/api';
import { formatDuration } from '../../utils/formatDuration';
import { useLayout } from '../../hooks/useLayout';

export default function MedleyDetailScreen({ navigation, route }) {
  const { medleyId, workspaceId, editing: startEditing } = route.params;
  const isNew = !medleyId;
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();
  const headerHeight = useHeaderHeight();

  const [medley, setMedley] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(isNew || startEditing);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedSongs, setSelectedSongs] = useState([]); // ordered list of song objects

  // Available songs for picker
  const [allSongs, setAllSongs] = useState([]);
  const [loadingSongs, setLoadingSongs] = useState(false);

  useEffect(() => {
    if (isNew) {
      loadAvailableSongs();
      return;
    }
    (async () => {
      try {
        const data = await api.getMedley(medleyId);
        setMedley(data);
        populateForm(data);
      } catch (err) {
        Alert.alert('Error', 'Failed to load medley');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [medleyId, isNew, navigation]);

  const loadAvailableSongs = useCallback(async () => {
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

  useEffect(() => {
    if (editing) loadAvailableSongs();
  }, [editing, loadAvailableSongs]);

  const populateForm = useCallback((data) => {
    if (!data) return;
    setName(data.name || '');
    setDescription(data.description || '');
    const songs = data.songs || data.medleySongs || [];
    const sorted = [...songs]
      .sort((a, b) => (a.position ?? a.order ?? 0) - (b.position ?? b.order ?? 0))
      .map(entry => entry.song || entry);
    setSelectedSongs(sorted);
  }, []);

  useLayoutEffect(() => {
    if (isNew) {
      navigation.setOptions({ title: 'New Medley' });
    } else if (editing) {
      navigation.setOptions({ title: 'Edit Medley' });
    } else if (medley) {
      navigation.setOptions({ title: medley.name || 'Medley' });
    }
  }, [navigation, isNew, editing, medley]);

  // Header edit button
  useLayoutEffect(() => {
    if (!isNew && !editing && !loading) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity onPress={() => setEditing(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Edit medley">
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Edit</Text>
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({ headerRight: undefined });
    }
  }, [navigation, isNew, editing, loading, colors.primary]);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Required', 'Medley name is required');
      return;
    }
    if (selectedSongs.length < 2) {
      Alert.alert('Required', 'A medley needs at least 2 songs');
      return;
    }
    setSaving(true);
    const data = {
      name: trimmedName,
      description: description.trim() || null,
      songIds: selectedSongs.map(s => s.id),
    };
    try {
      if (isNew) {
        const created = await api.createMedley(workspaceId, data);
        setMedley(created);
        populateForm(created);
        setEditing(false);
        navigation.setParams({ medleyId: created.id });
      } else {
        const updated = await api.updateMedley(medleyId, data);
        setMedley(updated);
        populateForm(updated);
        setEditing(false);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save medley');
    } finally {
      setSaving(false);
    }
  }, [name, description, selectedSongs, isNew, workspaceId, medleyId, navigation, populateForm]);

  const handleCancel = useCallback(() => {
    if (isNew) {
      navigation.goBack();
    } else {
      populateForm(medley);
      setEditing(false);
    }
  }, [isNew, medley, navigation, populateForm]);

  const addSong = useCallback((song) => {
    setSelectedSongs(prev => {
      if (prev.some(s => s.id === song.id)) return prev;
      return [...prev, song];
    });
  }, []);

  const removeSong = useCallback((songId) => {
    setSelectedSongs(prev => prev.filter(s => s.id !== songId));
  }, []);

  const moveSong = useCallback((index, direction) => {
    setSelectedSongs(prev => {
      const newList = [...prev];
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= newList.length) return prev;
      [newList[index], newList[newIndex]] = [newList[newIndex], newList[index]];
      return newList;
    });
  }, []);

  const availableSongs = allSongs.filter(s => !selectedSongs.some(sel => sel.id === s.id));

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (editing) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        <ScrollView contentContainerStyle={[styles.formContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Text style={[styles.label, { color: colors.textSecondary }]}>Name *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={name}
            onChangeText={setName}
            placeholder="Medley name"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Medley name"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Optional description..."
            placeholderTextColor={colors.textSecondary}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Description"
          />

          {/* Songs in Medley */}
          <Text style={[styles.sectionHeader, { color: colors.textPrimary }]} accessibilityRole="header">
            Songs in Medley ({selectedSongs.length})
          </Text>
          {selectedSongs.length < 2 && (
            <Text style={[styles.validationHint, { color: '#f59e0b' }]}>
              Add at least 2 songs
            </Text>
          )}
          {selectedSongs.map((song, idx) => (
            <View key={song.id} style={[styles.selectedSongRow, { backgroundColor: colors.bgSecondary }]}>
              <Text style={[styles.selectedSongNumber, { color: colors.textSecondary }]}>{idx + 1}</Text>
              <View style={styles.selectedSongInfo}>
                <Text style={[styles.selectedSongTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {song.title}
                </Text>
                {song.artist ? (
                  <Text style={[styles.selectedSongArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                    {song.artist}
                  </Text>
                ) : null}
              </View>
              <View style={styles.reorderButtons}>
                <TouchableOpacity
                  onPress={() => moveSong(idx, -1)}
                  disabled={idx === 0}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${song.title} up`}
                >
                  <Text style={[styles.reorderIcon, { color: idx === 0 ? colors.border : colors.textSecondary }]}>
                    {'\u25B2'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveSong(idx, 1)}
                  disabled={idx === selectedSongs.length - 1}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${song.title} down`}
                >
                  <Text style={[styles.reorderIcon, { color: idx === selectedSongs.length - 1 ? colors.border : colors.textSecondary }]}>
                    {'\u25BC'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => removeSong(song.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${song.title}`}
              >
                <Text style={styles.removeIcon}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Available Songs */}
          <Text style={[styles.sectionHeader, { color: colors.textPrimary, marginTop: 20 }]} accessibilityRole="header">
            Available Songs
          </Text>
          {loadingSongs ? (
            <ActivityIndicator style={{ padding: 20 }} color={colors.primary} />
          ) : availableSongs.length === 0 ? (
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
              {allSongs.length === 0 ? 'No songs in workspace' : 'All songs added'}
            </Text>
          ) : (
            availableSongs.map(song => (
              <PressableRow
                key={song.id}
                style={[styles.availableSongRow, { backgroundColor: colors.bgSecondary }]}
                onPress={() => addSong(song)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${song.title}`}
              >
                <View style={styles.availableSongInfo}>
                  <Text style={[styles.availableSongTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {song.title}
                  </Text>
                  {song.artist ? (
                    <Text style={[styles.availableSongArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                      {song.artist}
                    </Text>
                  ) : null}
                </View>
                {song.duration ? (
                  <Text style={[styles.availableSongDuration, { color: colors.textSecondary }]}>
                    {formatDuration(song.duration)}
                  </Text>
                ) : null}
                <Text style={[styles.addIcon, { color: colors.primary }]}>+</Text>
              </PressableRow>
            ))
          )}

          {/* Actions */}
          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.bgTertiary }]}
              onPress={handleCancel}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.formButtonText, { color: colors.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.primary }]}
              onPress={handleSave}
              disabled={saving || !name.trim() || selectedSongs.length < 2}
              accessibilityRole="button"
              accessibilityLabel={isNew ? "Create medley" : "Save medley"}
            >
              {saving ? (
                <ActivityIndicator color={colors.primaryText} size="small" />
              ) : (
                <Text style={[styles.formButtonTextWhite, { color: colors.primaryText }]}>{isNew ? 'Create' : 'Save'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // View mode
  if (!medley) return null;

  const songList = (() => {
    const songs = medley.songs || medley.medleySongs || [];
    return [...songs]
      .sort((a, b) => (a.position ?? a.order ?? 0) - (b.position ?? b.order ?? 0))
      .map(entry => entry.song || entry);
  })();

  const totalDuration = songList.reduce((acc, s) => acc + (s.duration || 0), 0);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={[styles.viewContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
    >
      {medley.description ? (
        <Text style={[styles.viewDescription, { color: colors.textSecondary }]}>{medley.description}</Text>
      ) : null}

      <View style={styles.badgeRow}>
        <Badge
          label={`${songList.length} song${songList.length !== 1 ? 's' : ''}`}
          color={colors.badgeBpm}
          bgColor={colors.badgeBpmBg}
        />
        {totalDuration > 0 && (
          <Badge
            label={formatDuration(totalDuration)}
            color={colors.badgeDuration}
            bgColor={colors.badgeDurationBg}
          />
        )}
      </View>

      <View style={styles.viewSongList}>
        <Text style={[styles.viewSectionTitle, { color: colors.textSecondary }]}>Songs</Text>
        {songList.map((song, idx) => (
          <View key={song.id || idx} style={[styles.viewSongRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.viewSongNumber, { color: colors.textSecondary }]}>{idx + 1}.</Text>
            <View style={styles.viewSongInfo}>
              <Text style={[styles.viewSongTitle, { color: colors.textPrimary }]}>{song.title}</Text>
              {song.artist ? (
                <Text style={[styles.viewSongArtist, { color: colors.textSecondary }]}>{song.artist}</Text>
              ) : null}
            </View>
            {song.key ? (
              <Badge label={song.key} color={colors.badgeKey} bgColor={colors.badgeKeyBg} />
            ) : null}
            {song.duration ? (
              <Text style={[styles.viewSongDuration, { color: colors.textSecondary }]}>
                {formatDuration(song.duration)}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // View mode
  viewContent: { padding: 16 },
  viewDescription: { fontSize: 15, marginBottom: 8 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  viewSongList: { marginTop: 16 },
  viewSectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },
  viewSongRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  viewSongNumber: { fontSize: 14, fontWeight: '600', width: 24 },
  viewSongInfo: { flex: 1 },
  viewSongTitle: { fontSize: 15, fontWeight: '600' },
  viewSongArtist: { fontSize: 13 },
  viewSongDuration: { fontSize: 13 },
  // Form
  formContent: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  textArea: { minHeight: 80, paddingTop: 10 },
  sectionHeader: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  validationHint: { fontSize: 13, marginBottom: 8 },
  // Selected songs
  selectedSongRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 4,
    gap: 8,
  },
  selectedSongNumber: { fontSize: 14, fontWeight: '700', width: 22 },
  selectedSongInfo: { flex: 1 },
  selectedSongTitle: { fontSize: 14, fontWeight: '600' },
  selectedSongArtist: { fontSize: 12 },
  reorderButtons: { gap: 4, alignItems: 'center' },
  reorderIcon: { fontSize: 10 },
  removeIcon: { fontSize: 14, color: '#ef4444' },
  // Available songs
  availableSongRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 4,
    gap: 8,
  },
  availableSongInfo: { flex: 1 },
  availableSongTitle: { fontSize: 14, fontWeight: '600' },
  availableSongArtist: { fontSize: 12 },
  availableSongDuration: { fontSize: 12 },
  addIcon: { fontSize: 22, fontWeight: '300' },
  emptyHint: { fontSize: 14, padding: 12 },
  // Actions
  formActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  formButton: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  formButtonText: { fontSize: 16, fontWeight: '600' },
  formButtonTextWhite: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
});
