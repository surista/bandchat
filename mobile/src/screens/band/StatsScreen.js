import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../context/ThemeContext';
import ErrorState from '../../components/ErrorState';
import api from '../../services/api';
import { formatTotalDuration } from '../../utils/formatDuration';
import { useLayout } from '../../hooks/useLayout';
import getCurrencySymbol from '../../utils/getCurrencySymbol';

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  try {
    return format(parseISO(dateStr), 'dd-MMM-yyyy');
  } catch {
    return dateStr;
  }
}

function StatBox({ label, value, color, bgColor, onPress }) {
  const content = (
    <View style={[styles.statBox, { backgroundColor: bgColor }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
    </View>
  );
  if (onPress) {
    return <TouchableOpacity style={styles.statBoxWrapper} onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>{content}</TouchableOpacity>;
  }
  return <View style={styles.statBoxWrapper} accessibilityLabel={`${label}: ${value}`}>{content}</View>;
}

const MEDAL_COLORS = { 1: '#ffd700', 2: '#c0c0c0', 3: '#cd7f32' };

function RankedItem({ rank, title, subtitle, colors }) {
  const medalColor = MEDAL_COLORS[rank];
  return (
    <View style={[styles.rankedItem, { backgroundColor: colors.bgSecondary }]} accessibilityLabel={`Number ${rank}: ${title}${subtitle ? `, ${subtitle}` : ''}`}>
      <View style={styles.rankBadge}>
        {medalColor ? (
          <Ionicons name="trophy" size={20} color={medalColor} />
        ) : (
          <Text style={[styles.rankNumber, { color: colors.textSecondary }]}>{rank}</Text>
        )}
      </View>
      <View style={styles.rankedInfo}>
        <Text style={[styles.rankedTitle, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.rankedSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function FunFactCard({ label, value, detail, colors }) {
  return (
    <View style={[styles.funFactCard, { backgroundColor: colors.bgSecondary }]} accessibilityLabel={`${label}: ${value}${detail ? `, ${detail}` : ''}`}>
      <Text style={[styles.funFactLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.funFactValue, { color: colors.textPrimary }]}>{value}</Text>
      {detail ? <Text style={[styles.funFactDetail, { color: colors.textSecondary }]}>{detail}</Text> : null}
    </View>
  );
}

export default function StatsScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  const loadStats = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await api.getGigStats(workspaceId);
      setStats(data);
    } catch (err) {
      setLoadError('Could not load stats');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loadingRef.current) loadStats();
    });
    return unsubscribe;
  }, [navigation, loadStats]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadStats();
  }, [loadStats]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError && !stats) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <ErrorState
          iconName="stats-chart-outline"
          title="Couldn't load stats"
          message={loadError}
          onRetry={() => { setLoadError(null); loadStats(); }}
        />
      </SafeAreaView>
    );
  }

  if (!stats) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No stats available</Text>
        </View>
      </SafeAreaView>
    );
  }

  const stageTime = stats.totalTimeGigged
    ? `${stats.totalTimeGigged.hours}h ${stats.totalTimeGigged.minutes}m`
    : '0h';

  const careerSpan = (stats.firstGig && stats.lastGig)
    ? `${formatDateShort(stats.firstGig)} \u2013 ${formatDateShort(stats.lastGig)}`
    : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Primary Stats */}
        <View style={styles.statsGrid}>
          <StatBox label="Gigs Played" value={stats.totalGigs || 0} color="#22c55e" bgColor="rgba(34,197,94,0.12)" />
          <StatBox label="Stage Time" value={stageTime} color="#3b82f6" bgColor="rgba(59,130,246,0.12)" />
          <StatBox label="Unique Songs" value={stats.uniqueSongsPlayed || 0} color="#a855f7" bgColor="rgba(168,85,247,0.12)" />
          <StatBox label="Revenue" value={`${getCurrencySymbol(stats.currency)}${(stats.totalRevenue || 0).toLocaleString()}`} color="#eab308" bgColor="rgba(234,179,8,0.12)" />
        </View>

        {/* Secondary Stats */}
        <View style={styles.statsGrid}>
          <StatBox label="Avg Songs/Gig" value={stats.averageSongsPerGig || 0} color="#06b6d4" bgColor="rgba(6,182,212,0.12)" />
          <StatBox label="Rehearsals" value={stats.totalRehearsals || 0} color="#ec4899" bgColor="rgba(236,72,153,0.12)" />
          <StatBox label="Upcoming" value={stats.upcomingGigs || 0} color="#f97316" bgColor="rgba(249,115,22,0.12)" />
          <StatBox label="Never Played" value={stats.songsNeverPlayed || 0} color="#ef4444" bgColor="rgba(239,68,68,0.12)" />
        </View>

        {/* Fun Stats */}
        {stats.busiestStretch && (
          <FunFactCard
            label="Busiest Stretch"
            value={`${stats.busiestStretch.gigs} gigs in ${stats.busiestStretch.days} days`}
            detail={`${formatDateShort(stats.busiestStretch.startDate)} \u2013 ${formatDateShort(stats.busiestStretch.endDate)}`}
            colors={colors}
          />
        )}

        {stats.longestSetlist && (
          <FunFactCard
            label="Longest Setlist"
            value={stats.longestSetlist.name}
            detail={`${stats.longestSetlist.songCount} songs`}
            colors={colors}
          />
        )}

        {careerSpan && (
          <FunFactCard
            label="Career Span"
            value={careerSpan}
            colors={colors}
          />
        )}

        {/* Most Played Songs */}
        {stats.mostPlayedSongs?.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} accessibilityRole="header">Most Played Songs</Text>
            {stats.mostPlayedSongs.slice(0, 10).map((song, i) => (
              <RankedItem
                key={song.id}
                rank={i + 1}
                title={song.title}
                subtitle={`${song.playCount} plays${song.artist ? ` \u00B7 ${song.artist}` : ''}${song.totalTime ? ` \u00B7 ${formatTotalDuration(song.totalTime)}` : ''}`}
                colors={colors}
              />
            ))}
          </View>
        )}

        {/* Top Venues */}
        {stats.topVenues?.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} accessibilityRole="header">Top Venues</Text>
            {stats.topVenues.slice(0, 8).map((venue, i) => (
              <RankedItem
                key={venue.venue}
                rank={i + 1}
                title={venue.venue}
                subtitle={`${venue.count} ${venue.count === 1 ? 'time' : 'times'}`}
                colors={colors}
              />
            ))}
          </View>
        )}

        {/* Fun Facts */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} accessibilityRole="header">Fun Facts</Text>

          {stats.mostTimeSong && (
            <FunFactCard
              label="Most Time on One Song"
              value={stats.mostTimeSong.title}
              detail={`${formatTotalDuration(stats.mostTimeSong.totalTime)} total (${stats.mostTimeSong.playCount} plays)`}
              colors={colors}
            />
          )}

          {stats.mostPlayedArtist && (
            <FunFactCard
              label="Most Played Artist"
              value={stats.mostPlayedArtist.name}
              detail={`${stats.mostPlayedArtist.playCount} plays`}
              colors={colors}
            />
          )}

          {stats.longestGap && (
            <FunFactCard
              label="Longest Break"
              value={`${stats.longestGap.days} days`}
              detail={`${formatDateShort(stats.longestGap.startDate)} \u2013 ${formatDateShort(stats.longestGap.endDate)}`}
              colors={colors}
            />
          )}

          {stats.daysSinceLastGig != null && (
            <FunFactCard
              label="Days Since Last Gig"
              value={`${stats.daysSinceLastGig}`}
              colors={colors}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 15 },
  scrollContent: { padding: 12, paddingBottom: 30 },
  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  statBoxWrapper: { width: '48%', flexGrow: 1 },
  statBox: {
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '700', marginBottom: 2 },
  statLabel: { fontSize: 12, fontWeight: '600', opacity: 0.8 },
  // Sections
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  // Ranked items
  rankedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
  },
  rankBadge: {
    width: 32,
    alignItems: 'center',
    marginRight: 10,
  },
  rankNumber: { fontSize: 15, fontWeight: '700' },
  rankedInfo: { flex: 1 },
  rankedTitle: { fontSize: 15, fontWeight: '600' },
  rankedSubtitle: { fontSize: 13, marginTop: 1 },
  // Fun fact cards
  funFactCard: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  funFactLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  funFactValue: { fontSize: 16, fontWeight: '700' },
  funFactDetail: { fontSize: 13, marginTop: 2 },
});
