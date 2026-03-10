import { memo, useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { View, Text, Image, TouchableOpacity, Pressable, Animated, Linking, StyleSheet } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, { useAnimatedStyle, interpolate } from 'react-native-reanimated';
import { Video, ResizeMode } from 'expo-av';
import { format, isToday, isYesterday } from 'date-fns';
import { useTheme } from '../context/ThemeContext';
import LinkPreview from './LinkPreview';
import getAvatarColor from '../utils/getAvatarColor';
import { buildMentionRegex } from '../utils/parseMentions';

const YT_REGEX = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/|m\.youtube\.com\/watch\?v=)([\w-]{11})/;

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

const MessageBubble = forwardRef(function MessageBubble({ message, isGrouped, onLongPress, onReplyPress, onImagePress, onReactionPress, onSwipeReply, onSwipeReact, onAvatarPress, members }, ref) {
  const { colors, density } = useTheme();
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

  const renderContent = (text) => {
    if (!text) return null;
    const mentionRegex = buildMentionRegex(members || []);
    if (!mentionRegex) return text;
    const parts = text.split(mentionRegex);
    const result = [];
    for (let j = 0; j < parts.length; j += 3) {
      if (parts[j]) result.push(parts[j]);
      if (j + 2 < parts.length) {
        if (parts[j + 1]) result.push(parts[j + 1]);
        result.push(
          <Text key={j} style={{ color: colors.primary, fontWeight: '600' }}>
            @{parts[j + 2]}
          </Text>
        );
      }
    }
    return result;
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

    if (direction === 'left' && onSwipeReply && !isPending) {
      onSwipeReply(message);
    } else if (direction === 'right' && onSwipeReact && !isPending) {
      onSwipeReact(message.id, '👍');
    }
    swipeableRef.current?.close();
  };

  const swipeEnabled = !isPending && (onSwipeReply || onSwipeReact);

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
        friction={2.5}
        leftThreshold={40}
        rightThreshold={40}
      >
      <Pressable
        style={[styles.groupedContainer, { paddingTop: density.groupedPaddingTop, paddingBottom: density.groupedPaddingBottom }, isPending && styles.pending]}
        onLongPress={handleLongPress}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={`Message: ${message.content || 'attachment'}`}
      >
        <View style={{ width: density.groupedSpacerWidth }} />
        <View style={styles.contentContainer}>
          {message.content ? (
            <Text style={[styles.content, { color: colors.textPrimary, fontSize: density.contentFontSize, lineHeight: density.contentLineHeight }]}>
              {renderContent(message.content)}
              {isEdited && <Text style={[styles.edited, { color: colors.textSecondary }]}> (edited)</Text>}
            </Text>
          ) : null}
          <YouTubeThumbnail content={message.content} colors={colors} />
          {message.content && !YT_REGEX.test(message.content) ? <LinkPreview content={message.content} /> : null}
          {renderAttachments(message.attachments, onImagePress)}
          {renderReactions(message.reactions, colors, message.id, onReactionPress)}
        </View>
      </Pressable>
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
      friction={2.5}
      leftThreshold={40}
      rightThreshold={40}
    >
    <Pressable
      style={[styles.container, { paddingTop: density.containerPaddingTop, paddingBottom: density.containerPaddingBottom }, isPending && styles.pending]}
      onLongPress={handleLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}: ${message.content || 'attachment'}`}
    >
      <TouchableOpacity
        style={[styles.avatar, { backgroundColor: avatarColor, width: density.avatarSize, height: density.avatarSize }]}
        onPress={() => author.id && onAvatarPress?.(author)}
        activeOpacity={author.id && onAvatarPress ? 0.6 : 1}
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
          <Text style={[styles.avatarText, { fontSize: density.avatarSize * 0.42 }]}>{initial}</Text>
        )}
      </TouchableOpacity>
      <View style={styles.contentContainer}>
        <View style={styles.header}>
          <Text style={[styles.authorName, { color: colors.textPrimary, fontSize: density.authorFontSize }]}>
            {displayName}
          </Text>
          <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
            {formatTimestamp(message.createdAt)}
          </Text>
        </View>
        {message.content ? (
          <Text style={[styles.content, { color: colors.textPrimary, fontSize: density.contentFontSize, lineHeight: density.contentLineHeight }]}>
            {renderContent(message.content)}
            {isEdited && <Text style={[styles.edited, { color: colors.textSecondary }]}> (edited)</Text>}
          </Text>
        ) : null}
        <YouTubeThumbnail content={message.content} colors={colors} />
        {message.content && !YT_REGEX.test(message.content) ? <LinkPreview content={message.content} /> : null}
        {renderAttachments(message.attachments, onImagePress)}
        {renderReactions(message.reactions, colors, message.id, onReactionPress)}
        {message._count?.replies > 0 && (
          <TouchableOpacity onPress={() => onReplyPress?.(message)} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel={`${message._count.replies} ${message._count.replies === 1 ? 'reply' : 'replies'}, view thread`}>
            <Text style={[styles.replyCount, { color: colors.primary }]}>
              {message._count.replies} {message._count.replies === 1 ? 'reply' : 'replies'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Pressable>
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
    <TouchableOpacity
      key={videoId}
      style={ytStyles.container}
      onPress={() => Linking.openURL(url).catch(() => {})}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` }}
        style={ytStyles.thumbnail}
        resizeMode="cover"
      />
      <View style={ytStyles.playOverlay}>
        <View style={ytStyles.playButton}>
          <Text style={ytStyles.playIcon}>{'\u25B6'}</Text>
        </View>
      </View>
    </TouchableOpacity>
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

function renderAttachments(attachments, onImagePress) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <View>
      {attachments.filter(att => att.url).map(att => {
        if (att.type === 'IMAGE') {
          return (
            <TouchableOpacity
              key={att.id}
              onPress={() => onImagePress?.(att.url)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="View attached image"
            >
              <Image
                source={{ uri: att.thumbnailUrl || att.url }}
                style={styles.attachmentImage}
                resizeMode="cover"
                accessibilityLabel="Attached image"
              />
            </TouchableOpacity>
          );
        }
        if (att.type === 'VIDEO') {
          return <VideoAttachment key={att.id} url={att.url} />;
        }
        if (att.type === 'AUDIO') {
          return <AudioAttachment key={att.id} url={att.url} filename={att.filename} />;
        }
        return null;
      })}
    </View>
  );
}

function VideoAttachment({ url }) {
  const { colors } = useTheme();
  return (
    <View style={styles.videoContainer}>
      <Video
        source={{ uri: url }}
        style={styles.videoPlayer}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        isLooping={false}
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

function AudioAttachment({ url, filename }) {
  const { colors } = useTheme();
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(null);
  const soundRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const waveformBars = useMemo(() => generateWaveformBars(24), []);

  useEffect(() => {
    return () => {
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
      await sound.playAsync();
      setPlaying(true);
    } else {
      try {
        const { Audio } = require('expo-av');
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
    <TouchableOpacity
      style={[styles.audioContainer, { backgroundColor: colors.bgTertiary }]}
      onPress={togglePlay}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${playing ? 'Pause' : 'Play'} audio ${filename || ''}, duration ${displayDuration}`}
    >
      <Text style={styles.audioIcon}>{playing ? '\u23F8' : '\u25B6\uFE0F'}</Text>
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
          <Text style={[styles.audioDuration, { color: colors.textSecondary }]}>
            {playing ? displayPosition : displayDuration}
          </Text>
          {!isVoice && filename ? (
            <Text style={[styles.audioFilenameSmall, { color: colors.textSecondary }]} numberOfLines={1}>
              {filename}
            </Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function renderReactions(reactions, colors, messageId, onReactionPress) {
  if (!reactions || reactions.length === 0) return null;

  const grouped = {};
  reactions.forEach(r => {
    if (!grouped[r.emoji]) grouped[r.emoji] = 0;
    grouped[r.emoji]++;
  });

  return (
    <View style={styles.reactionsRow}>
      {Object.entries(grouped).map(([emoji, count]) => (
        <TouchableOpacity
          key={emoji}
          style={[styles.reactionBadge, { backgroundColor: colors.bgTertiary }]}
          onPress={() => onReactionPress?.(messageId, emoji)}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={`${emoji} reaction, ${count} ${count === 1 ? 'person' : 'people'}`}
        >
          <Text style={styles.reactionEmoji}>{emoji}</Text>
          <Text style={[styles.reactionCount, { color: colors.textSecondary }]}>{count}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function LeftAction({ drag }) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drag.value, [0, 60], [-60, 0], 'clamp') }],
  }));
  return (
    <Reanimated.View style={[swipeStyles.leftAction, animatedStyle]}>
      <Text style={swipeStyles.actionIcon}>💬</Text>
      <Text style={swipeStyles.actionLabel}>Reply</Text>
    </Reanimated.View>
  );
}

function RightAction({ drag }) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(drag.value, [-60, 0], [0, 60], 'clamp') }],
  }));
  return (
    <Reanimated.View style={[swipeStyles.rightAction, animatedStyle]}>
      <Text style={swipeStyles.actionIcon}>👍</Text>
      <Text style={swipeStyles.actionLabel}>React</Text>
    </Reanimated.View>
  );
}

const swipeStyles = StyleSheet.create({
  leftAction: {
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  rightAction: {
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#22c55e',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  actionIcon: {
    fontSize: 20,
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
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 6,
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
    fontSize: 18,
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
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
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
