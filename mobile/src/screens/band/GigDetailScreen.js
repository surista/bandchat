import { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  Linking,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { successNotification } from '../../utils/haptics';
import api from '../../services/api';

const ATTENDEE_STATUSES = ['ATTENDING', 'MAYBE', 'NOT_ATTENDING'];
const ATTENDEE_LABELS = { ATTENDING: 'Going', MAYBE: 'Maybe', NOT_ATTENDING: 'Not Going' };
const ATTENDEE_COLORS = { ATTENDING: '#22c55e', MAYBE: '#eab308', NOT_ATTENDING: '#ef4444' };

const GIG_TYPES = ['GIG', 'REHEARSAL', 'RECORDING', 'OTHER'];
const GIG_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'];

const TYPE_COLORS = {
  GIG: '#3b82f6',
  REHEARSAL: '#38bdf8',
  RECORDING: '#6366f1',
  OTHER: '#6b7280',
};

const STATUS_COLORS = {
  SCHEDULED: '#3b82f6',
  COMPLETED: '#22c55e',
  CANCELLED: '#ef4444',
};

export default function GigDetailScreen({ navigation, route }) {
  const { gigId, workspaceId, editing: startEditing } = route.params;
  const isNew = !gigId;
  const { user } = useAuth();
  const { colors } = useTheme();

  const [gig, setGig] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(isNew || startEditing);

  // Form
  const [title, setTitle] = useState('');
  const [type, setType] = useState('GIG');
  const [status, setStatus] = useState('SCHEDULED');
  const [date, setDate] = useState(new Date());
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [venue, setVenue] = useState('');
  const [address, setAddress] = useState('');
  const [pay, setPay] = useState('');
  const [notes, setNotes] = useState('');

  // Pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const data = await api.getGig(gigId);
        setGig(data);
        populateForm(data);
      } catch (err) {
        console.error('Failed to load gig:', err);
        Alert.alert('Error', 'Failed to load event');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [gigId, isNew, navigation]);

  const populateForm = useCallback((data) => {
    if (!data) return;
    setTitle(data.title || '');
    setType(data.type || 'GIG');
    setStatus(data.status || 'SCHEDULED');
    if (data.date) {
      try { setDate(parseISO(data.date)); } catch { setDate(new Date()); }
    }
    setStartTime(data.startTime || '');
    setEndTime(data.endTime || '');
    setVenue(data.venue || '');
    setAddress(data.address || '');
    setPay(data.pay ? String(data.pay) : '');
    setNotes(data.notes || '');
  }, []);

  useLayoutEffect(() => {
    if (isNew) {
      navigation.setOptions({ title: 'New Event' });
    } else if (editing) {
      navigation.setOptions({ title: 'Edit Event' });
    } else if (gig) {
      navigation.setOptions({ title: gig.title || 'Event' });
    }
  }, [navigation, isNew, editing, gig]);

  useLayoutEffect(() => {
    if (!isNew && !editing && !loading) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity onPress={() => setEditing(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Edit</Text>
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({ headerRight: undefined });
    }
  }, [navigation, isNew, editing, loading, colors.primary]);

  const handleSave = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('Required', 'Event title is required');
      return;
    }
    setSaving(true);
    const data = {
      title: trimmedTitle,
      type,
      status,
      date: format(date, 'yyyy-MM-dd'),
      startTime: startTime.trim() || null,
      endTime: endTime.trim() || null,
      venue: venue.trim() || null,
      address: address.trim() || null,
      pay: pay ? parseFloat(pay) : null,
      notes: notes.trim() || null,
    };
    try {
      if (isNew) {
        const created = await api.createGig(workspaceId, data);
        setGig(created);
        populateForm(created);
        setEditing(false);
        navigation.setParams({ gigId: created.id });
      } else {
        const updated = await api.updateGig(gigId, data);
        setGig(updated);
        populateForm(updated);
        setEditing(false);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save event');
    } finally {
      setSaving(false);
    }
  }, [title, type, status, date, startTime, endTime, venue, address, pay, notes, isNew, workspaceId, gigId, navigation, populateForm]);

  const handleCancel = useCallback(() => {
    if (isNew) {
      navigation.goBack();
    } else {
      populateForm(gig);
      setEditing(false);
    }
  }, [isNew, gig, navigation, populateForm]);

  const handleDelete = useCallback(() => {
    Alert.alert('Delete Event', `Delete "${gig?.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteGig(gigId);
            navigation.goBack();
          } catch (err) {
            Alert.alert('Error', 'Failed to delete event');
          }
        },
      },
    ]);
  }, [gig, gigId, navigation]);

  const openMaps = useCallback(() => {
    const query = encodeURIComponent([gig?.venue, gig?.address].filter(Boolean).join(', '));
    const url = Platform.OS === 'ios'
      ? `maps:?q=${query}`
      : `geo:0,0?q=${query}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://maps.google.com/maps?q=${query}`);
    });
  }, [gig]);

  const onDateChange = useCallback((event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) setDate(selectedDate);
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (editing) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.bgPrimary }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { color: colors.textSecondary }]}>Title *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Event title"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Type</Text>
          <TouchableOpacity
            style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
            onPress={() => setShowTypePicker(true)}
          >
            <View style={[styles.typeDot, { backgroundColor: TYPE_COLORS[type] }]} />
            <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{type}</Text>
          </TouchableOpacity>

          {!isNew && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Status</Text>
              <TouchableOpacity
                style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
                onPress={() => setShowStatusPicker(true)}
              >
                <View style={[styles.typeDot, { backgroundColor: STATUS_COLORS[status] }]} />
                <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{status}</Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={[styles.label, { color: colors.textSecondary }]}>Date</Text>
          <TouchableOpacity
            style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 15 }}>
              {format(date, 'EEEE, MMM d, yyyy')}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={onDateChange}
              themeVariant="dark"
            />
          )}

          <View style={styles.row}>
            <View style={styles.rowField}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Start Time</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="19:00"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <View style={styles.rowField}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>End Time</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="21:00"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Venue</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={venue}
            onChangeText={setVenue}
            placeholder="Venue name"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Address</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={address}
            onChangeText={setAddress}
            placeholder="Full address"
            placeholderTextColor={colors.textSecondary}
          />

          {(type === 'GIG') && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Pay</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={pay}
                onChangeText={setPay}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
              />
            </>
          )}

          <Text style={[styles.label, { color: colors.textSecondary }]}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes..."
            placeholderTextColor={colors.textSecondary}
            multiline
            textAlignVertical="top"
          />

          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.bgTertiary }]}
              onPress={handleCancel}
              disabled={saving}
            >
              <Text style={[styles.formButtonText, { color: colors.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.primary }]}
              onPress={handleSave}
              disabled={saving || !title.trim()}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.formButtonTextWhite}>{isNew ? 'Create' : 'Save'}</Text>
              )}
            </TouchableOpacity>
          </View>

          {!isNew && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Text style={styles.deleteButtonText}>Delete Event</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Type Picker */}
        <Modal visible={showTypePicker} transparent animationType="fade">
          <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowTypePicker(false)}>
            <View style={[styles.pickerModal, { backgroundColor: colors.modalBg }]}>
              <Text style={[styles.pickerModalTitle, { color: colors.textPrimary }]}>Event Type</Text>
              {GIG_TYPES.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.pickerOption, type === t && { backgroundColor: colors.bgTertiary }]}
                  onPress={() => { setType(t); setShowTypePicker(false); }}
                >
                  <View style={[styles.typeDot, { backgroundColor: TYPE_COLORS[t] }]} />
                  <Text style={[styles.pickerOptionText, { color: colors.textPrimary }]}>{t}</Text>
                  {type === t && <Text style={{ color: colors.primary, marginLeft: 'auto' }}>{'\u2713'}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Status Picker */}
        <Modal visible={showStatusPicker} transparent animationType="fade">
          <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowStatusPicker(false)}>
            <View style={[styles.pickerModal, { backgroundColor: colors.modalBg }]}>
              <Text style={[styles.pickerModalTitle, { color: colors.textPrimary }]}>Status</Text>
              {GIG_STATUSES.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.pickerOption, status === s && { backgroundColor: colors.bgTertiary }]}
                  onPress={() => { setStatus(s); setShowStatusPicker(false); }}
                >
                  <View style={[styles.typeDot, { backgroundColor: STATUS_COLORS[s] }]} />
                  <Text style={[styles.pickerOptionText, { color: colors.textPrimary }]}>{s}</Text>
                  {status === s && <Text style={{ color: colors.primary, marginLeft: 'auto' }}>{'\u2713'}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    );
  }

  // View mode
  if (!gig) return null;

  const typeColor = TYPE_COLORS[gig.type] || TYPE_COLORS.OTHER;
  const statusColor = STATUS_COLORS[gig.status] || STATUS_COLORS.SCHEDULED;
  const setlistItems = gig.setlists || [];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={styles.viewContent}
    >
      {/* Type + Status badges */}
      <View style={styles.viewBadgeRow}>
        <View style={[styles.typeBadge, { backgroundColor: typeColor + '25' }]}>
          <Text style={[styles.typeBadgeText, { color: typeColor }]}>{gig?.type}</Text>
        </View>
        {gig?.status && gig.status !== 'SCHEDULED' && (
          <View style={[styles.typeBadge, { backgroundColor: statusColor + '25' }]}>
            <Text style={[styles.typeBadgeText, { color: statusColor }]}>{gig.status}</Text>
          </View>
        )}
      </View>

      {/* Date + Time */}
      <View style={styles.viewSection}>
        <Text style={[styles.viewLabel, { color: colors.textSecondary }]}>Date & Time</Text>
        <Text style={[styles.viewValue, { color: colors.textPrimary }]}>
          {gig?.date ? format(parseISO(gig.date), 'EEEE, MMMM d, yyyy') : 'No date'}
        </Text>
        {(gig?.startTime || gig?.endTime) && (
          <Text style={[styles.viewValueSecondary, { color: colors.textSecondary }]}>
            {[gig.startTime, gig.endTime].filter(Boolean).join(' \u2013 ')}
          </Text>
        )}
      </View>

      {/* Venue */}
      {(gig?.venue || gig?.address) && (
        <TouchableOpacity style={styles.viewSection} onPress={openMaps} activeOpacity={0.7}>
          <Text style={[styles.viewLabel, { color: colors.textSecondary }]}>Venue</Text>
          {gig.venue && <Text style={[styles.viewValue, { color: colors.textPrimary }]}>{gig.venue}</Text>}
          {gig.address && <Text style={[styles.viewValueSecondary, { color: colors.primary }]}>{gig.address} {'\u2197'}</Text>}
        </TouchableOpacity>
      )}

      {/* Pay */}
      {gig?.pay ? (
        <View style={styles.viewSection}>
          <Text style={[styles.viewLabel, { color: colors.textSecondary }]}>Pay</Text>
          <Text style={styles.payValue}>{'\u00A5'}{gig.pay.toLocaleString()}</Text>
        </View>
      ) : null}

      {/* Setlists */}
      {setlistItems.length > 0 && (
        <View style={styles.viewSection}>
          <Text style={[styles.viewLabel, { color: colors.textSecondary }]}>Setlists</Text>
          {setlistItems.map(gs => (
            <TouchableOpacity
              key={gs.id}
              style={[styles.setlistLink, { backgroundColor: colors.bgSecondary }]}
              onPress={() => {
                if (gs.setlist?.id) {
                  navigation.navigate('SetlistDetail', { setlistId: gs.setlist.id, workspaceId });
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.setlistLinkText, { color: colors.primary }]}>
                {gs.setlist?.name || 'Untitled Setlist'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Attendees */}
      {gig?.attendees?.length > 0 && (
        <View style={styles.viewSection}>
          <Text style={[styles.viewLabel, { color: colors.textSecondary }]}>Attendees</Text>
          {gig.attendees.map(a => {
            const statusColor = ATTENDEE_COLORS[a.status] || '#6b7280';
            const statusLabel = ATTENDEE_LABELS[a.status] || a.status;
            return (
              <View key={a.id || a.bandMember?.id} style={[styles.attendeeRow, { backgroundColor: colors.bgSecondary }]}>
                <View style={[styles.attendeeAvatar, { backgroundColor: statusColor + '30' }]}>
                  <Text style={[styles.attendeeInitial, { color: statusColor }]}>
                    {(a.bandMember?.name || '?')[0].toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.attendeeName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {a.bandMember?.name || 'Unknown'}
                </Text>
                <View style={[styles.attendeeStatusBadge, { backgroundColor: statusColor + '20' }]}>
                  <Text style={[styles.attendeeStatusText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Notes */}
      {gig?.notes ? (
        <View style={styles.viewSection}>
          <Text style={[styles.viewLabel, { color: colors.textSecondary }]}>Notes</Text>
          <Text style={[styles.viewValue, { color: colors.textPrimary }]}>{gig.notes}</Text>
        </View>
      ) : null}

      {/* Mark Complete */}
      {gig?.status === 'SCHEDULED' && (
        <TouchableOpacity
          style={[styles.completeButton, { backgroundColor: '#22c55e' }]}
          onPress={() => {
            Alert.alert('Mark Complete', `Mark "${gig.title}" as completed?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Complete',
                onPress: async () => {
                  try {
                    const updated = await api.completeGig(gig.id);
                    successNotification();
                    setGig(updated);
                    populateForm(updated);
                  } catch (err) {
                    Alert.alert('Error', 'Failed to mark event as complete');
                  }
                },
              },
            ]);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.completeButtonText}>{'\u2713'} Mark Complete</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // View mode
  viewContent: { padding: 16 },
  viewBadgeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  typeBadgeText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  viewSection: { marginBottom: 20 },
  viewLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 },
  viewValue: { fontSize: 16, lineHeight: 22 },
  viewValueSecondary: { fontSize: 14, marginTop: 2 },
  payValue: { color: '#22c55e', fontSize: 20, fontWeight: '700' },
  setlistLink: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, marginBottom: 6 },
  setlistLinkText: { fontSize: 15, fontWeight: '600' },
  attendeeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, marginBottom: 6, gap: 10 },
  attendeeAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  attendeeInitial: { fontSize: 14, fontWeight: '700' },
  attendeeName: { flex: 1, fontSize: 15 },
  attendeeStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  attendeeStatusText: { fontSize: 12, fontWeight: '600' },
  completeButton: { paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 8, marginBottom: 20 },
  completeButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
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
  pickerInput: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  textArea: { minHeight: 100, paddingTop: 10 },
  typeDot: { width: 10, height: 10, borderRadius: 5 },
  row: { flexDirection: 'row', gap: 8 },
  rowField: { flex: 1 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  formButton: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  formButtonText: { fontSize: 16, fontWeight: '600' },
  formButtonTextWhite: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  deleteButton: { marginTop: 16, paddingVertical: 14, alignItems: 'center' },
  deleteButtonText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
  // Picker modals
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerModal: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
  },
  pickerModalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 10,
  },
  pickerOptionText: { fontSize: 16 },
});
