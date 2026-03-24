import { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { isSafeUrl } from '../../utils/urlSafety';
import { successNotification, mediumImpact } from '../../utils/haptics';
import api from '../../services/api';
import { useLayout } from '../../hooks/useLayout';
import ErrorState from '../../components/ErrorState';
import { SkeletonList } from '../../components/SkeletonLoader';

export default function VenueDetailScreen({ navigation, route }) {
  const { venueId, workspaceId, isNew } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const { isTablet, contentMaxWidth } = useLayout();

  const [venue, setVenue] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(!!isNew);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoaded, setAdminLoaded] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [capacity, setCapacity] = useState('');
  const [notes, setNotes] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageUploading, setImageUploading] = useState(false);

  // Check admin status
  useEffect(() => {
    api.getWorkspace(workspaceId).then(ws => {
      const membership = ws.members?.find(m => m.userId === user?.id);
      setIsAdmin(membership?.role === 'ADMIN');
    }).catch(() => {}).finally(() => setAdminLoaded(true));
  }, [workspaceId, user?.id]);

  const populateForm = useCallback((data) => {
    if (!data) return;
    setName(data.name || '');
    setAddress(data.address || '');
    setCity(data.city || '');
    setPhone(data.phone || '');
    setEmail(data.email || '');
    setWebsite(data.website || '');
    setCapacity(data.capacity != null ? String(data.capacity) : '');
    setNotes(data.notes || '');
    setImageUrl(data.imageUrl || '');
  }, []);

  const loadVenue = useCallback(async () => {
    if (!venueId) return;
    try {
      const data = await api.getVenue(venueId);
      setVenue(data);
      populateForm(data);
    } catch (err) {
      setLoadError(err.message || 'Failed to load venue');
    } finally {
      setLoading(false);
    }
  }, [venueId, populateForm]);

  useEffect(() => {
    if (!isNew) loadVenue();
  }, [isNew, loadVenue]);

  const canEdit = isNew || (adminLoaded && (isAdmin || venue?.createdById === user?.id));

  useLayoutEffect(() => {
    if (isNew) {
      navigation.setOptions({ title: 'New Venue' });
    } else if (editing) {
      navigation.setOptions({
        title: 'Edit Venue',
        headerRight: () => null,
      });
    } else {
      navigation.setOptions({
        title: venue?.name || 'Venue',
        headerRight: canEdit ? () => (
          <TouchableOpacity
            onPress={() => setEditing(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Edit venue"
          >
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Edit</Text>
          </TouchableOpacity>
        ) : undefined,
      });
    }
  }, [navigation, editing, isNew, venue?.name, canEdit]);

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Required', 'Venue name is required');
      return;
    }

    const capacityNum = capacity.trim() ? parseInt(capacity, 10) : null;
    if (capacityNum !== null && (isNaN(capacityNum) || capacityNum < 0)) {
      Alert.alert('Invalid', 'Capacity must be a positive number');
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: trimmed,
        address: address.trim() || null,
        city: city.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        website: website.trim() || null,
        capacity: capacityNum,
        notes: notes.trim() || null,
        imageUrl: imageUrl || null,
      };

      if (isNew) {
        const created = await api.createVenue(workspaceId, data);
        setVenue(created);
        populateForm(created);
        setEditing(false);
        navigation.setParams({ venueId: created.id, isNew: false });
        successNotification();
        toast.success('Venue created');
      } else {
        const updated = await api.updateVenue(venueId, data);
        setVenue(updated);
        populateForm(updated);
        setEditing(false);
        successNotification();
        toast.success('Venue updated');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save venue');
    } finally {
      setSaving(false);
    }
  }, [name, address, city, phone, email, website, capacity, notes, imageUrl, isNew, workspaceId, venueId, navigation, populateForm, toast]);

  const handleCancel = useCallback(() => {
    if (isNew) {
      navigation.goBack();
    } else {
      populateForm(venue);
      setEditing(false);
    }
  }, [isNew, venue, navigation, populateForm]);

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setImageUploading(true);
    try {
      const filename = asset.fileName || 'venue.jpg';
      const mimeType = asset.mimeType || 'image/jpeg';
      const uploaded = await api.uploadFile(asset.uri, filename, mimeType, workspaceId);
      setImageUrl(uploaded.url);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to upload image');
    } finally {
      setImageUploading(false);
    }
  }, [workspaceId]);

  const handleDelete = useCallback(() => {
    mediumImpact();
    Alert.alert('Delete Venue', `Delete "${venue?.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteVenue(venueId);
            successNotification();
            toast.success('Venue deleted');
            navigation.goBack();
          } catch (err) {
            Alert.alert('Error', 'Failed to delete venue');
          }
        },
      },
    ]);
  }, [venue, venueId, navigation, toast]);

  const openMaps = useCallback(() => {
    const query = encodeURIComponent([venue?.name, venue?.address, venue?.city].filter(Boolean).join(', '));
    const url = Platform.OS === 'ios'
      ? `maps:?q=${query}`
      : `geo:0,0?q=${query}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://maps.google.com/maps?q=${query}`);
    });
  }, [venue]);

  const openLink = useCallback((type, value) => {
    let url;
    if (type === 'phone') url = `tel:${value}`;
    else if (type === 'email') url = `mailto:${value}`;
    else if (type === 'website') {
      const candidate = value.startsWith('http') ? value : `https://${value}`;
      if (!isSafeUrl(candidate)) return;
      url = candidate;
    }
    if (url) Linking.openURL(url).catch(() => {});
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <SkeletonList count={4} />
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <ErrorState
          iconName="location-outline"
          iconSize={48}
          title="Couldn't load venue"
          message={loadError}
          onRetry={() => { setLoading(true); loadVenue(); }}
        />
      </SafeAreaView>
    );
  }

  // ---- Edit Mode ----
  if (editing) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          contentContainerStyle={[styles.formContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.label, { color: colors.textSecondary }]}>Name *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={name}
            onChangeText={setName}
            placeholder="Venue name"
            placeholderTextColor={colors.textSecondary}
            autoFocus={isNew}
            accessibilityLabel="Venue name"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Address</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={address}
            onChangeText={setAddress}
            placeholder="Full address"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Address"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>City</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={city}
            onChangeText={setCity}
            placeholder="City"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="City"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Phone</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone number"
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
            accessibilityLabel="Phone number"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={email}
            onChangeText={setEmail}
            placeholder="email@venue.com"
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            accessibilityLabel="Email"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Website</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={website}
            onChangeText={setWebsite}
            placeholder="www.venue.com"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            accessibilityLabel="Website"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Capacity</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={capacity}
            onChangeText={setCapacity}
            placeholder="e.g. 500"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            accessibilityLabel="Capacity"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Additional notes..."
            placeholderTextColor={colors.textSecondary}
            multiline
            accessibilityLabel="Notes"
          />

          {/* Image upload */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Venue Image</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            {imageUrl ? (
              <View style={{ position: 'relative' }}>
                <Image source={{ uri: imageUrl }} style={{ width: 64, height: 64, borderRadius: 8 }} />
                <TouchableOpacity
                  onPress={() => setImageUrl('')}
                  style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' }}
                  accessibilityRole="button"
                  accessibilityLabel="Remove image"
                >
                  <Ionicons name="close" size={14} color="#ffffff" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: colors.bgTertiary, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="image-outline" size={24} color={colors.textSecondary} />
              </View>
            )}
            <TouchableOpacity
              onPress={handlePickImage}
              disabled={imageUploading}
              style={[styles.formButton, { backgroundColor: colors.bgTertiary, flex: 0, paddingHorizontal: 16 }]}
              accessibilityRole="button"
              accessibilityLabel={imageUrl ? 'Change venue image' : 'Upload venue image'}
            >
              {imageUploading ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <Text style={[styles.formButtonText, { color: colors.textPrimary }]}>
                  {imageUrl ? 'Change Image' : 'Upload Image'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Save / Cancel buttons */}
          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.bgTertiary }]}
              onPress={handleCancel}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.formButtonText, { color: colors.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.primary }, (saving || !name.trim()) && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={saving || !name.trim()}
              accessibilityRole="button"
              accessibilityLabel={isNew ? 'Create venue' : 'Save venue'}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.formButtonTextWhite}>{isNew ? 'Create' : 'Save'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ---- View Mode ----
  const gigCount = venue?._count?.gigs || 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}
      contentContainerStyle={[styles.viewContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
    >
      {/* Venue image */}
      {venue?.imageUrl && (
        <Image
          source={{ uri: venue.imageUrl }}
          style={styles.venueImage}
          resizeMode="cover"
          accessibilityLabel={`Photo of ${venue.name}`}
        />
      )}

      {/* Name */}
      <Text style={[styles.viewName, { color: colors.textPrimary }]}>{venue?.name}</Text>

      {/* City */}
      {venue?.city && (
        <View style={styles.cityRow}>
          <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.cityText, { color: colors.textSecondary }]}>{venue.city}</Text>
        </View>
      )}

      {/* Capacity */}
      {venue?.capacity && (
        <View style={styles.infoRow}>
          <Ionicons name="people-outline" size={18} color={colors.textSecondary} />
          <Text style={[styles.infoText, { color: colors.textPrimary }]}>
            Capacity: {venue.capacity.toLocaleString()}
          </Text>
        </View>
      )}

      {/* Address with map link */}
      {venue?.address && (
        <TouchableOpacity
          style={styles.infoRow}
          onPress={openMaps}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Show on map"
        >
          <Ionicons name="navigate-outline" size={18} color={colors.primary} />
          <Text style={[styles.infoTextLink, { color: colors.primary }]}>{venue.address}</Text>
          <Ionicons name="open-outline" size={14} color={colors.primary} />
        </TouchableOpacity>
      )}

      {/* Phone */}
      {venue?.phone && (
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => openLink('phone', venue.phone)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Call ${venue.phone}`}
        >
          <Ionicons name="call-outline" size={18} color={colors.primary} />
          <Text style={[styles.infoTextLink, { color: colors.primary }]}>{venue.phone}</Text>
        </TouchableOpacity>
      )}

      {/* Email */}
      {venue?.email && (
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => openLink('email', venue.email)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Email ${venue.email}`}
        >
          <Ionicons name="mail-outline" size={18} color={colors.primary} />
          <Text style={[styles.infoTextLink, { color: colors.primary }]}>{venue.email}</Text>
        </TouchableOpacity>
      )}

      {/* Website */}
      {venue?.website && (
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => openLink('website', venue.website)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Open website ${venue.website}`}
        >
          <Ionicons name="globe-outline" size={18} color={colors.primary} />
          <Text style={[styles.infoTextLink, { color: colors.primary }]} numberOfLines={1}>{venue.website}</Text>
          <Ionicons name="open-outline" size={14} color={colors.primary} />
        </TouchableOpacity>
      )}

      {/* Notes */}
      {venue?.notes && (
        <View style={[styles.notesSection, { backgroundColor: colors.bgSecondary }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Notes</Text>
          <Text style={[styles.notesText, { color: colors.textPrimary }]}>{venue.notes}</Text>
        </View>
      )}

      {/* Show on Map button */}
      {(venue?.address || venue?.city) && (
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}
          onPress={openMaps}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Show on map"
        >
          <Ionicons name="map-outline" size={18} color={colors.primary} />
          <Text style={[styles.actionButtonText, { color: colors.primary }]}>Show on Map</Text>
        </TouchableOpacity>
      )}

      {/* Gigs at this venue */}
      <View style={[styles.gigsSection, { backgroundColor: colors.bgSecondary }]}>
        <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
        <Text style={[styles.gigsText, { color: colors.textPrimary }]}>
          {gigCount === 0
            ? 'No gigs at this venue yet'
            : `${gigCount} gig${gigCount !== 1 ? 's' : ''} at this venue`}
        </Text>
      </View>

      {/* Created by */}
      {venue?.createdBy && (
        <Text style={[styles.createdBy, { color: colors.textSecondary }]}>
          Added by {venue.createdBy.displayName}
        </Text>
      )}

      {/* Delete button */}
      {canEdit && !isNew && (
        <TouchableOpacity
          style={[styles.deleteButton, { borderColor: '#ef4444' }]}
          onPress={handleDelete}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Delete venue"
        >
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
          <Text style={styles.deleteButtonText}>Delete Venue</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  // View mode
  viewContent: { padding: 16, paddingBottom: 40 },
  venueImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
  },
  viewName: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  cityText: { fontSize: 15 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    minHeight: 44,
  },
  infoText: { fontSize: 15, flex: 1 },
  infoTextLink: { fontSize: 15, flex: 1 },
  notesSection: {
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
  },
  sectionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6 },
  notesText: { fontSize: 15, lineHeight: 22 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 16,
  },
  actionButtonText: { fontSize: 15, fontWeight: '600' },
  gigsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 10,
    marginTop: 16,
  },
  gigsText: { fontSize: 15 },
  createdBy: { fontSize: 12, marginTop: 16, textAlign: 'center' },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 24,
  },
  deleteButtonText: { fontSize: 15, fontWeight: '600', color: '#ef4444' },
  // Edit mode
  formContent: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  notesInput: { height: 100, textAlignVertical: 'top' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  formButton: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  formButtonText: { fontSize: 16, fontWeight: '600' },
  formButtonTextWhite: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
});
