import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  BackHandler,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';

const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 32;
const DEFAULT_FONT_SIZE = 18;

export default function LyricsScreen({ navigation, route }) {
  const { lyrics, songTitle, duration } = route.params;
  const insets = useSafeAreaInsets();

  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [autoScrolling, setAutoScrolling] = useState(false);
  const [userTouching, setUserTouching] = useState(false);
  const scrollViewRef = useRef(null);
  const scrollIntervalRef = useRef(null);
  const contentHeightRef = useRef(0);
  const scrollViewHeightRef = useRef(0);
  const currentScrollOffsetRef = useRef(0);

  // Keep awake during auto-scroll
  useKeepAwake();

  // Hide header
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Auto-scroll logic
  useEffect(() => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }

    if (!autoScrolling || userTouching) return;

    const scrollableDistance = contentHeightRef.current - scrollViewHeightRef.current;
    if (scrollableDistance <= 0) return;

    // Calculate scroll speed: complete scroll in `duration` seconds, or 120s default
    const totalDuration = duration || 120;
    const pixelsPerSecond = scrollableDistance / totalDuration;
    const intervalMs = 50;
    const pixelsPerInterval = pixelsPerSecond * (intervalMs / 1000);

    let currentOffset = currentScrollOffsetRef.current;

    scrollIntervalRef.current = setInterval(() => {
      currentOffset += pixelsPerInterval;
      if (currentOffset >= scrollableDistance) {
        currentOffset = scrollableDistance;
        setAutoScrolling(false);
      }
      scrollViewRef.current?.scrollTo({ y: currentOffset, animated: false });
    }, intervalMs);

    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
    };
  }, [autoScrolling, userTouching, duration]);

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // Android hardware back button
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [handleClose]);

  const increaseFontSize = useCallback(() => {
    setFontSize(prev => Math.min(prev + 2, MAX_FONT_SIZE));
  }, []);

  const decreaseFontSize = useCallback(() => {
    setFontSize(prev => Math.max(prev - 2, MIN_FONT_SIZE));
  }, []);

  const toggleAutoScroll = useCallback(() => {
    setAutoScrolling(prev => !prev);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar hidden animated />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Close lyrics view"
        >
          <Ionicons name="close" size={22} color="#ffffff" />
        </TouchableOpacity>

        <Text style={styles.titleText} numberOfLines={1}>{songTitle}</Text>

        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={decreaseFontSize}
            disabled={fontSize <= MIN_FONT_SIZE}
            accessibilityRole="button"
            accessibilityLabel="Decrease font size"
          >
            <Text style={[styles.controlText, fontSize <= MIN_FONT_SIZE && styles.controlDisabled]}>A-</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={increaseFontSize}
            disabled={fontSize >= MAX_FONT_SIZE}
            accessibilityRole="button"
            accessibilityLabel="Increase font size"
          >
            <Text style={[styles.controlText, fontSize >= MAX_FONT_SIZE && styles.controlDisabled]}>A+</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scrollToggle, autoScrolling && styles.scrollToggleActive]}
            onPress={toggleAutoScroll}
            accessibilityRole="button"
            accessibilityLabel={autoScrolling ? 'Stop auto-scroll' : 'Start auto-scroll'}
          >
            <Text style={[styles.scrollToggleText, autoScrolling && styles.scrollToggleTextActive]}>
              {autoScrolling ? 'STOP' : 'SCROLL'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Lyrics */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={(_, h) => { contentHeightRef.current = h; }}
        onLayout={(e) => { scrollViewHeightRef.current = e.nativeEvent.layout.height; }}
        onScroll={(e) => { currentScrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        onScrollBeginDrag={() => setUserTouching(true)}
        onScrollEndDrag={() => setUserTouching(false)}
        onMomentumScrollEnd={() => setUserTouching(false)}
        scrollEventThrottle={16}
      >
        <Text style={[
          styles.lyricsText,
          {
            fontSize,
            lineHeight: fontSize * 1.5,
          },
        ]}>
          {lyrics}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50, // overridden inline with safe area insets
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  titleText: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  controlDisabled: {
    color: 'rgba(255,255,255,0.3)',
  },
  scrollToggle: {
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  scrollToggleActive: {
    backgroundColor: 'rgba(16,185,129,0.3)',
  },
  scrollToggleText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  scrollToggleTextActive: {
    color: '#10b981',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  lyricsText: {
    color: 'rgba(255,255,255,0.9)',
  },
});
