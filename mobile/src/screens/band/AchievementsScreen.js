import { useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import formatDate from '../../utils/formatDate';
import api from '../../services/api';

const TABS = ['band', 'my', 'leaderboard'];
const TAB_LABELS = { band: 'Band', my: 'My Badges', leaderboard: 'Leaderboard' };

const CATEGORY_LABELS = {
  gigs: 'Gigs',
  songs: 'Songs',
  rehearsals: 'Rehearsals',
  social: 'Social',
  milestones: 'Milestones',
};

function StatCard({ label, value, color, bgColor }) {
  return (
    <View style={[styles.statCard, { backgroundColor: bgColor }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
    </View>
  );
}

export default function AchievementsScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();

  const [definitions, setDefinitions] = useState([]);
  const [bandAchievements, setBandAchievements] = useState([]);
  const [myAchievements, setMyAchievements] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [activeTab, setActiveTab] = useState('band');
  const [newAchievements, setNewAchievements] = useState([]);

  // Header "Check" button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleCheck}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={checking}
          accessibilityRole="button"
          accessibilityLabel="Check for new achievements"
        >
          {checking ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>Check</Text>
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.primary, checking]);

  const loadData = useCallback(async () => {
    try {
      const [defs, band, my, lb] = await Promise.all([
        api.getAchievementDefinitions(),
        api.getBandAchievements(workspaceId),
        api.getMyAchievements(workspaceId),
        api.getAchievementLeaderboard(workspaceId),
      ]);
      setDefinitions(defs);
      setBandAchievements(band);
      setMyAchievements(my);
      setLeaderboard(lb);
    } catch (err) {
      console.error('Failed to load achievements:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleCheck = useCallback(async () => {
    setChecking(true);
    try {
      const result = await api.checkAchievements(workspaceId);
      setStats(result.stats);
      if (result.newAchievements?.length > 0) {
        setNewAchievements(result.newAchievements);
        loadData();
      } else {
        Alert.alert('Up to Date', 'No new achievements - keep playing!');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to check achievements');
    } finally {
      setChecking(false);
    }
  }, [workspaceId, loadData]);

  // Build achievement grids
  const bandDefinitions = useMemo(() => definitions.filter(d => d.isBandWide), [definitions]);
  const memberDefinitions = useMemo(() => definitions.filter(d => !d.isBandWide), [definitions]);

  const bandEarnedIds = useMemo(
    () => new Set(bandAchievements.map(a => a.achievementId)),
    [bandAchievements]
  );
  const myEarnedIds = useMemo(
    () => new Set(myAchievements.map(a => a.achievementId)),
    [myAchievements]
  );

  const bandEarnedMap = useMemo(() => {
    const m = {};
    bandAchievements.forEach(a => { m[a.achievementId] = a; });
    return m;
  }, [bandAchievements]);

  const myEarnedMap = useMemo(() => {
    const m = {};
    myAchievements.forEach(a => { m[a.achievementId] = a; });
    return m;
  }, [myAchievements]);

  // Group definitions by category
  const groupByCategory = useCallback((defs) => {
    const groups = {};
    for (const def of defs) {
      const cat = def.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(def);
    }
    return Object.entries(groups).map(([cat, items]) => ({
      category: cat,
      label: CATEGORY_LABELS[cat] || cat,
      items,
    }));
  }, []);

  const bandGroups = useMemo(() => groupByCategory(bandDefinitions), [bandDefinitions, groupByCategory]);
  const myGroups = useMemo(() => groupByCategory(memberDefinitions), [memberDefinitions, groupByCategory]);

  const bandEarnedCount = bandEarnedIds.size;
  const myEarnedCount = myEarnedIds.size;

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
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Celebration banner */}
        {newAchievements.length > 0 && (
          <View style={styles.celebrationBanner}>
            <Text style={styles.celebrationTitle}>New Achievements Unlocked!</Text>
            <View style={styles.celebrationBadges}>
              {newAchievements.map((a, i) => (
                <View key={a.id || i} style={styles.celebrationBadge}>
                  <Text style={styles.celebrationIcon}>{a.achievement?.icon || '\uD83C\uDFC6'}</Text>
                  <Text style={styles.celebrationName}>{a.achievement?.name}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity onPress={() => setNewAchievements([])} style={styles.dismissButton} accessibilityRole="button" accessibilityLabel="Dismiss new achievements">
              <Text style={styles.dismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Stats summary */}
        {stats && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statsRow}
          >
            <StatCard label="Gigs" value={stats.gigs || 0} color="#22c55e" bgColor="rgba(34,197,94,0.12)" />
            <StatCard label="Stage Time" value={`${Math.round((stats.hoursGigged || 0))}h`} color="#3b82f6" bgColor="rgba(59,130,246,0.12)" />
            <StatCard label="Rehearsals" value={stats.rehearsals || 0} color="#ec4899" bgColor="rgba(236,72,153,0.12)" />
            <StatCard label="Practice" value={`${Math.round((stats.hoursRehearsed || 0))}h`} color="#f97316" bgColor="rgba(249,115,22,0.12)" />
            <StatCard label="Songs" value={stats.songs || 0} color="#a855f7" bgColor="rgba(168,85,247,0.12)" />
            <StatCard label="Revenue" value={`$${(stats.revenue || 0).toLocaleString()}`} color="#eab308" bgColor="rgba(234,179,8,0.12)" />
          </ScrollView>
        )}

        {/* Tabs */}
        <View style={styles.tabRow}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${TAB_LABELS[tab]} tab`}
            >
              <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textSecondary }]}>
                {TAB_LABELS[tab]}
                {tab === 'band' ? ` (${bandEarnedCount}/${bandDefinitions.length})` : ''}
                {tab === 'my' ? ` (${myEarnedCount}/${memberDefinitions.length})` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab content */}
        <View style={styles.tabContent}>
          {activeTab === 'band' && (
            <AchievementGrid
              groups={bandGroups}
              earnedIds={bandEarnedIds}
              earnedMap={bandEarnedMap}
              accentColor="#eab308"
              accentBg="rgba(234,179,8,0.15)"
              colors={colors}
            />
          )}

          {activeTab === 'my' && (
            <AchievementGrid
              groups={myGroups}
              earnedIds={myEarnedIds}
              earnedMap={myEarnedMap}
              accentColor="#22c55e"
              accentBg="rgba(34,197,94,0.15)"
              colors={colors}
            />
          )}

          {activeTab === 'leaderboard' && (
            <LeaderboardView leaderboard={leaderboard} colors={colors} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AchievementGrid({ groups, earnedIds, earnedMap, accentColor, accentBg, colors }) {
  if (groups.length === 0) {
    return (
      <View style={styles.emptyCentered}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No achievements defined</Text>
      </View>
    );
  }

  return (
    <View>
      {groups.map(group => (
        <View key={group.category} style={styles.categorySection}>
          <Text style={[styles.categoryTitle, { color: colors.textSecondary }]} accessibilityRole="header">{group.label}</Text>
          <View style={styles.badgeGrid}>
            {group.items.map(def => {
              const earned = earnedIds.has(def.id);
              const earnedData = earnedMap[def.id];
              return (
                <View
                  key={def.id}
                  style={[
                    styles.badgeCard,
                    { backgroundColor: colors.bgSecondary },
                    earned && { borderColor: accentColor, borderWidth: 1 },
                    !earned && { opacity: 0.5 },
                  ]}
                >
                  <Text style={[styles.badgeIcon, !earned && styles.badgeIconDimmed]}>
                    {def.icon || '\uD83C\uDFC6'}
                  </Text>
                  <Text style={[styles.badgeName, { color: colors.textPrimary }]} numberOfLines={2}>
                    {def.name}
                  </Text>
                  <Text style={[styles.badgeDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                    {def.description}
                  </Text>
                  {earned && earnedData ? (
                    <Text style={[styles.badgeDate, { color: accentColor }]}>
                      {formatDate(earnedData.earnedAt)}
                    </Text>
                  ) : def.threshold ? (
                    <Text style={[styles.badgeThreshold, { color: colors.textSecondary }]}>
                      Goal: {def.threshold}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

function LeaderboardView({ leaderboard, colors }) {
  if (!leaderboard || leaderboard.length === 0) {
    return (
      <View style={styles.emptyCentered}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No achievements earned yet. Keep playing!
        </Text>
      </View>
    );
  }

  const medals = { 0: '\uD83E\uDD47', 1: '\uD83E\uDD48', 2: '\uD83E\uDD49' };

  return (
    <View>
      {leaderboard.map((entry, idx) => (
        <View
          key={entry.user?.id || idx}
          style={[styles.leaderboardRow, { backgroundColor: colors.bgSecondary }]}
        >
          <View style={styles.rankBadge}>
            {medals[idx] ? (
              <Text style={styles.medalText}>{medals[idx]}</Text>
            ) : (
              <Text style={[styles.rankNumber, { color: colors.textSecondary }]}>#{idx + 1}</Text>
            )}
          </View>
          <View style={[styles.leaderboardAvatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.leaderboardAvatarText}>
              {(entry.user?.displayName || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.leaderboardInfo}>
            <Text style={[styles.leaderboardName, { color: colors.textPrimary }]} numberOfLines={1}>
              {entry.user?.displayName || 'Unknown'}
            </Text>
            <View style={styles.recentIcons}>
              {(entry.achievements || []).slice(0, 5).map((a, i) => (
                <Text key={i} style={styles.recentIcon}>{a.icon || '\uD83C\uDFC6'}</Text>
              ))}
              {(entry.achievements || []).length > 5 && (
                <Text style={[styles.moreCount, { color: colors.textSecondary }]}>
                  +{entry.achievements.length - 5}
                </Text>
              )}
            </View>
          </View>
          <Text style={[styles.leaderboardCount, { color: colors.textPrimary }]}>
            {entry.achievementCount || 0}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyCentered: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15 },
  // Celebration banner
  celebrationBanner: {
    margin: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(234,179,8,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.3)',
  },
  celebrationTitle: { fontSize: 18, fontWeight: '700', color: '#eab308', marginBottom: 12, textAlign: 'center' },
  celebrationBadges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  celebrationBadge: { alignItems: 'center', width: 80 },
  celebrationIcon: { fontSize: 32 },
  celebrationName: { fontSize: 12, fontWeight: '600', color: '#eab308', textAlign: 'center', marginTop: 4 },
  dismissButton: { marginTop: 12, alignItems: 'center' },
  dismissText: { fontSize: 14, color: '#eab308', fontWeight: '600' },
  // Stats row
  statsRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  statCard: {
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    minWidth: 90,
  },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600', opacity: 0.8, marginTop: 2 },
  // Tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabText: { fontSize: 13, fontWeight: '600' },
  tabContent: { paddingHorizontal: 12, paddingBottom: 20 },
  // Achievement grid
  categorySection: { marginTop: 16 },
  categoryTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badgeCard: {
    width: '48%',
    flexGrow: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  badgeIcon: { fontSize: 32, marginBottom: 6 },
  badgeIconDimmed: { opacity: 0.4 },
  badgeName: { fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 2 },
  badgeDescription: { fontSize: 11, textAlign: 'center', lineHeight: 15 },
  badgeDate: { fontSize: 11, fontWeight: '600', marginTop: 6 },
  badgeThreshold: { fontSize: 11, marginTop: 6 },
  // Leaderboard
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    gap: 10,
  },
  rankBadge: { width: 32, alignItems: 'center' },
  medalText: { fontSize: 22 },
  rankNumber: { fontSize: 15, fontWeight: '700' },
  leaderboardAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leaderboardAvatarText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  leaderboardInfo: { flex: 1 },
  leaderboardName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  recentIcons: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  recentIcon: { fontSize: 14 },
  moreCount: { fontSize: 12, marginLeft: 4 },
  leaderboardCount: { fontSize: 24, fontWeight: '800' },
});
