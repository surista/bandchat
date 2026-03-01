import { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
  ActivityIndicator,
  Linking,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

const KEY_ROOTS = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];
const KEY_SUFFIXES = ['major', 'minor'];

function parseDuration(str) {
  if (!str) return null;
  const parts = str.split(':');
  if (parts.length !== 2) return null;
  const m = parseInt(parts[0], 10);
  const s = parseInt(parts[1], 10);
  if (isNaN(m) || isNaN(s)) return null;
  return m * 60 + s;
}

function formatDuration(seconds) {
  if (!seconds) return '';
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

export default function SongDetailScreen({ navigation, route }) {
  const { songId, workspaceId, editing: startEditing } = route.params;
  const isNew = !songId;
  const { colors } = useTheme();

  const [song, setSong] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(isNew || startEditing);

  // Form fields
  const [title, setTitle] = useState('');
  const [shortName, setShortName] = useState('');
  const [artist, setArtist] = useState('');
  const [key, setKey] = useState('');
  const [bpm, setBpm] = useState('');
  const [duration, setDuration] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [arrangement, setArrangement] = useState('');

  const [showKeyPicker, setShowKeyPicker] = useState(false);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const data = await api.getSong(songId);
        setSong(data);
        populateForm(data);
      } catch (err) {
        console.error('Failed to load song:', err);
        Alert.alert('Error', 'Failed to load song');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [songId, isNew, navigation]);

  const populateForm = useCallback((data) => {
    if (!data) return;
    setTitle(data.title || '');
    setShortName(data.shortName || '');
    setArtist(data.artist || '');
    setKey(data.key || '');
    setBpm(data.bpm ? String(data.bpm) : '');
    setDuration(formatDuration(data.duration));
    setYoutubeUrl(data.youtubeUrl || '');
    setSpotifyUrl(data.spotifyUrl || '');
    setNotes(data.notes || '');
    setLyrics(data.lyrics || '');
    setArrangement(data.arrangement || '');
  }, []);

  useLayoutEffect(() => {
    if (isNew) {
      navigation.setOptions({ title: 'New Song' });
    } else if (editing) {
      navigation.setOptions({ title: 'Edit Song' });
    } else if (song) {
      navigation.setOptions({ title: song.title || 'Song' });
    }
  }, [navigation, isNew, editing, song]);

  // Header edit button
  useLayoutEffect(() => {
    if (!isNew && !editing && !loading) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity onPress={() => setEditing(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Edit</Text>
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({ headerRight: undefined });
    }
  }, [navigation, isNew, editing, loading, colors.primary]);

  const handleSave = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('Required', 'Song title is required');
      return;
    }
    setSaving(true);
    const data = {
      title: trimmedTitle,
      shortName: shortName.trim() || null,
      artist: artist.trim() || null,
      key: key || null,
      bpm: bpm ? parseInt(bpm, 10) : null,
      duration: parseDuration(duration) || null,
      youtubeUrl: youtubeUrl.trim() || null,
      spotifyUrl: spotifyUrl.trim() || null,
      notes: notes.trim() || null,
      lyrics: lyrics.trim() || null,
      arrangement: arrangement.trim() || null,
    };
    try {
      if (isNew) {
        const created = await api.createSong(workspaceId, data);
        setSong(created);
        populateForm(created);
        setEditing(false);
        // Replace route so back goes to list, not create screen
        navigation.setParams({ songId: created.id });
      } else {
        const updated = await api.updateSong(songId, data);
        setSong(updated);
        populateForm(updated);
        setEditing(false);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save song');
    } finally {
      setSaving(false);
    }
  }, [title, shortName, artist, key, bpm, duration, youtubeUrl, spotifyUrl, notes, lyrics, arrangement, isNew, workspaceId, songId, navigation, populateForm]);

  const handleCancel = useCallback(() => {
    if (isNew) {
      navigation.goBack();
    } else {
      populateForm(song);
      setEditing(false);
    }
  }, [isNew, song, navigation, populateForm]);

  const handleDelete = useCallback(() => {
    Alert.alert('Delete Song', `Delete "${song?.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteSong(songId);
            navigation.goBack();
          } catch (err) {
            Alert.alert('Error', 'Failed to delete song');
          }
        },
      },
    ]);
  }, [song, songId, navigation]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (editing) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.bgPrimary }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { color: colors.textSecondary }]}>Title *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Song title"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Short Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={shortName}
            onChangeText={setShortName}
            placeholder="Abbreviated name for setlists"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Artist</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={artist}
            onChangeText={setArtist}
            placeholder="Artist name"
            placeholderTextColor={colors.textSecondary}
          />

          <View style={styles.row}>
            <View style={styles.rowField}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Key</Text>
              <TouchableOpacity
                style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
                onPress={() => setShowKeyPicker(true)}
              >
                <Text style={{ color: key ? colors.textPrimary : colors.textSecondary, fontSize: 15 }}>
                  {key || 'Select key'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.rowField}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>BPM</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={bpm}
                onChangeText={setBpm}
                placeholder="120"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.rowField}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Duration</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={duration}
                onChangeText={setDuration}
                placeholder="3:30"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>YouTube URL</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={youtubeUrl}
            onChangeText={setYoutubeUrl}
            placeholder="https://youtube.com/..."
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            keyboardType="url"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Spotify URL</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={spotifyUrl}
            onChangeText={setSpotifyUrl}
            placeholder="https://open.spotify.com/..."
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            keyboardType="url"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes about this song..."
            placeholderTextColor={colors.textSecondary}
            multiline
            textAlignVertical="top"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Lyrics / Chord Chart</Text>
          <TextInput
            style={[styles.input, styles.lyricsArea, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}
            value={lyrics}
            onChangeText={setLyrics}
            placeholder="Lyrics or chord chart..."
            placeholderTextColor={colors.textSecondary}
            multiline
            textAlignVertical="top"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Arrangement</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={arrangement}
            onChangeText={setArrangement}
            placeholder="Arrangement notes..."
            placeholderTextColor={colors.textSecondary}
            multiline
            textAlignVertical="top"
          />

          {/* Actions */}
          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.bgTertiary }]}
              onPress={handleCancel}
              disabled={saving}
            >
              <Text style={[styles.formButtonText, { color: colors.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.primary }]}
              onPress={handleSave}
              disabled={saving || !title.trim()}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.formButtonTextWhite}>{isNew ? 'Create' : 'Save'}</Text>
              )}
            </TouchableOpacity>
          </View>

          {!isNew && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Text style={styles.deleteButtonText}>Delete Song</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Key Picker Modal */}
        <Modal visible={showKeyPicker} transparent animationType="fade" onRequestClose={() => setShowKeyPicker(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowKeyPicker(false)}>
            <View style={[styles.keyPickerContent, { backgroundColor: colors.modalBg }]}>
              <Text style={[styles.keyPickerTitle, { color: colors.textPrimary }]}>Select Key</Text>
              <TouchableOpacity
                style={[styles.keyOption, !key && { backgroundColor: colors.bgTertiary }]}
                onPress={() => { setKey(''); setShowKeyPicker(false); }}
              >
                <Text style={[styles.keyOptionText, { color: colors.textSecondary }]}>None</Text>
              </TouchableOpacity>
              <FlatList
                data={KEY_ROOTS.flatMap(root => KEY_SUFFIXES.map(suffix => `${root} ${suffix}`))}
                keyExtractor={(item) => item}
                numColumns={2}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.keyOption, styles.keyOptionGrid, key === item && { backgroundColor: colors.bgTertiary }]}
                    onPress={() => { setKey(item); setShowKeyPicker(false); }}
                  >
                    <Text style={[styles.keyOptionText, { color: colors.textPrimary }]}>{item}</Text>
                    {key === item && <Text style={{ color: colors.primary, marginLeft: 4 }}>{'\u2713'}</Text>}
                  </TouchableOpacity>
                )}
                style={{ maxHeight: 400 }}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    );
  }

  // View mode
  if (!song) return null;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={styles.viewContent}
    >
      {song?.artist ? (
        <Text style={[styles.viewArtist, { color: colors.textSecondary }]}>{song.artist}</Text>
      ) : null}
      {song?.shortName ? (
        <Text style={[styles.viewShortName, { color: colors.textSecondary }]}>aka "{song.shortName}"</Text>
      ) : null}

      <View style={styles.badgeRow}>
        {song?.key ? <Badge label={`Key: ${song.key}`} color="#c084fc" bgColor="rgba(192,132,252,0.15)" /> : null}
        {song?.bpm ? <Badge label={`${song.bpm} BPM`} color="#60a5fa" bgColor="rgba(96,165,250,0.15)" /> : null}
        {song?.duration ? <Badge label={formatDuration(song.duration)} color="#9ca3af" bgColor="rgba(156,163,175,0.15)" /> : null}
      </View>

      {/* Links */}
      {(song?.youtubeUrl || song?.spotifyUrl) && (
        <View style={styles.linksRow}>
          {song.youtubeUrl ? (
            <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(song.youtubeUrl)}>
              <Text style={styles.youtubeLink}>YouTube</Text>
            </TouchableOpacity>
          ) : null}
          {song.spotifyUrl ? (
            <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(song.spotifyUrl)}>
              <Text style={styles.spotifyLink}>Spotify</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Notes */}
      {song?.notes ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Notes</Text>
          <Text style={[styles.sectionText, { color: colors.textPrimary }]}>{song.notes}</Text>
        </View>
      ) : null}

      {/* Lyrics */}
      {song?.lyrics ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Lyrics / Chord Chart</Text>
          <Text style={[styles.sectionText, styles.monoText, { color: colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>
            {song.lyrics}
          </Text>
        </View>
      ) : null}

      {/* Arrangement */}
      {song?.arrangement ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Arrangement</Text>
          <Text style={[styles.sectionText, { color: colors.textPrimary }]}>{song.arrangement}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // View mode
  viewContent: { padding: 16 },
  viewArtist: { fontSize: 16, marginBottom: 4 },
  viewShortName: { fontSize: 14, fontStyle: 'italic', marginBottom: 8 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 13, fontWeight: '600' },
  linksRow: { flexDirection: 'row', gap: 12, marginVertical: 12 },
  linkButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  youtubeLink: { color: '#ef4444', fontSize: 15, fontWeight: '600' },
  spotifyLink: { color: '#22c55e', fontSize: 15, fontWeight: '600' },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },
  sectionText: { fontSize: 15, lineHeight: 22 },
  monoText: { fontSize: 13, lineHeight: 20 },
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
  pickerInput: { justifyContent: 'center' },
  textArea: { minHeight: 80, paddingTop: 10 },
  lyricsArea: { minHeight: 200, paddingTop: 10 },
  row: { flexDirection: 'row', gap: 8 },
  rowField: { flex: 1 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  formButton: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  formButtonText: { fontSize: 16, fontWeight: '600' },
  formButtonTextWhite: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  deleteButton: { marginTop: 16, paddingVertical: 14, alignItems: 'center' },
  deleteButtonText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
  // Key picker
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  keyPickerContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
  },
  keyPickerTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  keyOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  keyOptionGrid: { flex: 1 },
  keyOptionText: { fontSize: 15 },
});
