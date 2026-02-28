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
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

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

function getInitial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

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

  const [members, setMembers] = useState({ current: [], former: [], guests: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      headerRight: () => (
        <TouchableOpacity
          onPress={() => openCreateModal()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ color: colors.primary, fontSize: 28, fontWeight: '300', lineHeight: 30 }}>+</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.primary]);

  const loadMembers = useCallback(async () => {
    try {
      const data = await api.getBandMembers(workspaceId);
      setMembers(data);
    } catch (err) {
      console.error('Failed to load members:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

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
    const result = [];
    if (members.current?.length > 0) {
      result.push({ title: 'Current Members', data: members.current });
    }
    if (members.former?.length > 0) {
      result.push({ title: 'Former Members', data: members.former });
    }
    if (members.guests?.length > 0) {
      result.push({ title: 'Guest Musicians', data: members.guests });
    }
    return result;
  }, [members]);

  const renderMember = useCallback(({ item }) => {
    const instruments = getInstruments(item);
    const dateRange = getDateRange(item);
    return (
      <TouchableOpacity
        style={[styles.memberCard, { backgroundColor: colors.bgSecondary }]}
        onLongPress={() => { setSelectedMember(item); setShowActions(true); }}
        delayLongPress={400}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{getInitial(item.name)}</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={[styles.memberName, { color: colors.textPrimary }]}>{item.name}</Text>
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
      </TouchableOpacity>
    );
  }, [colors]);

  const renderSectionHeader = useCallback(({ section }) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{section.title}</Text>
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
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
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
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No members yet</Text>
          </View>
        }
      />

      {/* Create/Edit Modal */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
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
                    >
                      <Text style={[styles.instrumentChipText, { color: active ? instColor : colors.textSecondary }]}>{inst}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setIsGuest(prev => !prev)}
                activeOpacity={0.6}
              >
                <View style={[styles.checkbox, { borderColor: colors.border }, isGuest && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  {isGuest && <Text style={styles.checkmark}>{'\u2713'}</Text>}
                </View>
                <Text style={[styles.checkboxLabel, { color: colors.textPrimary }]}>Guest musician</Text>
              </TouchableOpacity>

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Notes</Text>
              <TextInput
                style={[styles.modalInput, styles.notesInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional notes"
                placeholderTextColor={colors.textSecondary}
                multiline
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => setShowModal(false)}
                disabled={saving}
              >
                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                disabled={saving || !name.trim()}
              >
                {saving ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextWhite}>{editingMember ? 'Save' : 'Add'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Action Sheet */}
      <Modal visible={showActions} transparent animationType="slide">
        <TouchableOpacity
          style={styles.actionOverlay}
          activeOpacity={1}
          onPress={() => { setShowActions(false); setSelectedMember(null); }}
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.actionHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {selectedMember?.name}
            </Text>
            <TouchableOpacity style={styles.actionItem} onPress={() => openEditModal(selectedMember)}>
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleDelete}>
              <Text style={[styles.actionText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionCancel]}
              onPress={() => { setShowActions(false); setSelectedMember(null); }}
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
  emptyText: { fontSize: 15 },
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
  memberInfo: { flex: 1 },
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
  checkmark: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
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
