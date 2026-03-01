import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
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

export default function MedleyListScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();

  const [medleys, setMedleys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  // Action sheet
  const [selectedMedley, setSelectedMedley] = useState(null);
  const [showActions, setShowActions] = useState(false);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Header "+" button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('MedleyDetail', { workspaceId })}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Create medley"
        >
          <Text style={{ color: colors.primary, fontSize: 28, fontWeight: '300', lineHeight: 30 }}>+</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, workspaceId, colors.primary]);

  const loadMedleys = useCallback(async () => {
    try {
      const data = await api.getMedleys(workspaceId);
      setMedleys(data);
    } catch (err) {
      console.error('Failed to load medleys:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadMedleys();
  }, [loadMedleys]);

  // Reload when returning from detail screen
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loadingRef.current) loadMedleys();
    });
    return unsubscribe;
  }, [navigation, loadMedleys]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadMedleys();
  }, [loadMedleys]);

  const handleLongPress = useCallback((medley) => {
    setSelectedMedley(medley);
    setShowActions(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedMedley) return;
    Alert.alert('Delete Medley', `Delete "${selectedMedley.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteMedley(selectedMedley.id);
            setMedleys(prev => prev.filter(m => m.id !== selectedMedley.id));
          } catch (err) {
            Alert.alert('Error', 'Failed to delete medley');
          }
          setShowActions(false);
          setSelectedMedley(null);
        },
      },
    ]);
  }, [selectedMedley]);

  const getTotalDuration = useCallback((medley) => {
    const songs = medley.songs || medley.medleySongs || [];
    let total = 0;
    for (const entry of songs) {
      const song = entry.song || entry;
      if (song.duration) total += song.duration;
    }
    return total;
  }, []);

  const getSongList = useCallback((medley) => {
    const songs = medley.songs || medley.medleySongs || [];
    return songs
      .sort((a, b) => (a.position ?? a.order ?? 0) - (b.position ?? b.order ?? 0))
      .map(entry => entry.song || entry);
  }, []);

  const renderMedley = useCallback(({ item }) => {
    const songList = getSongList(item);
    const songCount = songList.length;
    const totalDuration = getTotalDuration(item);
    const isExpanded = expandedId === item.id;

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.bgSecondary }]}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${songCount} songs. Long press for options`}
      >
        <Text style={[styles.cardName, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.name}
        </Text>
        {item.description ? (
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        <View style={styles.badgeRow}>
          <Badge
            label={`${songCount} song${songCount !== 1 ? 's' : ''}`}
            color="#60a5fa"
            bgColor="rgba(96,165,250,0.15)"
          />
          {totalDuration > 0 && (
            <Badge
              label={formatDuration(totalDuration)}
              color="#9ca3af"
              bgColor="rgba(156,163,175,0.15)"
            />
          )}
        </View>

        {isExpanded && songList.length > 0 && (
          <View style={[styles.songList, { borderTopColor: colors.border }]}>
            {songList.map((song, idx) => (
              <View key={song.id || idx} style={styles.songRow}>
                <Text style={[styles.songNumber, { color: colors.textSecondary }]}>{idx + 1}.</Text>
                <View style={styles.songInfo}>
                  <Text style={[styles.songTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {song.title}
                  </Text>
                  {song.artist ? (
                    <Text style={[styles.songArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                      {song.artist}
                    </Text>
                  ) : null}
                </View>
                {song.key ? (
                  <Badge label={song.key} color="#c084fc" bgColor="rgba(192,132,252,0.15)" />
                ) : null}
                {song.duration ? (
                  <Text style={[styles.songDuration, { color: colors.textSecondary }]}>
                    {formatDuration(song.duration)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  }, [colors, expandedId, handleLongPress, getSongList, getTotalDuration]);

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
      <FlatList
        data={medleys}
        keyExtractor={(item) => item.id}
        renderItem={renderMedley}
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
            <Text style={styles.emptyIcon}>{'\uD83C\uDFB6'}</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No medleys yet</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Group songs that flow together
            </Text>
          </View>
        }
      />

      {/* Action Sheet */}
      <Modal visible={showActions} transparent animationType="slide" onRequestClose={() => setShowActions(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setShowActions(false); setSelectedMedley(null); }}
          accessibilityRole="button"
          accessibilityLabel="Close action sheet"
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.actionHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {selectedMedley?.name}
            </Text>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                setShowActions(false);
                navigation.navigate('MedleyDetail', { medleyId: selectedMedley?.id, workspaceId, editing: true });
                setSelectedMedley(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Edit medley"
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Delete medley">
              <Text style={[styles.actionText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionCancel]}
              onPress={() => { setShowActions(false); setSelectedMedley(null); }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
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
  listContent: { paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 20 },
  card: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  cardName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  cardDescription: { fontSize: 14, marginBottom: 6 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  // Expanded song list
  songList: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  songNumber: { fontSize: 13, fontWeight: '600', width: 22 },
  songInfo: { flex: 1 },
  songTitle: { fontSize: 14, fontWeight: '600' },
  songArtist: { fontSize: 12 },
  songDuration: { fontSize: 12 },
  // Empty state
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  emptySubtext: { fontSize: 14 },
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
