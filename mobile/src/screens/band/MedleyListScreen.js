import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import Badge from '../../components/Badge';
import { Ionicons } from '@expo/vector-icons';
import ErrorState from '../../components/ErrorState';
import PressableRow from '../../components/PressableRow';
import ActionSheet from '../../components/ActionSheet';
import api from '../../services/api';
import { formatDuration } from '../../utils/formatDuration';
import { useLayout } from '../../hooks/useLayout';

export default function MedleyListScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();

  const [medleys, setMedleys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
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
          <Ionicons name="add" size={28} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, workspaceId, colors.primary]);

  const loadMedleys = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await api.getMedleys(workspaceId);
      setMedleys(data);
    } catch (err) {
      setLoadError('Could not load medleys');
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
      <PressableRow
        style={[styles.card, { backgroundColor: colors.bgSecondary }]}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
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
                  <Badge label={song.key} color={colors.badgeKey} bgColor={colors.badgeKeyBg} />
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
      </PressableRow>
    );
  }, [colors, expandedId, handleLongPress, getSongList, getTotalDuration]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError && medleys.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <ErrorState
          iconName="layers-outline"
          title="Couldn't load medleys"
          message={loadError}
          onRetry={() => { setLoadError(null); loadMedleys(); }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={medleys}
        keyExtractor={(item) => item.id}
        renderItem={renderMedley}
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
            <Ionicons name="layers-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No medleys yet</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Group songs that flow together
            </Text>
          </View>
        }
      />

      <ActionSheet
        visible={showActions}
        title={selectedMedley?.name}
        actions={[
          {
            label: 'Edit',
            onPress: () => navigation.navigate('MedleyDetail', { medleyId: selectedMedley?.id, workspaceId, editing: true }),
          },
          { label: 'Delete', destructive: true, onPress: handleDelete },
        ]}
        onClose={() => { setShowActions(false); setSelectedMedley(null); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
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
});
