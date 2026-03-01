import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isToday,
  parseISO,
} from 'date-fns';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

const STATUS_COLORS = {
  AVAILABLE: '#22c55e',
  MAYBE: '#eab308',
  UNAVAILABLE: '#ef4444',
  UNKNOWN: '#6b7280',
};

const STATUS_LABELS = {
  AVAILABLE: 'Available',
  MAYBE: 'Maybe',
  UNAVAILABLE: 'Unavailable',
  UNKNOWN: 'Not set',
};

export default function AvailabilityScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();

  const [tab, setTab] = useState('personal');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [myAvailability, setMyAvailability] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Team tab
  const [teamSummaries, setTeamSummaries] = useState({});

  // Detail modal
  const [selectedDate, setSelectedDate] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamDetail, setTeamDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);
  const days = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd]);

  const dateRange = useMemo(() => ({
    start: format(monthStart, 'yyyy-MM-dd'),
    end: format(monthEnd, 'yyyy-MM-dd'),
  }), [monthStart, monthEnd]);

  const loadPersonal = useCallback(async () => {
    try {
      const data = await api.getMyAvailability(workspaceId, dateRange.start, dateRange.end);
      const map = {};
      for (const item of data) {
        const dateKey = item.date.substring(0, 10);
        map[dateKey] = item.status;
      }
      setMyAvailability(map);
    } catch (err) {
      console.error('Failed to load availability:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId, dateRange]);

  const loadTeam = useCallback(async () => {
    try {
      const data = await api.getAvailability(workspaceId, dateRange.start, dateRange.end);
      const summaryMap = {};
      for (const item of data) {
        const dateKey = item.date.substring(0, 10);
        if (!summaryMap[dateKey]) {
          summaryMap[dateKey] = { available: 0, maybe: 0, unavailable: 0, total: 0 };
        }
        summaryMap[dateKey].total++;
        if (item.status === 'AVAILABLE') summaryMap[dateKey].available++;
        else if (item.status === 'MAYBE') summaryMap[dateKey].maybe++;
        else if (item.status === 'UNAVAILABLE') summaryMap[dateKey].unavailable++;
      }
      setTeamSummaries(summaryMap);
    } catch (err) {
      console.error('Failed to load team availability:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId, dateRange]);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  useEffect(() => {
    setLoading(true);
    if (tab === 'personal') {
      loadPersonal();
    } else {
      loadTeam();
    }
  }, [tab, loadPersonal, loadTeam]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loadingRef.current) {
        if (tab === 'personal') loadPersonal();
        else loadTeam();
      }
    });
    return unsubscribe;
  }, [navigation, tab, loadPersonal, loadTeam]);

  const prevMonth = useCallback(() => setCurrentMonth(prev => subMonths(prev, 1)), []);
  const nextMonth = useCallback(() => setCurrentMonth(prev => addMonths(prev, 1)), []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (tab === 'personal') loadPersonal();
    else loadTeam();
  }, [tab, loadPersonal, loadTeam]);

  const handleDatePress = useCallback((dateObj) => {
    const dateStr = format(dateObj, 'yyyy-MM-dd');
    setSelectedDate(dateStr);
    if (tab === 'personal') {
      setShowStatusModal(true);
    } else {
      setShowTeamModal(true);
      setLoadingDetail(true);
      api.getAvailabilitySummary(workspaceId, dateStr)
        .then(data => setTeamDetail(data))
        .catch(() => setTeamDetail(null))
        .finally(() => setLoadingDetail(false));
    }
  }, [tab, workspaceId]);

  const setStatus = useCallback(async (status) => {
    if (!selectedDate) return;
    setSaving(true);
    try {
      if (status === 'CLEAR') {
        await api.clearAvailability(workspaceId, selectedDate);
        setMyAvailability(prev => {
          const next = { ...prev };
          delete next[selectedDate];
          return next;
        });
      } else {
        await api.setAvailability(workspaceId, selectedDate, status);
        setMyAvailability(prev => ({ ...prev, [selectedDate]: status }));
      }
    } catch (err) {
      console.error('Failed to set availability:', err);
    } finally {
      setSaving(false);
      setShowStatusModal(false);
      setSelectedDate(null);
    }
  }, [selectedDate, workspaceId]);

  const renderDay = useCallback(({ item: dateObj }) => {
    const dateStr = format(dateObj, 'yyyy-MM-dd');
    const today = isToday(dateObj);

    if (tab === 'personal') {
      const status = myAvailability[dateStr] || 'UNKNOWN';
      const statusColor = STATUS_COLORS[status];
      return (
        <TouchableOpacity
          style={[styles.dayRow, { backgroundColor: colors.bgSecondary }, today && styles.todayRow]}
          onPress={() => handleDatePress(dateObj)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${format(dateObj, 'EEEE, MMMM d')}, ${STATUS_LABELS[status]}`}
        >
          <View style={styles.dayInfo}>
            <Text style={[styles.dayName, { color: today ? colors.primary : colors.textSecondary }]}>
              {format(dateObj, 'EEE')}
            </Text>
            <Text style={[styles.dayDate, { color: today ? colors.primary : colors.textPrimary }]}>
              {format(dateObj, 'd')}
            </Text>
          </View>
          <View style={styles.statusInfo}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusLabel, { color: statusColor }]}>{STATUS_LABELS[status]}</Text>
          </View>
        </TouchableOpacity>
      );
    }

    // Team tab
    const summary = teamSummaries[dateStr];
    const total = summary ? summary.available + summary.maybe + summary.unavailable : 0;
    return (
      <TouchableOpacity
        style={[styles.dayRow, { backgroundColor: colors.bgSecondary }, today && styles.todayRow]}
        onPress={() => handleDatePress(dateObj)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${format(dateObj, 'EEEE, MMMM d')}, ${total > 0 ? `${summary.available} of ${total} available` : 'No responses'}`}
      >
        <View style={styles.dayInfo}>
          <Text style={[styles.dayName, { color: today ? colors.primary : colors.textSecondary }]}>
            {format(dateObj, 'EEE')}
          </Text>
          <Text style={[styles.dayDate, { color: today ? colors.primary : colors.textPrimary }]}>
            {format(dateObj, 'd')}
          </Text>
        </View>
        <View style={styles.teamInfo}>
          {total > 0 ? (
            <>
              <View style={styles.summaryBar}>
                {summary.available > 0 && (
                  <View style={[styles.barSegment, { flex: summary.available, backgroundColor: STATUS_COLORS.AVAILABLE }]} />
                )}
                {summary.maybe > 0 && (
                  <View style={[styles.barSegment, { flex: summary.maybe, backgroundColor: STATUS_COLORS.MAYBE }]} />
                )}
                {summary.unavailable > 0 && (
                  <View style={[styles.barSegment, { flex: summary.unavailable, backgroundColor: STATUS_COLORS.UNAVAILABLE }]} />
                )}
              </View>
              <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
                {summary.available}/{total} available
              </Text>
            </>
          ) : (
            <Text style={[styles.summaryText, { color: colors.textSecondary }]}>No responses</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [tab, myAvailability, teamSummaries, colors, handleDatePress]);

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
      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.bgSecondary }]}>
        <TouchableOpacity
          style={[styles.tab, tab === 'personal' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setTab('personal')}
          accessibilityRole="button"
          accessibilityLabel="Personal tab"
        >
          <Text style={[styles.tabText, { color: tab === 'personal' ? colors.primary : colors.textSecondary }]}>Personal</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'team' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setTab('team')}
          accessibilityRole="button"
          accessibilityLabel="Team tab"
        >
          <Text style={[styles.tabText, { color: tab === 'team' ? colors.primary : colors.textSecondary }]}>Team</Text>
        </TouchableOpacity>
      </View>

      {/* Month navigation */}
      <View style={[styles.monthNav, { backgroundColor: colors.bgPrimary }]}>
        <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Previous month">
          <Text style={[styles.navArrow, { color: colors.primary }]}>{'\u2039'}</Text>
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: colors.textPrimary }]} accessibilityRole="header">
          {format(currentMonth, 'MMMM yyyy')}
        </Text>
        <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Next month">
          <Text style={[styles.navArrow, { color: colors.primary }]}>{'\u203A'}</Text>
        </TouchableOpacity>
      </View>

      {/* Days list */}
      <FlatList
        data={days}
        keyExtractor={(item) => item.toISOString()}
        renderItem={renderDay}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />

      {/* Status Modal (Personal) */}
      <Modal visible={showStatusModal} transparent animationType="slide" onRequestClose={() => setShowStatusModal(false)}>
        <TouchableOpacity
          style={styles.actionOverlay}
          activeOpacity={1}
          onPress={() => { setShowStatusModal(false); setSelectedDate(null); }}
          accessibilityRole="button"
          accessibilityLabel="Close status picker"
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.actionHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>
              {selectedDate ? format(parseISO(selectedDate), 'EEEE, MMM d') : ''}
            </Text>
            {saving ? (
              <ActivityIndicator color={colors.primary} style={{ padding: 20 }} />
            ) : (
              <>
                <TouchableOpacity style={styles.statusOption} onPress={() => setStatus('AVAILABLE')} accessibilityRole="button" accessibilityLabel="Set as available">
                  <View style={[styles.statusOptionDot, { backgroundColor: STATUS_COLORS.AVAILABLE }]} />
                  <Text style={[styles.statusOptionText, { color: colors.textPrimary }]}>Available</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.statusOption} onPress={() => setStatus('MAYBE')} accessibilityRole="button" accessibilityLabel="Set as maybe">
                  <View style={[styles.statusOptionDot, { backgroundColor: STATUS_COLORS.MAYBE }]} />
                  <Text style={[styles.statusOptionText, { color: colors.textPrimary }]}>Maybe</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.statusOption} onPress={() => setStatus('UNAVAILABLE')} accessibilityRole="button" accessibilityLabel="Set as unavailable">
                  <View style={[styles.statusOptionDot, { backgroundColor: STATUS_COLORS.UNAVAILABLE }]} />
                  <Text style={[styles.statusOptionText, { color: colors.textPrimary }]}>Unavailable</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.statusOption} onPress={() => setStatus('CLEAR')} accessibilityRole="button" accessibilityLabel="Clear availability">
                  <View style={[styles.statusOptionDot, { backgroundColor: STATUS_COLORS.UNKNOWN }]} />
                  <Text style={[styles.statusOptionText, { color: colors.textSecondary }]}>Clear</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={[styles.statusOption, styles.statusCancel]}
              onPress={() => { setShowStatusModal(false); setSelectedDate(null); }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.statusOptionText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Team Detail Modal */}
      <Modal visible={showTeamModal} transparent animationType="slide" onRequestClose={() => setShowTeamModal(false)}>
        <TouchableOpacity
          style={styles.actionOverlay}
          activeOpacity={1}
          onPress={() => { setShowTeamModal(false); setSelectedDate(null); setTeamDetail(null); }}
          accessibilityRole="button"
          accessibilityLabel="Close team detail"
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.actionHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]}>
              {selectedDate ? format(parseISO(selectedDate), 'EEEE, MMM d') : ''}
            </Text>
            {loadingDetail ? (
              <ActivityIndicator color={colors.primary} style={{ padding: 20 }} />
            ) : teamDetail?.members ? (
              teamDetail.members.map(member => {
                const statusColor = STATUS_COLORS[member.status] || STATUS_COLORS.UNKNOWN;
                return (
                  <View key={member.user.id} style={styles.teamMemberRow}>
                    <View style={[styles.teamMemberDot, { backgroundColor: statusColor }]} />
                    <Text style={[styles.teamMemberName, { color: colors.textPrimary }]}>
                      {member.user.displayName}
                    </Text>
                    <Text style={[styles.teamMemberStatus, { color: statusColor }]}>
                      {STATUS_LABELS[member.status] || 'Not set'}
                    </Text>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.noDataText, { color: colors.textSecondary }]}>No data</Text>
            )}
            <TouchableOpacity
              style={[styles.statusOption, styles.statusCancel]}
              onPress={() => { setShowTeamModal(false); setSelectedDate(null); setTeamDetail(null); }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={[styles.statusOptionText, { color: colors.textSecondary }]}>Close</Text>
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
  // Tabs
  tabBar: {
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabText: { fontSize: 15, fontWeight: '600' },
  // Month nav
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  navArrow: { fontSize: 28, fontWeight: '300', lineHeight: 30 },
  monthLabel: { fontSize: 17, fontWeight: '700' },
  // Days
  listContent: { paddingHorizontal: 12, paddingBottom: 20 },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 12,
    marginBottom: 4,
  },
  todayRow: { borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)' },
  dayInfo: {
    width: 50,
    alignItems: 'center',
  },
  dayName: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  dayDate: { fontSize: 18, fontWeight: '700' },
  statusInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusLabel: { fontSize: 14, fontWeight: '500' },
  // Team
  teamInfo: {
    flex: 1,
    marginLeft: 12,
  },
  summaryBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  barSegment: { minWidth: 3 },
  summaryText: { fontSize: 13 },
  // Action sheet / modal
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
  // Status options
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  statusOptionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusOptionText: { fontSize: 17 },
  statusCancel: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
  },
  // Team detail
  teamMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  teamMemberDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  teamMemberName: { flex: 1, fontSize: 15 },
  teamMemberStatus: { fontSize: 14, fontWeight: '500' },
  noDataText: { fontSize: 15, textAlign: 'center', padding: 20 },
});
