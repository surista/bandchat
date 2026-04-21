import { useState, useEffect, useCallback, useMemo, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  SectionList,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import ActionSheet from '../../components/ActionSheet';
import { Ionicons } from '@expo/vector-icons';
import ErrorState from '../../components/ErrorState';
import { SkeletonList } from '../../components/SkeletonLoader';
import api from '../../services/api';
import { useLayout } from '../../hooks/useLayout';

const PRIORITY_COLORS = {
  low: '#6b7280',
  normal: '#3b82f6',
  high: '#eab308',
  urgent: '#ef4444',
};

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

function timeAgo(dateStr) {
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
  } catch {
    return '';
  }
}

export default function AnnouncementsScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();
  const { user } = useAuth();

  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState('normal');
  const [isPinned, setIsPinned] = useState(true);
  const [saving, setSaving] = useState(false);

  // Action sheet
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [showActions, setShowActions] = useState(false);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => openCreateModal()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Create announcement"
        >
          <Ionicons name="add" size={28} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.primary]);

  const loadAnnouncements = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getAnnouncements(workspaceId);
      setAnnouncements(data);
    } catch (err) {
      if (!announcements.length) setError(err.message || 'Failed to load announcements');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loadingRef.current) loadAnnouncements();
    });
    return unsubscribe;
  }, [navigation, loadAnnouncements]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAnnouncements();
  }, [loadAnnouncements]);

  const openCreateModal = useCallback(() => {
    setEditingAnnouncement(null);
    setTitle('');
    setContent('');
    setPriority('normal');
    setIsPinned(true);
    setShowModal(true);
  }, []);

  const openEditModal = useCallback((ann) => {
    setEditingAnnouncement(ann);
    setTitle(ann.title || '');
    setContent(ann.content || '');
    setPriority(ann.priority || 'normal');
    setIsPinned(ann.isPinned ?? true);
    setShowModal(true);
    setShowActions(false);
    setSelectedAnnouncement(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Title is required');
      return;
    }
    if (!content.trim()) {
      Alert.alert('Required', 'Content is required');
      return;
    }
    setSaving(true);
    try {
      const data = {
        title: title.trim(),
        content: content.trim(),
        priority,
        isPinned,
      };
      if (editingAnnouncement) {
        await api.updateAnnouncement(editingAnnouncement.id, data);
      } else {
        await api.createAnnouncement(workspaceId, data);
      }
      setShowModal(false);
      loadAnnouncements();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save announcement');
    } finally {
      setSaving(false);
    }
  }, [title, content, priority, isPinned, editingAnnouncement, workspaceId, loadAnnouncements]);

  const handleAcknowledge = useCallback(async (id) => {
    try {
      await api.acknowledgeAnnouncement(id);
      setAnnouncements(prev =>
        prev.map(a => a.id === id ? { ...a, isAcknowledged: true, acknowledgmentCount: (a.acknowledgmentCount || 0) + 1 } : a)
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to acknowledge');
    }
  }, []);

  const handleDelete = useCallback(() => {
    if (!selectedAnnouncement) return;
    Alert.alert('Delete Announcement', `Delete "${selectedAnnouncement.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteAnnouncement(selectedAnnouncement.id);
            setAnnouncements(prev => prev.filter(a => a.id !== selectedAnnouncement.id));
          } catch (err) {
            Alert.alert('Error', 'Failed to delete announcement');
          }
          setShowActions(false);
          setSelectedAnnouncement(null);
        },
      },
    ]);
  }, [selectedAnnouncement]);

  const sections = useMemo(() => {
    const requiresAck = announcements.filter(a => a.isPinned && !a.isAcknowledged);
    const others = announcements.filter(a => !a.isPinned || a.isAcknowledged);
    const result = [];
    if (requiresAck.length > 0) {
      result.push({ title: `Requires Acknowledgment (${requiresAck.length})`, data: requiresAck, isUrgent: true });
    }
    if (others.length > 0) {
      result.push({ title: 'Previous Announcements', data: others });
    }
    return result;
  }, [announcements]);

  const renderAnnouncement = useCallback(({ item }) => {
    const prioColor = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.normal;
    const needsAck = item.isPinned && !item.isAcknowledged;
    const authorName = item.createdBy?.displayName || item.removedCreatorName || 'Deleted User';

    return (
      <TouchableOpacity
        style={[styles.annCard, { backgroundColor: colors.bgSecondary }]}
        onLongPress={() => { setSelectedAnnouncement(item); setShowActions(true); }}
        delayLongPress={400}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Announcement: ${item.title}. Long press for options`}
      >
        {/* Priority stripe */}
        <View style={[styles.priorityStripe, { backgroundColor: prioColor }]} />
        <View style={styles.annContent}>
          <View style={styles.annHeaderRow}>
            {item.isPinned && <Ionicons name="pin-outline" size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />}
            <Text style={[styles.annTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
          <Text style={[styles.annText, { color: colors.textSecondary }]} numberOfLines={3}>
            {item.content}
          </Text>
          <View style={styles.annFooter}>
            <Text style={[styles.annMeta, { color: colors.textSecondary }]}>
              By {authorName} {'\u00B7'} {timeAgo(item.createdAt)}
            </Text>
            {item.acknowledgmentCount > 0 && (
              <Text style={[styles.ackCount, { color: colors.textSecondary }]}>
                Seen by {item.acknowledgmentCount}/{item.memberCount || '?'}
              </Text>
            )}
          </View>
          {needsAck && (
            <TouchableOpacity
              style={[styles.ackButton, { backgroundColor: '#22c55e' }]}
              onPress={() => handleAcknowledge(item.id)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Acknowledge ${item.title}`}
            >
              <Text style={styles.ackButtonText}>Acknowledge</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [colors, handleAcknowledge]);

  const renderSectionHeader = useCallback(({ section }) => (
    <View style={[styles.sectionHeader, section.isUrgent && styles.urgentSection]}>
      <Text style={[styles.sectionTitle, { color: section.isUrgent ? '#ef4444' : colors.textSecondary }]} accessibilityRole="header">
        {section.title}
      </Text>
    </View>
  ), [colors]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <SkeletonList count={5} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <ErrorState
          iconName="megaphone-outline"
          title="Couldn't load announcements"
          message={error}
          onRetry={() => { setLoading(true); loadAnnouncements(); }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderAnnouncement}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
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
            <Ionicons name="megaphone-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No announcements yet</Text>
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
              Share important updates with your band. Tap + to post an announcement.
            </Text>
          </View>
        }
      />

      {/* Create/Edit Modal */}
      <Modal visible={showModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardDismissMode="on-drag">
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {editingAnnouncement ? 'Edit Announcement' : 'New Announcement'}
              </Text>

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Title *</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Announcement title"
                placeholderTextColor={colors.textSecondary}
                autoFocus
                accessibilityLabel="Announcement title"
              />

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Content *</Text>
              <TextInput
                style={[styles.modalInput, styles.contentInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={content}
                onChangeText={setContent}
                placeholder="Announcement content"
                placeholderTextColor={colors.textSecondary}
                multiline
                accessibilityLabel="Announcement content"
              />

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Priority</Text>
              <View style={styles.priorityPicker}>
                {PRIORITY_OPTIONS.map(opt => {
                  const active = priority === opt.value;
                  const pColor = PRIORITY_COLORS[opt.value];
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.priorityChip, { backgroundColor: active ? pColor + '30' : colors.bgTertiary, borderColor: active ? pColor : 'transparent', borderWidth: 1 }]}
                      onPress={() => setPriority(opt.value)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`${opt.label} priority${active ? ', selected' : ''}`}
                    >
                      <Text style={[styles.priorityChipText, { color: active ? pColor : colors.textSecondary }]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setIsPinned(prev => !prev)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Pin and require acknowledgment, ${isPinned ? 'checked' : 'unchecked'}`}
              >
                <View style={[styles.checkbox, { borderColor: colors.border }, isPinned && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  {isPinned && <Text style={[styles.checkmark, { color: colors.primaryText }]}>{'\u2713'}</Text>}
                </View>
                <Text style={[styles.checkboxLabel, { color: colors.textPrimary }]}>Pin & require acknowledgment</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => setShowModal(false)}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                disabled={saving || !title.trim() || !content.trim()}
                accessibilityRole="button"
                accessibilityLabel={editingAnnouncement ? 'Save announcement' : 'Post announcement'}
              >
                {saving ? (
                  <ActivityIndicator color={colors.primaryText} size="small" />
                ) : (
                  <Text style={[styles.modalButtonTextWhite, { color: colors.primaryText }]}>{editingAnnouncement ? 'Save' : 'Post'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Action Sheet */}
      <ActionSheet
        visible={showActions}
        title={selectedAnnouncement?.title}
        actions={[
          { label: 'Edit', onPress: () => openEditModal(selectedAnnouncement) },
          { label: 'Delete', destructive: true, onPress: handleDelete },
        ]}
        onClose={() => { setShowActions(false); setSelectedAnnouncement(null); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  emptyHint: { fontSize: 13, textAlign: 'center', opacity: 0.7, maxWidth: 280 },
  listContent: { padding: 12, paddingBottom: 20 },
  // Section header
  sectionHeader: { paddingVertical: 8, paddingHorizontal: 4 },
  urgentSection: { },
  sectionTitle: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  // Announcement card
  annCard: {
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
  },
  priorityStripe: { width: 4 },
  annContent: { flex: 1, padding: 12 },
  annHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  pinIcon: { fontSize: 14, marginRight: 6 },
  annTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
  annText: { fontSize: 14, lineHeight: 20, marginBottom: 6 },
  annFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  annMeta: { fontSize: 12 },
  ackCount: { fontSize: 12 },
  ackButton: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  ackButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
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
    maxHeight: '80%',
    maxWidth: 500,
    width: '100%',
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
  contentInput: { height: 100, textAlignVertical: 'top' },
  priorityPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  priorityChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14 },
  priorityChipText: { fontSize: 14, fontWeight: '600' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkmark: { fontSize: 14, fontWeight: '700' },
  checkboxLabel: { fontSize: 15 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 15, fontWeight: '600' },
  modalButtonTextWhite: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
});
