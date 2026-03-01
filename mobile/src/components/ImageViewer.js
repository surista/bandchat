import { memo, useState, useCallback } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const TIMING_CONFIG = { duration: 250 };

function ImageViewer({ visible, imageUrl, onClose }) {
  const [loading, setLoading] = useState(true);

  // Shared values for gestures
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetZoom = useCallback(() => {
    'worklet';
    scale.value = withTiming(1, TIMING_CONFIG);
    savedScale.value = 1;
    translateX.value = withTiming(0, TIMING_CONFIG);
    translateY.value = withTiming(0, TIMING_CONFIG);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, []);

  const handleClose = useCallback(() => {
    // Reset zoom state before closing
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setLoading(true);
    onClose();
  }, [onClose]);

  // Clamp translation so the image doesn't fly off-screen
  const clampTranslate = useCallback((translationX, translationY, currentScale) => {
    'worklet';
    const maxX = ((currentScale - 1) * SCREEN_WIDTH) / 2;
    const maxY = ((currentScale - 1) * SCREEN_HEIGHT * 0.75) / 2;
    const clampedX = Math.max(-maxX, Math.min(maxX, translationX));
    const clampedY = Math.max(-maxY, Math.min(maxY, translationY));
    return { x: clampedX, y: clampedY };
  }, []);

  // Pinch gesture
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((event) => {
      const newScale = savedScale.value * event.scale;
      scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;

      // If scale is near 1, snap back fully
      if (scale.value < 1.1) {
        resetZoom();
      } else {
        // Clamp translation for current scale
        const clamped = clampTranslate(translateX.value, translateY.value, scale.value);
        translateX.value = withTiming(clamped.x, TIMING_CONFIG);
        translateY.value = withTiming(clamped.y, TIMING_CONFIG);
        savedTranslateX.value = clamped.x;
        savedTranslateY.value = clamped.y;
      }
    });

  // Pan gesture — only active when zoomed in
  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      if (scale.value > 1) {
        const newX = savedTranslateX.value + event.translationX;
        const newY = savedTranslateY.value + event.translationY;
        const clamped = clampTranslate(newX, newY, scale.value);
        translateX.value = clamped.x;
        translateY.value = clamped.y;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Double-tap to reset zoom
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      if (scale.value > 1) {
        // Already zoomed in — reset
        resetZoom();
      } else {
        // Zoom to 2.5x centered on tap point
        const targetScale = 2.5;
        const focalX = event.x - SCREEN_WIDTH / 2;
        const focalY = event.y - (SCREEN_HEIGHT * 0.75) / 2;
        const clamped = clampTranslate(-focalX, -focalY, targetScale);
        scale.value = withTiming(targetScale, TIMING_CONFIG);
        savedScale.value = targetScale;
        translateX.value = withTiming(clamped.x, TIMING_CONFIG);
        translateY.value = withTiming(clamped.y, TIMING_CONFIG);
        savedTranslateX.value = clamped.x;
        savedTranslateY.value = clamped.y;
      }
    });

  // Compose gestures: pinch + pan run simultaneously, double-tap is exclusive
  const composedGesture = Gesture.Race(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture)
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (!imageUrl) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <GestureHandlerRootView style={styles.rootView}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Close image viewer">
            <Text style={styles.closeText}>{'\u2715'}</Text>
          </TouchableOpacity>
          {loading && (
            <ActivityIndicator style={styles.loader} size="large" color="#ffffff" />
          )}
          <GestureDetector gesture={composedGesture}>
            <Animated.Image
              source={{ uri: imageUrl }}
              style={[styles.image, animatedStyle]}
              resizeMode="contain"
              onLoadEnd={() => setLoading(false)}
              accessibilityLabel="Full size image"
            />
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export default memo(ImageViewer);

const styles = StyleSheet.create({
  rootView: {
    flex: 1,
  },
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
  loader: {
    position: 'absolute',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
  },
});
