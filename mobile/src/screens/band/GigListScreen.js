import { useState, useEffect, useCallback, useMemo, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  SectionList,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../context/ThemeContext';
import { mediumImpact, successNotification } from '../../utils/haptics';
import { SkeletonList } from '../../components/SkeletonLoader';
import api from '../../services/api';

function getCurrencySymbol(code) {
  const symbols = { USD: '$', GBP: '£', EUR: '€', JPY: '¥', AUD: 'A$', CAD: 'C$', NZD: 'NZ$', ZAR: 'R', CHF: 'CHF ' };
  return symbols[code] || code + ' ';
}

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'GIG', label: 'Gigs' },
  { key: 'REHEARSAL', label: 'Rehearsals' },
  { key: 'RECORDING', label: 'Recording' },
  { key: 'OTHER', label: 'Other' },
];

const TYPE_COLORS = {
  GIG: '#3b82f6',
  REHEARSAL: '#38bdf8',
  RECORDING: '#6366f1',
  OTHER: '#6b7280',
};

const STATUS_COLORS = {
  COMPLETED: '#22c55e',
  CANCELLED: '#ef4444',
};

const AVAILABILITY_STATUS = {
  AVAILABLE: { label: 'Available', color: '#22c55e', icon: '✓' },
  MAYBE: { label: 'Maybe', color: '#eab308', icon: '?' },
  UNAVAILABLE: { label: 'Unavailable', color: '#ef4444', icon: '✗' },
};

function formatGigDate(dateStr) {
  try {
    const d = parseISO(dateStr);
    return format(d, 'EEEE, dd-MMM');
  } catch {
    return dateStr;
  }
}

function formatTimeRange(startTime, endTime) {
  const parts = [];
  if (startTime) parts.push(startTime);
  if (endTime) parts.push(endTime);
  return parts.join(' \u2013 ');
}

export default function GigListScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();

  const [gigs, setGigs] = useState([]);
  const [otherGigs, setOtherGigs] = useState([]);
  const [showAllBands, setShowAllBands] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');

  // Action sheet
  const [selectedGig, setSelectedGig] = useState(null);
  const [showActions, setShowActions] = useState(false);

  // Calendar subscribe
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarUrl, setCalendarUrl] = useState('');
  const [calendarLoading, setCalendarLoading] = useState(false);

  // Currency
  const [currencySymbol, setCurrencySymbol] = useState('$');

  // Availability
  const [availability, setAvailability] = useState({});
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [availabilityDate, setAvailabilityDate] = useState(null);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Load workspace currency
  useEffect(() => {
    api.getWorkspace(workspaceId).then(ws => {
      setCurrencySymbol(getCurrencySymbol(ws.currency || 'USD'));
    }).catch(() => {});
  }, [workspaceId]);

  const handleSubscribeCalendar = useCallback(async () => {
    setCalendarLoading(true);
    try {
      let tokenData;
      try {
        tokenData = await api.getCalendarToken(workspaceId);
      } catch {
        tokenData = await api.generateCalendarToken(workspaceId);
      }
      const token = tokenData.token;
      const Constants = require('expo-constants').default;
      const apiUrl = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3001/api';
      const baseUrl = apiUrl.replace(/\/api\/?$/, '');
      const icalUrl = `${baseUrl}/api/gigs/workspace/${workspaceId}/calendar.ics?token=${token}`;
      setCalendarUrl(icalUrl);
      setShowCalendarModal(true);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to get calendar link');
    } finally {
      setCalendarLoading(false);
    }
  }, [workspaceId]);

  // Header buttons
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity
            onPress={handleSubscribeCalendar}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Subscribe to calendar"
            disabled={calendarLoading}
          >
            {calendarLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={{ color: colors.primary, fontSize: 18 }}>{'\uD83D\uDCC5'}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('GigDetail', { workspaceId })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Create event"
          >
            <Text style={{ color: colors.primary, fontSize: 28, fontWeight: '300', lineHeight: 30 }}>+</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, workspaceId, colors.primary, calendarLoading, handleSubscribeCalendar]);

  const loadGigs = useCallback(async () => {
    try {
      const filters = typeFilter !== 'all' ? { type: typeFilter } : {};
      const [data, other, myAvail] = await Promise.all([
        api.getGigs(workspaceId, filters),
        showAllBands ? api.getGigsFromAllWorkspaces(workspaceId).catch(() => []) : Promise.resolve([]),
        api.getMyAvailability(workspaceId).catch(() => []),
      ]);
      setGigs(data);
      setOtherGigs(showAllBands ? other : []);
      // Index availability by date
      const availMap = {};
      for (const a of myAvail) {
        if (a.date) availMap[a.date.split('T')[0]] = a.status;
      }
      setAvailability(availMap);
    } catch (err) {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId, typeFilter, showAllBands]);

  useEffect(() => {
    loadGigs();
  }, [loadGigs]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loadingRef.current) loadGigs();
    });
    return unsubscribe;
  }, [navigation, loadGigs]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadGigs();
  }, [loadGigs]);

  // Group by month
  const sections = useMemo(() => {
    const allGigs = [
      ...gigs,
      ...otherGigs.map(g => ({ ...g, _otherWorkspace: true, _workspaceName: g.workspace?.name })),
    ];
    const sorted = allGigs.sort((a, b) => {
      const da = a.date ? new Date(a.date) : new Date(0);
      const db = b.date ? new Date(b.date) : new Date(0);
      return da - db;
    });

    const monthMap = {};
    for (const gig of sorted) {
      let monthKey = 'No Date';
      if (gig.date) {
        try {
          monthKey = format(parseISO(gig.date), 'MMMM yyyy');
        } catch {
          monthKey = 'No Date';
        }
      }
      if (!monthMap[monthKey]) monthMap[monthKey] = [];
      monthMap[monthKey].push(gig);
    }

    return Object.entries(monthMap).map(([title, data]) => ({ title, data }));
  }, [gigs, otherGigs]);

  const handleDuplicate = useCallback(async () => {
    if (!selectedGig) return;
    try {
      await api.duplicateGig(selectedGig.id);
      loadGigs();
    } catch (err) {
      Alert.alert('Error', 'Failed to duplicate event');
    }
    setShowActions(false);
    setSelectedGig(null);
  }, [selectedGig, loadGigs]);

  const handleComplete = useCallback(() => {
    if (!selectedGig) return;
    Alert.alert('Mark Complete', `Mark "${selectedGig.title}" as completed?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: async () => {
          try {
            await api.completeGig(selectedGig.id);
            successNotification();
            loadGigs();
          } catch (err) {
            Alert.alert('Error', 'Failed to mark event as complete');
          }
          setShowActions(false);
          setSelectedGig(null);
        },
      },
    ]);
  }, [selectedGig, loadGigs]);

  const handleDelete = useCallback(() => {
    if (!selectedGig) return;
    Alert.alert('Delete Event', `Delete "${selectedGig.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteGig(selectedGig.id);
            setGigs(prev => prev.filter(g => g.id !== selectedGig.id));
          } catch (err) {
            Alert.alert('Error', 'Failed to delete event');
          }
          setShowActions(false);
          setSelectedGig(null);
        },
      },
    ]);
  }, [selectedGig]);

  const handleSetAvailability = useCallback(async (status) => {
    if (!availabilityDate) return;
    try {
      if (status === 'CLEAR') {
        await api.clearAvailability(workspaceId, availabilityDate);
        setAvailability(prev => {
          const next = { ...prev };
          delete next[availabilityDate];
          return next;
        });
      } else {
        await api.setAvailability(workspaceId, availabilityDate, status);
        setAvailability(prev => ({ ...prev, [availabilityDate]: status }));
      }
      successNotification();
    } catch (err) {
      Alert.alert('Error', 'Failed to set availability');
    }
    setShowAvailabilityModal(false);
    setAvailabilityDate(null);
  }, [workspaceId, availabilityDate]);

  // Cycle through: none → AVAILABLE → MAYBE → UNAVAILABLE → none
  const cycleAvailability = useCallback(async (dateKey) => {
    const current = availability[dateKey];
    const cycle = {
      undefined: 'AVAILABLE',
      'AVAILABLE': 'MAYBE',
      'MAYBE': 'UNAVAILABLE',
      'UNAVAILABLE': 'CLEAR',
    };
    const next = cycle[current] || 'AVAILABLE';

    try {
      if (next === 'CLEAR') {
        await api.clearAvailability(workspaceId, dateKey);
        setAvailability(prev => {
          const updated = { ...prev };
          delete updated[dateKey];
          return updated;
        });
      } else {
        await api.setAvailability(workspaceId, dateKey, next);
        setAvailability(prev => ({ ...prev, [dateKey]: next }));
      }
      mediumImpact();
    } catch (err) {
      Alert.alert('Error', 'Failed to set availability');
    }
  }, [workspaceId, availability]);

  const renderGig = useCallback(({ item }) => {
    const typeColor = TYPE_COLORS[item.type] || TYPE_COLORS.OTHER;
    const isCancelled = item.status === 'CANCELLED';
    const isCompleted = item.status === 'COMPLETED';
    const timeStr = formatTimeRange(item.startTime, item.endTime);
    const setlistNames = (item.setlists || []).map(gs => gs.setlist?.name).filter(Boolean);
    const isOther = item._otherWorkspace;
    const dateKey = item.date ? item.date.split('T')[0] : null;
    const myStatus = dateKey ? availability[dateKey] : null;
    const statusInfo = myStatus ? AVAILABILITY_STATUS[myStatus] : null;

    return (
      <TouchableOpacity
        style={[
          styles.gigCard,
          { backgroundColor: colors.bgSecondary },
          isCancelled && styles.cancelledCard,
          isOther && styles.otherWorkspaceCard,
        ]}
        onPress={() => {
          if (!isOther) navigation.navigate('GigDetail', { gigId: item.id, workspaceId });
        }}
        onLongPress={() => {
          if (!isOther) { mediumImpact(); setSelectedGig(item); setShowActions(true); }
        }}
        delayLongPress={400}
        activeOpacity={isOther ? 1 : 0.7}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${item.date ? formatGigDate(item.date) : 'No date'}${item.venue ? `, at ${item.venue}` : ''}`}
      >
        {/* Color stripe */}
        <View style={[styles.typeStripe, { backgroundColor: typeColor }]} />
        <View style={styles.gigContent}>
          {isOther && item._workspaceName && (
            <View style={[styles.workspaceBadge, { backgroundColor: '#6366f120' }]}>
              <Text style={[styles.workspaceBadgeText, { color: '#6366f1' }]}>{item._workspaceName}</Text>
            </View>
          )}
          <View style={styles.gigHeaderRow}>
            <Text
              style={[
                styles.gigTitle,
                { color: colors.textPrimary },
                isCancelled && styles.cancelledText,
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <View style={[styles.typeBadge, { backgroundColor: typeColor + '25' }]}>
              <Text style={[styles.typeBadgeText, { color: typeColor }]}>{item.type}</Text>
            </View>
          </View>

          <View style={styles.dateRow}>
            <Text style={[styles.gigDate, { color: colors.textSecondary }]}>
              {item.date ? formatGigDate(item.date) : 'No date'}
              {timeStr ? ` \u00B7 ${timeStr}` : ''}
            </Text>
            {dateKey && (
              <TouchableOpacity
                onPress={() => cycleAvailability(dateKey)}
                style={[
                  styles.availabilityBadge,
                  { backgroundColor: statusInfo ? statusInfo.color + '20' : colors.bgTertiary }
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Set availability: ${statusInfo?.label || 'Not set'}`}
              >
                <Text style={[styles.availabilityText, { color: statusInfo?.color || colors.textSecondary }]}>
                  {statusInfo ? `${statusInfo.icon} ${statusInfo.label}` : '+ Avail'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {(isCompleted || isCancelled) && (
            <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[item.status] || '#6b7280') + '20' }]}>
              <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
                {isCompleted ? 'Done' : 'Cancelled'}
              </Text>
            </View>
          )}

          {item.venue ? (
            <Text style={[styles.gigVenue, { color: colors.textSecondary }]} numberOfLines={1}>
              {'\uD83D\uDCCD'} {item.venue}{item.address ? ` \u00B7 ${item.address}` : ''}
            </Text>
          ) : null}

          {item.pay ? (
            <Text style={styles.gigPay}>{currencySymbol}{item.pay.toLocaleString()}</Text>
          ) : null}

          {setlistNames.length > 0 ? (
            <Text style={[styles.gigSetlists, { color: colors.textSecondary }]} numberOfLines={1}>
              {'\uD83C\uDFB5'} {setlistNames.join(' \u2192 ')}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }, [colors, navigation, workspaceId, availability, cycleAvailability]);

  const renderSectionHeader = useCallback(({ section }) => (
    <View style={styles.monthHeader}>
      <Text style={[styles.monthText, { color: colors.textSecondary }]} accessibilityRole="header">{section.title}</Text>
    </View>
  ), [colors]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <SkeletonList count={6} lines={3} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {TYPE_FILTERS.map(f => {
          const active = typeFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterChip,
                { backgroundColor: active ? colors.primary : colors.bgTertiary },
              ]}
              onPress={() => setTypeFilter(f.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Filter: ${f.label}${active ? ', selected' : ''}`}
            >
              <Text style={[styles.filterChipText, { color: active ? '#ffffff' : colors.textSecondary }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        <View style={[styles.filterDivider, { backgroundColor: colors.border }]} />
        <TouchableOpacity
          style={[
            styles.filterChip,
            { backgroundColor: showAllBands ? '#6366f1' : colors.bgTertiary },
          ]}
          onPress={() => setShowAllBands(prev => !prev)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`All Bands${showAllBands ? ', selected' : ''}`}
        >
          <Text style={[styles.filterChipText, { color: showAllBands ? '#ffffff' : colors.textSecondary }]}>
            All Bands
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Desktop feature hint */}
      <View style={[styles.desktopHint, { backgroundColor: colors.bgTertiary }]}>
        <Text style={[styles.desktopHintText, { color: colors.textSecondary }]}>
          Import calendar invites from web app
        </Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderGig}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
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
            <Text style={styles.emptyIcon}>{'\uD83D\uDCC5'}</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No events scheduled</Text>
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
              Tap + to add a gig or rehearsal
            </Text>
          </View>
        }
      />

      {/* Calendar Subscribe Modal */}
      <Modal visible={showCalendarModal} transparent animationType="fade" onRequestClose={() => setShowCalendarModal(false)}>
        <TouchableOpacity
          style={styles.actionOverlay}
          activeOpacity={1}
          onPress={() => setShowCalendarModal(false)}
          accessibilityRole="button"
          accessibilityLabel="Close calendar subscribe modal"
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.actionHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>Subscribe to Calendar</Text>
            <Text style={[styles.calendarDesc, { color: colors.textSecondary }]}>
              Add this URL to your calendar app to stay in sync with all band events.
            </Text>
            <View style={[styles.calendarUrlBox, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}>
              <Text style={[styles.calendarUrlText, { color: colors.textPrimary }]} numberOfLines={2} selectable>
                {calendarUrl}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.calendarActionButton, { backgroundColor: colors.primary }]}
              onPress={async () => {
                await Clipboard.setStringAsync(calendarUrl);
                mediumImpact();
                Alert.alert('Copied', 'Calendar URL copied to clipboard');
              }}
              accessibilityRole="button"
              accessibilityLabel="Copy calendar URL"
            >
              <Text style={styles.calendarActionButtonText}>Copy URL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.calendarActionButton, { backgroundColor: colors.bgTertiary, marginTop: 8 }]}
              onPress={() => {
                const webcalUrl = calendarUrl.replace(/^https?:\/\//, 'webcal://');
                Linking.openURL(webcalUrl).catch(() => {
                  Alert.alert('Error', 'Could not open calendar app');
                });
              }}
              accessibilityRole="button"
              accessibilityLabel="Open in calendar app"
            >
              <Text style={[styles.calendarActionButtonText, { color: colors.primary }]}>Open in Calendar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionCancel]}
              onPress={() => setShowCalendarModal(false)}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Action Sheet */}
      <Modal visible={showActions} transparent animationType="slide" onRequestClose={() => setShowActions(false)}>
        <TouchableOpacity
          style={styles.actionOverlay}
          activeOpacity={1}
          onPress={() => { setShowActions(false); setSelectedGig(null); }}
          accessibilityRole="button"
          accessibilityLabel="Close action sheet"
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.actionHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {selectedGig?.title}
            </Text>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                setShowActions(false);
                navigation.navigate('GigDetail', { gigId: selectedGig?.id, workspaceId, editing: true });
                setSelectedGig(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Edit event"
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleDuplicate} accessibilityRole="button" accessibilityLabel="Duplicate event">
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Duplicate</Text>
            </TouchableOpacity>
            {selectedGig?.date && (
              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => {
                  setShowActions(false);
                  setAvailabilityDate(selectedGig.date.split('T')[0]);
                  setShowAvailabilityModal(true);
                  setSelectedGig(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Set availability for this date"
              >
                <Text style={[styles.actionText, { color: colors.primary }]}>Set Availability</Text>
              </TouchableOpacity>
            )}
            {selectedGig?.status === 'SCHEDULED' && (
              <TouchableOpacity style={styles.actionItem} onPress={handleComplete} accessibilityRole="button" accessibilityLabel="Mark event as complete">
                <Text style={[styles.actionText, { color: '#22c55e' }]}>{'\u2713'} Mark Complete</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionItem} onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Delete event">
              <Text style={[styles.actionText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionCancel]}
              onPress={() => { setShowActions(false); setSelectedGig(null); }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Availability Modal */}
      <Modal visible={showAvailabilityModal} transparent animationType="fade" onRequestClose={() => setShowAvailabilityModal(false)}>
        <TouchableOpacity
          style={styles.actionOverlay}
          activeOpacity={1}
          onPress={() => { setShowAvailabilityModal(false); setAvailabilityDate(null); }}
          accessibilityRole="button"
          accessibilityLabel="Close availability modal"
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.actionHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>Set Availability</Text>
            <Text style={[styles.availabilityDateLabel, { color: colors.textSecondary }]}>
              {availabilityDate ? format(parseISO(availabilityDate), 'EEEE, dd-MMM-yyyy') : ''}
            </Text>
            <TouchableOpacity
              style={[styles.availabilityOption, { backgroundColor: '#22c55e20' }]}
              onPress={() => handleSetAvailability('AVAILABLE')}
              accessibilityRole="button"
              accessibilityLabel="Set as available"
            >
              <Text style={[styles.availabilityOptionText, { color: '#22c55e' }]}>✓ Available</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.availabilityOption, { backgroundColor: '#eab30820' }]}
              onPress={() => handleSetAvailability('MAYBE')}
              accessibilityRole="button"
              accessibilityLabel="Set as maybe"
            >
              <Text style={[styles.availabilityOptionText, { color: '#eab308' }]}>? Maybe</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.availabilityOption, { backgroundColor: '#ef444420' }]}
              onPress={() => handleSetAvailability('UNAVAILABLE')}
              accessibilityRole="button"
              accessibilityLabel="Set as unavailable"
            >
              <Text style={[styles.availabilityOptionText, { color: '#ef4444' }]}>✗ Unavailable</Text>
            </TouchableOpacity>
            {availability[availabilityDate] && (
              <TouchableOpacity
                style={[styles.availabilityOption, { backgroundColor: colors.bgTertiary }]}
                onPress={() => handleSetAvailability('CLEAR')}
                accessibilityRole="button"
                accessibilityLabel="Clear availability"
              >
                <Text style={[styles.availabilityOptionText, { color: colors.textSecondary }]}>Clear</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionItem, styles.actionCancel]}
              onPress={() => { setShowAvailabilityModal(false); setAvailabilityDate(null); }}
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
  // Filters
  filterScroll: { flexGrow: 0 },
  filterRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  filterChipText: { fontSize: 14, fontWeight: '600' },
  // List
  listContent: { paddingHorizontal: 12, paddingBottom: 20 },
  monthHeader: { paddingVertical: 8, paddingHorizontal: 4 },
  monthText: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  // Gig card
  gigCard: {
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
  },
  cancelledCard: { opacity: 0.6 },
  typeStripe: { width: 4 },
  gigContent: { flex: 1, padding: 12 },
  gigHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  gigTitle: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  cancelledText: { textDecorationLine: 'line-through' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  typeBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  gigDate: { fontSize: 14, marginBottom: 4 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  gigVenue: { fontSize: 13, marginBottom: 2 },
  gigPay: { color: '#22c55e', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  gigSetlists: { fontSize: 13, marginTop: 2 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 15 },
  emptyHint: { fontSize: 13, marginTop: 6, textAlign: 'center', opacity: 0.7 },
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
  calendarDesc: { fontSize: 14, textAlign: 'center', marginBottom: 16, paddingHorizontal: 16 },
  calendarUrlBox: { borderWidth: 1, borderRadius: 8, padding: 12, marginHorizontal: 16, marginBottom: 16 },
  calendarUrlText: { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  calendarActionButton: { marginHorizontal: 16, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  calendarActionButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  filterDivider: { width: 1, height: 20, alignSelf: 'center' },
  otherWorkspaceCard: { borderLeftWidth: 0, borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)' },
  workspaceBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
  workspaceBadgeText: { fontSize: 11, fontWeight: '700' },
  desktopHint: { paddingHorizontal: 12, paddingVertical: 6 },
  desktopHintText: { fontSize: 12, textAlign: 'center' },
  // Availability
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  availabilityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  availabilityText: { fontSize: 11, fontWeight: '600' },
  availabilityDateLabel: { fontSize: 14, textAlign: 'center', marginBottom: 16 },
  availabilityOption: { paddingVertical: 16, borderRadius: 10, alignItems: 'center', marginBottom: 8, marginHorizontal: 16 },
  availabilityOptionText: { fontSize: 17, fontWeight: '600' },
});
