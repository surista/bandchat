import { useState, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  Platform,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { selectionFeedback } from '../../utils/haptics';
import { SkeletonList } from '../../components/SkeletonLoader';
import ErrorState from '../../components/ErrorState';
import PressableRow from '../../components/PressableRow';
import { useLayout } from '../../hooks/useLayout';
import getInitial from '../../utils/getInitial';
import getCurrencySymbol from '../../utils/getCurrencySymbol';
import api from '../../services/api';

// Mirrors `getSetlistStats` from the web GigArchive: SONG-typed items only,
// plus playable duration. SET_BREAK and MC items are excluded from both counts.
function getSetlistStats(setlist) {
  if (!setlist?.songs) return { songCount: 0, totalDuration: 0 };
  let songCount = 0;
  let totalDuration = 0;
  for (const item of setlist.songs) {
    const isSong = item.type === 'SONG' || !item.type;
    if (isSong) {
      songCount++;
      totalDuration += item.song?.duration || 0;
    }
  }
  return { songCount, totalDuration };
}

function formatTotalDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Same name-parser as the web — matches "Venue - 21 May 2024" or trailing
// "21-May-2024" patterns so legacy setlists without explicit performedAt
// dates still slot into the timeline correctly.
function parseSetlistName(name) {
  if (!name) return { date: null, venue: null };
  const m1 = name.match(/^(.+?)\s*[-–]\s*(\d{1,2})[\s-]([A-Za-z]+)[\s-](\d{2,4})\s*$/);
  if (m1) {
    const date = new Date(`${m1[2]} ${m1[3]} ${m1[4]}`);
    if (!isNaN(date)) return { date, venue: m1[1].trim() };
  }
  return { date: null, venue: null };
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'past', label: 'Past' },
  { key: 'upcoming', label: 'Upcoming' },
];

export default function GigArchiveScreen({ navigation, route }) {
  const { workspaceId, workspaceName, currency, effectivePlan } = route.params || {};
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();

  const [setlists, setSetlists] = useState([]);
  const [gigs, setGigs] = useState([]);
  const [bandMembers, setBandMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Gig Archive' });
  }, [navigation]);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [setlistsData, gigsData, membersData] = await Promise.all([
        api.getSetlists(workspaceId),
        api.getGigs(workspaceId),
        api.getBandMembers(workspaceId).catch(() => []),
      ]);
      setSetlists(setlistsData || []);
      setGigs(gigsData || []);
      setBandMembers(membersData || []);
    } catch (err) {
      setError(err.message || 'Failed to load gig archive');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Build archive entries: setlists (auto-linked to matching gigs) + standalone
  // gigs. Mirrors the web GigArchive merging logic so users see the same
  // timeline on both platforms.
  const { archiveEntries, pastCount, upcomingCount } = useMemo(() => {
    const usedGigIds = new Set();

    const setlistEntries = setlists.map((setlist) => {
      const parsed = parseSetlistName(setlist.name);
      const setlistDate = setlist.performedAt ? new Date(setlist.performedAt) : parsed.date;
      const setlistVenue = setlist.venue || parsed.venue;

      // Direct link via setlistId
      let associatedGig = gigs.find(g =>
        g.type === 'GIG' && (
          g.setlistId === setlist.id ||
          (g.setlists && g.setlists.some(gs => gs.setlistId === setlist.id))
        )
      );

      // Fallback: match by date/venue
      if (!associatedGig && setlistDate) {
        const setlistDateStr = setlistDate.toDateString();
        associatedGig = gigs.find(g => {
          if (g.type !== 'GIG' || usedGigIds.has(g.id)) return false;
          const gigDateStr = new Date(g.date).toDateString();
          if (gigDateStr !== setlistDateStr) return false;
          const venueMatch = g.venue && setlistVenue &&
            g.venue.toLowerCase().includes(setlistVenue.toLowerCase());
          const titleMatch = g.title && setlist.name &&
            (g.title.toLowerCase().includes(setlist.name.toLowerCase()) ||
              setlist.name.toLowerCase().includes(g.title.toLowerCase()));
          return venueMatch || titleMatch;
        });
      }

      if (associatedGig) usedGigIds.add(associatedGig.id);

      return {
        id: `setlist-${setlist.id}`,
        setlist,
        gig: associatedGig,
        title: setlist.name,
        venue: setlistVenue || associatedGig?.venue,
        date: associatedGig ? new Date(associatedGig.date) : setlistDate,
        hasFormalGig: !!associatedGig,
      };
    }).filter(e => e.date || e.hasFormalGig);

    const standaloneGigs = gigs
      .filter(g => g.type === 'GIG' && !usedGigIds.has(g.id))
      .map(gig => ({
        id: `gig-${gig.id}`,
        setlist: null,
        gig,
        title: gig.title,
        venue: gig.venue,
        date: new Date(gig.date),
        hasFormalGig: true,
      }));

    const all = [...setlistEntries, ...standaloneGigs].sort((a, b) => {
      if (a.date && b.date) return b.date - a.date;
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });

    const now = new Date();
    let past = 0;
    let upcoming = 0;
    for (const e of all) {
      if (!e.date) continue;
      if (e.date < now) past++; else upcoming++;
    }
    return { archiveEntries: all, pastCount: past, upcomingCount: upcoming };
  }, [setlists, gigs]);

  const filteredEntries = useMemo(() => {
    const now = new Date();
    return archiveEntries.filter(e => {
      if (filter === 'past') return e.date && e.date < now;
      if (filter === 'upcoming') return e.date && e.date >= now;
      return true;
    });
  }, [archiveEntries, filter]);

  const handleEntryPress = useCallback((entry) => {
    selectionFeedback();
    if (entry.hasFormalGig && entry.gig) {
      navigation.navigate('GigDetail', { gigId: entry.gig.id, workspaceId });
    } else if (entry.setlist) {
      navigation.navigate('SetlistDetail', { setlistId: entry.setlist.id, workspaceId, workspaceName });
    }
  }, [navigation, workspaceId, workspaceName]);

  const handleMediaPress = useCallback((entry) => {
    if (entry.gig) {
      selectionFeedback();
      navigation.navigate('GigGallery', { gigId: entry.gig.id, workspaceId, gigTitle: entry.gig.title });
    }
  }, [navigation, workspaceId]);

  const renderCard = useCallback(({ item: entry }) => {
    const { setlist, gig, title, date, hasFormalGig } = entry;
    const { songCount, totalDuration } = getSetlistStats(setlist);
    const songs = setlist?.songs?.filter(s => s.type === 'SONG' || !s.type) || [];
    const displaySongs = songs.slice(0, 3);
    const remainingSongs = songs.length - 3;
    const performers = setlist?.performers?.slice(0, 5) || [];
    const performerOverflow = (setlist?.performers?.length || 0) - performers.length;
    const media = gig?.media || [];
    const displayMedia = media.slice(0, 4);
    const mediaOverflow = media.length - displayMedia.length;

    return (
      <PressableRow
        onPress={() => handleEntryPress(entry)}
        style={[styles.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
        accessibilityRole="button"
        accessibilityLabel={`${title}${date ? ', ' + format(date, 'd MMM yyyy') : ''}`}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={[styles.cardTitle, { color: colors.textPrimary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.6}
            >
              {title}
            </Text>
            {date && (
              <Text
                style={[styles.cardDate, { color: colors.textMuted || colors.textSecondary }]}
                maxFontSizeMultiplier={1.4}
              >
                {format(date, 'dd-MMM-yyyy')}
              </Text>
            )}
          </View>
          {media.length > 0 && (
            <View style={styles.mediaBadge}>
              <Ionicons name="images-outline" size={14} color="#60a5fa" />
              <Text style={styles.mediaBadgeText} maxFontSizeMultiplier={1.2}>{media.length}</Text>
            </View>
          )}
        </View>

        {/* Stats badges */}
        {(songCount > 0 || totalDuration > 0 || Number(gig?.pay) > 0) && (
          <View style={styles.badgesRow}>
            {songCount > 0 && (
              <View style={[styles.badge, { backgroundColor: 'rgba(34,197,94,0.15)' }]}>
                <Text style={[styles.badgeText, { color: '#4ade80' }]} maxFontSizeMultiplier={1.2}>
                  {songCount} songs
                </Text>
              </View>
            )}
            {totalDuration > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.bgTertiary }]}>
                <Text style={[styles.badgeText, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.2}>
                  {formatTotalDuration(totalDuration)}
                </Text>
              </View>
            )}
            {Number(gig?.pay) > 0 && (
              <View style={[styles.badge, { backgroundColor: 'rgba(234,179,8,0.15)' }]}>
                <Text style={[styles.badgeText, { color: '#fbbf24' }]} maxFontSizeMultiplier={1.2}>
                  {getCurrencySymbol(currency)}{Number(gig.pay).toLocaleString()}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Performer avatars */}
        {performers.length > 0 && (
          <View style={styles.performersRow}>
            {performers.map((member, idx) => (
              <View
                key={member.id}
                style={[
                  styles.avatar,
                  { backgroundColor: colors.bgTertiary, borderColor: colors.bgSecondary, marginLeft: idx === 0 ? 0 : -8 },
                ]}
              >
                {member.imageUrl ? (
                  <Image source={{ uri: member.imageUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={[styles.avatarInitial, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.2}>
                    {getInitial(member.name)}
                  </Text>
                )}
              </View>
            ))}
            {performerOverflow > 0 && (
              <View style={[
                styles.avatar,
                { backgroundColor: colors.bgTertiary, borderColor: colors.bgSecondary, marginLeft: -8 },
              ]}>
                <Text style={[styles.avatarInitial, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.2}>
                  +{performerOverflow}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Song preview */}
        {displaySongs.length > 0 && (
          <View style={styles.songList}>
            {displaySongs.map((item, idx) => (
              <Text
                key={item.id || idx}
                style={[styles.songItem, { color: colors.textSecondary }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.5}
              >
                {idx + 1}. {item.song?.title || item.label || 'Unknown'}
              </Text>
            ))}
            {remainingSongs > 0 && (
              <Text
                style={[styles.songItemMore, { color: colors.textMuted || colors.textSecondary }]}
                maxFontSizeMultiplier={1.3}
              >
                +{remainingSongs} more...
              </Text>
            )}
          </View>
        )}

        {/* Media thumbnails */}
        {displayMedia.length > 0 && (
          <PressableRow
            onPress={() => handleMediaPress(entry)}
            style={[styles.mediaRow, { borderTopColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Open gig gallery, ${media.length} item${media.length === 1 ? '' : 's'}`}
          >
            {displayMedia.map((m) => (
              <View key={m.id} style={[styles.mediaThumb, { backgroundColor: colors.bgTertiary }]}>
                {m.type === 'image' && m.url ? (
                  <Image source={{ uri: m.url }} style={styles.mediaThumbImage} contentFit="cover" />
                ) : m.type === 'youtube' ? (
                  <View style={styles.ytBadge}>
                    <Ionicons name="logo-youtube" size={16} color="#ef4444" />
                  </View>
                ) : m.type === 'video' ? (
                  <Ionicons name="play-circle-outline" size={20} color="#60a5fa" />
                ) : m.type === 'audio' ? (
                  <Ionicons name="musical-notes-outline" size={18} color={colors.textSecondary} />
                ) : (
                  <Ionicons name="link-outline" size={18} color={colors.textSecondary} />
                )}
              </View>
            ))}
            {mediaOverflow > 0 && (
              <View style={[styles.mediaThumb, { backgroundColor: colors.bgTertiary }]}>
                <Text style={[styles.mediaThumbMore, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.2}>
                  +{mediaOverflow}
                </Text>
              </View>
            )}
          </PressableRow>
        )}
      </PressableRow>
    );
  }, [colors, currency, handleEntryPress, handleMediaPress]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <View style={styles.skeletonContent}>
          <SkeletonList count={5} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <ErrorState
          iconName="images-outline"
          title="Couldn't load gig archive"
          message={error}
          onRetry={loadData}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      {/* Filter tabs */}
      <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
        {FILTERS.map(({ key, label }) => {
          const count = key === 'past' ? pastCount
            : key === 'upcoming' ? upcomingCount
            : archiveEntries.length;
          const active = filter === key;
          return (
            <PressableRow
              key={key}
              onPress={() => setFilter(key)}
              style={[
                styles.filterTab,
                {
                  backgroundColor: active ? colors.primary : colors.bgTertiary,
                },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label}, ${count}`}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: active ? '#ffffff' : colors.textSecondary },
                ]}
                maxFontSizeMultiplier={1.4}
              >
                {label} ({count})
              </Text>
            </PressableRow>
          );
        })}
      </View>

      {filteredEntries.length === 0 ? (
        <View style={styles.emptyContent}>
          <Ionicons name="images-outline" size={56} color={colors.textMuted || colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.5}>
            {archiveEntries.length === 0 ? 'No gigs yet' : `No ${filter} gigs`}
          </Text>
          <Text style={[styles.emptyHint, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
            {archiveEntries.length === 0
              ? 'Schedule gigs in Calendar or create dated setlists to see them here.'
              : 'Try a different filter.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={item => item.id}
          renderItem={renderCard}
          contentContainerStyle={[
            styles.listContent,
            isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          contentInsetAdjustmentBehavior="automatic"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skeletonContent: { padding: 16 },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  filterText: { fontSize: 13, fontWeight: '600' },
  listContent: { padding: 16, paddingBottom: 32 },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardDate: { fontSize: 13, marginTop: 2 },
  mediaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(96,165,250,0.15)',
  },
  mediaBadgeText: { color: '#60a5fa', fontSize: 12, fontWeight: '600' },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  performersRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 11, fontWeight: '600' },
  songList: { marginTop: 2 },
  songItem: { fontSize: 13, lineHeight: 18 },
  songItemMore: { fontSize: 12, marginTop: 4 },
  mediaRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  mediaThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mediaThumbImage: { width: '100%', height: '100%' },
  ytBadge: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  mediaThumbMore: { fontSize: 12, fontWeight: '600' },
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  emptyHint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
