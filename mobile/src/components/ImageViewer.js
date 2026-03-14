import { memo, useState, useCallback } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  Text,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';

function ImageViewer({ visible, imageUrl, onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const handleClose = useCallback(() => {
    setLoading(true);
    onClose();
  }, [onClose]);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted' && status !== 'limited') {
        Alert.alert('Permission needed', 'Allow BandChat to save photos to your library.');
        return;
      }
      // Extract and sanitize filename
      let filename = imageUrl.split('/').pop()?.split('?')[0] || '';
      filename = filename.replace(/[^a-zA-Z0-9._-]/g, '');
      if (!filename || !filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        filename = `image-${Date.now()}.jpg`;
      }
      const localUri = FileSystem.cacheDirectory + filename;
      const { uri } = await FileSystem.downloadAsync(imageUrl, localUri);
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved', 'Image saved to your photo library.');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save image.');
    } finally {
      setSaving(false);
    }
  }, [imageUrl]);

  if (!imageUrl) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Save image to photo library">
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveText}>{'\u2B07'}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeButton} onPress={handleClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Close image viewer">
          <Text style={styles.closeText}>{'\u2715'}</Text>
        </TouchableOpacity>
        {loading && (
          <ActivityIndicator style={styles.loader} size="large" color="#ffffff" />
        )}
        <Image
          source={{ uri: imageUrl }}
          style={{ width: screenWidth, height: screenHeight * 0.75 }}
          resizeMode="contain"
          onLoadEnd={() => setLoading(false)}
          accessibilityLabel="Full size image"
        />
      </View>
    </Modal>
  );
}

export default memo(ImageViewer);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  saveButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  loader: {
    position: 'absolute',
  },
});
