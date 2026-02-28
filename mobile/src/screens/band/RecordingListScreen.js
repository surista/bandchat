import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Audio } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

const TYPE_FILTERS = [
  { key: 'all', label: 'All Types' },
  { key: 'audio', label: 'Audio' },
  { key: 'video', label: 'Video' },
];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

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

function InlineAudioPlayer({ url, colors }) {
  const [sound, setSound] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

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
          if (status.didJustFinish) {
            setPlaying(false);
          }
        }
      );
      setSound(newSound);
      setPlaying(true);
    } catch (err) {
      console.error('Failed to play audio:', err);
    } finally {
      setLoading(false);
    }
  }, [sound, playing, url]);

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync();
    };
  }, [sound]);

  return (
    <TouchableOpacity
      style={[styles.audioPlayer, { backgroundColor: colors.bgTertiary }]}
      onPress={toggle}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Text style={[styles.audioPlayerIcon, { color: colors.primary }]}>
          {playing ? '\u23F8' : '\u25B6\uFE0F'}
        </Text>
      )}
      <Text style={[styles.audioPlayerText, { color: colors.textSecondary }]}>
        {playing ? 'Playing...' : 'Tap to play'}
      </Text>
    </TouchableOpacity>
  );
}

export default function RecordingListScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();

  const [recordings, setRecordings] = useState([]);
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [songFilter, setSongFilter] = useState('all');

  // Action sheet
  const [selectedRecording, setSelectedRecording] = useState(null);
  const [showActions, setShowActions] = useState(false);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Header "+" button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('RecordingDetail', { workspaceId })}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ color: colors.primary, fontSize: 28, fontWeight: '300', lineHeight: 30 }}>+</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, workspaceId, colors.primary]);

  const loadData = useCallback(async () => {
    try {
      const filters = {};
      if (typeFilter !== 'all') filters.type = typeFilter;
      if (songFilter !== 'all') filters.songId = songFilter;
      const [recs, songList] = await Promise.all([
        api.getRecordings(workspaceId, filters),
        api.getSongs(workspaceId),
      ]);
      setRecordings(recs);
      setSongs(songList);
    } catch (err) {
      console.error('Failed to load recordings:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId, typeFilter, songFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reload when returning from detail screen
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loadingRef.current) loadData();
    });
    return unsubscribe;
  }, [navigation, loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleLongPress = useCallback((recording) => {
    setSelectedRecording(recording);
    setShowActions(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedRecording) return;
    Alert.alert('Delete Recording', `Delete "${selectedRecording.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteRecording(selectedRecording.id);
            setRecordings(prev => prev.filter(r => r.id !== selectedRecording.id));
          } catch (err) {
            Alert.alert('Error', 'Failed to delete recording');
          }
          setShowActions(false);
          setSelectedRecording(null);
        },
      },
    ]);
  }, [selectedRecording]);

  const renderRecording = useCallback(({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.bgSecondary }]}
      onPress={() => navigation.navigate('RecordingDetail', { recordingId: item.id, workspaceId })}
      onLongPress={() => handleLongPress(item)}
      delayLongPress={400}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <TypeBadge type={item.type} />
        <Text style={[styles.cardDate, { color: colors.textSecondary }]}>
          {formatDate(item.createdAt)}
        </Text>
      </View>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
        {item.title}
      </Text>
      {item.song ? (
        <Text style={[styles.cardSong, { color: colors.primary }]} numberOfLines={1}>
          {item.song.title}
        </Text>
      ) : null}
      {item.description ? (
        <Text style={[styles.cardDescription, { color: colors.textSecondary }]} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}
      {item.creator ? (
        <Text style={[styles.cardCreator, { color: colors.textSecondary }]}>
          by {item.creator.displayName || item.creator.username}
        </Text>
      ) : null}
      {item.type === 'audio' && item.fileUrl ? (
        <InlineAudioPlayer url={item.fileUrl} colors={colors} />
      ) : null}
    </TouchableOpacity>
  ), [colors, navigation, workspaceId, handleLongPress]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      {/* Type Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {TYPE_FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.filterChip,
              { backgroundColor: typeFilter === f.key ? colors.primary : colors.bgTertiary },
            ]}
            onPress={() => setTypeFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.filterChipText,
              { color: typeFilter === f.key ? '#ffffff' : colors.textSecondary },
            ]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Song Filter */}
      {songs.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <TouchableOpacity
            style={[
              styles.filterChip,
              { backgroundColor: songFilter === 'all' ? colors.primary : colors.bgTertiary },
            ]}
            onPress={() => setSongFilter('all')}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.filterChipText,
              { color: songFilter === 'all' ? '#ffffff' : colors.textSecondary },
            ]}>
              All Songs
            </Text>
          </TouchableOpacity>
          {songs.map(s => (
            <TouchableOpacity
              key={s.id}
              style={[
                styles.filterChip,
                { backgroundColor: songFilter === s.id ? colors.primary : colors.bgTertiary },
              ]}
              onPress={() => setSongFilter(s.id)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: songFilter === s.id ? '#ffffff' : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {s.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <FlatList
        data={recordings}
        keyExtractor={(item) => item.id}
        renderItem={renderRecording}
        contentContainerStyle={styles.listContent}
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
            <Text style={styles.emptyIcon}>{'\uD83C\uDFA4'}</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No recordings yet</Text>
          </View>
        }
      />

      {/* Action Sheet */}
      <Modal visible={showActions} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setShowActions(false); setSelectedRecording(null); }}
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.actionHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {selectedRecording?.title}
            </Text>
            <TouchableOpacity style={styles.actionItem} onPress={handleDelete}>
              <Text style={[styles.actionText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionCancel]}
              onPress={() => { setShowActions(false); setSelectedRecording(null); }}
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  // Filters
  filterRow: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    maxWidth: 140,
  },
  filterChipText: { fontSize: 13, fontWeight: '600' },
  // List
  listContent: { paddingHorizontal: 12, paddingBottom: 20 },
  card: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  cardSong: { fontSize: 14, marginBottom: 2 },
  cardDescription: { fontSize: 14, marginBottom: 4 },
  cardCreator: { fontSize: 12, marginBottom: 4 },
  cardDate: { fontSize: 12 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeBadgeText: { fontSize: 12, fontWeight: '600' },
  // Audio player
  audioPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  audioPlayerIcon: { fontSize: 18 },
  audioPlayerText: { fontSize: 13 },
  // Empty state
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  // Action sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
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
  actionCancel: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)' },
});
