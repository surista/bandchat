import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  BackHandler,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
// expo-status-bar (not react-native's StatusBar) — Expo's version maintains a
// stack of styles, so when LiveMode unmounts the previous bar styling is
// restored automatically. The raw RN StatusBar mutates the bar globally and
// leaves it whatever LiveMode set it to on exit.
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { formatDuration } from '../../utils/formatDuration';

// LiveMode is intentionally always-dark — even when the user's overall
// app theme is light. Stage use almost always wants minimum brightness so
// the screen doesn't blow out the singer's night vision or photobomb the
// audience. The styles below hardcode dark colors for that reason; do not
// "fix" them to read from ThemeContext. The badge colors still read from
// the theme palette so dark/light keep their visible distinction.
export default function LiveModeScreen({ navigation, route }) {
  const { width: screenWidth } = useWindowDimensions();
  const { setlistItems, setlistName } = route.params;
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const flatListRef = useRef(null);
  const timerRef = useRef(null);

  const items = setlistItems || [];

  // Hide header
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Auto-advance timer
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!autoAdvance || currentIndex >= items.length - 1) return;

    const currentItem = items[currentIndex];
    let durationSecs = 0;

    if (currentItem.type === 'SET_BREAK') {
      durationSecs = currentItem.duration || 15;
    } else if (currentItem.type === 'MC') {
      durationSecs = currentItem.duration || 60;
    } else if (currentItem.song?.duration) {
      durationSecs = currentItem.song.duration;
    }

    if (durationSecs > 0) {
      timerRef.current = setTimeout(() => {
        const nextIndex = currentIndex + 1;
        if (nextIndex < items.length) {
          setCurrentIndex(nextIndex);
          flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
        }
      }, durationSecs * 1000);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoAdvance, currentIndex, items]);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

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

  // Compute song counter label
  const songNumber = (() => {
    let count = 0;
    for (let i = 0; i <= currentIndex && i < items.length; i++) {
      const item = items[i];
      if (item.type === 'SONG' || (!item.type && item.song)) count++;
    }
    return count;
  })();
  const totalSongs = items.filter(i => i.type === 'SONG' || (!i.type && i.song)).length;

  const renderPage = useCallback(({ item }) => {
    // maxFontSizeMultiplier caps below are tuned for stage use: text still
    // scales for accessibility, but capped so titles + lyrics don't blow out
    // the layout at AX5. The global App.js default is 2.0× — too aggressive
    // for a 28pt song title that's already large.
    if (item.type === 'SET_BREAK') {
      return (
        <View style={[styles.page, { width: screenWidth }]}>
          <View style={styles.breakContainer}>
            <Ionicons name="musical-note" size={48} color="rgba(255,255,255,0.3)" style={{ marginBottom: 16 }} />
            <Text style={styles.breakLabel} maxFontSizeMultiplier={1.4}>{item.label || 'Break'}</Text>
            {item.duration ? (
              <Text style={styles.breakDuration} maxFontSizeMultiplier={1.4}>{formatDuration(item.duration)}</Text>
            ) : null}
          </View>
        </View>
      );
    }

    if (item.type === 'MC') {
      return (
        <View style={[styles.page, { width: screenWidth }]}>
          <View style={styles.breakContainer}>
            <Ionicons name="mic" size={48} color="rgba(255,255,255,0.3)" style={{ marginBottom: 16 }} />
            <Text style={styles.breakLabel} maxFontSizeMultiplier={1.4}>{item.label || 'MC'}</Text>
            {item.duration ? (
              <Text style={styles.breakDuration} maxFontSizeMultiplier={1.4}>{formatDuration(item.duration)}</Text>
            ) : null}
          </View>
        </View>
      );
    }

    // Song page
    const song = item.song;
    return (
      <View style={[styles.page, { width: screenWidth }]}>
        <View style={styles.songHeader}>
          <Text style={styles.songTitle} numberOfLines={2} maxFontSizeMultiplier={1.4}>{song?.title || 'Unknown'}</Text>
          {song?.artist ? (
            <Text style={styles.songArtist} numberOfLines={1} maxFontSizeMultiplier={1.4}>{song.artist}</Text>
          ) : null}
          <View style={styles.badgeRow}>
            {song?.key ? (
              <View style={[styles.badge, { backgroundColor: colors.badgeKeyBg }]}>
                <Text style={[styles.badgeText, { color: colors.badgeKey }]} maxFontSizeMultiplier={1.3}>{song.key}</Text>
              </View>
            ) : null}
            {song?.bpm ? (
              <View style={[styles.badge, { backgroundColor: colors.badgeBpmBg }]}>
                <Text style={[styles.badgeText, { color: colors.badgeBpm }]} maxFontSizeMultiplier={1.3}>{song.bpm} BPM</Text>
              </View>
            ) : null}
            {song?.duration ? (
              <View style={[styles.badge, { backgroundColor: colors.badgeDurationBg }]}>
                <Text style={[styles.badgeText, { color: colors.badgeDuration }]} maxFontSizeMultiplier={1.3}>{formatDuration(song.duration)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {song?.lyrics ? (
          <ScrollView style={styles.lyricsScroll} contentContainerStyle={styles.lyricsContent}>
            {/* Lyrics get a slightly more generous cap (1.6×) because they're
                the primary reading surface and large is usually what stage
                users want. */}
            <Text style={styles.lyricsText} maxFontSizeMultiplier={1.6}>
              {song.lyrics}
            </Text>
          </ScrollView>
        ) : (
          <View style={styles.noLyricsContainer}>
            <Text style={styles.noLyricsText} maxFontSizeMultiplier={1.4}>No lyrics available</Text>
          </View>
        )}
      </View>
    );
  }, [screenWidth]);

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Close button */}
      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + 10 }]}
        onPress={handleClose}
        accessibilityRole="button"
        accessibilityLabel="Close live mode"
      >
        <Ionicons name="close" size={22} color="#ffffff" />
      </TouchableOpacity>

      {/* Auto-advance toggle */}
      <TouchableOpacity
        style={[styles.autoButton, { top: insets.top + 10 }, autoAdvance && styles.autoButtonActive]}
        onPress={() => setAutoAdvance(prev => !prev)}
        accessibilityRole="button"
        accessibilityLabel={autoAdvance ? 'Disable auto-advance' : 'Enable auto-advance'}
      >
        <Text
          style={[styles.autoText, autoAdvance && styles.autoTextActive]}
          maxFontSizeMultiplier={1.3}
        >
          {autoAdvance ? 'AUTO ON' : 'AUTO'}
        </Text>
      </TouchableOpacity>

      {/* Setlist name */}
      <View style={[styles.titleBar, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.setlistTitle} numberOfLines={1} maxFontSizeMultiplier={1.4}>{setlistName}</Text>
      </View>

      {/* Pages */}
      <FlatList
        ref={flatListRef}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderPage}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: screenWidth,
          offset: screenWidth * index,
          index,
        })}
      />

      {/* Counter */}
      <View style={styles.counterBar}>
        <Text style={styles.counterText} maxFontSizeMultiplier={1.4}>
          {items[currentIndex]?.type === 'SET_BREAK'
            ? 'Break'
            : items[currentIndex]?.type === 'MC'
            ? 'MC'
            : `Song ${songNumber} of ${totalSongs}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  closeButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  autoButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    paddingHorizontal: 16,
    minHeight: 44,
    minWidth: 64,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  autoButtonActive: {
    backgroundColor: 'rgba(16,185,129,0.3)',
  },
  autoText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  autoTextActive: {
    color: '#10b981',
  },
  titleBar: {
    paddingBottom: 8,
    alignItems: 'center',
    paddingHorizontal: 60,
  },
  setlistTitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  page: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 60,
  },
  songHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  songTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  songArtist: {
    color: '#9ca3af',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  lyricsScroll: {
    flex: 1,
  },
  lyricsContent: {
    paddingBottom: 40,
  },
  lyricsText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 18,
    lineHeight: 27,
  },
  noLyricsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noLyricsText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 16,
  },
  breakContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  breakLabel: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  breakDuration: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 16,
  },
  counterBar: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  counterText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '600',
  },
});
