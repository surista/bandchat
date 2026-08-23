import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  AppState,
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
import { MC_DEFAULT_DURATION_SECS } from '../../utils/setlistDuration';
import { MIN_TOUCH_TARGET } from '../../utils/touchTarget';
import { mediumImpact, selectionFeedback, warningNotification } from '../../utils/haptics';

// The two controls here are the only ones on the screen, and they get used
// mid-song with a guitar in hand, so they are deliberately more generous than
// the platform minimum rather than exactly at it.
const STAGE_TOUCH_TARGET = Math.max(MIN_TOUCH_TARGET, 52);

// How long auto-advance holds a page. SET_BREAK/MC fall back to the same
// defaults the setlist totals use, so the timer and the printed running time
// never disagree.
function itemDurationSecs(item) {
  if (!item) return 0;
  if (item.type === 'SET_BREAK') return item.duration || 15;
  if (item.type === 'MC') return item.duration || MC_DEFAULT_DURATION_SECS;
  return item.song?.duration || 0;
}

// Countdown label. formatDuration() returns null at 0 (by design, so callers
// can fall back to a placeholder), which is not what a timer wants.
function formatRemaining(secs) {
  return formatDuration(secs) || '0:00';
}

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
  const [remainingSecs, setRemainingSecs] = useState(null);
  const flatListRef = useRef(null);
  const deadlineRef = useRef(null);
  const warnedRef = useRef(false);
  const advancedRef = useRef(false);

  const items = setlistItems || [];

  // Hide header
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const goToIndex = useCallback((index) => {
    if (index < 0 || index >= items.length) return;
    setCurrentIndex(index);
    flatListRef.current?.scrollToIndex({ index, animated: true });
  }, [items.length]);

  // Auto-advance timer.
  //
  // Deliberately an absolute deadline polled on an interval, not a setTimeout:
  // iOS suspends JS timers while the app is backgrounded, so a bare setTimeout
  // leaves the setlist stranded on whatever page it was showing when the phone
  // locked. Reconciling against Date.now() on AppState 'active' catches the
  // position back up instead.
  //
  // The interval also drives the on-screen countdown. Without it the page just
  // flipped out from under the performer with no warning — which got sharper
  // when the MC default dropped to 30s. Haptics do the same job for anyone
  // looking at the audience rather than the phone: a warning buzz at T-5s and
  // a medium impact on the advance itself.
  useEffect(() => {
    setRemainingSecs(null);
    deadlineRef.current = null;
    warnedRef.current = false;
    advancedRef.current = false;

    if (!autoAdvance || currentIndex >= items.length - 1) return;

    const durationSecs = itemDurationSecs(items[currentIndex]);
    if (durationSecs <= 0) return;

    deadlineRef.current = Date.now() + durationSecs * 1000;
    setRemainingSecs(durationSecs);

    const tick = () => {
      if (advancedRef.current) return;
      const left = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
      setRemainingSecs(left);
      if (left <= 5 && left > 0 && !warnedRef.current) {
        warnedRef.current = true;
        warningNotification();
      }
      if (left <= 0) {
        advancedRef.current = true;
        mediumImpact();
        goToIndex(currentIndex + 1);
      }
    };

    // 250ms so the countdown never visibly sticks on a second and the advance
    // lands close to the beat, without a per-frame cost.
    const intervalId = setInterval(tick, 250);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });

    return () => {
      clearInterval(intervalId);
      sub.remove();
    };
  }, [autoAdvance, currentIndex, items, goToIndex]);

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

  const counterLabel = items[currentIndex]?.type === 'SET_BREAK'
    ? 'Break'
    : items[currentIndex]?.type === 'MC'
      ? 'MC'
      : `Song ${songNumber} of ${totalSongs}`;

  const renderPage = useCallback(({ item }) => {
    // maxFontSizeMultiplier caps below are tuned for stage use: text still
    // scales for accessibility, but capped so titles + lyrics don't blow out
    // the layout at AX5. The global App.js default is 2.0× — too aggressive
    // for a 28pt song title that's already large.
    if (item.type === 'SET_BREAK') {
      return (
        <View style={[styles.page, { width: screenWidth, paddingBottom: 60 + insets.bottom }]}>
          <View
            style={styles.breakContainer}
            accessible
            accessibilityLabel={`Break: ${item.label || 'Break'}${item.duration ? `, ${formatDuration(item.duration)}` : ''}`}
          >
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
        <View style={[styles.page, { width: screenWidth, paddingBottom: 60 + insets.bottom }]}>
          <View
            style={styles.breakContainer}
            accessible
            accessibilityLabel={`M C: ${item.label || 'MC'}, ${formatDuration(item.duration || MC_DEFAULT_DURATION_SECS)}`}
          >
            <Ionicons name="mic" size={48} color="rgba(255,255,255,0.3)" style={{ marginBottom: 16 }} />
            <Text style={styles.breakLabel} maxFontSizeMultiplier={1.4}>{item.label || 'MC'}</Text>
            {/* Always show a time. Legacy and Slack-imported MC items have a
                null duration, and hiding the label there left the performer
                with no idea the screen was about to advance — auto-advance
                falls back to the same constant regardless. */}
            <Text style={styles.breakDuration} maxFontSizeMultiplier={1.4}>
              {formatDuration(item.duration || MC_DEFAULT_DURATION_SECS)}
            </Text>
          </View>
        </View>
      );
    }

    // Song page
    const song = item.song;
    return (
      <View style={[styles.page, { width: screenWidth, paddingBottom: 60 + insets.bottom }]}>
        <View
          style={styles.songHeader}
          accessible
          accessibilityLabel={[
            song?.title || 'Unknown',
            song?.artist,
            song?.key ? `key ${song.key}` : null,
            song?.bpm ? `${song.bpm} B P M` : null,
            song?.duration ? formatDuration(song.duration) : null,
          ].filter(Boolean).join(', ')}
        >
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
    // `colors` is read for the key/BPM/duration badges, so it has to be a
    // dependency — without it a theme change while Live Mode is open leaves
    // the badges painted in the old palette.
  }, [screenWidth, colors, insets.bottom]);

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
        onPress={() => {
          selectionFeedback();
          setAutoAdvance(prev => !prev);
        }}
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

      {/* Counter. accessibilityLiveRegion so VoiceOver/TalkBack announce the
          new position when auto-advance changes the page on its own. */}
      <View
        style={[styles.counterBar, { bottom: insets.bottom + 12 }]}
        accessibilityLiveRegion="polite"
      >
        <Text style={styles.counterText} maxFontSizeMultiplier={1.4}>
          {counterLabel}
          {remainingSecs != null ? `  ·  ${formatRemaining(remainingSecs)}` : ''}
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
    width: STAGE_TOUCH_TARGET,
    height: STAGE_TOUCH_TARGET,
    borderRadius: STAGE_TOUCH_TARGET / 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  autoButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    paddingHorizontal: 16,
    minHeight: STAGE_TOUCH_TARGET,
    minWidth: 72,
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
    // 0.7 alpha on #000 is ~11:1. The old 0.4 was 3.7:1 — under WCAG AA for
    // text below 18.66px, and this screen gets read in the dark from a
    // distance, which is exactly when marginal contrast stops working.
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  page: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    // Clears the absolutely-positioned counter bar; insets.bottom is added at
    // the call site so the home indicator is cleared too.
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
    color: 'rgba(255,255,255,0.65)',
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
    color: 'rgba(255,255,255,0.7)',
    // 20px, up from 16: this is the "how long have I got" number on the MC and
    // break pages, and it has to be readable at arm's length.
    fontSize: 20,
  },
  counterBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  counterText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
});
