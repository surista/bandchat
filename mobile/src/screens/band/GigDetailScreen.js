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
  Image,
  FlatList,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Calendar from 'expo-calendar';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { successNotification } from '../../utils/haptics';
import api from '../../services/api';
import { useLayout } from '../../hooks/useLayout';
import ErrorState from '../../components/ErrorState';
import { SkeletonList } from '../../components/SkeletonLoader';
import getCurrencySymbol from '../../utils/getCurrencySymbol';
import { Ionicons } from '@expo/vector-icons';
import ActionSheet from '../../components/ActionSheet';
import { TYPE_COLORS, STATUS_COLORS } from '../../utils/constants';
import { updateWidgetGigData } from '../../services/widgetService';

const ATTENDEE_STATUSES = ['ATTENDING', 'MAYBE', 'NOT_ATTENDING'];
const ATTENDEE_LABELS = { ATTENDING: 'Going', MAYBE: 'Maybe', NOT_ATTENDING: 'Not Going' };
const ATTENDEE_COLORS = { ATTENDING: '#22c55e', MAYBE: '#eab308', NOT_ATTENDING: '#ef4444' };

const GIG_TYPES = ['GIG', 'REHEARSAL', 'RECORDING', 'OTHER'];
const GIG_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'];

export default function GigDetailScreen({ navigation, route }) {
  const { gigId, workspaceId, editing: startEditing } = route.params;
  const isNew = !gigId;
  const { user } = useAuth()
  const { isTablet, contentMaxWidth } = useLayout();
  const { colors, mode } = useTheme();

  const [gig, setGig] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(isNew || startEditing);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // Form
  const [title, setTitle] = useState('');
  const [type, setType] = useState('GIG');
  const [status, setStatus] = useState('SCHEDULED');
  const [date, setDate] = useState(new Date());
  const [endDate, setEndDate] = useState(null);
  const [multiDay, setMultiDay] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [soundCheckTime, setSoundCheckTime] = useState('');
  const [eventStartTime, setEventStartTime] = useState('');
  const [performanceStartTime, setPerformanceStartTime] = useState('');
  const [venue, setVenue] = useState('');
  const [address, setAddress] = useState('');
  const [pay, setPay] = useState('');
  const [notes, setNotes] = useState('');

  // Currency
  const [currencySymbol, setCurrencySymbol] = useState('$');

  // Media
  const [gigMedia, setGigMedia] = useState([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  // Pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showVenuePicker, setShowVenuePicker] = useState(false);
  const [venuesList, setVenuesList] = useState([]);
  const [selectedVenueId, setSelectedVenueId] = useState(null);
  const [customVenue, setCustomVenue] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [loadError, setLoadError] = useState(null);

  // Load workspace currency, admin status, and venues
  useEffect(() => {
    api.getWorkspace(workspaceId).then(ws => {
      setCurrencySymbol(getCurrencySymbol(ws.currency || 'USD'));
      const membership = ws.members?.find(m => m.userId === user?.id);
      setIsAdmin(membership?.role === 'ADMIN');
    }).catch(() => {});
    api.getVenues(workspaceId).then(setVenuesList).catch(() => {});
  }, [workspaceId, user?.id]);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const [data, mediaData] = await Promise.all([
          api.getGig(gigId),
          api.getGigMedia(gigId).catch(() => []),
        ]);
        setGig(data);
        setGigMedia(mediaData);
        populateForm(data);
      } catch (err) {
        setLoadError(err.message || 'Failed to load event');
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
      try {
        const parsedDate = parseISO(data.date);
        setDate(parsedDate);
        // Extract time from the date field (time is embedded in the datetime)
        setStartTime(format(parsedDate, 'HH:mm'));
      } catch {
        setDate(new Date());
        setStartTime('');
      }
    }
    if (data.endDate) {
      try {
        const parsedEndDate = parseISO(data.endDate);
        setEndTime(format(parsedEndDate, 'HH:mm'));
        // Check if multi-day (different dates)
        const startKey = data.date ? format(parseISO(data.date), 'yyyy-MM-dd') : '';
        const endKey = format(parsedEndDate, 'yyyy-MM-dd');
        if (startKey !== endKey) {
          setMultiDay(true);
          setEndDate(parsedEndDate);
        } else {
          setMultiDay(false);
          setEndDate(null);
        }
      } catch {
        setEndTime('');
        setMultiDay(false);
        setEndDate(null);
      }
    } else {
      setEndTime('');
      setMultiDay(false);
      setEndDate(null);
    }
    setSoundCheckTime(data.soundCheckTime || '');
    setEventStartTime(data.eventStartTime || '');
    setPerformanceStartTime(data.performanceStartTime || '');
    setVenue(data.venue || '');
    setAddress(data.address || '');
    setPay(data.pay ? String(data.pay) : '');
    setNotes(data.notes || '');
    setIsLocked(data.isLocked || false);
    setSelectedVenueId(data.venueId || null);
    setCustomVenue(!data.venueId && !!(data.venue));
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
    const canEdit = !gig?.isLocked || isAdmin;
    if (!isNew && !editing && !loading && canEdit) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity onPress={() => setEditing(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Edit event">
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Edit</Text>
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({ headerRight: undefined });
    }
  }, [navigation, isNew, editing, loading, colors.primary, gig?.isLocked, isAdmin]);

  const handleSave = useCallback(async () => {
    const errors = {};
    const trimmedTitle = title.trim();
    if (!trimmedTitle) errors.title = 'Title is required';
    if (pay) {
      const payNum = parseFloat(pay);
      if (isNaN(payNum) || payNum < 0) errors.pay = 'Pay must be a valid number';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    // Combine date + time into full ISO datetimes (like web client)
    const dateStr = format(date, 'yyyy-MM-dd');
    const endDateStr = multiDay && endDate ? format(endDate, 'yyyy-MM-dd') : dateStr;
    const timeRegex = /^\d{1,2}:\d{2}$/;
    const parsedStart = startTime.trim() && timeRegex.test(startTime.trim())
      ? new Date(`${dateStr}T${startTime.trim()}`)
      : null;
    const startDateTime = (parsedStart && !isNaN(parsedStart.getTime()))
      ? parsedStart.toISOString()
      : new Date(`${dateStr}T00:00`).toISOString();
    const parsedEnd = endTime.trim() && timeRegex.test(endTime.trim())
      ? new Date(`${endDateStr}T${endTime.trim()}`)
      : null;
    const endDateTime = (parsedEnd && !isNaN(parsedEnd.getTime()))
      ? parsedEnd.toISOString()
      : (multiDay && endDate ? new Date(`${endDateStr}T00:00`).toISOString() : null);
    const data = {
      title: trimmedTitle,
      type,
      status,
      date: startDateTime,
      endDate: endDateTime,
      soundCheckTime: soundCheckTime.trim() || null,
      eventStartTime: eventStartTime.trim() || null,
      performanceStartTime: performanceStartTime.trim() || null,
      venue: venue.trim() || null,
      address: address.trim() || null,
      venueId: selectedVenueId || null,
      pay: pay ? parseFloat(pay) : null,
      notes: notes.trim() || null,
      ...(isAdmin && { isLocked }),
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
      updateWidgetGigData();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save event');
    } finally {
      setSaving(false);
    }
  }, [title, type, status, date, startTime, endTime, venue, address, selectedVenueId, pay, notes, isNew, workspaceId, gigId, navigation, populateForm]);

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
            updateWidgetGigData();
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

  const addToCalendar = useCallback(async () => {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Calendar access is needed to add events.');
        return;
      }

      // Get a writable calendar
      let calendarId;
      if (Platform.OS === 'ios') {
        const defaultCal = await Calendar.getDefaultCalendarAsync();
        calendarId = defaultCal.id;
      } else {
        const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        const writable = calendars.find(c => c.accessLevel === 'owner' || c.allowsModifications);
        if (!writable) {
          Alert.alert('Error', 'No writable calendar found on this device.');
          return;
        }
        calendarId = writable.id;
      }

      // Parse date + time (time is embedded in the datetime fields)
      const startDate = gig.date ? parseISO(gig.date) : new Date();
      const endDate = gig.endDate
        ? parseISO(gig.endDate)
        : new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // +2 hours if no end

      const location = [gig.venue, gig.address].filter(Boolean).join(', ');

      await Calendar.createEventAsync(calendarId, {
        title: gig.title,
        startDate,
        endDate,
        location: location || undefined,
        notes: gig.notes || undefined,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      successNotification();
      Alert.alert('Added', `"${gig.title}" has been added to your calendar.`);
    } catch (err) {
      Alert.alert('Error', 'Failed to add event to calendar.');
    }
  }, [gig]);

  const onDateChange = useCallback((event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) setDate(selectedDate);
  }, []);

  const onEndDateChange = useCallback((event, selectedDate) => {
    setShowEndDatePicker(false);
    if (selectedDate) setEndDate(selectedDate);
  }, []);

  const handleAddPhotos = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;

      setUploadingMedia(true);
      for (const asset of result.assets) {
        const filename = asset.fileName || `media_${Date.now()}.jpg`;
        const mimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
        const uploaded = await api.uploadFile(asset.uri, filename, mimeType, workspaceId);
        const mediaType = asset.type === 'video' ? 'video' : 'image';
        await api.addGigMedia(gigId, {
          type: mediaType,
          url: uploaded.url,
          caption: filename,
        });
      }
      // Reload media
      const updatedMedia = await api.getGigMedia(gigId).catch(() => []);
      setGigMedia(updatedMedia);
      successNotification();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to upload media');
    } finally {
      setUploadingMedia(false);
    }
  }, [gigId]);

  const handleAddAudio = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      if (file.size > 50 * 1024 * 1024) {
        Alert.alert('Too Large', 'Audio file must be under 50MB');
        return;
      }
      setUploadingMedia(true);
      const uploaded = await api.uploadFile(file.uri, file.name, file.mimeType || 'audio/mpeg', workspaceId);
      await api.addGigMedia(gigId, { type: 'audio', url: uploaded.url, caption: file.name });
      const updatedMedia = await api.getGigMedia(gigId).catch(() => []);
      setGigMedia(updatedMedia);
      successNotification();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to upload audio');
    } finally {
      setUploadingMedia(false);
    }
  }, [gigId, workspaceId]);

  const handleAddLink = useCallback(async () => {
    const url = linkUrl.trim();
    if (!url) return;
    try {
      let type = 'link';
      if (/youtube\.com|youtu\.be/i.test(url)) type = 'youtube';
      else if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url)) type = 'image';
      const newMedia = await api.addGigMedia(gigId, { type, url });
      setGigMedia(prev => [newMedia, ...prev]);
      setLinkUrl('');
      setShowAddLink(false);
      successNotification();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to add link');
    }
  }, [gigId, linkUrl]);

  const loadGig = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const [data, mediaData] = await Promise.all([
        api.getGig(gigId),
        api.getGigMedia(gigId).catch(() => []),
      ]);
      setGig(data);
      setGigMedia(mediaData);
      populateForm(data);
    } catch (err) {
      setLoadError(err.message || 'Failed to load event');
    } finally {
      setLoading(false);
    }
  }, [gigId, populateForm]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}>
        <SkeletonList count={3} lines={3} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}>
        <ErrorState iconName="calendar-outline" title="Couldn't load event" message={loadError} onRetry={loadGig} />
      </View>
    );
  }

  if (editing) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView contentContainerStyle={[styles.formContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Title *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: fieldErrors.title ? '#ef4444' : colors.border }]}
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              if (fieldErrors.title) setFieldErrors(prev => ({ ...prev, title: null }));
            }}
            onBlur={() => {
              if (!title.trim()) setFieldErrors(prev => ({ ...prev, title: 'Title is required' }));
            }}
            placeholder="Event title"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Event title"
          />
          {fieldErrors.title && <Text style={styles.fieldError}>{fieldErrors.title}</Text>}

          <Text style={[styles.label, { color: colors.textSecondary }]}>Type</Text>
          <TouchableOpacity
            style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
            onPress={() => setShowTypePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={`Event type: ${type}`}
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
                accessibilityRole="button"
                accessibilityLabel={`Status: ${status}`}
              >
                <View style={[styles.typeDot, { backgroundColor: STATUS_COLORS[status] }]} />
                <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{status}</Text>
              </TouchableOpacity>
            </>
          )}

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
                onPress={() => setDate(shortcut.getDate())}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Set date to ${shortcut.label}`}
              >
                <Text style={[styles.dateChipText, { color: colors.textPrimary }]}>{shortcut.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
            onPress={() => setShowDatePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={`Date: ${format(date, 'EEEE, dd-MMM-yyyy')}`}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 15 }}>
              {format(date, 'EEEE, dd-MMM-yyyy')}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={onDateChange}
              themeVariant={mode === 'dark' ? 'dark' : 'light'}
            />
          )}

          <TouchableOpacity
            style={styles.multiDayToggle}
            onPress={() => {
              const next = !multiDay;
              setMultiDay(next);
              if (!next) setEndDate(null);
              else if (!endDate) {
                const tomorrow = new Date(date);
                tomorrow.setDate(tomorrow.getDate() + 1);
                setEndDate(tomorrow);
              }
            }}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: multiDay }}
            accessibilityLabel="Multi-day event"
          >
            <View style={[styles.checkbox, { borderColor: colors.border }, multiDay && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              {multiDay && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Multi-day event</Text>
          </TouchableOpacity>

          {multiDay && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>End Date</Text>
              <TouchableOpacity
                style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
                onPress={() => setShowEndDatePicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`End date: ${endDate ? format(endDate, 'EEEE, dd-MMM-yyyy') : 'Not set'}`}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 15 }}>
                  {endDate ? format(endDate, 'EEEE, dd-MMM-yyyy') : 'Select end date'}
                </Text>
              </TouchableOpacity>

              {showEndDatePicker && (
                <DateTimePicker
                  value={endDate || new Date(date.getTime() + 86400000)}
                  mode="date"
                  minimumDate={date}
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={onEndDateChange}
                  themeVariant={mode === 'dark' ? 'dark' : 'light'}
                />
              )}
            </>
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
                accessibilityLabel="Start time"
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
                accessibilityLabel="End time"
              />
            </View>
          </View>

          {/* Optional Gig Times (only for GIG type) */}
          {type === 'GIG' && (
            <View style={styles.row}>
              <View style={[styles.rowField, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.textSecondary, fontSize: 12 }]}>Sound Check</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                  value={soundCheckTime}
                  onChangeText={setSoundCheckTime}
                  placeholder="16:00"
                  placeholderTextColor={colors.textSecondary}
                  accessibilityLabel="Sound check time"
                />
              </View>
              <View style={[styles.rowField, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.textSecondary, fontSize: 12 }]}>Doors</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                  value={eventStartTime}
                  onChangeText={setEventStartTime}
                  placeholder="19:00"
                  placeholderTextColor={colors.textSecondary}
                  accessibilityLabel="Doors open time"
                />
              </View>
              <View style={[styles.rowField, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.textSecondary, fontSize: 12 }]}>Stage</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                  value={performanceStartTime}
                  onChangeText={setPerformanceStartTime}
                  placeholder="20:00"
                  placeholderTextColor={colors.textSecondary}
                  accessibilityLabel="Stage time"
                />
              </View>
            </View>
          )}

          <Text style={[styles.label, { color: colors.textSecondary }]}>Venue</Text>
          {venuesList.length > 0 && !customVenue ? (
            <TouchableOpacity
              style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
              onPress={() => setShowVenuePicker(true)}
              accessibilityRole="button"
              accessibilityLabel={venue ? `Venue: ${venue}` : 'Select a venue'}
            >
              <Ionicons name="location-outline" size={16} color={venue ? colors.textPrimary : colors.textSecondary} />
              <Text style={{ color: venue ? colors.textPrimary : colors.textSecondary, fontSize: 15, flex: 1 }}>
                {venue || 'Select a venue...'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={venue}
                onChangeText={setVenue}
                placeholder="Venue name"
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel="Venue name"
              />
              {venuesList.length > 0 && (
                <TouchableOpacity
                  onPress={() => { setCustomVenue(false); setVenue(''); setAddress(''); setSelectedVenueId(null); }}
                  style={styles.switchVenueMode}
                  accessibilityRole="button"
                  accessibilityLabel="Choose from saved venues"
                >
                  <Ionicons name="list-outline" size={14} color={colors.primary} />
                  <Text style={[styles.switchVenueModeText, { color: colors.primary }]}>Choose from saved venues</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          <Text style={[styles.label, { color: colors.textSecondary }]}>Address</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={address}
            onChangeText={setAddress}
            placeholder="Full address"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Address"
          />

          {(type === 'GIG') && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Pay</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: fieldErrors.pay ? '#ef4444' : colors.border }]}
                value={pay}
                onChangeText={(text) => {
                  setPay(text);
                  if (fieldErrors.pay) setFieldErrors(prev => ({ ...prev, pay: null }));
                }}
                onBlur={() => {
                  if (pay) {
                    const n = parseFloat(pay);
                    if (isNaN(n) || n < 0) setFieldErrors(prev => ({ ...prev, pay: 'Pay must be a valid number' }));
                  }
                }}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                accessibilityLabel="Pay amount"
              />
              {fieldErrors.pay && <Text style={styles.fieldError}>{fieldErrors.pay}</Text>}
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
            accessibilityLabel="Notes"
          />

          {isAdmin && (
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setIsLocked(prev => !prev)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`Lock event, ${isLocked ? 'checked' : 'unchecked'}`}
            >
              <View style={[styles.checkbox, { borderColor: colors.border }, isLocked && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                {isLocked && <Text style={styles.checkmark}>{'\u2713'}</Text>}
              </View>
              <Text style={[styles.checkboxLabel, { color: colors.textPrimary }]}>Lock event (prevents member edits)</Text>
            </TouchableOpacity>
          )}

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
              disabled={saving || !title.trim()}
              accessibilityRole="button"
              accessibilityLabel={isNew ? 'Create event' : 'Save event'}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.formButtonTextWhite}>{isNew ? 'Create' : 'Save'}</Text>
              )}
            </TouchableOpacity>
          </View>

          {!isNew && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Delete event">
              <Text style={styles.deleteButtonText}>Delete Event</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Type Picker */}
        <Modal visible={showTypePicker} transparent animationType="fade" onRequestClose={() => setShowTypePicker(false)}>
          <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowTypePicker(false)} accessibilityRole="button" accessibilityLabel="Close type picker">
            <View style={[styles.pickerModal, { backgroundColor: colors.modalBg }]}>
              <Text style={[styles.pickerModalTitle, { color: colors.textPrimary }]} accessibilityRole="header">Event Type</Text>
              {GIG_TYPES.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.pickerOption, type === t && { backgroundColor: colors.bgTertiary }]}
                  onPress={() => { setType(t); setShowTypePicker(false); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${t}${type === t ? ', selected' : ''}`}
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
        <Modal visible={showStatusPicker} transparent animationType="fade" onRequestClose={() => setShowStatusPicker(false)}>
          <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowStatusPicker(false)} accessibilityRole="button" accessibilityLabel="Close status picker">
            <View style={[styles.pickerModal, { backgroundColor: colors.modalBg }]}>
              <Text style={[styles.pickerModalTitle, { color: colors.textPrimary }]} accessibilityRole="header">Status</Text>
              {GIG_STATUSES.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.pickerOption, status === s && { backgroundColor: colors.bgTertiary }]}
                  onPress={() => { setStatus(s); setShowStatusPicker(false); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${s}${status === s ? ', selected' : ''}`}
                >
                  <View style={[styles.typeDot, { backgroundColor: STATUS_COLORS[s] }]} />
                  <Text style={[styles.pickerOptionText, { color: colors.textPrimary }]}>{s}</Text>
                  {status === s && <Text style={{ color: colors.primary, marginLeft: 'auto' }}>{'\u2713'}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Venue Picker */}
        <ActionSheet
          visible={showVenuePicker}
          title="Select Venue"
          actions={[
            ...venuesList.map(v => ({
              label: v.name + (v.city ? ` - ${v.city}` : ''),
              onPress: () => {
                setSelectedVenueId(v.id);
                setVenue(v.name);
                setAddress(v.address || '');
                setCustomVenue(false);
                setShowVenuePicker(false);
              },
            })),
            {
              label: 'Custom (type manually)',
              onPress: () => {
                setSelectedVenueId(null);
                setCustomVenue(true);
                setVenue('');
                setAddress('');
                setShowVenuePicker(false);
              },
            },
          ]}
          onClose={() => setShowVenuePicker(false)}
        />
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
      contentContainerStyle={[styles.viewContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
    >
      {/* Type + Status + Lock badges */}
      <View style={styles.viewBadgeRow}>
        <View style={[styles.typeBadge, { backgroundColor: typeColor + '25' }]}>
          <Text style={[styles.typeBadgeText, { color: typeColor }]}>{gig?.type}</Text>
        </View>
        {gig?.status && gig.status !== 'SCHEDULED' && (
          <View style={[styles.typeBadge, { backgroundColor: statusColor + '25' }]}>
            <Text style={[styles.typeBadgeText, { color: statusColor }]}>{gig.status}</Text>
          </View>
        )}
        {gig?.isLocked && (
          <View style={[styles.typeBadge, { backgroundColor: '#64748b25' }]}>
            <Text style={[styles.typeBadgeText, { color: '#64748b' }]}><Ionicons name="lock-closed" size={12} color="#64748b" /> Locked</Text>
          </View>
        )}
      </View>

      {/* Date + Time */}
      <View style={styles.viewSection}>
        <Text style={[styles.viewLabel, { color: colors.textSecondary }]}>Date & Time</Text>
        <Text style={[styles.viewValue, { color: colors.textPrimary }]}>
          {gig?.date ? (() => {
            try {
              const s = parseISO(gig.date);
              const e = gig.endDate ? parseISO(gig.endDate) : null;
              const isMulti = e && format(s, 'yyyy-MM-dd') !== format(e, 'yyyy-MM-dd');
              if (isMulti) {
                return `${format(s, 'dd-MMM-yyyy')} \u2013 ${format(e, 'dd-MMM-yyyy')}`;
              }
              const dateStr = format(s, 'EEEE, dd-MMM-yyyy');
              const t = format(s, 'HH:mm');
              if (t !== '00:00') {
                const endTime = e ? format(e, 'HH:mm') : null;
                return `${dateStr} · ${t}${endTime ? ` \u2013 ${endTime}` : ''}`;
              }
              return dateStr;
            } catch {
              return 'No date';
            }
          })() : 'No date'}
        </Text>
        {/* Show optional gig times if any are set */}
        {(gig?.soundCheckTime || gig?.eventStartTime || gig?.performanceStartTime) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
            {gig.soundCheckTime && (
              <View>
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>Sound Check</Text>
                <Text style={{ fontSize: 14, color: colors.textPrimary }}>{gig.soundCheckTime}</Text>
              </View>
            )}
            {gig.eventStartTime && (
              <View>
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>Doors</Text>
                <Text style={{ fontSize: 14, color: colors.textPrimary }}>{gig.eventStartTime}</Text>
              </View>
            )}
            {gig.performanceStartTime && (
              <View>
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>Stage</Text>
                <Text style={{ fontSize: 14, color: colors.textPrimary }}>{gig.performanceStartTime}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Venue */}
      {(gig?.venue || gig?.address) && (
        <TouchableOpacity style={styles.viewSection} onPress={openMaps} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Open venue in maps">
          <Text style={[styles.viewLabel, { color: colors.textSecondary }]}>Venue</Text>
          {gig.venue && <Text style={[styles.viewValue, { color: colors.textPrimary }]}>{gig.venue}</Text>}
          {gig.address && <Text style={[styles.viewValueSecondary, { color: colors.primary }]}>{gig.address} {'\u2197'}</Text>}
        </TouchableOpacity>
      )}

      {/* Pay */}
      {Number(gig?.pay) > 0 ? (
        <View style={styles.viewSection}>
          <Text style={[styles.viewLabel, { color: colors.textSecondary }]}>Pay</Text>
          <Text style={styles.payValue}>{currencySymbol}{Number(gig.pay).toLocaleString()}</Text>
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
              accessibilityRole="button"
              accessibilityLabel={`View setlist: ${gs.setlist?.name || 'Untitled Setlist'}`}
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

      {/* Attachments */}
      <View style={styles.viewSection}>
        <View style={styles.mediaSectionHeader}>
          <Text style={[styles.viewLabel, { color: colors.textSecondary }]}>Attachments</Text>
          {gigMedia.length > 6 && (
            <TouchableOpacity
              onPress={() => navigation.navigate('GigGallery', { gigId, gigTitle: gig?.title })}
              accessibilityRole="button"
              accessibilityLabel="View all photos and videos"
            >
              <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>View All {'\u2192'}</Text>
            </TouchableOpacity>
          )}
        </View>
        {gigMedia.length > 0 ? (
          <FlatList
            horizontal
            data={gigMedia.slice(0, 6)}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.mediaStrip}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.mediaThumbnail, { backgroundColor: colors.bgTertiary }]}
                onPress={() => {
                  if (item.type === 'image') {
                    navigation.navigate('GigGallery', { gigId, gigTitle: gig?.title });
                  }
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={item.type === 'video' ? 'Video thumbnail' : 'Photo thumbnail'}
              >
                {item.type === 'image' ? (
                  <Image source={{ uri: item.url }} style={styles.mediaThumbnailImage} resizeMode="cover" />
                ) : item.type === 'video' ? (
                  <View style={[styles.mediaThumbnailImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgTertiary }]}>
                    <View style={styles.videoOverlay}>
                      <Text style={styles.videoOverlayIcon}>{'\u25B6'}</Text>
                    </View>
                  </View>
                ) : item.type === 'audio' ? (
                  <View style={[styles.mediaThumbnailImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgTertiary }]}>
                    <Ionicons name="musical-notes-outline" size={22} color={colors.primary} />
                  </View>
                ) : (
                  <View style={[styles.mediaThumbnailImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgTertiary }]}>
                    <Ionicons name="link-outline" size={20} color={colors.textSecondary} />
                  </View>
                )}
              </TouchableOpacity>
            )}
          />
        ) : null}
        <TouchableOpacity
          style={[styles.addPhotosButton, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
          onPress={handleAddPhotos}
          disabled={uploadingMedia}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Add photos or videos"
        >
          {uploadingMedia ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.addPhotosText, { color: colors.primary }]}>+ Add Photos</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.addPhotosButton, { backgroundColor: colors.bgSecondary, borderColor: colors.border, marginTop: 8 }]}
          onPress={handleAddAudio}
          disabled={uploadingMedia}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Add audio recording"
        >
          {uploadingMedia ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.addPhotosText, { color: colors.primary }]}>+ Add Audio</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.addPhotosButton, { backgroundColor: colors.bgSecondary, borderColor: colors.border, marginTop: 8 }]}
          onPress={() => setShowAddLink(!showAddLink)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Add YouTube link or URL"
        >
          <Text style={[styles.addPhotosText, { color: colors.primary }]}>+ Add Link / YouTube</Text>
        </TouchableOpacity>
        {showAddLink && (
          <View style={[styles.addLinkRow, { borderColor: colors.border }]}>
            <TextInput
              style={[styles.addLinkInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              value={linkUrl}
              onChangeText={setLinkUrl}
              placeholder="Paste YouTube or any URL..."
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={handleAddLink}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.addLinkButton, { backgroundColor: linkUrl.trim() ? '#16a34a' : colors.bgTertiary }]}
              onPress={handleAddLink}
              disabled={!linkUrl.trim()}
              activeOpacity={0.7}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Add</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Add to Calendar */}
      <TouchableOpacity
        style={[styles.calendarButton, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
        onPress={addToCalendar}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Add to calendar"
      >
        <Text style={[styles.calendarButtonText, { color: colors.primary }]}>Add to Calendar</Text>
      </TouchableOpacity>

      {/* Mark Complete */}
      {gig?.status === 'SCHEDULED' && (
        <TouchableOpacity
          style={[styles.completeButton, { backgroundColor: '#22c55e' }]}
          accessibilityRole="button"
          accessibilityLabel="Mark event as complete"
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
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
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
  mediaSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mediaStrip: { gap: 8, marginBottom: 10 },
  mediaThumbnail: { width: 80, height: 80, borderRadius: 8, overflow: 'hidden' },
  mediaThumbnailImage: { width: '100%', height: '100%' },
  videoOverlay: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  videoOverlayIcon: { color: '#ffffff', fontSize: 14, marginLeft: 2 },
  addPhotosButton: { paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed' },
  addPhotosText: { fontSize: 14, fontWeight: '600' },
  addLinkRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  addLinkInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  addLinkButton: { borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  calendarButton: { paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 8, borderWidth: 1 },
  calendarButtonText: { fontSize: 16, fontWeight: '600' },
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
  multiDayToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
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
  fieldError: { color: '#ef4444', fontSize: 12, marginTop: 4 },
  dateShortcuts: { marginBottom: 8, flexGrow: 0 },
  dateShortcutsContent: { gap: 8 },
  dateChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  dateChipText: { fontSize: 13, fontWeight: '500' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkmark: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  checkboxLabel: { fontSize: 15 },
  switchVenueMode: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -4, marginBottom: 8 },
  switchVenueModeText: { fontSize: 13, fontWeight: '500' },
});
