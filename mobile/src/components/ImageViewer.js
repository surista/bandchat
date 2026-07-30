import { memo, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Gallery, useImageResolution, fitContainer } from 'react-native-zoom-toolkit';
import * as MediaLibrary from 'expo-media-library';
import * as ScreenOrientation from 'expo-screen-orientation';
import { File, Paths } from 'expo-file-system/next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useToast } from '../context/ToastContext';
import { isLargeScreenDevice } from '../utils/isLargeScreenDevice';

// All orientations so the Modal itself is allowed to rotate — without this,
// RN's Modal defaults to whatever orientation it was presented in and won't
// follow the device (this is on top of, and separate from, the app-wide
// portrait lock lifted below).
const SUPPORTED_ORIENTATIONS = ['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right'];

/**
 * One gallery slide. Sized reactively via useWindowDimensions (not a
 * one-time Dimensions.get() snapshot) so it re-fits when the device
 * rotates — the exact bug we replaced react-native-image-viewing to fix.
 */
function GalleryImageItem({ uri }) {
  const { width, height } = useWindowDimensions();
  const { resolution } = useImageResolution({ uri });

  const size = useMemo(() => {
    if (!resolution) return { width, height };
    return fitContainer(resolution.width / resolution.height, { width, height });
  }, [resolution, width, height]);

  return (
    <View style={styles.slide}>
      {!resolution && (
        <ActivityIndicator size="small" color="#ffffff" style={StyleSheet.absoluteFill} />
      )}
      <Image source={{ uri }} style={size} resizeMode="contain" />
    </View>
  );
}

function ImageViewer({ visible, imageUrl, images, initialIndex = 0, onClose }) {
  const [saving, setSaving] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(initialIndex);
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const galleryRef = useRef(null);

  // Phones are locked to portrait app-wide (mobile/App.js) so ordinary
  // screens don't have to handle rotated layouts. The full-screen image
  // viewer is the one place that should still rotate — like Photos/
  // Instagram, so a landscape photo can actually fill the screen. Lift the
  // lock only while visible, and always restore portrait on close/unmount
  // (tablets are never locked in the first place, so this is a no-op there).
  useEffect(() => {
    if (!visible || isLargeScreenDevice()) return;
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [visible]);

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

  // The Gallery component only reads initialIndex on its own first mount —
  // it doesn't reactively re-scroll on prop changes. Since this component
  // stays mounted across opens in gallery-mode call sites (GigGalleryScreen,
  // ThreadScreen) as long as `images` itself doesn't go empty, opening a
  // different starting photo needs an imperative jump via the ref, not just
  // a new prop value.
  //
  // The jump has to be deferred a frame: on the tick `visible` flips true the
  // Modal's children aren't mounted and laid out yet, so galleryRef is still
  // null and a synchronous setIndex() silently does nothing — which is the
  // original "reopening at a different photo lands on the wrong slide" bug.
  useEffect(() => {
    if (!visible) return;
    setCurrentIdx(initialIndex);
    const frame = requestAnimationFrame(() => {
      galleryRef.current?.setIndex(initialIndex);
    });
    return () => cancelAnimationFrame(frame);
  }, [initialIndex, visible]);

  const handleSave = useCallback(async (index) => {
    try {
      setSaving(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted' && status !== 'limited') {
        Alert.alert(
          'Permission needed',
          'Allow BandChat to save photos to your library.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      const url = imageList[index]?.uri;
      if (!url) return;
      // Derive a safe, correctly-extensioned filename. This matters: handing
      // the download a bare Directory lets the name come from the response
      // headers, which for an R2 URL can arrive without an image extension —
      // and saveToLibraryAsync needs one to recognise the file as a photo.
      let filename = url.split('/').pop()?.split('?')[0] || '';
      filename = filename.replace(/[^a-zA-Z0-9._-]/g, '');
      if (!filename || !filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        filename = `image-${Date.now()}.jpg`;
      }
      const file = await File.downloadFileAsync(url, new File(Paths.cache, filename), { idempotent: true });
      await MediaLibrary.saveToLibraryAsync(file.uri);
      // The cache copy has served its purpose once the image is in the photo
      // library; leaving it behind grows the app's footprint every save.
      try { file.delete(); } catch { /* best effort */ }
      toast.success('Image saved to your photo library');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save image.');
    } finally {
      setSaving(false);
    }
  }, [imageList, toast]);

  const renderItem = useCallback((item) => <GalleryImageItem uri={item.uri} />, []);
  const keyExtractor = useCallback((item, index) => `${item.uri}-${index}`, []);
  const onSwipe = useCallback((direction) => {
    if (direction === 'down') onClose?.();
  }, [onClose]);

  if (imageList.length === 0) return null;

  return (
    <Modal
      transparent
      visible={visible}
      presentationStyle="overFullScreen"
      animationType="fade"
      supportedOrientations={SUPPORTED_ORIENTATIONS}
      onRequestClose={onClose}
    >
      <View style={styles.container} accessibilityViewIsModal>
        <Gallery
          ref={galleryRef}
          data={imageList}
          initialIndex={initialIndex}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onIndexChange={setCurrentIdx}
          onSwipe={onSwipe}
        />
        <View style={[styles.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.headerButton}
            onPress={onClose}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Close image viewer"
          >
            <Ionicons name="close" size={22} color="#ffffff" />
          </TouchableOpacity>
          {imageList.length > 1 && (
            <Text style={styles.counter}>{currentIdx + 1} / {imageList.length}</Text>
          )}
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => handleSave(currentIdx)}
            disabled={saving}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Save image to photo library"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons name="download-outline" size={22} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default memo(ImageViewer);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    width: '100%',
  },
  headerButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  counter: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
