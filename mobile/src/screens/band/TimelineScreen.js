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
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import ErrorState from '../../components/ErrorState';
import PressableRow from '../../components/PressableRow';
import ActionSheet from '../../components/ActionSheet';
import useDebounce from '../../hooks/useDebounce';
import api from '../../services/api';
import { useLayout } from '../../hooks/useLayout';

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
    return format(new Date(dateStr), 'dd-MMM-yyyy');
  } catch {
    return dateStr;
  }
}

export default function TimelineScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { user } = useAuth()
  const { isTablet, contentMaxWidth } = useLayout();
  const { colors, mode } = useTheme();
  const toast = useToast();
  const headerHeight = useHeaderHeight();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

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
          accessibilityRole="button"
          accessibilityLabel="Add timeline event"
        >
          <Ionicons name="add" size={28} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.primary]);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [timeline, ws] = await Promise.all([
        api.getTimeline(workspaceId),
        api.getWorkspace(workspaceId),
      ]);
      setEvents(timeline);
      const membership = ws.members?.find(m => m.userId === user?.id);
      setIsAdmin(membership?.role === 'ADMIN');
    } catch (err) {
      if (events.length === 0) {
        setError(err.message || 'Failed to load timeline');
      }
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
    // Filter by search first
    const q = debouncedSearch.trim().toLowerCase();
    const filtered = q ? events.filter(e =>
      e.title?.toLowerCase().includes(q) ||
      e.description?.toLowerCase().includes(q)
    ) : events;
    // Then group filtered events by year
    const items = [];
    let currentYear = null;
    for (const event of filtered) {
      const year = new Date(event.eventDate).getFullYear();
      if (year !== currentYear) {
        currentYear = year;
        items.push({ type: 'year', year, id: `year-${year}` });
      }
      items.push({ type: 'event', ...event });
    }
    return items;
  }, [events, debouncedSearch]);

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
              toast.success(`${result.created || 0} events generated`);
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
              toast.success(`${result.deleted || 0} removed, ${result.created || 0} created`);
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
            <Text style={[styles.yearText, { color: colors.primaryText }]}>{item.year}</Text>
          </View>
        </View>
      );
    }

    return (
      <PressableRow
        style={[styles.eventCard, { backgroundColor: colors.bgSecondary }]}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${formatEventDate(item.eventDate)}. Long press for options`}
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
      </PressableRow>
    );
  }, [colors, handleLongPress]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <ErrorState message={error} onRetry={loadData} />
      </SafeAreaView>
    );
  }

  if (showForm) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        <ScrollView contentContainerStyle={[styles.formContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Text style={[styles.formTitle, { color: colors.textPrimary }]}>
            {editingEvent ? 'Edit Event' : 'New Event'}
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Event Type</Text>
          <PressableRow
            style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
            onPress={() => setShowTypePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={`Event type: ${getEventLabel(formEventType)}`}
          >
            <Text style={{ fontSize: 16, marginRight: 8 }}>{getEventIcon(formEventType)}</Text>
            <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{getEventLabel(formEventType)}</Text>
          </PressableRow>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateShortcuts} contentContainerStyle={styles.dateShortcutsContent}>
            {[
              { label: 'Today', getDate: () => new Date() },
              { label: 'Tomorrow', getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); return d; } },
              { label: 'This Weekend', getDate: () => { const d = new Date(); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? 0 : 6 - day)); return d; } },
              { label: 'Next Week', getDate: () => { const d = new Date(); d.setDate(d.getDate() + (8 - d.getDay())); return d; } },
            ].map(shortcut => (
              <TouchableOpacity
                key={shortcut.label}
                style={[styles.dateChip, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
                onPress={() => setFormDate(shortcut.getDate())}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Set date to ${shortcut.label}`}
              >
                <Text style={[styles.dateChipText, { color: colors.textPrimary }]}>{shortcut.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <PressableRow
            style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
            onPress={() => setShowDatePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={`Date: ${format(formDate, 'EEEE, dd-MMM-yyyy')}`}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 15 }}>
              {format(formDate, 'EEEE, dd-MMM-yyyy')}
            </Text>
          </PressableRow>

          {showDatePicker && (
            <DateTimePicker
              value={formDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={onDateChange}
              themeVariant={mode === 'dark' ? 'dark' : 'light'}
            />
          )}

          <Text style={[styles.label, { color: colors.textSecondary }]}>Title *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={formTitle}
            onChangeText={setFormTitle}
            placeholder="Event title"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Event title"
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
            accessibilityLabel="Event description"
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
            accessibilityLabel="Image URL"
          />

          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.bgTertiary }]}
              onPress={() => { setShowForm(false); resetForm(); }}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.formButtonText, { color: colors.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.primary }]}
              onPress={handleSave}
              disabled={saving || !formTitle.trim()}
              accessibilityRole="button"
              accessibilityLabel={editingEvent ? 'Save event' : 'Create event'}
            >
              {saving ? (
                <ActivityIndicator color={colors.primaryText} size="small" />
              ) : (
                <Text style={[styles.formButtonTextWhite, { color: colors.primaryText }]}>{editingEvent ? 'Save' : 'Create'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Type Picker Modal */}
        <Modal visible={showTypePicker} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowTypePicker(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTypePicker(false)} accessibilityRole="button" accessibilityLabel="Dismiss event type picker">
            <View style={[styles.pickerContent, { backgroundColor: colors.modalBg }]} accessibilityViewIsModal>
              <Text style={[styles.pickerTitle, { color: colors.textPrimary }]} accessibilityRole="header">Event Type</Text>
              {EVENT_TYPES.map(t => (
                <PressableRow
                  key={t.key}
                  style={[styles.pickerOption, formEventType === t.key && { backgroundColor: colors.bgTertiary }]}
                  onPress={() => { setFormEventType(t.key); setShowTypePicker(false); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.label}${formEventType === t.key ? ', selected' : ''}`}
                >
                  <Text style={{ fontSize: 18, marginRight: 10 }}>{t.icon}</Text>
                  <Text style={[styles.pickerOptionText, { color: colors.textPrimary }]}>{t.label}</Text>
                  {formEventType === t.key && <Text style={{ color: colors.primary, marginLeft: 'auto' }}>{'\u2713'}</Text>}
                </PressableRow>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      {/* Admin actions */}
      {isAdmin && (
        <View style={styles.adminRow}>
          <TouchableOpacity
            style={[styles.adminButton, { backgroundColor: colors.bgTertiary }]}
            onPress={handleAutoGenerate}
            disabled={generating}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Auto-generate timeline"
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
            accessibilityRole="button"
            accessibilityLabel="Regenerate timeline"
          >
            <Text style={[styles.adminButtonText, { color: colors.textSecondary }]}>Regenerate</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.searchBar, { borderBottomColor: colors.border }]}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search timeline..."
          placeholderTextColor={colors.textSecondary}
          autoCorrect={false}
          accessibilityLabel="Search timeline"
        />
      </View>

      <FlatList
        data={groupedData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentInsetAdjustmentBehavior="automatic"
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
            <Ionicons name={debouncedSearch.trim() ? 'search' : 'time-outline'} size={40} color={colors.textSecondary} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {debouncedSearch.trim() ? 'No matching events' : "Your band's story starts here!"}
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              {debouncedSearch.trim() ? 'Try a different search term' : 'Add events or tap Auto-Generate'}
            </Text>
          </View>
        }
      />

      <ActionSheet
        visible={showActions}
        title={selectedEvent?.title}
        actions={[
          { label: 'Edit', onPress: () => startEdit(selectedEvent) },
          { label: 'Delete', destructive: true, onPress: handleDelete },
        ]}
        onClose={() => { setShowActions(false); setSelectedEvent(null); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
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
  // Search
  searchBar: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  searchInput: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  dateShortcuts: { marginBottom: 8, flexGrow: 0 },
  dateShortcutsContent: { gap: 8 },
  dateChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  dateChipText: { fontSize: 13, fontWeight: '500' },
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
});
