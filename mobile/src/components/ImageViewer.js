import { memo, useState, useCallback, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import ImageView from 'react-native-image-viewing';
import * as MediaLibrary from 'expo-media-library';
import { File, Directory, Paths } from 'expo-file-system/next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function ImageViewer({ visible, imageUrl, images, initialIndex = 0, onClose }) {
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();

  // Support both single image and gallery mode
  const imageList = useMemo(() => {
    if (images && images.length > 0) {
      return images.map(img => ({ uri: typeof img === 'string' ? img : img.url || img.uri }));
    }
    if (imageUrl) {
      return [{ uri: imageUrl }];
    }
    return [];
  }, [images, imageUrl]);

  const handleSave = useCallback(async (currentIndex) => {
    try {
      setSaving(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted' && status !== 'limited') {
        Alert.alert('Permission needed', 'Allow BandChat to save photos to your library.');
        return;
      }
      const url = imageList[currentIndex]?.uri;
      if (!url) return;
      let filename = url.split('/').pop()?.split('?')[0] || '';
      filename = filename.replace(/[^a-zA-Z0-9._-]/g, '');
      if (!filename || !filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        filename = `image-${Date.now()}.jpg`;
      }
      const file = await File.downloadFileAsync(url, new Directory(Paths.cache), { idempotent: true });
      await MediaLibrary.saveToLibraryAsync(file.uri);
      Alert.alert('Saved', 'Image saved to your photo library.');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save image.');
    } finally {
      setSaving(false);
    }
  }, [imageList]);

  const [currentIdx, setCurrentIdx] = useState(initialIndex);

  const HeaderComponent = useCallback(({ imageIndex }) => (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => handleSave(imageIndex)}
        disabled={saving}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Save image to photo library"
      >
        {saving ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.headerButtonText}>{'\u2B07'}</Text>
        )}
      </TouchableOpacity>
      {imageList.length > 1 && (
        <Text style={styles.counter}>{imageIndex + 1} / {imageList.length}</Text>
      )}
      <TouchableOpacity
        style={styles.headerButton}
        onPress={onClose}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Close image viewer"
      >
        <Text style={styles.headerButtonText}>{'\u2715'}</Text>
      </TouchableOpacity>
    </View>
  ), [insets.top, saving, imageList.length, handleSave, onClose]);

  if (imageList.length === 0) return null;

  return (
    <ImageView
      images={imageList}
      imageIndex={initialIndex}
      visible={visible}
      onRequestClose={onClose}
      onImageIndexChange={setCurrentIdx}
      swipeToCloseEnabled
      doubleTapToZoomEnabled
      presentationStyle="overFullScreen"
      HeaderComponent={HeaderComponent}
      backgroundColor="rgba(0,0,0,0.95)"
    />
  );
}

export default memo(ImageViewer);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    width: '100%',
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  counter: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
