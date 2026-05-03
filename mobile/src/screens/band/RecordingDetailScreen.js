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
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Audio, Video, ResizeMode } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useTheme } from '../../context/ThemeContext';
import formatDate from '../../utils/formatDate';
import PressableRow from '../../components/PressableRow';
import api from '../../services/api';
import { useLayout } from '../../hooks/useLayout';

function TypeBadge({ type }) {
  const isAudio = type === 'audio';
  return (
    <View style={[styles.typeBadge, { backgroundColor: isAudio ? 'rgba(96,165,250,0.15)' : 'rgba(168,85,247,0.15)' }]}>
      <Text style={[styles.typeBadgeText, { color: isAudio ? '#60a5fa' : '#a855f7' }]}>
        {isAudio ? 'Audio' : 'Video'}
      </Text>
    </View>
  );
}

function AudioPlayer({ url, colors }) {
  const [sound, setSound] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = useCallback(async () => {
    if (sound) {
      if (playing) {
        await sound.pauseAsync();
        setPlaying(false);
      } else {
        await sound.playAsync();
        setPlaying(true);
      }
      return;
    }
    setLoading(true);
    try {
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            setPosition(status.positionMillis || 0);
            setDuration(status.durationMillis || 0);
          }
          if (status.didJustFinish) {
            setPlaying(false);
            setPosition(0);
          }
        }
      );
      setSound(newSound);
      setPlaying(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to play audio');
    } finally {
      setLoading(false);
    }
  }, [sound, playing, url]);

  // Unload sound when URL changes or component unmounts
  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
        setSound(null);
        setPlaying(false);
        setPosition(0);
        setDuration(0);
      }
    };
  }, [url]);

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync();
    };
  }, [sound]);

  const formatTime = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? position / duration : 0;

  return (
    <View style={[styles.playerContainer, { backgroundColor: colors.bgTertiary }]}>
      <TouchableOpacity onPress={toggle} style={styles.playButton} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={playing ? "Pause" : "Play"}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={[styles.playIcon, { color: colors.primary }]}>
            {playing ? '\u23F8' : '\u25B6\uFE0F'}
          </Text>
        )}
      </TouchableOpacity>
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.primary }]} />
        </View>
        <View style={styles.timeRow}>
          <Text style={[styles.timeText, { color: colors.textSecondary }]}>{formatTime(position)}</Text>
          <Text style={[styles.timeText, { color: colors.textSecondary }]}>{formatTime(duration)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function RecordingDetailScreen({ navigation, route }) {
  const { recordingId, workspaceId, editing: startEditing } = route.params;
  const isNew = !recordingId;
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const [recording, setRecording] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(isNew || startEditing);

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [songId, setSongId] = useState(null);
  const [fileUri, setFileUri] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [fileMimeType, setFileMimeType] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Song picker
  const [songs, setSongs] = useState([]);
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [selectedSong, setSelectedSong] = useState(null);

  useEffect(() => {
    if (isNew) {
      loadSongs();
      return;
    }
    (async () => {
      try {
        const rec = await api.getRecording(recordingId);
        if (rec) {
          setRecording(rec);
          populateForm(rec);
        } else {
          Alert.alert('Error', 'Recording not found');
          navigation.goBack();
        }
      } catch (err) {
        Alert.alert('Error', 'Failed to load recording');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [recordingId, isNew, workspaceId, navigation]);

  const loadSongs = useCallback(async () => {
    try {
      const data = await api.getSongs(workspaceId);
      setSongs(data);
    } catch (err) {
      // silently fail
    }
  }, [workspaceId]);

  useEffect(() => {
    if (editing) loadSongs();
  }, [editing, loadSongs]);

  const populateForm = useCallback((data) => {
    if (!data) return;
    setTitle(data.title || '');
    setDescription(data.description || '');
    setSongId(data.songId || null);
    setSelectedSong(data.song || null);
  }, []);

  useLayoutEffect(() => {
    if (isNew) {
      navigation.setOptions({ title: 'New Recording' });
    } else if (editing) {
      navigation.setOptions({ title: 'Edit Recording' });
    } else if (recording) {
      navigation.setOptions({ title: recording.title || 'Recording' });
    }
  }, [navigation, isNew, editing, recording]);

  // Header edit button
  useLayoutEffect(() => {
    if (!isNew && !editing && !loading) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity onPress={() => setEditing(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Edit recording">
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Edit</Text>
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({ headerRight: undefined });
    }
  }, [navigation, isNew, editing, loading, colors.primary]);

  const pickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'video/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setFileUri(asset.uri);
        setFileName(asset.name);
        setFileMimeType(asset.mimeType || 'application/octet-stream');
      }
    } catch (err) {
      // silently fail
    }
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('Required', 'Title is required');
      return;
    }
    if (isNew && !fileUri) {
      Alert.alert('Required', 'Please select a file to upload');
      return;
    }

    setSaving(true);
    try {
      let fileUrl = recording?.fileUrl;
      let type = recording?.type;

      if (fileUri) {
        setUploading(true);
        const uploadResult = await api.uploadFile(fileUri, fileName, fileMimeType, workspaceId);
        fileUrl = uploadResult.url || uploadResult.fileUrl;
        type = fileMimeType?.startsWith('video') ? 'video' : 'audio';
        setUploading(false);
      }

      const data = {
        title: trimmedTitle,
        description: description.trim() || null,
        songId: songId || null,
        fileUrl,
        type,
      };

      if (isNew) {
        const created = await api.createRecording(workspaceId, data);
        setRecording(created);
        populateForm(created);
        setEditing(false);
        navigation.setParams({ recordingId: created.id });
      } else {
        const updated = await api.updateRecording(recordingId, {
          title: trimmedTitle,
          description: description.trim() || null,
          songId: songId || null,
        });
        setRecording(updated);
        populateForm(updated);
        setEditing(false);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save recording');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  }, [title, description, songId, fileUri, fileName, fileMimeType, isNew, workspaceId, recordingId, recording, navigation, populateForm]);

  const handleCancel = useCallback(() => {
    if (isNew) {
      navigation.goBack();
    } else {
      populateForm(recording);
      setFileUri(null);
      setFileName(null);
      setEditing(false);
    }
  }, [isNew, recording, navigation, populateForm]);

  const handleDelete = useCallback(() => {
    Alert.alert('Delete Recording', `Delete "${recording?.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteRecording(recordingId);
            navigation.goBack();
          } catch (err) {
            Alert.alert('Error', 'Failed to delete recording');
          }
        },
      },
    ]);
  }, [recording, recordingId, navigation]);

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
          <Text style={[styles.label, { color: colors.textSecondary }]}>Title *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Recording title"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Recording title"
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

          <Text style={[styles.label, { color: colors.textSecondary }]}>Link to Song</Text>
          <PressableRow
            style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
            onPress={() => setShowSongPicker(true)}
            accessibilityRole="button"
            accessibilityLabel={`Link to song: ${selectedSong ? selectedSong.title : "None selected"}`}
          >
            <Text style={{ color: selectedSong ? colors.textPrimary : colors.textSecondary, fontSize: 15 }}>
              {selectedSong ? selectedSong.title : 'Select song (optional)'}
            </Text>
          </PressableRow>

          {/* File picker - only for new recordings */}
          {isNew && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>File *</Text>
              <PressableRow
                style={[styles.filePickerButton, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
                onPress={pickFile}
                accessibilityRole="button"
                accessibilityLabel={fileName ? `Selected file: ${fileName}` : "Pick audio or video file"}
              >
                <Text style={{ color: fileName ? colors.textPrimary : colors.textSecondary, fontSize: 15 }}>
                  {fileName || 'Pick audio or video file'}
                </Text>
              </PressableRow>
            </>
          )}

          {uploading && (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.uploadingText, { color: colors.textSecondary }]}>Uploading...</Text>
            </View>
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
              disabled={saving || !title.trim() || (isNew && !fileUri)}
              accessibilityRole="button"
              accessibilityLabel={isNew ? "Create recording" : "Save recording"}
            >
              {saving ? (
                <ActivityIndicator color={colors.primaryText} size="small" />
              ) : (
                <Text style={[styles.formButtonTextWhite, { color: colors.primaryText }]}>{isNew ? 'Create' : 'Save'}</Text>
              )}
            </TouchableOpacity>
          </View>

          {!isNew && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Delete recording">
              <Text style={styles.deleteButtonText}>Delete Recording</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Song Picker Modal */}
        <Modal visible={showSongPicker} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowSongPicker(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSongPicker(false)} accessibilityRole="button" accessibilityLabel="Close song picker">
            <View style={[styles.pickerContent, { backgroundColor: colors.modalBg, paddingBottom: Math.max(insets.bottom, 20) + 20 }]}>
              <Text style={[styles.pickerTitle, { color: colors.textPrimary }]} accessibilityRole="header">Select Song</Text>
              <PressableRow
                style={[styles.pickerOption, !songId && { backgroundColor: colors.bgTertiary }]}
                onPress={() => { setSongId(null); setSelectedSong(null); setShowSongPicker(false); }}
                accessibilityRole="button"
                accessibilityLabel="None"
              >
                <Text style={[styles.pickerOptionText, { color: colors.textSecondary }]}>None</Text>
              </PressableRow>
              <FlatList
                data={songs}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 350 }}
                renderItem={({ item }) => (
                  <PressableRow
                    style={[styles.pickerOption, songId === item.id && { backgroundColor: colors.bgTertiary }]}
                    onPress={() => { setSongId(item.id); setSelectedSong(item); setShowSongPicker(false); }}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title}${songId === item.id ? ", selected" : ""}`}
                  >
                    <Text style={[styles.pickerOptionText, { color: colors.textPrimary }]}>{item.title}</Text>
                    {item.artist ? (
                      <Text style={[styles.pickerOptionSub, { color: colors.textSecondary }]}>{item.artist}</Text>
                    ) : null}
                    {songId === item.id && <Text style={{ color: colors.primary }}>{'\u2713'}</Text>}
                  </PressableRow>
                )}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    );
  }

  // View mode
  if (!recording) return null;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={[styles.viewContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
    >
      <TypeBadge type={recording.type} />

      {/* Player */}
      {recording.type === 'audio' && recording.fileUrl ? (
        <View style={{ marginTop: 16 }}>
          <AudioPlayer url={recording.fileUrl} colors={colors} />
        </View>
      ) : null}

      {recording.type === 'video' && recording.fileUrl ? (
        <Video
          source={{ uri: recording.fileUrl }}
          style={styles.videoPlayer}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
        />
      ) : null}

      {/* Linked song */}
      {recording.song ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Linked Song</Text>
          <Text style={[styles.linkedSong, { color: colors.primary }]}>{recording.song.title}</Text>
        </View>
      ) : null}

      {/* Description */}
      {recording.description ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Description</Text>
          <Text style={[styles.sectionText, { color: colors.textPrimary }]}>{recording.description}</Text>
        </View>
      ) : null}

      {/* Creator & date */}
      <View style={styles.metaRow}>
        {recording.creator ? (
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            by {recording.creator.displayName || recording.creator.username}
          </Text>
        ) : null}
        <Text style={[styles.metaText, { color: colors.textSecondary }]}>
          {formatDate(recording.createdAt)}
        </Text>
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
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  typeBadgeText: { fontSize: 13, fontWeight: '600' },
  videoPlayer: { width: '100%', height: 220, borderRadius: 8, marginTop: 16, backgroundColor: '#000' },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },
  sectionText: { fontSize: 15, lineHeight: 22 },
  linkedSong: { fontSize: 15, fontWeight: '600' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)' },
  metaText: { fontSize: 13 },
  // Player
  playerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    gap: 12,
  },
  playButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  playIcon: { fontSize: 24 },
  progressContainer: { flex: 1 },
  progressBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timeText: { fontSize: 11 },
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
  filePickerButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  uploadingText: { fontSize: 13 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  formButton: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  formButtonText: { fontSize: 16, fontWeight: '600' },
  formButtonTextWhite: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  deleteButton: { marginTop: 16, paddingVertical: 14, alignItems: 'center' },
  deleteButtonText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
  // Song picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  pickerTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  pickerOptionText: { fontSize: 15, flex: 1 },
  pickerOptionSub: { fontSize: 13, marginRight: 8 },
});
