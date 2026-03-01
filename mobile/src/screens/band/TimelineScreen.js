import { useState, useEffect, useCallback, useLayoutEffect, useRef, useMemo } from 'react';
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
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

const EVENT_TYPES = [
  { key: 'formation', label: 'Band Formation', icon: '\uD83C\uDFB8' },
  { key: 'first_gig', label: 'First Gig', icon: '\uD83C\uDFA4' },
  { key: 'gig', label: 'Gig / Show', icon: '\uD83C\uDFB5' },
  { key: 'rehearsal', label: 'Rehearsal', icon: '\uD83E\uDD41' },
  { key: 'member_joined', label: 'Member Joined', icon: '\uD83D\uDE4C' },
  { key: 'member_left', label: 'Member Left', icon: '\uD83D\uDC4B' },
  { key: 'album_release', label: 'Album / EP Release', icon: '\uD83D\uDCBF' },
  { key: 'milestone', label: 'Milestone', icon: '\uD83C\uDFC6' },
  { key: 'custom', label: 'Custom Event', icon: '\uD83D\uDCCC' },
];

function getEventIcon(eventType) {
  return EVENT_TYPES.find(t => t.key === eventType)?.icon || '\uD83D\uDCCC';
}

function getEventLabel(eventType) {
  return EVENT_TYPES.find(t => t.key === eventType)?.label || eventType;
}

function formatEventDate(dateStr) {
  if (!dateStr) return '';
  try {
    return format(new Date(dateStr), 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

export default function TimelineScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formEventType, setFormEventType] = useState('custom');
  const [formDate, setFormDate] = useState(new Date());
  const [formImageUrl, setFormImageUrl] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);

  // Action sheet
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showActions, setShowActions] = useState(false);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Header "+" button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => {
            resetForm();
            setShowForm(true);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ color: colors.primary, fontSize: 28, fontWeight: '300', lineHeight: 30 }}>+</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.primary]);

  const loadData = useCallback(async () => {
    try {
      const [timeline, ws] = await Promise.all([
        api.getTimeline(workspaceId),
        api.getWorkspace(workspaceId),
      ]);
      setEvents(timeline);
      const membership = ws.members?.find(m => m.userId === user?.id);
      setIsAdmin(membership?.role === 'admin');
    } catch (err) {
      console.error('Failed to load timeline:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // Group events by year
  const groupedData = useMemo(() => {
    const items = [];
    let currentYear = null;
    for (const event of events) {
      const year = new Date(event.eventDate).getFullYear();
      if (year !== currentYear) {
        currentYear = year;
        items.push({ type: 'year', year, id: `year-${year}` });
      }
      items.push({ type: 'event', ...event });
    }
    return items;
  }, [events]);

  const resetForm = useCallback(() => {
    setEditingEvent(null);
    setFormTitle('');
    setFormDescription('');
    setFormEventType('custom');
    setFormDate(new Date());
    setFormImageUrl('');
  }, []);

  const startEdit = useCallback((event) => {
    setEditingEvent(event);
    setFormTitle(event.title || '');
    setFormDescription(event.description || '');
    setFormEventType(event.eventType || 'custom');
    setFormDate(new Date(event.eventDate));
    setFormImageUrl(event.imageUrl || '');
    setShowForm(true);
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedTitle = formTitle.trim();
    if (!trimmedTitle) {
      Alert.alert('Required', 'Title is required');
      return;
    }
    setSaving(true);
    const data = {
      title: trimmedTitle,
      description: formDescription.trim() || null,
      eventType: formEventType,
      eventDate: formDate.toISOString(),
      imageUrl: formImageUrl.trim() || null,
    };
    try {
      if (editingEvent) {
        await api.updateTimelineEvent(editingEvent.id, data);
      } else {
        await api.createTimelineEvent(workspaceId, data);
      }
      setShowForm(false);
      resetForm();
      loadData();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save event');
    } finally {
      setSaving(false);
    }
  }, [formTitle, formDescription, formEventType, formDate, formImageUrl, editingEvent, workspaceId, resetForm, loadData]);

  const handleDelete = useCallback(async () => {
    if (!selectedEvent) return;
    Alert.alert('Delete Event', `Delete "${selectedEvent.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteTimelineEvent(selectedEvent.id);
            setEvents(prev => prev.filter(e => e.id !== selectedEvent.id));
          } catch (err) {
            Alert.alert('Error', 'Failed to delete event');
          }
          setShowActions(false);
          setSelectedEvent(null);
        },
      },
    ]);
  }, [selectedEvent]);

  const handleLongPress = useCallback((event) => {
    const canEdit = event.createdById === user?.id || isAdmin;
    if (!canEdit) return;
    setSelectedEvent(event);
    setShowActions(true);
  }, [user?.id, isAdmin]);

  const handleAutoGenerate = useCallback(async () => {
    Alert.alert(
      'Auto-Generate Timeline',
      'Generate timeline events from your band history (gigs, members, milestones)?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setGenerating(true);
            try {
              const result = await api.generateTimeline(workspaceId);
              Alert.alert('Done', `${result.created || 0} events generated`);
              loadData();
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to generate timeline');
            } finally {
              setGenerating(false);
            }
          },
        },
      ]
    );
  }, [workspaceId, loadData]);

  const handleRegenerate = useCallback(async () => {
    Alert.alert(
      'Regenerate Timeline',
      'This will delete auto-generated events and recreate them from current data. Custom events will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            setGenerating(true);
            try {
              const result = await api.regenerateTimeline(workspaceId);
              Alert.alert('Done', `${result.deleted || 0} removed, ${result.created || 0} created`);
              loadData();
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to regenerate timeline');
            } finally {
              setGenerating(false);
            }
          },
        },
      ]
    );
  }, [workspaceId, loadData]);

  const onDateChange = useCallback((event, selectedDate) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selectedDate) setFormDate(selectedDate);
  }, []);

  const renderItem = useCallback(({ item }) => {
    if (item.type === 'year') {
      return (
        <View style={styles.yearRow}>
          <View style={[styles.yearBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.yearText}>{item.year}</Text>
          </View>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.eventCard, { backgroundColor: colors.bgSecondary }]}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
        activeOpacity={0.7}
      >
        <View style={styles.eventHeader}>
          <Text style={styles.eventIcon}>{getEventIcon(item.eventType)}</Text>
          <View style={styles.eventHeaderInfo}>
            <Text style={[styles.eventTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={[styles.eventDate, { color: colors.textSecondary }]}>
              {formatEventDate(item.eventDate)}
            </Text>
          </View>
        </View>
        {item.description ? (
          <Text style={[styles.eventDescription, { color: colors.textSecondary }]} numberOfLines={3}>
            {item.description}
          </Text>
        ) : null}
        {(item.createdBy || item.removedCreatorName) ? (
          <Text style={[styles.eventCreator, { color: colors.textSecondary }]}>
            Added by {item.createdBy?.displayName || item.removedCreatorName || 'Deleted User'}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  }, [colors, handleLongPress]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (showForm) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.bgPrimary }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <Text style={[styles.formTitle, { color: colors.textPrimary }]}>
            {editingEvent ? 'Edit Event' : 'New Event'}
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Event Type</Text>
          <TouchableOpacity
            style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
            onPress={() => setShowTypePicker(true)}
          >
            <Text style={{ fontSize: 16, marginRight: 8 }}>{getEventIcon(formEventType)}</Text>
            <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{getEventLabel(formEventType)}</Text>
          </TouchableOpacity>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Date</Text>
          <TouchableOpacity
            style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 15 }}>
              {format(formDate, 'EEEE, MMM d, yyyy')}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={formDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={onDateChange}
              themeVariant="dark"
            />
          )}

          <Text style={[styles.label, { color: colors.textSecondary }]}>Title *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={formTitle}
            onChangeText={setFormTitle}
            placeholder="Event title"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={formDescription}
            onChangeText={setFormDescription}
            placeholder="Optional description..."
            placeholderTextColor={colors.textSecondary}
            multiline
            textAlignVertical="top"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Image URL</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={formImageUrl}
            onChangeText={setFormImageUrl}
            placeholder="https://..."
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            keyboardType="url"
          />

          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.bgTertiary }]}
              onPress={() => { setShowForm(false); resetForm(); }}
              disabled={saving}
            >
              <Text style={[styles.formButtonText, { color: colors.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.primary }]}
              onPress={handleSave}
              disabled={saving || !formTitle.trim()}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.formButtonTextWhite}>{editingEvent ? 'Save' : 'Create'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Type Picker Modal */}
        <Modal visible={showTypePicker} transparent animationType="fade" onRequestClose={() => setShowTypePicker(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTypePicker(false)}>
            <View style={[styles.pickerContent, { backgroundColor: colors.modalBg }]}>
              <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>Event Type</Text>
              {EVENT_TYPES.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.pickerOption, formEventType === t.key && { backgroundColor: colors.bgTertiary }]}
                  onPress={() => { setFormEventType(t.key); setShowTypePicker(false); }}
                >
                  <Text style={{ fontSize: 18, marginRight: 10 }}>{t.icon}</Text>
                  <Text style={[styles.pickerOptionText, { color: colors.textPrimary }]}>{t.label}</Text>
                  {formEventType === t.key && <Text style={{ color: colors.primary, marginLeft: 'auto' }}>{'\u2713'}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      {/* Admin actions */}
      {isAdmin && (
        <View style={styles.adminRow}>
          <TouchableOpacity
            style={[styles.adminButton, { backgroundColor: colors.bgTertiary }]}
            onPress={handleAutoGenerate}
            disabled={generating}
            activeOpacity={0.7}
          >
            {generating ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={[styles.adminButtonText, { color: colors.textSecondary }]}>Auto-Generate</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.adminButton, { backgroundColor: colors.bgTertiary }]}
            onPress={handleRegenerate}
            disabled={generating}
            activeOpacity={0.7}
          >
            <Text style={[styles.adminButtonText, { color: colors.textSecondary }]}>Regenerate</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={groupedData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
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
            <Text style={styles.emptyIcon}>{'\uD83D\uDCDC'}</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Your band's story starts here!
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Add events or tap Auto-Generate
            </Text>
          </View>
        }
      />

      {/* Action Sheet */}
      <Modal visible={showActions} transparent animationType="slide" onRequestClose={() => setShowActions(false)}>
        <TouchableOpacity
          style={styles.actionOverlay}
          activeOpacity={1}
          onPress={() => { setShowActions(false); setSelectedEvent(null); }}
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.actionHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {selectedEvent?.title}
            </Text>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                setShowActions(false);
                startEdit(selectedEvent);
                setSelectedEvent(null);
              }}
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleDelete}>
              <Text style={[styles.actionText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionCancel]}
              onPress={() => { setShowActions(false); setSelectedEvent(null); }}
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
  // Admin row
  adminRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  adminButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  adminButtonText: { fontSize: 13, fontWeight: '600' },
  // List
  listContent: { paddingHorizontal: 12, paddingBottom: 20 },
  // Year badge
  yearRow: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  yearBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  yearText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  // Event card
  eventCard: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  eventIcon: { fontSize: 22, marginTop: 2 },
  eventHeaderInfo: { flex: 1 },
  eventTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  eventDate: { fontSize: 13 },
  eventDescription: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  eventCreator: { fontSize: 12, marginTop: 6 },
  // Empty state
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  emptySubtext: { fontSize: 14 },
  // Form
  formContent: { padding: 16, paddingBottom: 40 },
  formTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  pickerInput: { flexDirection: 'row', alignItems: 'center' },
  textArea: { minHeight: 80, paddingTop: 10 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  formButton: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  formButtonText: { fontSize: 16, fontWeight: '600' },
  formButtonTextWhite: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  // Type picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
  },
  pickerTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  pickerOptionText: { fontSize: 15 },
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
