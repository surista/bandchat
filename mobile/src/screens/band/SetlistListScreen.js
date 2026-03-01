import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
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

export default function SetlistListScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();

  const [setlists, setSetlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Action sheet
  const [selectedSetlist, setSelectedSetlist] = useState(null);
  const [showActions, setShowActions] = useState(false);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Header "+" button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setShowCreate(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ color: colors.primary, fontSize: 28, fontWeight: '300', lineHeight: 30 }}>+</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.primary]);

  const loadSetlists = useCallback(async () => {
    try {
      const data = await api.getSetlists(workspaceId);
      setSetlists(data);
    } catch (err) {
      console.error('Failed to load setlists:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadSetlists();
  }, [loadSetlists]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loadingRef.current) loadSetlists();
    });
    return unsubscribe;
  }, [navigation, loadSetlists]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadSetlists();
  }, [loadSetlists]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await api.createSetlist(workspaceId, {
        name,
        description: newDescription.trim() || null,
      });
      setShowCreate(false);
      setNewName('');
      setNewDescription('');
      navigation.navigate('SetlistDetail', { setlistId: created.id, workspaceId });
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create setlist');
    } finally {
      setCreating(false);
    }
  }, [newName, newDescription, workspaceId, navigation]);

  const handleDuplicate = useCallback(async () => {
    if (!selectedSetlist) return;
    try {
      await api.duplicateSetlist(selectedSetlist.id);
      loadSetlists();
    } catch (err) {
      Alert.alert('Error', 'Failed to duplicate setlist');
    }
    setShowActions(false);
    setSelectedSetlist(null);
  }, [selectedSetlist, loadSetlists]);

  const handleDelete = useCallback(() => {
    if (!selectedSetlist) return;
    Alert.alert('Delete Setlist', `Delete "${selectedSetlist.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteSetlist(selectedSetlist.id);
            setSetlists(prev => prev.filter(s => s.id !== selectedSetlist.id));
          } catch (err) {
            Alert.alert('Error', 'Failed to delete setlist');
          }
          setShowActions(false);
          setSelectedSetlist(null);
        },
      },
    ]);
  }, [selectedSetlist]);

  const renderSetlist = useCallback(({ item }) => {
    const songs = (item.songs || []).filter(s => s.type === 'SONG' || (!s.type && s.song));
    const songCount = songs.length;
    const setBreaks = (item.songs || []).filter(s => s.type === 'SET_BREAK');
    const setCount = setBreaks.length > 0 ? setBreaks.length + 1 : 0;
    const totalDuration = (item.songs || []).reduce((sum, s) => sum + (s.song?.duration || s.duration || 0), 0);
    const preview = songs.slice(0, 4).map((s, i) => s.song?.title || s.label || `Song ${i + 1}`);
    const remaining = songCount - preview.length;

    return (
      <TouchableOpacity
        style={[styles.setlistCard, { backgroundColor: colors.bgSecondary }]}
        onPress={() => navigation.navigate('SetlistDetail', { setlistId: item.id, workspaceId })}
        onLongPress={() => { setSelectedSetlist(item); setShowActions(true); }}
        delayLongPress={400}
        activeOpacity={0.7}
      >
        <Text style={[styles.setlistName, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.name}
        </Text>
        {(item.performedAt || item.venue) && (
          <Text style={[styles.setlistMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.performedAt ? format(new Date(item.performedAt), 'MMM d, yyyy') : ''}
            {item.performedAt && item.venue ? ' \u00B7 ' : ''}
            {item.venue || ''}
          </Text>
        )}
        <View style={styles.badgeRow}>
          {songCount > 0 && <Badge label={`${songCount} songs`} color="#60a5fa" bgColor="rgba(96,165,250,0.15)" />}
          {setCount > 0 && <Badge label={`${setCount} sets`} color="#c084fc" bgColor="rgba(192,132,252,0.15)" />}
          {totalDuration > 0 && <Badge label={formatDuration(totalDuration)} color="#9ca3af" bgColor="rgba(156,163,175,0.15)" />}
        </View>
        {preview.length > 0 && (
          <View style={styles.previewList}>
            {preview.map((title, i) => (
              <Text key={i} style={[styles.previewItem, { color: colors.textSecondary }]} numberOfLines={1}>
                {i + 1}. {title}
              </Text>
            ))}
            {remaining > 0 && (
              <Text style={[styles.previewMore, { color: colors.textSecondary }]}>
                +{remaining} more...
              </Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  }, [colors, navigation, workspaceId]);

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
        data={setlists}
        keyExtractor={(item) => item.id}
        renderItem={renderSetlist}
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
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No setlists yet</Text>
          </View>
        }
      />

      {/* Create Setlist Modal */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>New Setlist</Text>
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Name *</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              value={newName}
              onChangeText={setNewName}
              placeholder="Setlist name"
              placeholderTextColor={colors.textSecondary}
              autoFocus
            />
            <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Description</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Optional description"
              placeholderTextColor={colors.textSecondary}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => { setShowCreate(false); setNewName(''); setNewDescription(''); }}
                disabled={creating}
              >
                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleCreate}
                disabled={creating || !newName.trim()}
              >
                {creating ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextWhite}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Action Sheet */}
      <Modal visible={showActions} transparent animationType="slide" onRequestClose={() => setShowActions(false)}>
        <TouchableOpacity
          style={styles.actionOverlay}
          activeOpacity={1}
          onPress={() => { setShowActions(false); setSelectedSetlist(null); }}
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.actionHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {selectedSetlist?.name}
            </Text>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                setShowActions(false);
                navigation.navigate('SetlistDetail', { setlistId: selectedSetlist?.id, workspaceId, editing: true });
                setSelectedSetlist(null);
              }}
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleDuplicate}>
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Duplicate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleDelete}>
              <Text style={[styles.actionText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionCancel]}
              onPress={() => { setShowActions(false); setSelectedSetlist(null); }}
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
  listContent: { padding: 12, paddingBottom: 20 },
  setlistCard: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  setlistName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  setlistMeta: { fontSize: 13, marginBottom: 6 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  previewList: { marginTop: 4 },
  previewItem: { fontSize: 13, lineHeight: 20 },
  previewMore: { fontSize: 13, fontStyle: 'italic', marginTop: 2 },
  emptyText: { fontSize: 15 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 12,
    padding: 24,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20 },
  modalLabel: { fontSize: 14, fontWeight: '500', marginBottom: 6 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 15, fontWeight: '600' },
  modalButtonTextWhite: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
  // Action sheet
  actionOverlay: {
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
