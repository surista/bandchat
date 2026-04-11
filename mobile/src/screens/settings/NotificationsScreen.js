import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import { useLayout } from '../../hooks/useLayout';
import PressableRow from '../../components/PressableRow';

const SNOOZE_OPTIONS = [
  { label: '30 minutes', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: 'Indefinitely', value: -1 },
];

const PREF_CATEGORIES = [
  { key: 'notifyDMs', label: 'Direct Messages' },
  { key: 'notifyMentions', label: 'Mentions' },
  { key: 'notifyGigChanges', label: 'Gig Changes' },
  { key: 'notifyAnnouncements', label: 'Announcements' },
  { key: 'notifyChannelMessages', label: 'All Channel Messages' },
];

export default function NotificationsScreen({ route }) {
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();
  const workspaceId = route?.params?.workspaceId;

  const [loading, setLoading] = useState(true);
  const [snoozeStatus, setSnoozeStatus] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [prefs, setPrefs] = useState(null);
  const [prefsLoading, setPrefsLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [status, prefData] = await Promise.all([
        api.getNotificationSnoozeStatus().catch(() => null),
        workspaceId ? api.getNotificationPreferences(workspaceId).catch(() => null) : null,
      ]);
      setSnoozeStatus(status);
      if (prefData) {
        setPrefs(prefData);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSnooze = useCallback(async (duration) => {
    setUpdating(true);
    try {
      await api.setNotificationSnooze(duration);
      const status = await api.getNotificationSnoozeStatus();
      setSnoozeStatus(status);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to set snooze');
    } finally {
      setUpdating(false);
    }
  }, []);

  const handleUnsnooze = useCallback(async () => {
    setUpdating(true);
    try {
      await api.setNotificationSnooze(0);
      setSnoozeStatus(null);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to turn off snooze');
    } finally {
      setUpdating(false);
    }
  }, []);

  const handlePrefToggle = useCallback(async (key, value) => {
    if (!workspaceId) return;
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    try {
      await api.updateNotificationPreferences(workspaceId, { [key]: value });
    } catch (err) {
      // Revert on failure
      setPrefs(prev => ({ ...prev, [key]: !value }));
      Alert.alert('Error', err.message || 'Failed to update preference');
    }
  }, [workspaceId, prefs]);

  const isSnoozed = snoozeStatus?.snoozed;
  const snoozeUntil = snoozeStatus?.until;

  const getStatusText = () => {
    if (!isSnoozed) return 'Active';
    if (snoozeStatus?.indefinite) return 'Snoozed indefinitely';
    if (snoozeUntil) {
      const until = new Date(snoozeUntil);
      return `Snoozed until ${until.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return 'Snoozed';
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      <ScrollView contentContainerStyle={[styles.content, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
        {/* Status */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>STATUS</Text>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          <View style={styles.statusRow}>
            <Text style={[styles.statusLabel, { color: colors.textPrimary }]}>Notifications</Text>
            <View style={[styles.statusBadge, { backgroundColor: isSnoozed ? '#f59e0b20' : '#22c55e20' }]}>
              <Text style={[styles.statusText, { color: isSnoozed ? '#f59e0b' : '#22c55e' }]}>
                {getStatusText()}
              </Text>
            </View>
          </View>
        </View>

        {/* Notification Preferences */}
        {workspaceId && prefs && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>NOTIFICATION CATEGORIES</Text>
            <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
              {PREF_CATEGORIES.map((cat, index) => (
                <View
                  key={cat.key}
                  style={[
                    styles.prefRow,
                    index < PREF_CATEGORIES.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  ]}
                >
                  <Text style={[styles.prefLabel, { color: colors.textPrimary }]}>{cat.label}</Text>
                  <Switch
                    value={prefs[cat.key] !== false}
                    onValueChange={(value) => handlePrefToggle(cat.key, value)}
                    trackColor={{ false: colors.border, true: colors.primary + '80' }}
                    thumbColor={prefs[cat.key] !== false ? colors.primary : '#f4f3f4'}
                    accessibilityLabel={`${cat.label} notifications`}
                  />
                </View>
              ))}
            </View>
          </>
        )}

        {/* Snooze Options */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>SNOOZE NOTIFICATIONS</Text>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          {SNOOZE_OPTIONS.map((option, index) => (
            <PressableRow
              key={option.value}
              style={[
                styles.optionRow,
                index < SNOOZE_OPTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
              ]}
              onPress={() => handleSnooze(option.value)}
              disabled={updating}
              accessibilityRole="button"
              accessibilityLabel={`Snooze for ${option.label}`}
            >
              <Text style={[styles.optionText, { color: colors.textPrimary }]}>{option.label}</Text>
            </PressableRow>
          ))}
        </View>

        {/* Turn off snooze */}
        {isSnoozed && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}> </Text>
            <TouchableOpacity
              style={[styles.unsnoozeButton, { backgroundColor: colors.primary }]}
              onPress={handleUnsnooze}
              disabled={updating}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Turn off snooze"
            >
              {updating ? (
                <ActivityIndicator color={colors.primaryText} size="small" />
              ) : (
                <Text style={[styles.unsnoozeText, { color: colors.primaryText }]}>Turn Off Snooze</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  statusLabel: { fontSize: 16, fontWeight: '500' },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { fontSize: 13, fontWeight: '600' },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  prefLabel: { fontSize: 16 },
  optionRow: {
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  optionText: { fontSize: 16 },
  unsnoozeButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  unsnoozeText: { fontSize: 16, fontWeight: '600' },
});
