import { memo, useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { View, Text, Pressable, Animated, Linking, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { useAnimatedStyle, interpolate, runOnJS } from 'react-native-reanimated';
import { Audio } from 'expo-av';
import { useVideoPlayer, VideoView } from 'expo-video';
import { format, isToday, isYesterday } from 'date-fns';
import { useTheme } from '../context/ThemeContext';
import { lightImpact } from '../utils/haptics';
import LinkPreview from './LinkPreview';
import getAvatarColor from '../utils/getAvatarColor';
import { CUSTOM_EMOJI, renderCustomEmoji } from './EmojiPicker';
import { buildMentionRegex, buildChannelRegex, buildGroupMentionRegex } from '../utils/parseMentions';
import { isSafeUrl } from '../utils/urlSafety';
import { MIN_TOUCH_TARGET } from '../utils/touchTarget';
import { useLayout } from '../hooks/useLayout';

const YT_REGEX = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/|m\.youtube\.com\/watch\?v=)([\w-]{11})/;

// 250ms on both platforms. The Material guidance says ~500ms, but real users
// experience that as "nothing happened" and lift — better to accept a few
// accidental triggers during scroll than have the primary interaction feel dead.
const LONG_PRESS_DELAY = 250;

function formatTimestamp(dateStr) {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday ' + format(date, 'h:mm a');
  return format(date, 'dd-MMM-yyyy, h:mm a');
}

function formatDurationMmSs(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const SWIPE_COOLDOWN = 500; // ms between swipe actions

const SWIPE_REACT_EMOJI = '\uD83D\uDC4D'; // 👍

const MessageBubble = forwardRef(function MessageBubble({ message, isGrouped, onLongPress, onReplyPress, onImagePress, onReactionPress, onReactionLongPress, onSwipeReply, onSwipeReact, onAvatarPress, members, isOwn, onTogglePreview, blockedDomains, onLinkLongPress, channels, onChannelPress }, ref) {
  const { colors, density } = useTheme();
  const { attachmentWidth, attachmentHeight } = useLayout();
  const swipeableRef = useRef(null);
  const lastSwipeTime = useRef(0);
  const author = message.author || {};
  const displayName = author.displayName || message.removedUserName || 'Deleted User';
  const initial = displayName.charAt(0).toUpperCase();
  const avatarColor = getAvatarColor(displayName);
  const isPending = message.pending;

  useImperativeHandle(ref, () => ({
    close: () => swipeableRef.current?.close(),
  }));

  // Resolve avatar: author's own avatarUrl, or fallback to workspace member's (includes BandMember)
  const resolvedAvatarUrl = useMemo(() => {
    if (author.avatarUrl) return author.avatarUrl;
    if (author.id && members) {
      const match = members.find(m => m.user?.id === author.id);
      return match?.user?.avatarUrl || null;
    }
    return null;
  }, [author.avatarUrl, author.id, members]);
  const isEdited = message.updatedAt && message.updatedAt !== message.createdAt;
  const [avatarError, setAvatarError] = useState(false);

  const handleLongPress = () => {
    if (!isPending && onLongPress) onLongPress(message);
  };
  // Ref tracks the latest handleLongPress closure. The gesture's useMemo
  // depends on message.id only so the gesture object is stable across
  // sibling updates (reactions, edits, pins all create a new `message`
  // reference), but the worklet still reaches the freshest handler. Without
  // this, every reaction add anywhere in the channel rebuilt every visible
  // bubble's gesture handler.
  const handleLongPressRef = useRef(handleLongPress);
  handleLongPressRef.current = handleLongPress;

  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(LONG_PRESS_DELAY)
        .maxDistance(10)
        .onStart(() => {
          'worklet';
          runOnJS(() => handleLongPressRef.current?.())();
        }),
    // Intentionally narrow deps to message.id — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [message.id]
  );

  // URL regex to match http/https URLs
  const URL_REGEX = /(https?:\/\/[^\s<>"\])}]+)/gi;

  /**
   * Render a text segment with @mention highlighting.
   * Group mentions (@channel/@here/@everyone) get a distinct warning-tinted style
   * so the broadcast nature is visually obvious.
   */
  const renderMentions = (text, keyPrefix) => {
    if (!text) return null;

    // First: pull out @channel/@here/@everyone group mentions
    const groupRegex = buildGroupMentionRegex();
    const groupParts = text.split(groupRegex);
    const afterGroup = [];
    for (let g = 0; g < groupParts.length; g += 3) {
      if (groupParts[g]) afterGroup.push(groupParts[g]);
      if (g + 2 < groupParts.length) {
        if (groupParts[g + 1]) afterGroup.push(groupParts[g + 1]);
        afterGroup.push(
          <Text
            key={`${keyPrefix}-g${g}`}
            style={{ color: '#f59e0b', fontWeight: '700' }}
            maxFontSizeMultiplier={1.5}
          >
            @{groupParts[g + 2].toLowerCase()}
          </Text>
        );
      }
    }

    // Then: per-user @mentions on remaining text fragments
    const mentionRegex = buildMentionRegex(members || []);
    if (!mentionRegex) return afterGroup;

    const result = [];
    for (let f = 0; f < afterGroup.length; f++) {
      const frag = afterGroup[f];
      if (typeof frag !== 'string') {
        result.push(frag);
        continue;
      }
      const parts = frag.split(mentionRegex);
      for (let j = 0; j < parts.length; j += 3) {
        if (parts[j]) result.push(parts[j]);
        if (j + 2 < parts.length) {
          if (parts[j + 1]) result.push(parts[j + 1]);
          result.push(
            <Text key={`${keyPrefix}-m${f}-${j}`} style={{ color: colors.primary, fontWeight: '600' }} maxFontSizeMultiplier={1.5}>
              @{parts[j + 2]}
            </Text>
          );
        }
      }
    }
    return result;
  };

  /**
   * Render a text segment with #channel reference highlighting.
   */
  const renderChannelRefs = (fragments, keyPrefix) => {
    const channelRegex = (channels && channels.length > 0) ? buildChannelRegex(channels) : null;
    if (!channelRegex) return fragments;
    const result = [];
    for (let i = 0; i < fragments.length; i++) {
      const fragment = fragments[i];
      if (typeof fragment !== 'string') {
        result.push(fragment);
        continue;
      }
      channelRegex.lastIndex = 0;
      const chParts = fragment.split(channelRegex);
      for (let k = 0; k < chParts.length; k += 3) {
        if (chParts[k]) result.push(chParts[k]);
        if (k + 2 < chParts.length) {
          if (chParts[k + 1]) result.push(chParts[k + 1]);
          const chName = chParts[k + 2];
          const matchedChannel = channels.find(c => c.name === chName);
          result.push(
            <Text
              key={`${keyPrefix}-ch${i}-${k}`}
              style={{ color: colors.primary, fontWeight: '600' }}
              onPress={() => matchedChannel && onChannelPress?.(matchedChannel)}
            maxFontSizeMultiplier={1.5}>
              #{chName}
            </Text>
          );
        }
      }
    }
    return result;
  };

  /**
   * Apply inline markdown formatting to text fragments.
   * Handles: **bold**, *italic*, ~~strikethrough~~, `code`
   */
  const renderMarkdown = (fragments, keyPrefix) => {
    // Combined regex: code must come first (to avoid nested parsing inside code spans)
    const mdRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~)/;
    const result = [];
    let keyIdx = 0;

    for (const fragment of fragments) {
      if (typeof fragment !== 'string') {
        result.push(fragment);
        continue;
      }

      const mdParts = fragment.split(mdRegex);
      for (const mdPart of mdParts) {
        if (!mdPart) continue;
        const k = `${keyPrefix}-md${keyIdx++}`;

        if (mdPart.startsWith('`') && mdPart.endsWith('`') && mdPart.length > 2) {
          result.push(
            <Text key={k} style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 3 }} maxFontSizeMultiplier={1.5}>
              {mdPart.slice(1, -1)}
            </Text>
          );
        } else if (mdPart.startsWith('**') && mdPart.endsWith('**') && mdPart.length > 4) {
          result.push(<Text key={k} style={{ fontWeight: '700' }} maxFontSizeMultiplier={1.5}>{mdPart.slice(2, -2)}</Text>);
        } else if (mdPart.startsWith('*') && mdPart.endsWith('*') && mdPart.length > 2) {
          result.push(<Text key={k} style={{ fontStyle: 'italic' }} maxFontSizeMultiplier={1.5}>{mdPart.slice(1, -1)}</Text>);
        } else if (mdPart.startsWith('~~') && mdPart.endsWith('~~') && mdPart.length > 4) {
          result.push(<Text key={k} style={{ textDecorationLine: 'line-through', opacity: 0.7 }} maxFontSizeMultiplier={1.5}>{mdPart.slice(2, -2)}</Text>);
        } else {
          result.push(mdPart);
        }
      }
    }
    return result;
  };

  /**
   * Render message content with clickable URLs, @mentions, #channels, and markdown.
   */
  const renderContent = (text) => {
    if (!text) return null;

    // Split text by URLs while keeping the URLs in the result
    const parts = text.split(URL_REGEX);
    const result = [];

    parts.forEach((part, i) => {
      if (!part) return;

      // Check if this part is a URL
      if (URL_REGEX.test(part)) {
        // Reset regex lastIndex after test
        URL_REGEX.lastIndex = 0;

        if (isSafeUrl(part)) {
          result.push(
            <Text
              key={`url-${i}`}
              style={{ color: colors.primary, textDecorationLine: 'underline' }}
              onPress={() => Linking.openURL(part).catch(() => {})}
            maxFontSizeMultiplier={1.5}>
              {part}
            </Text>
          );
        } else {
          // Not a safe URL, render as plain text
          result.push(part);
        }
      } else {
        // Not a URL, apply mention highlighting, then channel references, then markdown
        const mentionResult = renderMentions(part, `p${i}`);
        const mentionFragments = Array.isArray(mentionResult) ? mentionResult : mentionResult ? [mentionResult] : [];
        const withChannels = renderChannelRefs(mentionFragments, `p${i}`);
        const withMarkdown = renderMarkdown(withChannels, `p${i}`);
        result.push(...withMarkdown);
      }
    });

    return result.length > 0 ? result : text;
  };

  const renderLeftActions = (_progress, drag) => (
    <LeftAction drag={drag} />
  );

  const renderRightActions = (_progress, drag) => (
    <RightAction drag={drag} />
  );

  const handleSwipeOpen = (direction) => {
    const now = Date.now();
    if (now - lastSwipeTime.current < SWIPE_COOLDOWN) {
      swipeableRef.current?.close();
      return;
    }
    lastSwipeTime.current = now;

    if (direction === 'right' && onSwipeReply && !isPending) {
      lightImpact();
      onSwipeReply(message);
    } else if (direction === 'left' && onSwipeReact && !isPending) {
      lightImpact();
      onSwipeReact(message.id, SWIPE_REACT_EMOJI);
    }
    // Small delay before closing so user sees the action panel
    setTimeout(() => swipeableRef.current?.close(), 150);
  };

  const swipeEnabled = !isPending && (!!onSwipeReply || !!onSwipeReact);

  if (isGrouped) {
    return (
      <ReanimatedSwipeable
        ref={swipeableRef}
        enabled={swipeEnabled}
        renderLeftActions={onSwipeReply ? renderLeftActions : undefined}
        renderRightActions={onSwipeReact ? renderRightActions : undefined}
        onSwipeableWillOpen={handleSwipeOpen}
        overshootLeft={false}
        overshootRight={false}
        friction={2}
        leftThreshold={30}
        rightThreshold={30}
      >
      <GestureDetector gesture={longPressGesture}>
        <View
          style={[styles.groupedContainer, { paddingTop: density.groupedPaddingTop, paddingBottom: density.groupedPaddingBottom }, isPending && styles.pending]}
          accessibilityRole="button"
          accessibilityLabel={`Message: ${message.content || 'attachment'}`}
        >
          <View style={{ width: density.groupedSpacerWidth }} />
          <View style={styles.contentContainer}>
            {message.content ? (
              <Text style={[styles.content, { color: colors.textPrimary, fontSize: density.contentFontSize, lineHeight: density.contentLineHeight }]} maxFontSizeMultiplier={1.6}>
                {renderContent(message.content)}
                {isEdited && <Text style={[styles.edited, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.2}> (edited)</Text>}
              </Text>
            ) : null}
            <YouTubeThumbnail content={message.content} colors={colors} />
            {message.content && !message.hidePreview && !YT_REGEX.test(message.content) ? <LinkPreview content={message.content} isOwn={isOwn} onDismiss={onTogglePreview ? () => onTogglePreview(message.id) : undefined} blockedDomains={blockedDomains} onLongPress={onLinkLongPress} /> : null}
            {renderAttachments(message.attachments, onImagePress, attachmentWidth, attachmentHeight, handleLongPress)}
            {renderReactions(message.reactions, colors, message.id, onReactionPress, onReactionLongPress)}
          </View>
        </View>
      </GestureDetector>
      </ReanimatedSwipeable>
    );
  }

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      enabled={swipeEnabled}
      renderLeftActions={onSwipeReply ? renderLeftActions : undefined}
      renderRightActions={onSwipeReact ? renderRightActions : undefined}
      onSwipeableWillOpen={handleSwipeOpen}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
      leftThreshold={30}
      rightThreshold={30}
    >
    <GestureDetector gesture={longPressGesture}>
    <View
      style={[styles.container, { paddingTop: density.containerPaddingTop, paddingBottom: density.containerPaddingBottom }, isPending && styles.pending]}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}: ${message.content || 'attachment'}`}
    >
      <Pressable
        style={({ pressed }) => [
          styles.avatar,
          { backgroundColor: avatarColor, width: density.avatarSize, height: density.avatarSize },
          pressed && Platform.OS === 'ios' && author.id && onAvatarPress && { opacity: 0.6 },
        ]}
        onPress={() => author.id && onAvatarPress?.(author)}
        android_ripple={author.id && onAvatarPress ? { color: 'rgba(255,255,255,0.2)', borderless: true } : null}
        disabled={!author.id || !onAvatarPress}
        accessibilityRole="button"
        accessibilityLabel={`View ${displayName} profile`}
      >
        {resolvedAvatarUrl && !avatarError ? (
          <Image
            source={{ uri: resolvedAvatarUrl }}
            style={[styles.avatarImage, { width: density.avatarSize, height: density.avatarSize }]}
            accessibilityLabel={`${displayName} avatar`}
            onError={() => setAvatarError(true)}
          />
        ) : (
          <Text style={[styles.avatarText, { fontSize: density.avatarSize * 0.42 }]} maxFontSizeMultiplier={1.2}>{initial}</Text>
        )}
      </Pressable>
      <View style={styles.contentContainer}>
        <View style={styles.header}>
          <Text style={[styles.authorName, { color: colors.textPrimary, fontSize: density.authorFontSize }]} maxFontSizeMultiplier={1.6}>
            {displayName}
          </Text>
          <Text style={[styles.timestamp, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.2}>
            {formatTimestamp(message.createdAt)}
          </Text>
        </View>
        {message.content ? (
          <Text style={[styles.content, { color: colors.textPrimary, fontSize: density.contentFontSize, lineHeight: density.contentLineHeight }]} maxFontSizeMultiplier={1.6}>
            {renderContent(message.content)}
            {isEdited && <Text style={[styles.edited, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.2}> (edited)</Text>}
          </Text>
        ) : null}
        <YouTubeThumbnail content={message.content} colors={colors} />
        {message.content && !message.hidePreview && !YT_REGEX.test(message.content) ? <LinkPreview content={message.content} isOwn={isOwn} onDismiss={onTogglePreview ? () => onTogglePreview(message.id) : undefined} blockedDomains={blockedDomains} onLongPress={onLinkLongPress} /> : null}
        {renderAttachments(message.attachments, onImagePress, attachmentWidth, attachmentHeight, handleLongPress)}
        {renderReactions(message.reactions, colors, message.id, onReactionPress, onReactionLongPress)}
        {message._count?.replies > 0 && (
          <Pressable
            onPress={() => onReplyPress?.(message)}
            style={({ pressed }) => [
              { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
              pressed && Platform.OS === 'ios' && { opacity: 0.6 },
            ]}
            android_ripple={{ color: colors.border, borderless: true }}
            accessibilityRole="button"
            accessibilityLabel={`${message._count.replies} ${message._count.replies === 1 ? 'reply' : 'replies'}, view thread`}
          >
            <Text style={[styles.replyCount, { color: colors.primary }]} maxFontSizeMultiplier={1.3}>
              {message._count.replies} {message._count.replies === 1 ? 'reply' : 'replies'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
    </GestureDetector>
    </ReanimatedSwipeable>
  );
});

function YouTubeThumbnail({ content, colors }) {
  if (!content) return null;
  const urls = content.match(/(https?:\/\/[^\s]+)/g);
  if (!urls) return null;

  const ytEmbeds = [];
  for (const url of urls) {
    const match = url.match(YT_REGEX);
    if (match) ytEmbeds.push({ videoId: match[1], url });
  }
  if (ytEmbeds.length === 0) return null;

  return ytEmbeds.map(({ videoId, url }) => (
    <Pressable
      key={videoId}
      style={({ pressed }) => [
        ytStyles.container,
        pressed && Platform.OS === 'ios' && { opacity: 0.8 },
      ]}
      onPress={() => Linking.openURL(url).catch(() => {})}
      android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
      accessibilityRole="link"
      accessibilityLabel="Open YouTube video"
    >
      <Image
        source={{ uri: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` }}
        style={ytStyles.thumbnail}
        contentFit="cover"
        accessible={false}
      />
      <View style={ytStyles.playOverlay}>
        <View style={ytStyles.playButton}>
          <Text style={ytStyles.playIcon} maxFontSizeMultiplier={1.5}>{'\u25B6'}</Text>
        </View>
      </View>
    </Pressable>
  ));
}

const ytStyles = StyleSheet.create({
  container: {
    marginTop: 6,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    color: '#ffffff',
    fontSize: 20,
    marginLeft: 3,
  },
});

function renderAttachments(attachments, onImagePress, imgWidth, imgHeight, onLongPressImage) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <View>
      {attachments.filter(att => att.url).map(att => {
        if (att.type === 'IMAGE') {
          return (
            <Pressable
              key={att.id}
              onPress={() => onImagePress?.(att.url)}
              onLongPress={onLongPressImage}
              delayLongPress={400}
              style={({ pressed }) => [pressed && Platform.OS === 'ios' && { opacity: 0.8 }]}
              android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
              accessibilityRole="button"
              accessibilityLabel="View attached image"
            >
              <Image
                source={{ uri: att.thumbnailUrl || att.url }}
                style={[styles.attachmentImage, { width: imgWidth, height: imgHeight }]}
                contentFit="cover"
                accessibilityLabel="Attached image"
              />
            </Pressable>
          );
        }
        if (att.type === 'VIDEO') {
          return <VideoAttachment key={att.id} url={att.url} />;
        }
        if (att.type === 'AUDIO') {
          return <AudioAttachment key={att.id} url={att.url} filename={att.filename} />;
        }
        if (att.type === 'DOCUMENT') {
          return <DocumentAttachment key={att.id} url={att.url} filename={att.filename} />;
        }
        return null;
      })}
    </View>
  );
}

function VideoAttachment({ url }) {
  // expo-video replaces deprecated expo-av Video. Native controls (fullscreen,
  // AirPlay/PiP, scrubber) are first-class and reliable; the legacy expo-av
  // Video had broken fullscreen/AirPlay buttons on SDK 54+.
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return (
    <View style={styles.videoContainer}>
      <VideoView
        player={player}
        style={styles.videoPlayer}
        contentFit="contain"
        nativeControls
        allowsFullscreen
        allowsPictureInPicture
      />
    </View>
  );
}

// Generate stable faux waveform bar heights
function generateWaveformBars(count) {
  const bars = [];
  for (let i = 0; i < count; i++) {
    // Use a deterministic pattern that looks organic
    const h = 0.2 + 0.8 * Math.abs(Math.sin(i * 0.7 + 1.3) * Math.cos(i * 0.4 + 0.8));
    bars.push(h);
  }
  return bars;
}

function DocumentAttachment({ url, filename }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', padding: 8, marginTop: 4, borderRadius: 8, backgroundColor: colors.bgTertiary },
        pressed && Platform.OS === 'ios' && { opacity: 0.7 },
      ]}
      android_ripple={{ color: colors.border }}
      accessibilityLabel={`Document: ${filename}`}
      accessibilityRole="link"
    >
      <Ionicons name="document-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
      <Text style={{ color: colors.primary, fontSize: 14, flex: 1 }} numberOfLines={1} maxFontSizeMultiplier={1.5}>{filename}</Text>
    </Pressable>
  );
}

// Module-level registry so only one AudioAttachment plays at a time.
// When any player starts, it broadcasts; every other player that's currently
// playing pauses + sets its own UI state. iOS HIG (and common sense) expects
// one-at-a-time audio playback when multiple voice messages are on screen.
const audioPauseListeners = new Set();
function broadcastAudioPlay(playerId) {
  for (const fn of audioPauseListeners) {
    fn(playerId);
  }
}

function AudioAttachment({ url, filename }) {
  const { colors } = useTheme();
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(null);
  const soundRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const waveformBars = useMemo(() => generateWaveformBars(24), []);
  // Stable identity used by the pause-others broadcast so a player doesn't
  // pause itself when it announces its own start.
  const playerIdRef = useRef({});

  useEffect(() => {
    const listener = (startedBy) => {
      if (startedBy === playerIdRef.current) return;
      if (soundRef.current) {
        soundRef.current.pauseAsync().catch(() => {});
      }
      setPlaying(false);
    };
    audioPauseListeners.add(listener);
    return () => {
      audioPauseListeners.delete(listener);
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);
  // Update progress animation
  useEffect(() => {
    if (duration > 0) {
      const progress = position / duration;
      Animated.timing(progressAnim, {
        toValue: progress,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  }, [position, duration, progressAnim]);

  const togglePlay = async () => {
    if (playing && sound) {
      await sound.pauseAsync();
      setPlaying(false);
    } else if (sound) {
      broadcastAudioPlay(playerIdRef.current);
      await sound.playAsync();
      setPlaying(true);
    } else {
      try {
        broadcastAudioPlay(playerIdRef.current);
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded) {
              setDuration(status.durationMillis || 0);
              setPosition(status.positionMillis || 0);
              if (status.didJustFinish) {
                setPlaying(false);
                setPosition(0);
              }
            }
          }
        );
        soundRef.current = newSound;
        setSound(newSound);
        setPlaying(true);
      } catch (err) {
        // silently fail
      }
    }
  };

  const isVoice = filename?.startsWith('voice-') || filename?.includes('voice');
  const displayDuration = duration > 0 ? formatDurationMmSs(duration) : '0:00';
  const displayPosition = position > 0 ? formatDurationMmSs(position) : '0:00';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.audioContainer,
        { backgroundColor: colors.bgTertiary },
        pressed && Platform.OS === 'ios' && { opacity: 0.7 },
      ]}
      onPress={togglePlay}
      android_ripple={{ color: colors.border }}
      accessibilityRole="button"
      accessibilityLabel={`${playing ? 'Pause' : 'Play'} audio ${filename || ''}, duration ${displayDuration}`}
    >
      <Ionicons name={playing ? 'pause' : 'play'} size={18} color={colors.textPrimary} style={styles.audioIcon} />
      <View style={styles.audioDetails}>
        {/* Waveform visualization */}
        <View style={styles.waveformContainer}>
          {waveformBars.map((h, i) => {
            const barProgress = duration > 0 ? position / duration : 0;
            const barThreshold = i / waveformBars.length;
            const isActive = barThreshold < barProgress;
            return (
              <View
                key={i}
                style={[
                  styles.waveformBar,
                  {
                    height: 4 + h * 16,
                    backgroundColor: isActive ? colors.primary : (colors.textSecondary + '40'),
                  },
                ]}
              />
            );
          })}
        </View>
        {/* Duration / position */}
        <View style={styles.audioDurationRow}>
          <Text style={[styles.audioDuration, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.2}>
            {playing ? displayPosition : displayDuration}
          </Text>
          {!isVoice && filename ? (
            <Text style={[styles.audioFilenameSmall, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {filename}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function renderReactions(reactions, colors, messageId, onReactionPress, onReactionLongPress) {
  if (!reactions || reactions.length === 0) return null;

  const grouped = {};
  reactions.forEach(r => {
    if (!grouped[r.emoji]) grouped[r.emoji] = 0;
    grouped[r.emoji]++;
  });

  return (
    <View style={styles.reactionsRow}>
      {Object.entries(grouped).map(([emoji, count]) => (
        <Pressable
          key={emoji}
          style={({ pressed }) => [
            styles.reactionBadge,
            { backgroundColor: colors.bgTertiary },
            pressed && Platform.OS === 'ios' && { opacity: 0.6 },
          ]}
          onPress={() => onReactionPress?.(messageId, emoji)}
          onLongPress={() => onReactionLongPress?.(reactions, emoji)}
          delayLongPress={300}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          android_ripple={{ color: colors.border, borderless: true }}
          accessibilityRole="button"
          accessibilityLabel={`${emoji} reaction, ${count} ${count === 1 ? 'person' : 'people'}. Long press to see who reacted.`}
          accessibilityHint="Long press to see who reacted"
        >
          {CUSTOM_EMOJI[emoji] ? renderCustomEmoji(emoji, 16) : <Text style={styles.reactionEmoji} maxFontSizeMultiplier={1.2}>{emoji}</Text>}
          <Text style={[styles.reactionCount, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.2}>{count}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function LeftAction({ drag }) {
  const { colors } = useTheme();
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drag.value, [0, 60], [-60, 0], 'clamp') }],
  }));
  return (
    <Reanimated.View style={[swipeStyles.leftAction, { backgroundColor: colors.primary }, animatedStyle]}>
      <Ionicons name="chatbubble" size={20} color="#fff" />
      <Text style={swipeStyles.actionLabel} maxFontSizeMultiplier={1.2}>Reply</Text>
    </Reanimated.View>
  );
}

function RightAction({ drag }) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drag.value, [0, -60], [60, 0], 'clamp') }],
  }));
  return (
    <Reanimated.View style={[swipeStyles.rightAction, animatedStyle]}>
      <Ionicons name="thumbs-up" size={20} color="#fff" />
      <Text style={swipeStyles.actionLabel} maxFontSizeMultiplier={1.2}>Like</Text>
    </Reanimated.View>
  );
}

const swipeStyles = StyleSheet.create({
  leftAction: {
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  rightAction: {
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f59e0b',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
});

export default memo(MessageBubble);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  groupedContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 1,
    paddingBottom: 1,
  },
  pending: {
    opacity: 0.5,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  groupedSpacer: {
    width: 46,
  },
  contentContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  authorName: {
    fontSize: 15,
    fontWeight: '700',
    marginRight: 8,
  },
  timestamp: {
    fontSize: 12,
  },
  content: {
    fontSize: 15,
    lineHeight: 21,
  },
  edited: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  attachmentImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginTop: 6,
  },
  videoContainer: {
    width: 260,
    height: 180,
    borderRadius: 8,
    marginTop: 6,
    overflow: 'hidden',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 6,
    maxWidth: 260,
  },
  audioIcon: {
    marginRight: 10,
  },
  audioDetails: {
    flex: 1,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    gap: 2,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
    minHeight: 4,
  },
  audioDurationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  audioDuration: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  audioFilenameSmall: {
    fontSize: 11,
    flex: 1,
    marginLeft: 8,
    textAlign: 'right',
  },
  audioFilename: {
    fontSize: 14,
    flex: 1,
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: MIN_TOUCH_TARGET,
  },
  reactionEmoji: {
    fontSize: 14,
    marginRight: 3,
  },
  reactionCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  replyCount: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
});
