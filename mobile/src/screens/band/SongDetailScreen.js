import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { isSafeUrl } from '../../utils/urlSafety';
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
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../context/ThemeContext';
import Badge from '../../components/Badge';
import api from '../../services/api';
import { formatDuration } from '../../utils/formatDuration';
import { useLayout } from '../../hooks/useLayout';
import ErrorState from '../../components/ErrorState';

const KEY_ROOTS = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];
const KEY_SUFFIXES = ['major', 'minor'];

function SongAudioPlayer({ url, filename, colors }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const soundRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const progressBarRef = useRef(null);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  const togglePlay = async () => {
    try {
      if (playing && soundRef.current) {
        await soundRef.current.pauseAsync();
        setPlaying(false);
        return;
      }
      if (soundRef.current) {
        await soundRef.current.playAsync();
        setPlaying(true);
        return;
      }
      // Set audio mode so sound plays through speakers (not earpiece)
      setLoading(true);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true, progressUpdateIntervalMillis: 250 },
        (status) => {
          if (status.isLoaded) {
            setDuration(status.durationMillis || 0);
            setPosition(status.positionMillis || 0);
            if (status.didJustFinish) {
              setPlaying(false);
              setPosition(0);
            }
          }
        }
      );
      soundRef.current = newSound;
      setPlaying(true);
    } catch (err) {
      Alert.alert('Playback Error', err.message || 'Could not play audio');
    } finally {
      setLoading(false);
    }
  };

  const handleScrub = async (evt) => {
    if (!soundRef.current || duration <= 0) return;
    progressBarRef.current?.measure((_x, _y, width) => {
      if (!width) return;
      const touchX = evt.nativeEvent.locationX;
      const ratio = Math.max(0, Math.min(1, touchX / width));
      const newPos = Math.floor(ratio * duration);
      soundRef.current.setPositionAsync(newPos).catch(() => {});
      setPosition(newPos);
    });
  };

  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const progress = duration > 0 ? position / duration : 0;

  return (
    <View style={[songAudioStyles.container, { backgroundColor: colors.bgTertiary }]}>
      <TouchableOpacity
        onPress={togglePlay}
        activeOpacity={0.7}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={`${playing ? 'Pause' : 'Play'} ${filename}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ width: 32, height: 32 }} />
        ) : (
          <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={32} color={colors.primary} />
        )}
      </TouchableOpacity>
      <View style={songAudioStyles.info}>
        <Text style={[songAudioStyles.filename, { color: colors.textPrimary }]} numberOfLines={1}>{filename}</Text>
        <TouchableOpacity
          ref={progressBarRef}
          onPress={handleScrub}
          activeOpacity={0.8}
          style={[songAudioStyles.progressTouchArea]}
          accessibilityRole="adjustable"
          accessibilityLabel={`Playback position ${fmt(position)} of ${fmt(duration)}`}
        >
          <View style={[songAudioStyles.progressBg, { backgroundColor: colors.border }]}>
            <View style={[songAudioStyles.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} />
            {duration > 0 && (
              <View style={[songAudioStyles.scrubHandle, { left: `${progress * 100}%`, backgroundColor: colors.primary }]} />
            )}
          </View>
        </TouchableOpacity>
        <View style={songAudioStyles.timeRow}>
          <Text style={[songAudioStyles.time, { color: colors.textSecondary }]}>
            {fmt(position)}
          </Text>
          <Text style={[songAudioStyles.time, { color: colors.textSecondary }]}>
            {duration > 0 ? fmt(duration) : '--:--'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const songAudioStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, gap: 10 },
  info: { flex: 1 },
  filename: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  progressTouchArea: { paddingVertical: 8 },
  progressBg: { height: 4, borderRadius: 2, overflow: 'visible', position: 'relative' },
  progressFill: { height: 4, borderRadius: 2 },
  scrubHandle: { position: 'absolute', top: -4, width: 12, height: 12, borderRadius: 6, marginLeft: -6 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  time: { fontSize: 11, fontVariant: ['tabular-nums'] },
});

function parseDuration(str) {
  if (!str) return null;
  const parts = str.split(':');
  if (parts.length !== 2) return null;
  const m = parseInt(parts[0], 10);
  const s = parseInt(parts[1], 10);
  if (isNaN(m) || isNaN(s)) return null;
  return m * 60 + s;
}

export default function SongDetailScreen({ navigation, route }) {
  const { songId, workspaceId, editing: startEditing } = route.params;
  const isNew = !songId;
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();
  const insets = useSafeAreaInsets();

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
  const [fieldErrors, setFieldErrors] = useState({});
  const [loadError, setLoadError] = useState(null);

  // Attachments
  const [attachments, setAttachments] = useState([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Practice logging
  const [showPracticeModal, setShowPracticeModal] = useState(false);
  const [practiceDuration, setPracticeDuration] = useState('30');
  const [practiceNotes, setPracticeNotes] = useState('');
  const [loggingPractice, setLoggingPractice] = useState(false);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const [data, atts] = await Promise.all([
          api.getSong(songId),
          api.getSongAttachments(songId).catch(() => []),
        ]);
        setSong(data);
        setAttachments(atts);
        populateForm(data);
      } catch (err) {
        setLoadError(err.message || 'Failed to load song');
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
    setDuration(formatDuration(data.duration) || '');
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
          <TouchableOpacity onPress={() => setEditing(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Edit song">
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Edit</Text>
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({ headerRight: undefined });
    }
  }, [navigation, isNew, editing, loading, colors.primary]);

  const handleSave = useCallback(async () => {
    const errors = {};
    const trimmedTitle = title.trim();
    if (!trimmedTitle) errors.title = 'Title is required';
    if (bpm) {
      const bpmNum = parseInt(bpm, 10);
      if (isNaN(bpmNum) || bpmNum < 20 || bpmNum > 300) errors.bpm = 'BPM must be 20\u2013300';
    }
    if (duration && !parseDuration(duration)) errors.duration = 'Use mm:ss format';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
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

  const handleLogPractice = useCallback(async () => {
    const dur = parseInt(practiceDuration, 10);
    if (isNaN(dur) || dur < 1 || dur > 480) {
      Alert.alert('Invalid', 'Duration must be between 1 and 480 minutes');
      return;
    }
    setLoggingPractice(true);
    try {
      await api.logPractice(workspaceId, {
        songId: songId || song?.id,
        duration: dur,
        notes: practiceNotes.trim() || null,
        practicedAt: new Date().toISOString(),
      });
      setShowPracticeModal(false);
      setPracticeDuration('30');
      setPracticeNotes('');
      Alert.alert('Logged', 'Practice session logged!');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to log practice');
    } finally {
      setLoggingPractice(false);
    }
  }, [workspaceId, songId, song, practiceDuration, practiceNotes]);

  const handleAddAttachment = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'image/*', 'application/pdf', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      if (file.size > 25 * 1024 * 1024) {
        Alert.alert('Too Large', 'File must be under 25MB');
        return;
      }
      setUploadingAttachment(true);
      const uploaded = await api.uploadFile(file.uri, file.name, file.mimeType, workspaceId);
      const attachment = await api.addSongAttachment(songId, {
        filename: file.name,
        url: uploaded.url,
        type: file.mimeType || 'file',
        size: file.size,
      });
      setAttachments(prev => [attachment, ...prev]);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to upload attachment');
    } finally {
      setUploadingAttachment(false);
    }
  }, [workspaceId, songId]);

  const handleDeleteAttachment = useCallback((att) => {
    Alert.alert('Delete Attachment', `Delete "${att.filename}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteSongAttachment(songId, att.id);
            setAttachments(prev => prev.filter(a => a.id !== att.id));
          } catch (err) {
            Alert.alert('Error', 'Failed to delete attachment');
          }
        },
      },
    ]);
  }, [songId]);

  const loadSong = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const data = await api.getSong(songId);
      setSong(data);
      populateForm(data);
    } catch (err) {
      setLoadError(err.message || 'Failed to load song');
    } finally {
      setLoading(false);
    }
  }, [songId, populateForm]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}>
        <ErrorState iconName="musical-notes-outline" title="Couldn't load song" message={loadError} onRetry={loadSong} />
      </View>
    );
  }

  if (editing) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView contentContainerStyle={[styles.formContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Title *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: fieldErrors.title ? '#ef4444' : colors.border }]}
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              if (fieldErrors.title) setFieldErrors(prev => ({ ...prev, title: null }));
            }}
            onBlur={() => {
              if (!title.trim()) setFieldErrors(prev => ({ ...prev, title: 'Title is required' }));
            }}
            placeholder="Song title"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Song title"
          />
          {fieldErrors.title && <Text style={styles.fieldError}>{fieldErrors.title}</Text>}

          <Text style={[styles.label, { color: colors.textSecondary }]}>Short Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={shortName}
            onChangeText={setShortName}
            placeholder="Abbreviated name for setlists"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Short name"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Artist</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={artist}
            onChangeText={setArtist}
            placeholder="Artist name"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Artist"
          />

          <View style={styles.row}>
            <View style={styles.rowField}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Key</Text>
              <TouchableOpacity
                style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
                onPress={() => setShowKeyPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`Key: ${key || 'not set'}`}
              >
                <Text style={{ color: key ? colors.textPrimary : colors.textSecondary, fontSize: 15 }}>
                  {key || 'Select key'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.rowField}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>BPM</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: fieldErrors.bpm ? '#ef4444' : colors.border }]}
                value={bpm}
                onChangeText={(text) => {
                  setBpm(text);
                  if (fieldErrors.bpm) setFieldErrors(prev => ({ ...prev, bpm: null }));
                }}
                onBlur={() => {
                  if (bpm) {
                    const n = parseInt(bpm, 10);
                    if (isNaN(n) || n < 20 || n > 300) setFieldErrors(prev => ({ ...prev, bpm: 'BPM must be 20\u2013300' }));
                  }
                }}
                placeholder="120"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                accessibilityLabel="BPM"
              />
              {fieldErrors.bpm && <Text style={styles.fieldError}>{fieldErrors.bpm}</Text>}
            </View>
            <View style={styles.rowField}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Duration</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: fieldErrors.duration ? '#ef4444' : colors.border }]}
                value={duration}
                onChangeText={(text) => {
                  setDuration(text);
                  if (fieldErrors.duration) setFieldErrors(prev => ({ ...prev, duration: null }));
                }}
                onBlur={() => {
                  if (duration && !parseDuration(duration)) setFieldErrors(prev => ({ ...prev, duration: 'Use mm:ss format' }));
                }}
                placeholder="3:30"
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel="Duration"
              />
              {fieldErrors.duration && <Text style={styles.fieldError}>{fieldErrors.duration}</Text>}
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
            accessibilityLabel="YouTube URL"
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
            accessibilityLabel="Spotify URL"
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
            accessibilityLabel="Notes"
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
            accessibilityLabel="Lyrics or chord chart"
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
            accessibilityLabel="Arrangement"
          />

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
              disabled={saving || !title.trim()}
              accessibilityRole="button"
              accessibilityLabel={isNew ? 'Create song' : 'Save song'}
            >
              {saving ? (
                <ActivityIndicator color={colors.primaryText} size="small" />
              ) : (
                <Text style={[styles.formButtonTextWhite, { color: colors.primaryText }]}>{isNew ? 'Create' : 'Save'}</Text>
              )}
            </TouchableOpacity>
          </View>

          {!isNew && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Delete song">
              <Text style={styles.deleteButtonText}>Delete Song</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Key Picker Modal */}
        <Modal visible={showKeyPicker} transparent animationType="fade" onRequestClose={() => setShowKeyPicker(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowKeyPicker(false)} accessibilityRole="button" accessibilityLabel="Dismiss key picker">
            <View style={[styles.keyPickerContent, { backgroundColor: colors.modalBg }]}>
              <Text style={[styles.keyPickerTitle, { color: colors.textPrimary }]} accessibilityRole="header">Select Key</Text>
              <TouchableOpacity
                style={[styles.keyOption, !key && { backgroundColor: colors.bgTertiary }]}
                onPress={() => { setKey(''); setShowKeyPicker(false); }}
                accessibilityRole="button"
                accessibilityLabel="No key"
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
                    accessibilityRole="button"
                    accessibilityLabel={`${item}${key === item ? ', selected' : ''}`}
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
      contentContainerStyle={[styles.viewContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }, { paddingBottom: insets.bottom + 16 }]}
    >
      {song?.artist ? (
        <Text style={[styles.viewArtist, { color: colors.textSecondary }]}>{song.artist}</Text>
      ) : null}
      {song?.shortName ? (
        <Text style={[styles.viewShortName, { color: colors.textSecondary }]}>aka "{song.shortName}"</Text>
      ) : null}

      <View style={styles.badgeRow}>
        {song?.key ? <Badge label={`Key: ${song.key}`} color={colors.badgeKey} bgColor={colors.badgeKeyBg} /> : null}
        {song?.bpm ? <Badge label={`${song.bpm} BPM`} color={colors.badgeBpm} bgColor={colors.badgeBpmBg} /> : null}
        {song?.duration ? <Badge label={formatDuration(song.duration)} color={colors.badgeDuration} bgColor={colors.badgeDurationBg} /> : null}
      </View>

      {/* Links */}
      {(song?.youtubeUrl || song?.spotifyUrl) && (
        <View style={styles.linksRow}>
          {song.youtubeUrl ? (
            <TouchableOpacity style={styles.linkButton} onPress={() => isSafeUrl(song.youtubeUrl) && Linking.openURL(song.youtubeUrl)} accessibilityRole="button" accessibilityLabel="Open on YouTube">
              <Text style={styles.youtubeLink}>YouTube</Text>
            </TouchableOpacity>
          ) : null}
          {song.spotifyUrl ? (
            <TouchableOpacity style={styles.linkButton} onPress={() => isSafeUrl(song.spotifyUrl) && Linking.openURL(song.spotifyUrl)} accessibilityRole="button" accessibilityLabel="Open on Spotify">
              <Text style={styles.spotifyLink}>Spotify</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Notes */}
      {song?.notes ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]} accessibilityRole="header">Notes</Text>
          <Text style={[styles.sectionText, { color: colors.textPrimary }]}>{song.notes}</Text>
        </View>
      ) : null}

      {/* Lyrics */}
      {song?.lyrics ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginBottom: 0 }]} accessibilityRole="header">Lyrics / Chord Chart</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Lyrics', { lyrics: song.lyrics, songTitle: song.title, duration: song.duration })}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="View lyrics full screen"
            >
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Full Screen</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.sectionText, styles.monoText, { color: colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>
            {song.lyrics}
          </Text>
        </View>
      ) : null}

      {/* Arrangement */}
      {song?.arrangement ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]} accessibilityRole="header">Arrangement</Text>
          <Text style={[styles.sectionText, { color: colors.textPrimary }]}>{song.arrangement}</Text>
        </View>
      ) : null}

      {/* Attachments */}
      {!isNew && !editing && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginBottom: 0 }]} accessibilityRole="header">
              Attachments{attachments.length > 0 ? ` (${attachments.length})` : ''}
            </Text>
            <TouchableOpacity
              onPress={handleAddAttachment}
              disabled={uploadingAttachment}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Add attachment"
            >
              {uploadingAttachment ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>
          {attachments.length === 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic' }}>
              No attachments. Add chord charts, audio files, or PDFs.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {attachments.map(att => (
                att.type?.startsWith('audio') ? (
                  <View key={att.id}>
                    <SongAudioPlayer url={att.url} filename={att.filename} colors={colors} />
                    <TouchableOpacity
                      onPress={() => handleDeleteAttachment(att)}
                      style={{ position: 'absolute', top: 4, right: 4 }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${att.filename}`}
                    >
                      <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View key={att.id} style={[songAudioStyles.container, { backgroundColor: colors.bgTertiary }]}>
                    <Ionicons
                      name={att.type?.startsWith('image') ? 'image-outline' : 'document-outline'}
                      size={22}
                      color={colors.textSecondary}
                    />
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => Linking.openURL(att.url)}
                      accessibilityRole="link"
                      accessibilityLabel={`Open ${att.filename}`}
                    >
                      <Text style={[songAudioStyles.filename, { color: colors.primary }]} numberOfLines={1}>{att.filename}</Text>
                      {att.size > 0 && (
                        <Text style={[songAudioStyles.time, { color: colors.textSecondary }]}>{(att.size / 1024).toFixed(0)} KB</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteAttachment(att)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${att.filename}`}
                    >
                      <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                )
              ))}
            </View>
          )}
        </View>
      )}

      {/* Desktop Feature Hint */}
      <View style={[styles.desktopHint, { backgroundColor: colors.bgTertiary }]}>
        <Ionicons name="volume-high-outline" size={20} color={colors.textSecondary} />
        <Text style={[styles.desktopHintText, { color: colors.textSecondary }]}>
          Audio analysis (BPM/key detection) available on web
        </Text>
      </View>

      {/* Log Practice Button */}
      <TouchableOpacity
        style={[styles.practiceButton, { backgroundColor: colors.primary }]}
        onPress={() => setShowPracticeModal(true)}
        accessibilityRole="button"
        accessibilityLabel="Log practice session"
      >
        <Text style={[styles.practiceButtonText, { color: colors.primaryText }]}>Log Practice</Text>
      </TouchableOpacity>

      {/* Practice Modal */}
      <Modal visible={showPracticeModal} transparent animationType="fade" onRequestClose={() => setShowPracticeModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPracticeModal(false)} accessibilityRole="button" accessibilityLabel="Dismiss practice modal">
          <View style={[styles.practiceModalContent, { backgroundColor: colors.modalBg }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.practiceModalTitle, { color: colors.textPrimary }]} accessibilityRole="header">Log Practice</Text>
            <Text style={[styles.practiceModalSong, { color: colors.textSecondary }]}>
              {song?.title}
            </Text>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Duration (minutes)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              value={practiceDuration}
              onChangeText={setPracticeDuration}
              placeholder="30"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              accessibilityLabel="Duration in minutes"
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.practiceNotesInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              value={practiceNotes}
              onChangeText={setPracticeNotes}
              placeholder="How did it go?"
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Practice notes"
            />

            <View style={styles.practiceModalActions}>
              <TouchableOpacity
                style={[styles.formButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => setShowPracticeModal(false)}
                disabled={loggingPractice}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.formButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formButton, { backgroundColor: colors.primary }]}
                onPress={handleLogPractice}
                disabled={loggingPractice || !practiceDuration.trim()}
                accessibilityRole="button"
                accessibilityLabel="Save practice session"
              >
                {loggingPractice ? (
                  <ActivityIndicator color={colors.primaryText} size="small" />
                ) : (
                  <Text style={[styles.formButtonTextWhite, { color: colors.primaryText }]}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // View mode
  viewContent: { padding: 16 },
  viewArtist: { fontSize: 16, marginBottom: 4 },
  viewShortName: { fontSize: 14, fontStyle: 'italic', marginBottom: 8 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  linksRow: { flexDirection: 'row', gap: 12, marginVertical: 12 },
  linkButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  youtubeLink: { color: '#ef4444', fontSize: 15, fontWeight: '600' },
  spotifyLink: { color: '#22c55e', fontSize: 15, fontWeight: '600' },
  section: { marginTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
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
  fieldError: { color: '#ef4444', fontSize: 12, marginTop: 4 },
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
  // Practice
  practiceButton: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  practiceButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  practiceModalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
  },
  practiceModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  practiceModalSong: {
    fontSize: 14,
    marginBottom: 16,
  },
  practiceNotesInput: {
    minHeight: 60,
    paddingTop: 10,
  },
  practiceModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  // Desktop feature hint
  desktopHint: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 20,
    gap: 10,
  },
  desktopHintIcon: {
    fontSize: 20,
  },
  desktopHintText: {
    fontSize: 13,
    flex: 1,
  },
});
