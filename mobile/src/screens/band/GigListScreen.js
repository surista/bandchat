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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../context/ThemeContext';
import { mediumImpact, successNotification } from '../../utils/haptics';
import api from '../../services/api';

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

function formatGigDate(dateStr) {
  try {
    const d = parseISO(dateStr);
    return format(d, 'EEEE, MMM d');
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

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Header "+" button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('GigDetail', { workspaceId })}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Create event"
        >
          <Text style={{ color: colors.primary, fontSize: 28, fontWeight: '300', lineHeight: 30 }}>+</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, workspaceId, colors.primary]);

  const loadGigs = useCallback(async () => {
    try {
      const filters = typeFilter !== 'all' ? { type: typeFilter } : {};
      const [data, other] = await Promise.all([
        api.getGigs(workspaceId, filters),
        showAllBands ? api.getGigsFromAllWorkspaces(workspaceId).catch(() => []) : Promise.resolve([]),
      ]);
      setGigs(data);
      setOtherGigs(showAllBands ? other : []);
    } catch (err) {
      console.error('Failed to load gigs:', err);
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

  const renderGig = useCallback(({ item }) => {
    const typeColor = TYPE_COLORS[item.type] || TYPE_COLORS.OTHER;
    const isCancelled = item.status === 'CANCELLED';
    const isCompleted = item.status === 'COMPLETED';
    const timeStr = formatTimeRange(item.startTime, item.endTime);
    const setlistNames = (item.setlists || []).map(gs => gs.setlist?.name).filter(Boolean);
    const isOther = item._otherWorkspace;

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

          <Text style={[styles.gigDate, { color: colors.textSecondary }]}>
            {item.date ? formatGigDate(item.date) : 'No date'}
            {timeStr ? ` \u00B7 ${timeStr}` : ''}
          </Text>

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
            <Text style={styles.gigPay}>${item.pay.toLocaleString()}</Text>
          ) : null}

          {setlistNames.length > 0 ? (
            <Text style={[styles.gigSetlists, { color: colors.textSecondary }]} numberOfLines={1}>
              {'\uD83C\uDFB5'} {setlistNames.join(' \u2192 ')}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }, [colors, navigation, workspaceId]);

  const renderSectionHeader = useCallback(({ section }) => (
    <View style={styles.monthHeader}>
      <Text style={[styles.monthText, { color: colors.textSecondary }]} accessibilityRole="header">{section.title}</Text>
    </View>
  ), [colors]);

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
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No events</Text>
          </View>
        }
      />

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
  emptyText: { fontSize: 15 },
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
  filterDivider: { width: 1, height: 20, alignSelf: 'center' },
  otherWorkspaceCard: { borderLeftWidth: 0, borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)' },
  workspaceBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
  workspaceBadgeText: { fontSize: 11, fontWeight: '700' },
});
