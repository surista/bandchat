import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import ErrorState from '../../components/ErrorState';
import { SkeletonList } from '../../components/SkeletonLoader';
import api from '../../services/api';
import { useLayout } from '../../hooks/useLayout';
import PressableRow from '../../components/PressableRow';

export default function VenuesScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();
  const { socket } = useSocket();
  const { isTablet, contentMaxWidth } = useLayout();

  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  const hasDataRef = useRef(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('VenueDetail', { workspaceId, isNew: true })}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Add venue"
          accessibilityHint="Create a new venue"
        >
          <Ionicons name="add" size={28} color={colors.primary} />
        </TouchableOpacity>
      ),
      ...(Platform.OS === 'ios' ? {
        headerSearchBarOptions: {
          placeholder: 'Search venues',
          hideWhenScrolling: false,
          onChangeText: (e) => setSearch(e.nativeEvent.text),
          onCancelButtonPress: () => setSearch(''),
        },
      } : {}),
    });
  }, [navigation, colors.primary, workspaceId]);

  const loadVenues = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getVenues(workspaceId);
      setVenues(data);
      hasDataRef.current = data.length > 0;
    } catch (err) {
      // hasDataRef (not `venues`) so a transient refresh failure after data
      // is already showing doesn't wipe the populated list with a full-page
      // error — this file has no re-check against already-rendered data.
      if (!hasDataRef.current) setError(err.message || 'Failed to load venues');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadVenues();
  }, [loadVenues]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loadingRef.current) loadVenues();
    });
    return unsubscribe;
  }, [navigation, loadVenues]);

  // Real-time venue updates via Socket.IO
  useEffect(() => {
    if (!socket) return;
    const handleCreated = (venue) => {
      if (venue.workspaceId === workspaceId) {
        setVenues(prev => prev.some(v => v.id === venue.id) ? prev : [...prev, venue]);
      }
    };
    const handleUpdated = (venue) => {
      setVenues(prev => prev.map(v => v.id === venue.id ? venue : v));
    };
    const handleDeleted = ({ venueId }) => {
      setVenues(prev => prev.filter(v => v.id !== venueId));
    };
    socket.on('venue:created', handleCreated);
    socket.on('venue:updated', handleUpdated);
    socket.on('venue:deleted', handleDeleted);
    return () => {
      socket.off('venue:created', handleCreated);
      socket.off('venue:updated', handleUpdated);
      socket.off('venue:deleted', handleDeleted);
    };
  }, [socket, workspaceId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadVenues();
  }, [loadVenues]);

  const filtered = search.trim()
    ? venues.filter(v =>
        v.name.toLowerCase().includes(search.toLowerCase()) ||
        (v.city && v.city.toLowerCase().includes(search.toLowerCase()))
      )
    : venues;

  const renderVenue = useCallback(({ item }) => {
    const gigCount = item._count?.gigs || 0;

    return (
      <PressableRow
        style={[styles.venueCard, { backgroundColor: colors.bgSecondary }]}
        onPress={() => navigation.navigate('VenueDetail', { venueId: item.id, workspaceId })}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}${item.city ? `, ${item.city}` : ''}`}
        accessibilityHint="View venue details"
      >
        <View style={styles.venueHeader}>
          <Ionicons name="location" size={20} color={colors.primary} style={styles.venueIcon} />
          <View style={styles.venueInfo}>
            <Text style={[styles.venueName, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.city && (
              <Text style={[styles.venueCity, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.city}
              </Text>
            )}
          </View>
          <View style={styles.venueRight}>
            {item.capacity ? (
              <View style={[styles.capacityBadge, { backgroundColor: colors.bgTertiary }]}>
                <Ionicons name="people-outline" size={12} color={colors.textSecondary} />
                <Text style={[styles.capacityText, { color: colors.textSecondary }]}>
                  {item.capacity.toLocaleString()}
                </Text>
              </View>
            ) : null}
            {gigCount > 0 && (
              <Text style={[styles.gigCount, { color: colors.textSecondary }]}>
                {gigCount} gig{gigCount !== 1 ? 's' : ''}
              </Text>
            )}
          </View>
        </View>
        {item.address && (
          <View style={styles.addressRow}>
            <Ionicons name="navigate-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.addressText, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.address}
            </Text>
          </View>
        )}
      </PressableRow>
    );
  }, [colors, navigation, workspaceId]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <SkeletonList count={5} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <ErrorState
          iconName="location-outline"
          iconSize={48}
          title="Couldn't load venues"
          message={error}
          onRetry={() => { setLoading(true); loadVenues(); }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      {/* Search bar (Android only — iOS uses native headerSearchBarOptions) */}
      {Platform.OS !== 'ios' && venues.length > 0 && (
        <View style={[styles.searchContainer, { borderBottomColor: colors.border }]}>
          <View style={[styles.searchBar, { backgroundColor: colors.bgTertiary }]}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              value={search}
              onChangeText={setSearch}
              placeholder="Search venues..."
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search venues"
            />
            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch('')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderVenue}
        contentContainerStyle={[styles.listContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
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
            <Ionicons name="location-outline" size={48} color={colors.textSecondary} style={styles.emptyIcon} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {search.trim() ? 'No matching venues' : 'No venues yet'}
            </Text>
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
              {search.trim()
                ? 'Try a different search term.'
                : 'Keep track of your favorite gig venues. Tap + to add one.'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  emptyHint: { fontSize: 13, textAlign: 'center', opacity: 0.7, maxWidth: 280 },
  // Search
  searchContainer: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 12, height: 40, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  // List
  listContent: { paddingHorizontal: 12, paddingBottom: 20, paddingTop: 4 },
  // Venue card
  venueCard: {
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
  },
  venueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  venueIcon: { marginRight: 10 },
  venueInfo: { flex: 1 },
  venueName: { fontSize: 16, fontWeight: '700' },
  venueCity: { fontSize: 13, marginTop: 1 },
  venueRight: { alignItems: 'flex-end', gap: 4 },
  capacityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  capacityText: { fontSize: 12, fontWeight: '600' },
  gigCount: { fontSize: 11, fontWeight: '500' },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginLeft: 30,
    gap: 6,
  },
  addressText: { fontSize: 13, flex: 1 },
});
