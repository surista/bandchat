import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDuration } from '../../utils/formatDuration';

export default function LiveModeScreen({ navigation, route }) {
  const { width: screenWidth } = useWindowDimensions();
  const { setlistItems, setlistName } = route.params;
  useKeepAwake();
  const insets = useSafeAreaInsets();

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
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

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
    if (item.type === 'SET_BREAK') {
      return (
        <View style={[styles.page, { width: screenWidth }]}>
          <View style={styles.breakContainer}>
            <Text style={styles.breakIcon}>&#9835;</Text>
            <Text style={styles.breakLabel}>{item.label || 'Break'}</Text>
            {item.duration ? (
              <Text style={styles.breakDuration}>{formatDuration(item.duration)}</Text>
            ) : null}
          </View>
        </View>
      );
    }

    if (item.type === 'MC') {
      return (
        <View style={[styles.page, { width: screenWidth }]}>
          <View style={styles.breakContainer}>
            <Text style={styles.mcIcon}>{'\uD83C\uDFA4'}</Text>
            <Text style={styles.breakLabel}>{item.label || 'MC'}</Text>
            {item.duration ? (
              <Text style={styles.breakDuration}>{formatDuration(item.duration)}</Text>
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
          <Text style={styles.songTitle} numberOfLines={2}>{song?.title || 'Unknown'}</Text>
          {song?.artist ? (
            <Text style={styles.songArtist} numberOfLines={1}>{song.artist}</Text>
          ) : null}
          <View style={styles.badgeRow}>
            {song?.key ? (
              <View style={[styles.badge, { backgroundColor: 'rgba(192,132,252,0.2)' }]}>
                <Text style={[styles.badgeText, { color: '#c084fc' }]}>{song.key}</Text>
              </View>
            ) : null}
            {song?.bpm ? (
              <View style={[styles.badge, { backgroundColor: 'rgba(96,165,250,0.2)' }]}>
                <Text style={[styles.badgeText, { color: '#60a5fa' }]}>{song.bpm} BPM</Text>
              </View>
            ) : null}
            {song?.duration ? (
              <View style={[styles.badge, { backgroundColor: 'rgba(156,163,175,0.2)' }]}>
                <Text style={[styles.badgeText, { color: '#9ca3af' }]}>{formatDuration(song.duration)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {song?.lyrics ? (
          <ScrollView style={styles.lyricsScroll} contentContainerStyle={styles.lyricsContent}>
            <Text style={[styles.lyricsText, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>
              {song.lyrics}
            </Text>
          </ScrollView>
        ) : (
          <View style={styles.noLyricsContainer}>
            <Text style={styles.noLyricsText}>No lyrics available</Text>
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
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Close live mode"
      >
        <Text style={styles.closeText}>{'\u2715'}</Text>
      </TouchableOpacity>

      {/* Auto-advance toggle */}
      <TouchableOpacity
        style={[styles.autoButton, { top: insets.top + 10 }, autoAdvance && styles.autoButtonActive]}
        onPress={() => setAutoAdvance(prev => !prev)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={autoAdvance ? 'Disable auto-advance' : 'Enable auto-advance'}
      >
        <Text style={[styles.autoText, autoAdvance && styles.autoTextActive]}>
          {autoAdvance ? 'AUTO ON' : 'AUTO'}
        </Text>
      </TouchableOpacity>

      {/* Setlist name */}
      <View style={[styles.titleBar, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.setlistTitle} numberOfLines={1}>{setlistName}</Text>
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
        <Text style={styles.counterText}>
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  autoButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
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
    fontWeight: '800',
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
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    lineHeight: 22,
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
  breakIcon: {
    fontSize: 48,
    color: 'rgba(255,255,255,0.3)',
    marginBottom: 16,
  },
  mcIcon: {
    fontSize: 48,
    marginBottom: 16,
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
