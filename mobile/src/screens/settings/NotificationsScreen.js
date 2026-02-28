import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

const SNOOZE_OPTIONS = [
  { label: '30 minutes', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: 'Indefinitely', value: -1 },
];

export default function NotificationsScreen() {
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [snoozeStatus, setSnoozeStatus] = useState(null);
  const [updating, setUpdating] = useState(false);

  const loadSnoozeStatus = useCallback(async () => {
    try {
      const status = await api.getNotificationSnoozeStatus();
      setSnoozeStatus(status);
    } catch {
      // Snooze not active
      setSnoozeStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSnoozeStatus();
  }, [loadSnoozeStatus]);

  const handleSnooze = useCallback(async (duration) => {
    setUpdating(true);
    try {
      await api.setNotificationSnooze(duration);
      await loadSnoozeStatus();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to set snooze');
    } finally {
      setUpdating(false);
    }
  }, [loadSnoozeStatus]);

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
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
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

        {/* Snooze Options */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>SNOOZE NOTIFICATIONS</Text>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          {SNOOZE_OPTIONS.map((option, index) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionRow,
                index < SNOOZE_OPTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
              ]}
              onPress={() => handleSnooze(option.value)}
              disabled={updating}
              activeOpacity={0.6}
            >
              <Text style={[styles.optionText, { color: colors.textPrimary }]}>{option.label}</Text>
            </TouchableOpacity>
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
            >
              {updating ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.unsnoozeText}>Turn Off Snooze</Text>
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
  unsnoozeText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
