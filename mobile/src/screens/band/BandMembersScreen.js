import { useState, useEffect, useCallback, useMemo, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  SectionList,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import useDebounce from '../../hooks/useDebounce';
import { Ionicons } from '@expo/vector-icons';
import ErrorState from '../../components/ErrorState';
import PressableRow from '../../components/PressableRow';
import { SkeletonList } from '../../components/SkeletonLoader';
import getInitial from '../../utils/getInitial';
import api from '../../services/api';
import { useLayout } from '../../hooks/useLayout';

const INSTRUMENT_OPTIONS = [
  'Guitar', 'Bass', 'Drums', 'Vocals', 'Keys',
  'Saxophone', 'Trumpet', 'Violin', 'Cello', 'Harmonica',
  'Percussion', 'DJ', 'Other',
];

const INSTRUMENT_COLORS = {
  Guitar: '#3b82f6',
  Bass: '#ef4444',
  Drums: '#f97316',
  Vocals: '#a855f7',
  Keys: '#22c55e',
  Saxophone: '#eab308',
  Trumpet: '#ec4899',
  Violin: '#06b6d4',
  Cello: '#8b5cf6',
  Harmonica: '#14b8a6',
  Percussion: '#f59e0b',
  DJ: '#6366f1',
  Other: '#6b7280',
};

function getInstruments(member) {
  if (member.stints?.length > 0) {
    const latest = member.stints[member.stints.length - 1];
    return latest.instruments || [];
  }
  return [];
}

function getDateRange(member) {
  if (member.isGuest) return 'Guest';
  if (member.stints?.length > 0) {
    const first = member.stints[0];
    const last = member.stints[member.stints.length - 1];
    const start = first.startDate ? format(parseISO(first.startDate), 'yyyy') : '?';
    const end = last.endDate ? format(parseISO(last.endDate), 'yyyy') : 'present';
    return `${start}\u2013${end}`;
  }
  return '';
}

export default function BandMembersScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();
  const { user } = useAuth();

  const [members, setMembers] = useState({ current: [], former: [], guests: [] });
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('all');
  const debouncedSearch = useDebounce(search, 300);

  const SEGMENTS = [
    { key: 'all', label: 'All' },
    { key: 'current', label: 'Current' },
    { key: 'former', label: 'Former' },
    { key: 'guests', label: 'Guests' },
  ];

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [name, setName] = useState('');
  const [selectedInstruments, setSelectedInstruments] = useState([]);
  const [isGuest, setIsGuest] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Action sheet
  const [selectedMember, setSelectedMember] = useState(null);
  const [showActions, setShowActions] = useState(false);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => isAdmin ? (
        <TouchableOpacity
          onPress={() => openCreateModal()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Add member"
        >
          <Ionicons name="add" size={28} color={colors.primary} />
        </TouchableOpacity>
      ) : null,
      ...(Platform.OS === 'ios' ? {
        headerSearchBarOptions: {
          placeholder: 'Search members',
          hideWhenScrolling: false,
          onChangeText: (e) => setSearch(e.nativeEvent.text),
          onCancelButtonPress: () => setSearch(''),
        },
      } : {}),
    });
  }, [navigation, colors.primary, isAdmin]);

  const loadMembers = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getBandMembers(workspaceId);
      setMembers(data);
    } catch (err) {
      if (!members.current?.length && !members.former?.length && !members.guests?.length) {
        setError(err.message || 'Failed to load members');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // Check if current user is workspace admin
  useEffect(() => {
    api.getWorkspace(workspaceId).then(ws => {
      const membership = ws.members?.find(m => m.userId === user?.id);
      setIsAdmin(membership?.role === 'ADMIN');
    }).catch(() => {});
  }, [workspaceId, user?.id]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loadingRef.current) loadMembers();
    });
    return unsubscribe;
  }, [navigation, loadMembers]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadMembers();
  }, [loadMembers]);

  const openCreateModal = useCallback(() => {
    setEditingMember(null);
    setName('');
    setSelectedInstruments([]);
    setIsGuest(false);
    setNotes('');
    setShowModal(true);
  }, []);

  const openEditModal = useCallback((member) => {
    setEditingMember(member);
    setName(member.name || '');
    setSelectedInstruments(getInstruments(member));
    setIsGuest(member.isGuest || false);
    setNotes(member.notes || '');
    setShowModal(true);
    setShowActions(false);
    setSelectedMember(null);
  }, []);

  const toggleInstrument = useCallback((inst) => {
    setSelectedInstruments(prev =>
      prev.includes(inst) ? prev.filter(i => i !== inst) : [...prev, inst]
    );
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Required', 'Name is required');
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: trimmed,
        instruments: selectedInstruments,
        isGuest,
        notes: notes.trim() || null,
      };
      if (editingMember) {
        await api.updateBandMember(editingMember.id, data);
      } else {
        await api.createBandMember(workspaceId, data);
      }
      setShowModal(false);
      loadMembers();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save member');
    } finally {
      setSaving(false);
    }
  }, [name, selectedInstruments, isGuest, notes, editingMember, workspaceId, loadMembers]);

  const handleDelete = useCallback(() => {
    if (!selectedMember) return;
    Alert.alert('Delete Member', `Remove "${selectedMember.name}" from the roster?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteBandMember(selectedMember.id);
            loadMembers();
          } catch (err) {
            Alert.alert('Error', 'Failed to delete member');
          }
          setShowActions(false);
          setSelectedMember(null);
        },
      },
    ]);
  }, [selectedMember, loadMembers]);

  const sections = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const filterFn = (m) => !q || m.name?.toLowerCase().includes(q);

    const filteredCurrent = (members.current || []).filter(filterFn);
    const filteredFormer = (members.former || []).filter(filterFn);
    const filteredGuests = (members.guests || []).filter(filterFn);

    // Apply segment filter
    const showCurrent = segment === 'all' || segment === 'current';
    const showFormer = segment === 'all' || segment === 'former';
    const showGuests = segment === 'all' || segment === 'guests';

    const result = [];
    if (showCurrent && filteredCurrent.length > 0) {
      result.push({ title: 'Current Members', data: filteredCurrent });
    }
    if (showFormer && filteredFormer.length > 0) {
      result.push({ title: 'Former Members', data: filteredFormer });
    }
    if (showGuests && filteredGuests.length > 0) {
      result.push({ title: 'Guest Musicians', data: filteredGuests });
    }
    return result;
  }, [members, debouncedSearch, segment]);

  const handleMemberPress = useCallback((item) => {
    if (item.linkedUserId) {
      navigation.navigate('MemberProfile', {
        workspaceId,
        userId: item.linkedUserId,
        displayName: item.name,
      });
    }
  }, [navigation, workspaceId]);

  const renderMember = useCallback(({ item }) => {
    const instruments = getInstruments(item);
    const dateRange = getDateRange(item);
    return (
      <PressableRow
        style={[styles.memberCard, { backgroundColor: colors.bgSecondary }]}
        onPress={() => handleMemberPress(item)}
        onLongPress={isAdmin ? () => { setSelectedMember(item); setShowActions(true); } : undefined}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}${item.linkedUserId ? '. Tap to view profile' : ''}${isAdmin ? '. Long press for options' : ''}`}
      >
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          {(item.imageUrl || item.linkedUser?.avatarUrl) ? (
            <Image source={{ uri: item.imageUrl || item.linkedUser.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{getInitial(item.name)}</Text>
          )}
        </View>
        <View style={styles.memberInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.memberName, { color: item.linkedUserId ? colors.primary : colors.textPrimary }]}>{item.name}</Text>
            {item.linkedUserId && <Ionicons name="link-outline" size={14} color={colors.primary} />}
          </View>
          {dateRange ? (
            <Text style={[styles.memberDate, { color: colors.textSecondary }]}>{dateRange}</Text>
          ) : null}
          {instruments.length > 0 && (
            <View style={styles.instrumentRow}>
              {instruments.map(inst => (
                <View key={inst} style={[styles.instrumentBadge, { backgroundColor: (INSTRUMENT_COLORS[inst] || '#6b7280') + '20' }]}>
                  <Text style={[styles.instrumentText, { color: INSTRUMENT_COLORS[inst] || '#6b7280' }]}>{inst}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </PressableRow>
    );
  }, [colors, handleMemberPress, isAdmin]);

  const renderSectionHeader = useCallback(({ section }) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]} accessibilityRole="header">{section.title}</Text>
    </View>
  ), [colors]);

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
          iconName="people-outline"
          title="Couldn't load members"
          message={error}
          onRetry={() => { setLoading(true); loadMembers(); }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      {Platform.OS !== 'ios' && (
        <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search members..."
            placeholderTextColor={colors.textSecondary}
            autoCorrect={false}
            accessibilityLabel="Search members"
          />
        </View>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.segmentRow}
        style={styles.segmentScroll}
      >
        {SEGMENTS.map(seg => (
          <TouchableOpacity
            key={seg.key}
            style={[styles.segmentChip, { backgroundColor: segment === seg.key ? colors.primary : colors.bgTertiary }]}
            onPress={() => setSegment(seg.key)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${seg.label}${segment === seg.key ? ', selected' : ''}`}
          >
            <Text style={[styles.segmentChipText, { color: segment === seg.key ? colors.primaryText : colors.textSecondary }]}>
              {seg.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
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
            <Ionicons name="people-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{search ? 'No matching members' : 'No members yet'}</Text>
            {!search && (
              <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                {isAdmin
                  ? 'Build your band roster. Tap + to add current, former, or guest musicians.'
                  : 'Your band roster will appear here once an admin adds members.'}
              </Text>
            )}
          </View>
        }
      />

      {/* Create/Edit Modal */}
      <Modal visible={showModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {editingMember ? 'Edit Member' : 'Add Member'}
              </Text>

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Name *</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={name}
                onChangeText={setName}
                placeholder="Member name"
                placeholderTextColor={colors.textSecondary}
                autoFocus
                accessibilityLabel="Member name"
              />

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Instruments</Text>
              <View style={styles.instrumentPicker}>
                {INSTRUMENT_OPTIONS.map(inst => {
                  const active = selectedInstruments.includes(inst);
                  const instColor = INSTRUMENT_COLORS[inst] || '#6b7280';
                  return (
                    <TouchableOpacity
                      key={inst}
                      style={[
                        styles.instrumentChip,
                        { backgroundColor: active ? instColor + '30' : colors.bgTertiary, borderColor: active ? instColor : 'transparent', borderWidth: 1 },
                      ]}
                      onPress={() => toggleInstrument(inst)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`${inst}${active ? ', selected' : ''}`}
                    >
                      <Text style={[styles.instrumentChipText, { color: active ? instColor : colors.textSecondary }]}>{inst}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <PressableRow
                style={styles.checkboxRow}
                onPress={() => setIsGuest(prev => !prev)}
                accessibilityRole="button"
                accessibilityLabel={`Guest musician, ${isGuest ? 'checked' : 'unchecked'}`}
              >
                <View style={[styles.checkbox, { borderColor: colors.border }, isGuest && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  {isGuest && <Text style={[styles.checkmark, { color: colors.primaryText }]}>{'\u2713'}</Text>}
                </View>
                <Text style={[styles.checkboxLabel, { color: colors.textPrimary }]}>Guest musician</Text>
              </PressableRow>

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Notes</Text>
              <TextInput
                style={[styles.modalInput, styles.notesInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional notes"
                placeholderTextColor={colors.textSecondary}
                multiline
                accessibilityLabel="Notes"
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => setShowModal(false)}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                disabled={saving || !name.trim()}
                accessibilityRole="button"
                accessibilityLabel={editingMember ? 'Save member' : 'Add member'}
              >
                {saving ? (
                  <ActivityIndicator color={colors.primaryText} size="small" />
                ) : (
                  <Text style={[styles.modalButtonTextWhite, { color: colors.primaryText }]}>{editingMember ? 'Save' : 'Add'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Action Sheet */}
      <Modal visible={showActions} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowActions(false)}>
        <TouchableOpacity
          style={styles.actionOverlay}
          activeOpacity={1}
          onPress={() => { setShowActions(false); setSelectedMember(null); }}
          accessibilityRole="button"
          accessibilityLabel="Close action sheet"
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.actionHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {selectedMember?.name}
            </Text>
            {isAdmin && (
              <>
                <PressableRow style={styles.actionItem} onPress={() => openEditModal(selectedMember)} accessibilityRole="button" accessibilityLabel="Edit member">
                  <Text style={[styles.actionText, { color: colors.textPrimary }]}>Edit</Text>
                </PressableRow>
                <PressableRow style={styles.actionItem} onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Delete member">
                  <Text style={[styles.actionText, { color: '#ef4444' }]}>Delete</Text>
                </PressableRow>
              </>
            )}
            <PressableRow
              style={[styles.actionItem, styles.actionCancel, { borderTopColor: colors.border }]}
              onPress={() => { setShowActions(false); setSelectedMember(null); }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>Cancel</Text>
            </PressableRow>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 15 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  emptyHint: { fontSize: 13, textAlign: 'center', opacity: 0.7, maxWidth: 280 },
  toolbar: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  searchInput: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  segmentScroll: { flexGrow: 0 },
  segmentRow: { paddingHorizontal: 12, paddingVertical: 6, gap: 6, flexDirection: 'row' },
  segmentChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  segmentChipText: { fontSize: 14, fontWeight: '600' },
  listContent: { padding: 12, paddingBottom: 20 },
  // Section header
  sectionHeader: { paddingVertical: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  // Member card
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  avatarImage: { width: 44, height: 44, borderRadius: 22 },
  memberInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkedIcon: { fontSize: 14 },
  memberName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  memberDate: { fontSize: 13, marginBottom: 4 },
  instrumentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  instrumentBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  instrumentText: { fontSize: 12, fontWeight: '600' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 12,
    padding: 24,
    maxHeight: '80%',
    maxWidth: 500,
    width: '100%',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20 },
  modalLabel: { fontSize: 14, fontWeight: '500', marginBottom: 6 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  notesInput: { height: 80, textAlignVertical: 'top' },
  instrumentPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  instrumentChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  instrumentChipText: { fontSize: 13, fontWeight: '600' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkmark: { fontSize: 14, fontWeight: '700' },
  checkboxLabel: { fontSize: 15 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 15, fontWeight: '600' },
  modalButtonTextWhite: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
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
});
