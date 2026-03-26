import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import getInitial from '../../utils/getInitial';
import api from '../../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useLayout } from '../../hooks/useLayout';

export default function EditProfileScreen({ navigation }) {
  const { user, updateUser } = useAuth()
  const { isTablet, contentMaxWidth } = useLayout();
  const { colors } = useTheme();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const handlePickAvatar = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      const filename = asset.fileName || 'avatar.jpg';
      const mimeType = asset.mimeType || 'image/jpeg';
      const uploaded = await api.uploadFile(asset.uri, filename, mimeType);
      await api.updateProfile({ avatarUrl: uploaded.url });
      updateUser({ avatarUrl: uploaded.url });
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
    }
  }, [updateUser]);

  const handleSave = useCallback(async () => {
    const trimmedName = displayName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 50) {
      setFieldErrors({ displayName: 'Must be 2\u201350 characters' });
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const updated = await api.updateProfile({
        displayName: trimmedName,
        bio: bio.trim() || null,
      });
      updateUser({ displayName: trimmedName, bio: bio.trim() || null, ...updated });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }, [displayName, bio, updateUser, navigation]);

  const hasChanges = displayName.trim() !== (user?.displayName || '') ||
    (bio.trim() || '') !== (user?.bio || '');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.content, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
        {/* Avatar */}
        <TouchableOpacity
          style={styles.avatarWrapper}
          onPress={handlePickAvatar}
          disabled={uploadingAvatar}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
        >
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            {uploadingAvatar ? (
              <ActivityIndicator color="#ffffff" />
            ) : user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{getInitial(user?.displayName)}</Text>
            )}
          </View>
          <View style={[styles.cameraOverlay, { backgroundColor: colors.bgTertiary }]}>
            <Ionicons name="camera-outline" size={16} color={colors.textPrimary} />
          </View>
        </TouchableOpacity>
        <Text style={[styles.avatarHint, { color: colors.textSecondary }]}>
          Tap to change photo
        </Text>

        {/* Display Name */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Display Name</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderColor: fieldErrors.displayName ? '#ef4444' : colors.border }]}
          value={displayName}
          onChangeText={(text) => {
            setDisplayName(text);
            if (fieldErrors.displayName) setFieldErrors(prev => ({ ...prev, displayName: null }));
          }}
          onBlur={() => {
            const trimmed = displayName.trim();
            if (trimmed.length > 0 && (trimmed.length < 2 || trimmed.length > 50)) {
              setFieldErrors(prev => ({ ...prev, displayName: 'Must be 2\u201350 characters' }));
            }
          }}
          placeholder="Your display name"
          placeholderTextColor={colors.textSecondary}
          maxLength={50}
          autoCapitalize="words"
          accessibilityLabel="Display name"
        />
        {fieldErrors.displayName && (
          <Text style={styles.fieldError}>{fieldErrors.displayName}</Text>
        )}
        <Text style={[styles.charCount, { color: colors.textSecondary }]}>
          {displayName.length}/50
        </Text>

        {/* Bio */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Bio</Text>
        <TextInput
          style={[styles.input, styles.bioInput, { backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderColor: colors.border }]}
          value={bio}
          onChangeText={setBio}
          placeholder="Tell people about yourself"
          placeholderTextColor={colors.textSecondary}
          multiline
          maxLength={500}
          textAlignVertical="top"
          accessibilityLabel="Bio"
        />
        <Text style={[styles.charCount, { color: colors.textSecondary }]}>
          {bio.length}/500
        </Text>

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: hasChanges ? colors.primary : colors.bgTertiary }]}
          onPress={handleSave}
          disabled={saving || !hasChanges}
          activeOpacity={0.7}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={[styles.saveText, { color: hasChanges ? '#ffffff' : colors.textSecondary }]}>
              Save Changes
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  content: { padding: 24, alignItems: 'center' },
  // Avatar
  avatarWrapper: { position: 'relative', marginBottom: 4 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#ffffff', fontSize: 36, fontWeight: '700' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 48 },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIcon: { fontSize: 16 },
  avatarHint: { fontSize: 13, marginBottom: 24 },
  // Form
  label: { fontSize: 14, fontWeight: '600', alignSelf: 'flex-start', marginBottom: 6 },
  input: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  bioInput: { height: 100, textAlignVertical: 'top' },
  charCount: { fontSize: 12, alignSelf: 'flex-end', marginTop: 4, marginBottom: 16 },
  fieldError: { color: '#ef4444', fontSize: 12, alignSelf: 'flex-start', marginTop: 4 },
  // Save
  saveButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  saveText: { fontSize: 16, fontWeight: '600' },
});
