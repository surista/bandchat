import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

function StatBox({ label, value, colors }) {
  return (
    <View style={[styles.statBox, { backgroundColor: colors.bgSecondary }]}>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

const ACHIEVEMENT_ICONS = {
  gigs: '\uD83C\uDFB8',
  songs: '\uD83C\uDFB5',
  setlists: '\uD83D\uDCCB',
  rehearsals: '\uD83E\uDD41',
  messages: '\uD83D\uDCAC',
  milestones: '\uD83C\uDFC6',
};

export default function MemberProfileScreen({ route, navigation }) {
  const { workspaceId, userId, displayName } = route.params;
  const { user: currentUser } = useAuth();
  const { colors } = useTheme();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  useEffect(() => {
    if (displayName) {
      navigation.setOptions({ title: displayName });
    }
  }, [navigation, displayName]);

  const loadProfile = useCallback(async () => {
    try {
      const data = await api.getMemberProfile(workspaceId, userId);
      setProfile(data);
      if (data.user?.displayName) {
        navigation.setOptions({ title: data.user.displayName });
      }
    } catch (err) {
      console.error('Failed to load member profile:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId, userId, navigation]);

  useEffect(() => {
    loadProfile();
    if (userId !== currentUser?.id) {
      checkBlockStatus();
    }
  }, [loadProfile, userId, currentUser?.id]);

  const checkBlockStatus = useCallback(async () => {
    try {
      const blocks = await api.getBlockedUsers();
      setIsBlocked(blocks.some(b => b.blockedUserId === userId));
    } catch {
      // Block status is supplementary
    }
  }, [userId]);

  const handleToggleBlock = useCallback(() => {
    const action = isBlocked ? 'Unblock' : 'Block';
    const message = isBlocked
      ? `Unblock ${profile?.user?.displayName || 'this user'}? Their messages will be visible again.`
      : `Block ${profile?.user?.displayName || 'this user'}? Their messages will be hidden from you.`;

    Alert.alert(action, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        style: isBlocked ? 'default' : 'destructive',
        onPress: async () => {
          setBlockLoading(true);
          try {
            if (isBlocked) {
              await api.unblockUser(userId);
              setIsBlocked(false);
            } else {
              await api.blockUser(userId);
              setIsBlocked(true);
            }
          } catch (err) {
            Alert.alert('Error', `Failed to ${action.toLowerCase()} user.`);
          } finally {
            setBlockLoading(false);
          }
        },
      },
    ]);
  }, [isBlocked, userId, profile]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadProfile();
  }, [loadProfile]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Profile not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { user: profileUser, role, joinedAt, bandJoinDate, firstGigDate, lastGigDate, isGuest, achievements, stats } = profile;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>
            {(profileUser?.displayName || '?')[0].toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.name, { color: colors.textPrimary }]}>
          {profileUser?.displayName || 'Unknown'}
        </Text>
        {profileUser?.bio ? (
          <Text style={[styles.bio, { color: colors.textSecondary }]}>{profileUser.bio}</Text>
        ) : null}
        <View style={styles.badgeRow}>
          <View style={[styles.roleBadge, {
            backgroundColor: role === 'admin' ? colors.primary + '20' : colors.bgTertiary,
          }]}>
            <Text style={[styles.roleText, {
              color: role === 'admin' ? colors.primary : colors.textSecondary,
            }]}>
              {role === 'admin' ? 'Admin' : 'Member'}
            </Text>
          </View>
          {isGuest && (
            <View style={[styles.roleBadge, { backgroundColor: '#eab30820' }]}>
              <Text style={[styles.roleText, { color: '#eab308' }]}>Guest</Text>
            </View>
          )}
        </View>
      </View>

      {/* Dates */}
      <View style={[styles.section, { backgroundColor: colors.bgSecondary }]}>
        {joinedAt && (
          <View style={styles.dateRow}>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>Joined workspace</Text>
            <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{formatDate(joinedAt)}</Text>
          </View>
        )}
        {bandJoinDate && (
          <View style={styles.dateRow}>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>Joined band</Text>
            <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{formatDate(bandJoinDate)}</Text>
          </View>
        )}
        {firstGigDate && (
          <View style={styles.dateRow}>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>First gig</Text>
            <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{formatDate(firstGigDate)}</Text>
          </View>
        )}
        {lastGigDate && (
          <View style={styles.dateRow}>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>Last gig</Text>
            <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{formatDate(lastGigDate)}</Text>
          </View>
        )}
      </View>

      {/* Stats */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Stats</Text>
      <View style={styles.statsGrid}>
        <StatBox label="Messages" value={stats?.messages || 0} colors={colors} />
        <StatBox label="Songs Added" value={stats?.songsAdded || 0} colors={colors} />
        <StatBox label="Setlists" value={stats?.setlistsCreated || 0} colors={colors} />
        <StatBox label="Gigs Played" value={stats?.gigsAttended || 0} colors={colors} />
        <StatBox label="Rehearsals" value={stats?.rehearsalsAttended || 0} colors={colors} />
      </View>

      {/* Achievements */}
      {achievements && achievements.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            Achievements ({achievements.length})
          </Text>
          <View style={styles.achievementsList}>
            {achievements.map((a, i) => {
              const icon = ACHIEVEMENT_ICONS[a.category] || '\uD83C\uDFC5';
              return (
                <View key={a.id || i} style={[styles.achievementCard, { backgroundColor: colors.bgSecondary }]}>
                  <Text style={styles.achievementIcon}>{icon}</Text>
                  <View style={styles.achievementInfo}>
                    <Text style={[styles.achievementName, { color: colors.textPrimary }]}>{a.name}</Text>
                    <Text style={[styles.achievementDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                      {a.description}
                    </Text>
                    {a.earnedAt && (
                      <Text style={[styles.achievementDate, { color: colors.textSecondary }]}>
                        Earned {formatDate(a.earnedAt)}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.achievementTypeBadge, {
                    backgroundColor: a.type === 'band' ? '#3b82f620' : '#22c55e20',
                  }]}>
                    <Text style={[styles.achievementTypeText, {
                      color: a.type === 'band' ? '#3b82f6' : '#22c55e',
                    }]}>
                      {a.type === 'band' ? 'Band' : 'Personal'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Block/Unblock */}
      {userId !== currentUser?.id && (
        <TouchableOpacity
          style={[styles.blockButton, { backgroundColor: colors.bgSecondary }]}
          onPress={handleToggleBlock}
          disabled={blockLoading}
          activeOpacity={0.6}
        >
          <Text style={[styles.blockButtonText, { color: isBlocked ? '#3b82f6' : '#ef4444' }]}>
            {blockLoading ? '...' : isBlocked ? 'Unblock User' : 'Block User'}
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15 },
  content: { padding: 16, paddingBottom: 40 },
  // Profile header
  profileHeader: { alignItems: 'center', marginBottom: 20 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { color: '#ffffff', fontSize: 28, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  bio: { fontSize: 14, textAlign: 'center', marginBottom: 8, lineHeight: 20 },
  badgeRow: { flexDirection: 'row', gap: 8 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  roleText: { fontSize: 12, fontWeight: '600' },
  // Dates section
  section: { borderRadius: 10, padding: 14, marginBottom: 20 },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  dateLabel: { fontSize: 14 },
  dateValue: { fontSize: 14, fontWeight: '600' },
  // Stats
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  statBox: {
    width: '48%',
    flexGrow: 1,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '700', marginBottom: 2 },
  statLabel: { fontSize: 12, fontWeight: '600' },
  // Achievements
  achievementsList: { gap: 8, marginBottom: 20 },
  achievementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  achievementIcon: { fontSize: 28 },
  achievementInfo: { flex: 1 },
  achievementName: { fontSize: 15, fontWeight: '600' },
  achievementDesc: { fontSize: 13, marginTop: 2 },
  achievementDate: { fontSize: 12, marginTop: 4 },
  achievementTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  achievementTypeText: { fontSize: 11, fontWeight: '600' },
  // Block button
  blockButton: {
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  blockButtonText: { fontSize: 15, fontWeight: '600' },
});
