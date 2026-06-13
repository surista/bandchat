import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, TextInput, TouchableOpacity, Text, Image, StyleSheet, Platform, Animated, PanResponder, Alert, FlatList, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { prepareImageForUpload, prepareImagesForUpload } from '../utils/prepareImageUpload';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { formatDuration as formatRecordingDuration } from '../utils/formatDuration';
import { mediumImpact, errorNotification, warningNotification, selectionFeedback } from '../utils/haptics';
import { containsGroupMention } from '../utils/parseMentions';
import EmojiPicker from './EmojiPicker';
import ActionSheet from './ActionSheet';
import PressableRow from './PressableRow';

const MAX_HEIGHT = 120;

// Group-mention suggestions appear at the top of the @-autocomplete list.
// All three notify the entire channel server-side (see server/src/routes/messages.js).
const GROUP_MENTION_OPTIONS = [
  { name: 'channel', desc: 'Notify everyone in this channel' },
  { name: 'here', desc: 'Notify everyone in this channel' },
  { name: 'everyone', desc: 'Notify everyone in this channel' },
];

// Cap voice recordings at 5 minutes. At 30s remaining, a warning haptic fires;
// at the cap the recording auto-stops so runaway recordings can't drain battery
// or bloat storage. This matches iMessage / WhatsApp behavior.
const MAX_RECORDING_SECONDS = 300;
const RECORDING_WARNING_THRESHOLD = 30;

export default function MessageInput({ onSend, onSendVoice, onTyping, editingMessage, onCancelEdit, onSendEdit, members = [], channels = [] }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(40);
  const [attachments, setAttachments] = useState([]);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [showMentions, setShowMentions] = useState(false);
  const [channelFilter, setChannelFilter] = useState('');
  const [channelStart, setChannelStart] = useState(-1);
  const [showChannels, setShowChannels] = useState(false);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const selectionRef = useRef({ start: 0, end: 0 });

  // Toolbar state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachSheet, setShowAttachSheet] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingCancelled, setRecordingCancelled] = useState(false);
  const recordingRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const stopRecordingRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideX = useRef(new Animated.Value(0)).current;
  const panStartX = useRef(0);

  // Pan responder for slide-to-cancel
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panStartX.current = 0;
      },
      onPanResponderMove: (_, gestureState) => {
        const dx = Math.min(0, gestureState.dx);
        slideX.setValue(dx);
        if (dx < -100) {
          setRecordingCancelled(true);
        } else {
          setRecordingCancelled(false);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -100) {
          cancelRecording();
        } else {
          stopRecording();
        }
        slideX.setValue(0);
      },
    })
  ).current;

  // Clean up typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  // Pulse animation for recording indicator
  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  // Pre-fill text when editing
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content || '');
      inputRef.current?.focus();
    }
  }, [editingMessage]);

  const filteredMembers = useMemo(() => {
    if (!showMentions || !mentionFilter) return members.map(m => m.user || m).slice(0, 8);
    const lower = mentionFilter.toLowerCase();
    return members
      .map(m => m.user || m)
      .filter(u => u.displayName?.toLowerCase().includes(lower))
      .slice(0, 8);
  }, [members, showMentions, mentionFilter]);

  // Combined mention suggestions — group mentions (@channel/@here/@everyone) on top, members below.
  // Each row gets a stable string id so the FlatList keyExtractor doesn't collide
  // between the two sources (a user UUID will never start with "g-").
  const mentionSuggestions = useMemo(() => {
    if (!showMentions) return [];
    const lower = (mentionFilter || '').toLowerCase();
    const groupMatches = GROUP_MENTION_OPTIONS
      .filter(g => !lower || g.name.startsWith(lower))
      .map(g => ({ kind: 'group', id: `g-${g.name}`, name: g.name, desc: g.desc }));
    const memberMatches = filteredMembers.map(u => ({ kind: 'user', id: u.id, user: u }));
    return [...groupMatches, ...memberMatches];
  }, [filteredMembers, showMentions, mentionFilter]);

  const filteredChannels = useMemo(() => {
    if (!showChannels) return [];
    if (!channelFilter) return channels.slice(0, 8);
    const lower = channelFilter.toLowerCase();
    return channels
      .filter(c => c.name?.toLowerCase().includes(lower))
      .slice(0, 8);
  }, [channels, showChannels, channelFilter]);

  const handleChangeText = useCallback((value) => {
    setText(value);

    // Detect @mention trigger
    const cursorPos = selectionRef.current?.start ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/(^|\s)@(\w*)$/);
    if (mentionMatch) {
      setShowMentions(true);
      setMentionStart(textBeforeCursor.lastIndexOf('@'));
      setMentionFilter(mentionMatch[2]);
    } else {
      setShowMentions(false);
      setMentionStart(-1);
      setMentionFilter('');
    }

    // Detect #channel trigger
    const channelMatch = textBeforeCursor.match(/(^|\s)#([\w-]*)$/);
    if (channelMatch) {
      setShowChannels(true);
      setChannelStart(textBeforeCursor.lastIndexOf('#'));
      setChannelFilter(channelMatch[2]);
    } else {
      setShowChannels(false);
      setChannelStart(-1);
      setChannelFilter('');
    }

    if (onTyping && !editingMessage) {
      onTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 2000);
    }
  }, [onTyping, editingMessage]);

  const insertMention = useCallback((displayName) => {
    const before = text.slice(0, mentionStart);
    const after = text.slice(selectionRef.current?.start ?? text.length);
    const newText = `${before}@${displayName} ${after}`;
    setText(newText);
    setShowMentions(false);
    setMentionStart(-1);
    setMentionFilter('');
    inputRef.current?.focus();
  }, [text, mentionStart]);

  const insertChannel = useCallback((channelName) => {
    const before = text.slice(0, channelStart);
    const after = text.slice(selectionRef.current?.start ?? text.length);
    const newText = `${before}#${channelName} ${after}`;
    setText(newText);
    setShowChannels(false);
    setChannelStart(-1);
    setChannelFilter('');
    inputRef.current?.focus();
  }, [text, channelStart]);

  const handleSelectionChange = useCallback((e) => {
    selectionRef.current = e.nativeEvent.selection;
  }, []);

  // Wrap selected text (or insert at cursor) with markdown markers
  const wrapSelection = useCallback((before, after) => {
    const sel = selectionRef.current;
    const start = sel?.start ?? text.length;
    const end = sel?.end ?? text.length;
    const selected = text.slice(start, end);
    const suffix = after || before;
    const newText = text.slice(0, start) + before + selected + suffix + text.slice(end);
    setText(newText);
    // Move cursor after inserted markers
    const newPos = selected
      ? start + before.length + selected.length + suffix.length
      : start + before.length;
    setTimeout(() => {
      inputRef.current?.setNativeProps({
        selection: { start: newPos, end: newPos },
      });
      selectionRef.current = { start: newPos, end: newPos };
    }, 50);
  }, [text]);

  const insertEmoji = useCallback((emoji) => {
    const pos = selectionRef.current?.start ?? text.length;
    const newText = text.slice(0, pos) + emoji + text.slice(pos);
    setText(newText);
    setShowEmojiPicker(false);
    const newPos = pos + emoji.length;
    setTimeout(() => {
      inputRef.current?.focus();
      selectionRef.current = { start: newPos, end: newPos };
    }, 50);
  }, [text]);

  const triggerMention = useCallback(() => {
    const pos = selectionRef.current?.start ?? text.length;
    const needsSpace = pos > 0 && text[pos - 1] !== ' ' && text[pos - 1] !== '\n';
    const insert = (needsSpace ? ' ' : '') + '@';
    const newText = text.slice(0, pos) + insert + text.slice(pos);
    setText(newText);
    const newPos = pos + insert.length;
    selectionRef.current = { start: newPos, end: newPos };
    setShowMentions(true);
    setMentionStart(newPos - 1);
    setMentionFilter('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [text]);

  const performSend = useCallback((trimmed) => {
    // Subtle feedback on successful send (matches voice-message UX which fires
    // mediumImpact on start). iMessage-style selection feedback rather than
    // impact since send is a routine, not a heavy, action.
    selectionFeedback();

    if (editingMessage) {
      if (trimmed && onSendEdit) onSendEdit(editingMessage.id, trimmed);
    } else {
      // Send with first attachment for backward compat, or all attachments
      onSend(trimmed, attachments.length === 1 ? attachments[0] : attachments.length > 0 ? attachments : null);
    }

    setText('');
    setInputHeight(40);
    setAttachments([]);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (onTyping) onTyping(false);
  }, [attachments, onSend, onTyping, editingMessage, onSendEdit]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;

    // Confirm before broadcasting via @channel/@here/@everyone. Edits skip this
    // because the server doesn't re-fire push notifications on message updates.
    if (!editingMessage && containsGroupMention(trimmed)) {
      Alert.alert(
        'Notify everyone?',
        'All members of this channel will get a push notification.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Notify everyone', onPress: () => performSend(trimmed) },
        ]
      );
      return;
    }

    performSend(trimmed);
  }, [text, attachments.length, editingMessage, performSend]);

  const handleContentSizeChange = useCallback((e) => {
    const height = e.nativeEvent.contentSize.height;
    setInputHeight(Math.min(Math.max(40, height), MAX_HEIGHT));
  }, []);

  const pickMedia = useCallback(async () => {
    const remaining = 5 - attachments.length;
    if (remaining <= 0) {
      Alert.alert('Limit reached', 'Maximum 5 files per message');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      videoMaxDuration: 300,
    });

    if (!result.canceled && result.assets?.length > 0) {
      const prepared = await prepareImagesForUpload(result.assets.slice(0, remaining));
      const newAttachments = prepared.map(asset => {
        const isVideo = asset.type === 'video';
        return {
          uri: asset.uri,
          filename: asset.fileName || (isVideo ? `video-${Date.now()}.mp4` : `image-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`),
          mimeType: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
          width: asset.width,
          height: asset.height,
          isVideo,
        };
      });
      setAttachments(prev => [...prev, ...newAttachments].slice(0, 5));
    }
  }, [attachments.length]);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera access is needed to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = await prepareImageForUpload(result.assets[0]);
      setAttachments(prev => [...prev, {
        uri: asset.uri,
        filename: asset.fileName || `photo-${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
        width: asset.width,
        height: asset.height,
        isVideo: false,
      }].slice(0, 5));
    }
  }, []);

  const pickDocument = useCallback(async () => {
    try {
      const remaining = 5 - attachments.length;
      if (remaining <= 0) {
        Alert.alert('Limit reached', 'Maximum 5 files per message');
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/zip', 'application/x-zip-compressed'],
        multiple: remaining > 1,
        // Android 13+ SAF returns a content:// URI that FormData can't stream.
        // Copying to cache first guarantees a real file path for upload.
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const maxSize = 10 * 1024 * 1024; // 10MB
        const newAttachments = [];
        for (const asset of result.assets.slice(0, remaining)) {
          if (asset.size > maxSize) {
            Alert.alert('File too large', `"${asset.name}" exceeds the 10MB limit for documents.`);
            continue;
          }
          const ext = asset.mimeType?.includes('pdf') ? 'pdf' : 'zip';
          newAttachments.push({
            uri: asset.uri,
            filename: asset.name || `file-${Date.now()}.${ext}`,
            mimeType: asset.mimeType || 'application/octet-stream',
            isVideo: false,
          });
        }
        if (newAttachments.length > 0) {
          setAttachments(prev => [...prev, ...newAttachments].slice(0, 5));
        }
      }
    } catch (err) {
      console.error('Document picker error:', err);
    }
  }, [attachments.length]);

  // Audio file picker — separate from pickDocument because the server caps
  // audio at 500MB (vs 10MB for docs) and uses a different MIME allowlist.
  // The flagged `isAudio: true` matches the voice-recorder upload shape so
  // MessageBubble renders the same audio player UI for both.
  const pickAudio = useCallback(async () => {
    try {
      const remaining = 5 - attachments.length;
      if (remaining <= 0) {
        Alert.alert('Limit reached', 'Maximum 5 files per message');
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        multiple: remaining > 1,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const maxSize = 500 * 1024 * 1024; // 500MB — must match server MAX_AUDIO_SIZE
      const newAttachments = [];
      for (const asset of result.assets.slice(0, remaining)) {
        if (asset.size > maxSize) {
          Alert.alert('File too large', `"${asset.name}" exceeds the 500MB limit for audio.`);
          continue;
        }
        newAttachments.push({
          uri: asset.uri,
          filename: asset.name || `audio-${Date.now()}.mp3`,
          mimeType: asset.mimeType || 'audio/mpeg',
          isAudio: true,
          isVideo: false,
        });
      }
      if (newAttachments.length > 0) {
        setAttachments(prev => [...prev, ...newAttachments].slice(0, 5));
      }
    } catch (err) {
      console.error('Audio picker error:', err);
    }
  }, [attachments.length]);

  const showAttachOptions = useCallback(() => {
    setShowAttachSheet(true);
  }, []);

  const removeAttachment = useCallback((index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleCancelEdit = useCallback(() => {
    setText('');
    setAttachments([]);
    if (onCancelEdit) onCancelEdit();
  }, [onCancelEdit]);

  // Voice recording functions
  const startRecording = useCallback(async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        errorNotification();
        toast.error('Microphone access is required to record voice messages.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      mediumImpact();
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      setRecordingCancelled(false);

      // Start timer; warn at threshold and auto-stop at cap
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const next = prev + 1;
          const remaining = MAX_RECORDING_SECONDS - next;
          if (remaining === RECORDING_WARNING_THRESHOLD) {
            warningNotification();
          }
          if (next >= MAX_RECORDING_SECONDS) {
            // Auto-send what we have when the cap is hit (ref avoids stale closure)
            setTimeout(() => stopRecordingRef.current?.(), 0);
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      errorNotification();
      toast.error('Could not start recording. Please try again.');
    }
  }, [toast]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    try {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);
      setRecordingDuration(0);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      if (uri && onSendVoice) {
        onSendVoice(uri);
      } else if (uri) {
        // Fallback: send as attachment through normal onSend
        const filename = `voice-${Date.now()}.m4a`;
        onSend('', [{
          uri,
          filename,
          mimeType: 'audio/mp4',
          isAudio: true,
        }]);
      }
    } catch (err) {
      setIsRecording(false);
      setRecordingDuration(0);
    }
  }, [onSendVoice, onSend]);

  // Expose the latest stopRecording to the timer interval inside startRecording,
  // which needs to auto-stop when the cap is reached.
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  const cancelRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    try {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      await recordingRef.current.stopAndUnloadAsync();
      recordingRef.current = null;
      setIsRecording(false);
      setRecordingDuration(0);
      setRecordingCancelled(false);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    } catch (err) {
      setIsRecording(false);
      setRecordingDuration(0);
    }
  }, []);

  const formatDuration = (seconds) => formatRecordingDuration(seconds) || '0:00';

  const canSend = text.trim().length > 0 || attachments.length > 0;
  const showMic = !editingMessage && !canSend;

  return (
    <View style={[styles.outerContainer, { backgroundColor: colors.bgSecondary, borderTopColor: colors.border }]}>
      {/* Edit mode banner */}
      {editingMessage && (
        <View style={[styles.editBanner, { backgroundColor: colors.bgTertiary }]}>
          <Text style={[styles.editBannerText, { color: colors.primary }]} maxFontSizeMultiplier={1.5}>Editing message</Text>
          <TouchableOpacity onPress={handleCancelEdit} accessibilityRole="button" accessibilityLabel="Cancel editing" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 8 }}>
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Recording overlay */}
      {isRecording && (
        <Animated.View
          style={[
            styles.recordingOverlay,
            { backgroundColor: colors.bgSecondary, transform: [{ translateX: slideX }] },
          ]}
          {...panResponder.panHandlers}
        >
          <View style={styles.recordingLeft}>
            <Animated.View
              style={[
                styles.recordingDot,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />
            <Text style={[styles.recordingTimer, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.5}>
              {formatDuration(recordingDuration)}
            </Text>
          </View>
          <Text style={[styles.slideToCancel, { color: recordingCancelled ? '#EF4444' : colors.textSecondary }]} maxFontSizeMultiplier={1.5}>
            {recordingCancelled ? 'Release to cancel' : '\u2190 Slide to cancel'}
          </Text>
        </Animated.View>
      )}

      {/* Attachment previews */}
      {attachments.length > 0 && !isRecording && (
        <View style={styles.attachmentPreviewRow}>
          {attachments.map((att, i) => (
            <View key={i} style={styles.attachmentPreviewItem}>
              <Image source={{ uri: att.uri }} style={styles.attachmentThumb} accessibilityLabel={`Attachment ${i + 1}`} />
              {att.isVideo && (
                <View style={styles.videoIndicator}>
                  <Ionicons name="play" size={10} color="#ffffff" />
                </View>
              )}
              <TouchableOpacity style={styles.removeAttachment} onPress={() => removeAttachment(i)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={`Remove attachment ${i + 1}`}>
                <Ionicons name="close" size={14} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Mention autocomplete dropdown — group mentions (@channel/@here/@everyone) shown first, then members */}
      {showMentions && mentionSuggestions.length > 0 && !isRecording && (
        <View style={[styles.mentionList, { backgroundColor: colors.bgTertiary, borderBottomColor: colors.border }]}>
          <FlatList
            data={mentionSuggestions}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="always"
            renderItem={({ item }) => {
              if (item.kind === 'group') {
                return (
                  <TouchableOpacity
                    style={[styles.mentionItem, { borderBottomColor: colors.border }]}
                    onPress={() => insertMention(item.name)}
                    accessibilityRole="button"
                    accessibilityLabel={`Notify everyone with @${item.name}`}
                  >
                    <View style={styles.groupMentionIcon}>
                      <Text style={styles.groupMentionAt} maxFontSizeMultiplier={1.2}>@</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.mentionName, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.5}>@{item.name}</Text>
                      <Text style={[styles.groupMentionDesc, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5} numberOfLines={1}>{item.desc}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }
              const u = item.user;
              return (
                <TouchableOpacity
                  style={[styles.mentionItem, { borderBottomColor: colors.border }]}
                  onPress={() => insertMention(u.displayName)}
                  accessibilityRole="button"
                  accessibilityLabel={`Mention ${u.displayName}`}
                >
                  {u.avatarUrl ? (
                    <Image source={{ uri: u.avatarUrl }} style={styles.mentionAvatar} accessible={false} />
                  ) : (
                    <View style={[styles.mentionAvatarFallback, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.mentionAvatarText, { color: colors.primaryText }]} maxFontSizeMultiplier={1.2}>{(u.displayName || '?')[0].toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={[styles.mentionName, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.5}>{u.displayName}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* Channel autocomplete dropdown */}
      {showChannels && filteredChannels.length > 0 && !isRecording && (
        <View style={[styles.mentionList, { backgroundColor: colors.bgTertiary, borderBottomColor: colors.border }]}>
          <FlatList
            data={filteredChannels}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="always"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.mentionItem, { borderBottomColor: colors.border }]}
                onPress={() => insertChannel(item.name)}
                accessibilityRole="button"
                accessibilityLabel={`Channel ${item.name}`}
              >
                <Text style={[styles.channelHashIcon, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>#</Text>
                <Text style={[styles.mentionName, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.5}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {!isRecording && (
        <>
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                {
                  backgroundColor: colors.bgTertiary,
                  color: colors.textPrimary,
                  height: inputHeight,
                },
              ]}
              placeholder={editingMessage ? 'Edit message...' : 'Message...'}
              placeholderTextColor={colors.textSecondary}
              value={text}
              onChangeText={handleChangeText}
              onSelectionChange={handleSelectionChange}
              onContentSizeChange={handleContentSizeChange}
              multiline
              autoCorrect={true}
              autoCapitalize="sentences"
              spellCheck={true}
              textAlignVertical="top"
              returnKeyType="default"
              blurOnSubmit={false}
              accessibilityLabel={editingMessage ? 'Edit message' : 'Type a message'}
            />

            {showMic ? (
              <PressableRow
                style={[styles.sendButton, { backgroundColor: colors.bgTertiary }]}
                onLongPress={startRecording}
                delayLongPress={200}
                // Tap-by-mistake teaching moment: a fire-and-forget toast
                // tells the user the gesture is hold, not tap. The light
                // warning haptic backs up the visual hint without being
                // jarring. WhatsApp / iMessage use the same pattern.
                onPress={() => { warningNotification(); toast.info('Hold the mic to record a voice message'); }}
                borderless
                accessibilityRole="button"
                accessibilityLabel="Record voice message"
                accessibilityHint="Long press to start recording"
              >
                <Ionicons name="mic" size={20} color={colors.textSecondary} />
              </PressableRow>
            ) : (
              <PressableRow
                style={[
                  styles.sendButton,
                  { backgroundColor: canSend ? colors.primary : colors.bgTertiary },
                ]}
                onPress={handleSend}
                disabled={!canSend}
                borderless
                accessibilityRole="button"
                accessibilityLabel={editingMessage ? 'Save edit' : 'Send message'}
              >
                <Ionicons name={editingMessage ? 'checkmark' : 'arrow-up'} size={20} color={canSend ? colors.primaryText : colors.textSecondary} />
              </PressableRow>
            )}
          </View>

          {/* Formatting toolbar */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={styles.toolbar}
            style={styles.toolbarContainer}
          >
            {!editingMessage && (
              <PressableRow
                style={styles.toolbarButton}
                onPress={showAttachOptions}
                borderless
                accessibilityRole="button"
                accessibilityLabel="Attach photo or file"
              >
                <Ionicons name="add-circle-outline" size={22} color={colors.textSecondary} />
              </PressableRow>
            )}
            {!editingMessage && (
              <PressableRow
                style={styles.toolbarButton}
                onPress={pickMedia}
                borderless
                accessibilityRole="button"
                accessibilityLabel="Choose from photo library"
              >
                <Ionicons name="image-outline" size={20} color={colors.textSecondary} />
              </PressableRow>
            )}
            <View style={[styles.toolbarDivider, { backgroundColor: colors.border }]} />
            <PressableRow
              style={styles.toolbarButton}
              onPress={() => wrapSelection('**')}
              borderless
              accessibilityRole="button"
              accessibilityLabel="Bold"
            >
              <Text style={[styles.toolbarTextBold, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>B</Text>
            </PressableRow>
            <PressableRow
              style={styles.toolbarButton}
              onPress={() => wrapSelection('*')}
              borderless
              accessibilityRole="button"
              accessibilityLabel="Italic"
            >
              <Text style={[styles.toolbarTextItalic, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>I</Text>
            </PressableRow>
            <PressableRow
              style={styles.toolbarButton}
              onPress={() => wrapSelection('~~')}
              borderless
              accessibilityRole="button"
              accessibilityLabel="Strikethrough"
            >
              <Text style={[styles.toolbarTextStrike, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>S</Text>
            </PressableRow>
            <PressableRow
              style={styles.toolbarButton}
              onPress={() => wrapSelection('`')}
              borderless
              accessibilityRole="button"
              accessibilityLabel="Inline code"
            >
              <Ionicons name="code-slash" size={18} color={colors.textSecondary} />
            </PressableRow>
            <View style={[styles.toolbarDivider, { backgroundColor: colors.border }]} />
            <PressableRow
              style={styles.toolbarButton}
              onPress={triggerMention}
              borderless
              accessibilityRole="button"
              accessibilityLabel="Mention someone"
            >
              <Ionicons name="at-outline" size={20} color={colors.textSecondary} />
            </PressableRow>
            <PressableRow
              style={styles.toolbarButton}
              onPress={() => setShowEmojiPicker(true)}
              borderless
              accessibilityRole="button"
              accessibilityLabel="Insert emoji"
            >
              <Ionicons name="happy-outline" size={20} color={colors.textSecondary} />
            </PressableRow>
          </ScrollView>
        </>
      )}

      {/* Recording input row: stop button */}
      {isRecording && (
        <View style={styles.inputRow}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: '#EF4444' }]}
            onPress={stopRecording}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Stop recording and send"
          >
            <Ionicons name="arrow-up" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Emoji picker modal */}
      <EmojiPicker
        visible={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onSelect={(emoji) => insertEmoji(emoji)}
      />

      {/* Attach options sheet */}
      <ActionSheet
        visible={showAttachSheet}
        title="Attach"
        actions={[
          { label: 'Take Photo', onPress: () => { setShowAttachSheet(false); takePhoto(); } },
          { label: 'Photo Library', onPress: () => { setShowAttachSheet(false); pickMedia(); } },
          { label: 'Audio File (MP3, etc.)', onPress: () => { setShowAttachSheet(false); pickAudio(); } },
          { label: 'File (PDF, ZIP)', onPress: () => { setShowAttachSheet(false); pickDocument(); } },
        ]}
        onClose={() => setShowAttachSheet(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    borderTopWidth: 1,
  },
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  editBannerText: {
    fontSize: 13,
    fontWeight: '600',
  },
  recordingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  recordingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    marginRight: 10,
  },
  recordingTimer: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  slideToCancel: {
    fontSize: 14,
  },
  attachmentPreviewRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  attachmentPreviewItem: {
    position: 'relative',
  },
  attachmentThumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  videoIndicator: {
    position: 'absolute',
    top: 22,
    left: 22,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeAttachment: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 16,
    marginLeft: 4,
    marginRight: 8,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Platform.OS === 'ios' ? 2 : 0,
  },
  mentionList: {
    maxHeight: 200,
    borderBottomWidth: 1,
  },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mentionAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 10,
  },
  mentionAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupMentionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  groupMentionAt: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '700',
  },
  groupMentionDesc: {
    fontSize: 12,
    marginTop: 1,
  },
  mentionAvatarText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  mentionName: {
    fontSize: 15,
    fontWeight: '500',
  },
  channelHashIcon: {
    fontSize: 18,
    fontWeight: '700',
    width: 28,
    textAlign: 'center',
    marginRight: 10,
  },
  toolbarContainer: {
    maxHeight: 48,
    paddingBottom: Platform.OS === 'ios' ? 2 : 4,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 2,
  },
  toolbarButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  toolbarDivider: {
    width: 1,
    height: 18,
    marginHorizontal: 4,
  },
  toolbarTextBold: {
    fontSize: 16,
    fontWeight: '700',
  },
  toolbarTextItalic: {
    fontSize: 16,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  toolbarTextStrike: {
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'line-through',
  },
});
