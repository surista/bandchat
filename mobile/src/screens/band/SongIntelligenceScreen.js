import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Linking,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

const TABS = ['recommendations', 'mashups', 'transitions', 'optimizer'];
const TAB_LABELS = {
  recommendations: 'Recs',
  mashups: 'Mashups',
  transitions: 'Transitions',
  optimizer: 'Optimizer',
};

function scoreColor(score) {
  if (score >= 70) return '#22c55e';
  if (score >= 50) return '#eab308';
  if (score >= 30) return '#f97316';
  return '#ef4444';
}

function PriorityBadge({ priority }) {
  const colorMap = { high: '#ef4444', medium: '#eab308', low: '#6b7280' };
  const color = colorMap[priority] || '#6b7280';
  return (
    <View style={[styles.priorityBadge, { backgroundColor: color + '20' }]}>
      <Text style={[styles.priorityText, { color }]}>{priority}</Text>
    </View>
  );
}

function ScoreBadge({ score }) {
  const color = scoreColor(score);
  return (
    <View style={[styles.scoreBadge, { backgroundColor: color + '20' }]}>
      <Text style={[styles.scoreText, { color }]}>{score}</Text>
    </View>
  );
}

// --- Recommendations Tab ---
function RecommendationsTab({ workspaceId, colors }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await api.getSongRecommendations(workspaceId);
        setData(result);
      } catch (err) {
        console.error('Failed to load recommendations:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId]);

  if (loading) return <ActivityIndicator style={{ padding: 40 }} size="large" color={colors.primary} />;
  if (!data) return <Text style={[styles.emptyText, { color: colors.textSecondary, padding: 40 }]}>Failed to load</Text>;

  const { analysis, recommendations } = data;

  return (
    <View>
      {/* Analysis */}
      {analysis && (
        <View style={styles.analysisSection}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} accessibilityRole="header">Repertoire Analysis</Text>
          <View style={styles.analysisGrid}>
            <View style={[styles.analysisCard, { backgroundColor: 'rgba(168,85,247,0.12)' }]}>
              <Text style={[styles.analysisValue, { color: '#a855f7' }]}>{analysis.totalSongs || 0}</Text>
              <Text style={[styles.analysisLabel, { color: '#a855f7' }]}>Songs</Text>
            </View>
            <View style={[styles.analysisCard, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
              <Text style={[styles.analysisValue, { color: '#3b82f6' }]}>{analysis.uniqueArtists || 0}</Text>
              <Text style={[styles.analysisLabel, { color: '#3b82f6' }]}>Artists</Text>
            </View>
            <View style={[styles.analysisCard, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
              <Text style={[styles.analysisValue, { color: '#22c55e' }]}>{Math.round(analysis.averageBpm || 0)}</Text>
              <Text style={[styles.analysisLabel, { color: '#22c55e' }]}>Avg BPM</Text>
            </View>
            <View style={[styles.analysisCard, { backgroundColor: 'rgba(234,179,8,0.12)' }]}>
              <Text style={[styles.analysisValue, { color: '#eab308' }]}>{analysis.topKeys?.[0]?.[0] || '-'}</Text>
              <Text style={[styles.analysisLabel, { color: '#eab308' }]}>Top Key</Text>
            </View>
          </View>
          {analysis.topArtists?.length > 0 && (
            <View style={styles.topArtists}>
              <Text style={[styles.subLabel, { color: colors.textSecondary }]}>Top Artists</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {analysis.topArtists.slice(0, 8).map(([artist, count], i) => (
                    <View key={i} style={[styles.artistChip, { backgroundColor: colors.bgTertiary }]}>
                      <Text style={[styles.artistChipText, { color: colors.textPrimary }]}>{artist} ({count})</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {/* Recommendations */}
      <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 16 }]} accessibilityRole="header">Suggestions</Text>
      {recommendations?.length > 0 ? (
        recommendations.map((rec, i) => (
          <View key={i} style={[styles.recCard, { backgroundColor: colors.bgSecondary }]}>
            <View style={styles.recHeader}>
              <PriorityBadge priority={rec.priority} />
              <View style={[styles.typeTag, { backgroundColor: colors.bgTertiary }]}>
                <Text style={[styles.typeTagText, { color: colors.textSecondary }]}>{rec.type}</Text>
              </View>
            </View>
            <Text style={[styles.recSuggestion, { color: colors.textPrimary }]}>{rec.suggestion}</Text>
            <Text style={[styles.recReason, { color: colors.textSecondary }]}>{rec.reason}</Text>
            {rec.searchTerm && (
              <TouchableOpacity
                onPress={() => Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(rec.searchTerm + ' cover songs')}`)}
                style={styles.searchLink}
                accessibilityRole="button"
                accessibilityLabel={`Search for ${rec.searchTerm}`}
              >
                <Text style={[styles.searchLinkText, { color: colors.primary }]}>Search</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      ) : (
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No suggestions yet. Add more songs!</Text>
      )}
    </View>
  );
}

// --- Mashups Tab ---
function MashupsTab({ workspaceId, colors }) {
  const [songs, setSongs] = useState([]);
  const [selectedSong, setSelectedSong] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getSongs(workspaceId);
        setSongs(data.filter(s => s.key || s.bpm));
      } catch (err) {
        console.error('Failed to load songs:', err);
      }
    })();
  }, [workspaceId]);

  const loadSuggestions = useCallback(async (song) => {
    setSelectedSong(song);
    setLoading(true);
    setSuggestions(null);
    try {
      const data = await api.getMashupSuggestions(workspaceId, song.id);
      setSuggestions(data);
    } catch (err) {
      console.error('Failed to load mashup suggestions:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  return (
    <View>
      <TouchableOpacity
        style={[styles.songSelector, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
        onPress={() => setShowPicker(true)}
        accessibilityRole="button"
        accessibilityLabel={selectedSong ? `Selected: ${selectedSong.title}. Tap to change` : 'Select a song to find mashups'}
      >
        <Text style={{ color: selectedSong ? colors.textPrimary : colors.textSecondary, fontSize: 15 }}>
          {selectedSong ? `${selectedSong.title}${selectedSong.artist ? ` - ${selectedSong.artist}` : ''}` : 'Select a song to find mashups...'}
        </Text>
      </TouchableOpacity>

      {selectedSong && (
        <View style={[styles.sourceInfo, { backgroundColor: colors.bgSecondary }]}>
          <Text style={[styles.sourceLabel, { color: colors.textSecondary }]}>Source Song</Text>
          <Text style={[styles.sourceTitle, { color: colors.textPrimary }]}>{selectedSong.title}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {selectedSong.key && <Text style={[styles.sourceMeta, { color: '#c084fc' }]}>Key: {selectedSong.key}</Text>}
            {selectedSong.bpm && <Text style={[styles.sourceMeta, { color: '#60a5fa' }]}>{selectedSong.bpm} BPM</Text>}
          </View>
        </View>
      )}

      {loading && <ActivityIndicator style={{ padding: 20 }} color={colors.primary} />}

      {suggestions?.suggestions?.map((s, i) => (
        <View key={i} style={[styles.mashupCard, { backgroundColor: colors.bgSecondary }]}>
          <View style={styles.mashupRow}>
            <ScoreBadge score={s.score} />
            <View style={styles.mashupInfo}>
              <Text style={[styles.mashupTitle, { color: colors.textPrimary }]} numberOfLines={1}>{s.song.title}</Text>
              {s.song.artist && <Text style={[styles.mashupArtist, { color: colors.textSecondary }]}>{s.song.artist}</Text>}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                {s.song.key && <Text style={{ color: '#c084fc', fontSize: 12 }}>Key: {s.song.key}</Text>}
                {s.song.bpm && <Text style={{ color: '#60a5fa', fontSize: 12 }}>{s.song.bpm} BPM</Text>}
              </View>
            </View>
          </View>
          {s.factors?.length > 0 && (
            <View style={styles.factorRow}>
              {s.factors.map((f, fi) => (
                <View key={fi} style={[styles.factorTag, { backgroundColor: (f.score >= 30 ? '#22c55e' : f.score >= 15 ? '#eab308' : '#6b7280') + '20' }]}>
                  <Text style={[styles.factorText, { color: f.score >= 30 ? '#22c55e' : f.score >= 15 ? '#eab308' : '#6b7280' }]}>
                    {f.reason}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}

      {suggestions && !suggestions.suggestions?.length && (
        <Text style={[styles.emptyText, { color: colors.textSecondary, padding: 20 }]}>No compatible songs found</Text>
      )}

      {/* Song Picker */}
      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowPicker(false)} accessibilityRole="button" accessibilityLabel="Dismiss song picker">
          <View style={[styles.pickerContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.pickerTitle, { color: colors.textPrimary }]} accessibilityRole="header">Select Song</Text>
            <FlatList
              data={songs}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerOption, selectedSong?.id === item.id && { backgroundColor: colors.bgTertiary }]}
                  onPress={() => { loadSuggestions(item); setShowPicker(false); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}${item.artist ? ` by ${item.artist}` : ''}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickerOptionText, { color: colors.textPrimary }]}>{item.title}</Text>
                    {item.artist && <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{item.artist}</Text>}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {item.key && <Text style={{ color: '#c084fc', fontSize: 12 }}>{item.key}</Text>}
                    {item.bpm && <Text style={{ color: '#60a5fa', fontSize: 12 }}>{item.bpm}</Text>}
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// --- Transitions Tab ---
function TransitionsTab({ workspaceId, colors }) {
  const [transitions, setTransitions] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getTransitions(workspaceId);
        setTransitions(data);
      } catch (err) {
        console.error('Failed to load transitions:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId]);

  if (loading) return <ActivityIndicator style={{ padding: 40 }} size="large" color={colors.primary} />;

  return (
    <View>
      {transitions?.count > 0 && (
        <Text style={[styles.transCount, { color: colors.textSecondary }]}>
          {transitions.count} compatible transitions found
        </Text>
      )}
      {transitions?.transitions?.map((t, i) => (
        <View key={i} style={[styles.transCard, { backgroundColor: colors.bgSecondary }]}>
          <View style={styles.transRow}>
            <ScoreBadge score={t.score} />
            <View style={styles.transInfo}>
              <Text style={[styles.transFrom, { color: colors.textPrimary }]} numberOfLines={1}>{t.from.title}</Text>
              <Text style={[styles.transArrow, { color: colors.textSecondary }]}>{'\u2193'}</Text>
              <Text style={[styles.transTo, { color: colors.textPrimary }]} numberOfLines={1}>{t.to.title}</Text>
            </View>
          </View>
          <View style={styles.transDetails}>
            {t.from.key && t.to.key && (
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                Key: {t.from.key} {'\u2192'} {t.to.key} (dist: {t.keyDistance})
              </Text>
            )}
            {t.from.bpm && t.to.bpm && (
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                BPM: {t.from.bpm} {'\u2192'} {t.to.bpm} (diff: {t.bpmDiff})
              </Text>
            )}
          </View>
        </View>
      ))}
      {(!transitions?.transitions?.length) && (
        <Text style={[styles.emptyText, { color: colors.textSecondary, padding: 20 }]}>No compatible transitions found. Add key and BPM data to your songs.</Text>
      )}
    </View>
  );
}

// --- Optimizer Tab ---
function OptimizerTab({ workspaceId, colors }) {
  const [songs, setSongs] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingSongs, setLoadingSongs] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getSongs(workspaceId);
        setSongs(data.filter(s => s.key || s.bpm));
      } catch (err) {
        console.error('Failed to load songs:', err);
      } finally {
        setLoadingSongs(false);
      }
    })();
  }, [workspaceId]);

  const toggleSong = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setResult(null);
  }, []);

  const optimize = useCallback(async () => {
    if (selected.size < 2) {
      Alert.alert('Required', 'Select at least 2 songs');
      return;
    }
    setLoading(true);
    try {
      const data = await api.optimizeSetlist(workspaceId, Array.from(selected));
      setResult(data);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to optimize');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, selected]);

  if (loadingSongs) return <ActivityIndicator style={{ padding: 40 }} size="large" color={colors.primary} />;

  return (
    <View>
      {result ? (
        <View style={[styles.optimizeResult, { backgroundColor: colors.bgSecondary }]}>
          <View style={styles.flowScoreRow}>
            <Text style={[styles.flowLabel, { color: colors.textSecondary }]}>Flow Score</Text>
            <Text style={[styles.flowScore, { color: scoreColor(result.flowScore) }]}>{result.flowScore}/100</Text>
          </View>
          {result.tip && <Text style={[styles.flowTip, { color: colors.textSecondary }]}>{result.tip}</Text>}
          {result.optimizedOrder?.map((song, idx) => (
            <View key={song.id} style={[styles.optimizedRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.orderBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.orderNumber}>{idx + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optimizedTitle, { color: colors.textPrimary }]}>{song.title}</Text>
                {song.artist && <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{song.artist}</Text>}
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {song.key && <Text style={{ color: '#c084fc', fontSize: 12 }}>{song.key}</Text>}
                {song.bpm && <Text style={{ color: '#60a5fa', fontSize: 12 }}>{song.bpm}</Text>}
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.clearButton} onPress={() => setResult(null)} accessibilityRole="button" accessibilityLabel="Clear and reselect songs">
            <Text style={[styles.clearText, { color: colors.primary }]}>Clear & Reselect</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={[styles.subLabel, { color: colors.textSecondary, paddingHorizontal: 0 }]}>
            Select songs to optimize ({selected.size} selected)
          </Text>
          {songs.map(song => {
            const isSelected = selected.has(song.id);
            return (
              <TouchableOpacity
                key={song.id}
                style={[styles.songCheckRow, { backgroundColor: isSelected ? colors.primary + '15' : colors.bgSecondary }]}
                onPress={() => toggleSong(song.id)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`${song.title}${isSelected ? ', selected' : ''}`}
              >
                <View style={[styles.checkbox, { borderColor: isSelected ? colors.primary : colors.border }, isSelected && { backgroundColor: colors.primary }]}>
                  {isSelected && <Text style={styles.checkmark}>{'\u2713'}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.songCheckTitle, { color: colors.textPrimary }]} numberOfLines={1}>{song.title}</Text>
                  {song.artist && <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{song.artist}</Text>}
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {song.key && <Text style={{ color: '#c084fc', fontSize: 12 }}>{song.key}</Text>}
                  {song.bpm && <Text style={{ color: '#60a5fa', fontSize: 12 }}>{song.bpm}</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[styles.optimizeButton, { backgroundColor: selected.size >= 2 ? colors.primary : colors.bgTertiary }]}
            onPress={optimize}
            disabled={loading || selected.size < 2}
            accessibilityRole="button"
            accessibilityLabel="Optimize order"
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={[styles.optimizeButtonText, { color: selected.size >= 2 ? '#ffffff' : colors.textSecondary }]}>
                Optimize Order
              </Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// --- Main Screen ---
export default function SongIntelligenceScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState('recommendations');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${TAB_LABELS[tab]} tab${activeTab === tab ? ', selected' : ''}`}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textSecondary }]}>
              {TAB_LABELS[tab]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.tabContent}>
        {activeTab === 'recommendations' && <RecommendationsTab workspaceId={workspaceId} colors={colors} />}
        {activeTab === 'mashups' && <MashupsTab workspaceId={workspaceId} colors={colors} />}
        {activeTab === 'transitions' && <TransitionsTab workspaceId={workspaceId} colors={colors} />}
        {activeTab === 'optimizer' && <OptimizerTab workspaceId={workspaceId} colors={colors} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Tabs
  tabRow: { paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)' },
  tab: { paddingVertical: 12, paddingHorizontal: 16 },
  tabText: { fontSize: 14, fontWeight: '600' },
  tabContent: { padding: 12, paddingBottom: 30 },
  // Section
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  subLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, paddingHorizontal: 4 },
  emptyText: { fontSize: 14, textAlign: 'center' },
  // Analysis
  analysisSection: { marginBottom: 8 },
  analysisGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  analysisCard: { width: '48%', flexGrow: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  analysisValue: { fontSize: 20, fontWeight: '800' },
  analysisLabel: { fontSize: 12, fontWeight: '600', opacity: 0.8, marginTop: 2 },
  topArtists: { marginTop: 12 },
  artistChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  artistChipText: { fontSize: 13 },
  // Recommendations
  recCard: { borderRadius: 10, padding: 12, marginBottom: 8 },
  recHeader: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  priorityText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  typeTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  typeTagText: { fontSize: 11, fontWeight: '600' },
  recSuggestion: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  recReason: { fontSize: 13, lineHeight: 19 },
  searchLink: { marginTop: 6 },
  searchLinkText: { fontSize: 13, fontWeight: '600' },
  // Score badge
  scoreBadge: { width: 40, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  scoreText: { fontSize: 15, fontWeight: '800' },
  // Mashups
  songSelector: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 12 },
  sourceInfo: { borderRadius: 10, padding: 12, marginBottom: 12 },
  sourceLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  sourceTitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  sourceMeta: { fontSize: 13, fontWeight: '600' },
  mashupCard: { borderRadius: 10, padding: 12, marginBottom: 8 },
  mashupRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mashupInfo: { flex: 1 },
  mashupTitle: { fontSize: 15, fontWeight: '600' },
  mashupArtist: { fontSize: 13 },
  factorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  factorTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  factorText: { fontSize: 11, fontWeight: '600' },
  // Transitions
  transCount: { fontSize: 13, marginBottom: 8 },
  transCard: { borderRadius: 10, padding: 12, marginBottom: 8 },
  transRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  transInfo: { flex: 1 },
  transFrom: { fontSize: 14, fontWeight: '600' },
  transArrow: { fontSize: 14, marginVertical: 2 },
  transTo: { fontSize: 14, fontWeight: '600' },
  transDetails: { marginTop: 8, gap: 2 },
  // Optimizer
  songCheckRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, padding: 10, marginBottom: 4, gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  checkmark: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  songCheckTitle: { fontSize: 14, fontWeight: '600' },
  optimizeButton: { marginTop: 16, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  optimizeButtonText: { fontSize: 16, fontWeight: '600' },
  optimizeResult: { borderRadius: 10, padding: 14 },
  flowScoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  flowLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  flowScore: { fontSize: 24, fontWeight: '800' },
  flowTip: { fontSize: 13, marginBottom: 12 },
  optimizedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  orderBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  orderNumber: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  optimizedTitle: { fontSize: 14, fontWeight: '600' },
  clearButton: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
  clearText: { fontSize: 15, fontWeight: '600' },
  // Picker
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerContent: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 },
  pickerTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  pickerOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8 },
  pickerOptionText: { fontSize: 15 },
});
