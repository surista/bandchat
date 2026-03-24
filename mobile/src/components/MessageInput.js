import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, TextInput, TouchableOpacity, Text, Image, StyleSheet, Platform, Animated, PanResponder, Alert, FlatList, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { useTheme } from '../context/ThemeContext';
import { formatDuration as formatRecordingDuration } from '../utils/formatDuration';
import EmojiPicker from './EmojiPicker';

const MAX_HEIGHT = 120;

export default function MessageInput({ onSend, onSendVoice, onTyping, editingMessage, onCancelEdit, onSendEdit, members = [], channels = [] }) {
  const { colors } = useTheme();
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

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingCancelled, setRecordingCancelled] = useState(false);
  const recordingRef = useRef(null);
  const durationIntervalRef = useRef(null);
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

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;

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
  }, [text, attachments, onSend, onTyping, editingMessage, onSendEdit]);

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
      const newAttachments = result.assets.slice(0, remaining).map(asset => {
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
      const asset = result.assets[0];
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

  const showAttachOptions = useCallback(() => {
    Alert.alert('Attach', null, [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Photo Library', onPress: pickMedia },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [takePhoto, pickMedia]);

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
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      setRecordingCancelled(false);

      // Start timer
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      // silently fail
    }
  }, []);

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
          <Text style={[styles.editBannerText, { color: colors.primary }]}>Editing message</Text>
          <TouchableOpacity onPress={handleCancelEdit} accessibilityRole="button" accessibilityLabel="Cancel editing">
            <Text style={[styles.editCancel, { color: colors.textSecondary }]}>{'\u2715'}</Text>
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
            <Text style={[styles.recordingTimer, { color: colors.textPrimary }]}>
              {formatDuration(recordingDuration)}
            </Text>
          </View>
          <Text style={[styles.slideToCancel, { color: recordingCancelled ? '#EF4444' : colors.textSecondary }]}>
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
                  <Text style={styles.videoIndicatorText}>{'\u25B6'}</Text>
                </View>
              )}
              <TouchableOpacity style={styles.removeAttachment} onPress={() => removeAttachment(i)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={`Remove attachment ${i + 1}`}>
                <Text style={styles.removeAttachmentText}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Mention autocomplete dropdown */}
      {showMentions && filteredMembers.length > 0 && !isRecording && (
        <View style={[styles.mentionList, { backgroundColor: colors.bgTertiary, borderBottomColor: colors.border }]}>
          <FlatList
            data={filteredMembers}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="always"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.mentionItem, { borderBottomColor: colors.border }]}
                onPress={() => insertMention(item.displayName)}
                accessibilityRole="button"
                accessibilityLabel={`Mention ${item.displayName}`}
              >
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.mentionAvatar} />
                ) : (
                  <View style={[styles.mentionAvatarFallback, { backgroundColor: colors.primary }]}>
                    <Text style={styles.mentionAvatarText}>{(item.displayName || '?')[0].toUpperCase()}</Text>
                  </View>
                )}
                <Text style={[styles.mentionName, { color: colors.textPrimary }]}>{item.displayName}</Text>
              </TouchableOpacity>
            )}
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
                <Text style={[styles.channelHashIcon, { color: colors.textSecondary }]}>#</Text>
                <Text style={[styles.mentionName, { color: colors.textPrimary }]}>{item.name}</Text>
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
              textAlignVertical="center"
              returnKeyType={Platform.OS === 'ios' ? 'default' : 'send'}
              blurOnSubmit={false}
              accessibilityLabel={editingMessage ? 'Edit message' : 'Type a message'}
            />

            {showMic ? (
              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: colors.bgTertiary }]}
                onLongPress={startRecording}
                delayLongPress={200}
                onPress={() => startRecording()}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Record voice message"
              >
                <Text style={[styles.micIcon, { color: colors.textSecondary }]}>{'\uD83C\uDF99'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  { backgroundColor: canSend ? colors.primary : colors.bgTertiary },
                ]}
                onPress={handleSend}
                disabled={!canSend}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={editingMessage ? 'Save edit' : 'Send message'}
              >
                <Text style={[styles.sendIcon, { color: canSend ? '#ffffff' : colors.textSecondary }]}>
                  {editingMessage ? '\u2713' : '\u2191'}
                </Text>
              </TouchableOpacity>
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
              <TouchableOpacity
                style={styles.toolbarButton}
                onPress={showAttachOptions}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel="Attach photo or file"
              >
                <Ionicons name="add-circle-outline" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
            {!editingMessage && (
              <TouchableOpacity
                style={styles.toolbarButton}
                onPress={pickMedia}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel="Choose from photo library"
              >
                <Ionicons name="image-outline" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
            <View style={[styles.toolbarDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() => wrapSelection('**')}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Bold"
            >
              <Text style={[styles.toolbarTextBold, { color: colors.textSecondary }]}>B</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() => wrapSelection('*')}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Italic"
            >
              <Text style={[styles.toolbarTextItalic, { color: colors.textSecondary }]}>I</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() => wrapSelection('~~')}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Strikethrough"
            >
              <Text style={[styles.toolbarTextStrike, { color: colors.textSecondary }]}>S</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() => wrapSelection('`')}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Inline code"
            >
              <Ionicons name="code-slash" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={[styles.toolbarDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={triggerMention}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Mention someone"
            >
              <Ionicons name="at-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() => setShowEmojiPicker(true)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Insert emoji"
            >
              <Ionicons name="happy-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
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
            <Text style={[styles.sendIcon, { color: '#ffffff' }]}>{'\u2191'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Emoji picker modal */}
      <EmojiPicker
        visible={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onSelect={(emoji) => insertEmoji(emoji)}
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
  editCancel: {
    fontSize: 16,
    padding: 4,
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
  videoIndicatorText: {
    color: '#ffffff',
    fontSize: 10,
  },
  removeAttachment: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeAttachmentText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
    marginBottom: Platform.OS === 'ios' ? 2 : 0,
  },
  attachIcon: {
    fontSize: 26,
    fontWeight: '300',
    lineHeight: 28,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Platform.OS === 'ios' ? 2 : 0,
  },
  sendIcon: {
    fontSize: 20,
    fontWeight: '700',
  },
  micIcon: {
    fontSize: 20,
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
    maxHeight: 36,
    paddingBottom: Platform.OS === 'ios' ? 2 : 4,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 2,
  },
  toolbarButton: {
    width: 36,
    height: 32,
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
