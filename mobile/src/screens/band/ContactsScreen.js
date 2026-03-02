import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Linking,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import ActionSheet from '../../components/ActionSheet';
import ErrorState from '../../components/ErrorState';
import api from '../../services/api';

const CATEGORY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'venue', label: 'Venues' },
  { key: 'sound_engineer', label: 'Sound' },
  { key: 'photographer', label: 'Photo' },
  { key: 'agent', label: 'Agents' },
  { key: 'other', label: 'Other' },
];

const CATEGORY_ICONS = {
  venue: '\uD83C\uDFE2',
  sound_engineer: '\uD83C\uDFA7',
  photographer: '\uD83D\uDCF7',
  agent: '\uD83D\uDC54',
  other: '\uD83D\uDCCB',
};

const CATEGORY_LABELS = {
  venue: 'Venue',
  sound_engineer: 'Sound Engineer',
  photographer: 'Photographer',
  agent: 'Agent',
  other: 'Other',
};

const CATEGORY_PICKER = [
  { value: 'venue', label: 'Venue' },
  { value: 'sound_engineer', label: 'Sound Engineer' },
  { value: 'photographer', label: 'Photographer' },
  { value: 'agent', label: 'Agent' },
  { value: 'other', label: 'Other' },
];

export default function ContactsScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();

  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('venue');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Action sheet
  const [selectedContact, setSelectedContact] = useState(null);
  const [showActions, setShowActions] = useState(false);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => openCreateModal()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Add contact"
        >
          <Text style={{ color: colors.primary, fontSize: 28, fontWeight: '300', lineHeight: 30 }}>+</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.primary]);

  const loadContacts = useCallback(async () => {
    setError(null);
    try {
      const cat = categoryFilter !== 'all' ? categoryFilter : null;
      const data = await api.getContacts(workspaceId, cat);
      setContacts(data);
    } catch (err) {
      console.error('Failed to load contacts:', err);
      if (!contacts.length) setError(err.message || 'Failed to load contacts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId, categoryFilter]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loadingRef.current) loadContacts();
    });
    return unsubscribe;
  }, [navigation, loadContacts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadContacts();
  }, [loadContacts]);

  const openCreateModal = useCallback(() => {
    setEditingContact(null);
    setName('');
    setCategory('venue');
    setEmail('');
    setPhone('');
    setWebsite('');
    setAddress('');
    setNotes('');
    setShowModal(true);
  }, []);

  const openEditModal = useCallback((contact) => {
    setEditingContact(contact);
    setName(contact.name || '');
    setCategory(contact.category || 'other');
    setEmail(contact.email || '');
    setPhone(contact.phone || '');
    setWebsite(contact.website || '');
    setAddress(contact.address || '');
    setNotes(contact.notes || '');
    setShowModal(true);
    setShowActions(false);
    setSelectedContact(null);
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
        category,
        email: email.trim() || null,
        phone: phone.trim() || null,
        website: website.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      };
      if (editingContact) {
        await api.updateContact(editingContact.id, data);
      } else {
        await api.createContact(workspaceId, data);
      }
      setShowModal(false);
      loadContacts();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  }, [name, category, email, phone, website, address, notes, editingContact, workspaceId, loadContacts]);

  const handleDelete = useCallback(() => {
    if (!selectedContact) return;
    Alert.alert('Delete Contact', `Delete "${selectedContact.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteContact(selectedContact.id);
            setContacts(prev => prev.filter(c => c.id !== selectedContact.id));
          } catch (err) {
            Alert.alert('Error', 'Failed to delete contact');
          }
          setShowActions(false);
          setSelectedContact(null);
        },
      },
    ]);
  }, [selectedContact]);

  const openLink = useCallback((type, value) => {
    let url;
    if (type === 'email') url = `mailto:${value}`;
    else if (type === 'phone') url = `tel:${value}`;
    else if (type === 'website') {
      url = value.startsWith('http') ? value : `https://${value}`;
    }
    if (url) Linking.openURL(url).catch(() => {});
  }, []);

  const renderContact = useCallback(({ item }) => {
    const icon = CATEGORY_ICONS[item.category] || CATEGORY_ICONS.other;
    const catLabel = CATEGORY_LABELS[item.category] || item.category;

    return (
      <TouchableOpacity
        style={[styles.contactCard, { backgroundColor: colors.bgSecondary }]}
        onLongPress={() => { setSelectedContact(item); setShowActions(true); }}
        delayLongPress={400}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}. Long press for options`}
      >
        <View style={styles.contactHeader}>
          <Text style={[styles.contactName, { color: colors.textPrimary }]}>{item.name}</Text>
          <View style={[styles.categoryBadge, { backgroundColor: colors.bgTertiary }]}>
            <Text style={styles.categoryIcon}>{icon}</Text>
            <Text style={[styles.categoryLabel, { color: colors.textSecondary }]}>{catLabel}</Text>
          </View>
        </View>

        {item.email && (
          <TouchableOpacity style={styles.contactRow} onPress={() => openLink('email', item.email)} accessibilityRole="button" accessibilityLabel={`Email ${item.email}`}>
            <Text style={styles.contactRowIcon}>{'\u2709\uFE0F'}</Text>
            <Text style={[styles.contactRowText, { color: colors.primary }]}>{item.email}</Text>
          </TouchableOpacity>
        )}

        {item.phone && (
          <TouchableOpacity style={styles.contactRow} onPress={() => openLink('phone', item.phone)} accessibilityRole="button" accessibilityLabel={`Call ${item.phone}`}>
            <Text style={styles.contactRowIcon}>{'\uD83D\uDCDE'}</Text>
            <Text style={[styles.contactRowText, { color: colors.primary }]}>{item.phone}</Text>
          </TouchableOpacity>
        )}

        {item.website && (
          <TouchableOpacity style={styles.contactRow} onPress={() => openLink('website', item.website)} accessibilityRole="button" accessibilityLabel={`Open website ${item.website}`}>
            <Text style={styles.contactRowIcon}>{'\uD83C\uDF10'}</Text>
            <Text style={[styles.contactRowText, { color: colors.primary }]} numberOfLines={1}>{item.website}</Text>
          </TouchableOpacity>
        )}

        {item.address && (
          <View style={styles.contactRow}>
            <Text style={styles.contactRowIcon}>{'\uD83D\uDCCD'}</Text>
            <Text style={[styles.contactRowText, { color: colors.textSecondary }]}>{item.address}</Text>
          </View>
        )}

        {item.notes && (
          <Text style={[styles.contactNotes, { color: colors.textSecondary }]}>{item.notes}</Text>
        )}
      </TouchableOpacity>
    );
  }, [colors, openLink]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <ErrorState
          emoji={'\uD83D\uDE15'}
          title="Couldn't load contacts"
          message={error}
          onRetry={() => { setLoading(true); loadContacts(); }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {CATEGORY_FILTERS.map(f => {
          const active = categoryFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, { backgroundColor: active ? colors.primary : colors.bgTertiary }]}
              onPress={() => setCategoryFilter(f.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${f.label}${active ? ', selected' : ''}`}
            >
              <Text style={[styles.filterChipText, { color: active ? '#ffffff' : colors.textSecondary }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        renderItem={renderContact}
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
            <Text style={styles.emptyIcon}>{'\uD83D\uDCC7'}</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No contacts yet</Text>
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
              Keep track of venues, sound engineers, photographers, and more. Tap + to add a contact.
            </Text>
          </View>
        }
      />

      {/* Create/Edit Modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {editingContact ? 'Edit Contact' : 'New Contact'}
              </Text>

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Name *</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={name}
                onChangeText={setName}
                placeholder="Contact name"
                placeholderTextColor={colors.textSecondary}
                autoFocus
                accessibilityLabel="Contact name"
              />

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Category</Text>
              <View style={styles.categoryPicker}>
                {CATEGORY_PICKER.map(opt => {
                  const active = category === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.categoryChip, { backgroundColor: active ? colors.primary : colors.bgTertiary }]}
                      onPress={() => setCategory(opt.value)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`${opt.label}${active ? ', selected' : ''}`}
                    >
                      <Text style={[styles.categoryChipText, { color: active ? '#ffffff' : colors.textSecondary }]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Email</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={email}
                onChangeText={setEmail}
                placeholder="email@example.com"
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                accessibilityLabel="Email"
              />

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Phone</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone number"
                placeholderTextColor={colors.textSecondary}
                keyboardType="phone-pad"
                accessibilityLabel="Phone number"
              />

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Website</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={website}
                onChangeText={setWebsite}
                placeholder="www.example.com"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                accessibilityLabel="Website"
              />

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Address</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={address}
                onChangeText={setAddress}
                placeholder="Address"
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel="Address"
              />

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
                accessibilityLabel={editingContact ? 'Save contact' : 'Create contact'}
              >
                {saving ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextWhite}>{editingContact ? 'Save' : 'Create'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Action Sheet */}
      <ActionSheet
        visible={showActions}
        title={selectedContact?.name}
        actions={[
          { label: 'Edit', onPress: () => openEditModal(selectedContact) },
          { label: 'Delete', destructive: true, onPress: handleDelete },
        ]}
        onClose={() => { setShowActions(false); setSelectedContact(null); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  emptyHint: { fontSize: 13, textAlign: 'center', opacity: 0.7, maxWidth: 280 },
  // Filters
  filterScroll: { flexGrow: 0 },
  filterRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
  },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  filterChipText: { fontSize: 14, fontWeight: '600' },
  // List
  listContent: { paddingHorizontal: 12, paddingBottom: 20 },
  // Contact card
  contactCard: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  contactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  contactName: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  categoryIcon: { fontSize: 12 },
  categoryLabel: { fontSize: 12, fontWeight: '600' },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  contactRowIcon: { fontSize: 14, width: 24 },
  contactRowText: { fontSize: 14, flex: 1 },
  contactNotes: { fontSize: 13, fontStyle: 'italic', marginTop: 4 },
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
    maxHeight: '85%',
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
  categoryPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  categoryChipText: { fontSize: 13, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 15, fontWeight: '600' },
  modalButtonTextWhite: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
});
