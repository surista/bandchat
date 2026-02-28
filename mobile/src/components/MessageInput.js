import { useState, useRef, useCallback, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, Image, StyleSheet, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';

const MAX_HEIGHT = 120;

export default function MessageInput({ onSend, onTyping, editingMessage, onCancelEdit, onSendEdit, onPickImage }) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(40);
  const [attachment, setAttachment] = useState(null);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  // Clean up typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  // Pre-fill text when editing
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content || '');
      inputRef.current?.focus();
    }
  }, [editingMessage]);

  const handleChangeText = useCallback((value) => {
    setText(value);

    if (onTyping && !editingMessage) {
      onTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 2000);
    }
  }, [onTyping, editingMessage]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && !attachment) return;

    if (editingMessage) {
      if (trimmed && onSendEdit) onSendEdit(editingMessage.id, trimmed);
    } else {
      onSend(trimmed, attachment);
    }

    setText('');
    setInputHeight(40);
    setAttachment(null);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (onTyping) onTyping(false);
  }, [text, attachment, onSend, onTyping, editingMessage, onSendEdit]);

  const handleContentSizeChange = useCallback((e) => {
    const height = e.nativeEvent.contentSize.height;
    setInputHeight(Math.min(Math.max(40, height), MAX_HEIGHT));
  }, []);

  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setAttachment({
        uri: asset.uri,
        filename: asset.fileName || `image-${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
        width: asset.width,
        height: asset.height,
      });
    }
  }, []);

  const removeAttachment = useCallback(() => {
    setAttachment(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setText('');
    setAttachment(null);
    if (onCancelEdit) onCancelEdit();
  }, [onCancelEdit]);

  const canSend = text.trim().length > 0 || attachment;

  return (
    <View style={[styles.outerContainer, { backgroundColor: colors.bgSecondary, borderTopColor: colors.border }]}>
      {/* Edit mode banner */}
      {editingMessage && (
        <View style={[styles.editBanner, { backgroundColor: colors.bgTertiary }]}>
          <Text style={[styles.editBannerText, { color: colors.primary }]}>Editing message</Text>
          <TouchableOpacity onPress={handleCancelEdit}>
            <Text style={[styles.editCancel, { color: colors.textSecondary }]}>{'\u2715'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Attachment preview */}
      {attachment && (
        <View style={styles.attachmentPreview}>
          <Image source={{ uri: attachment.uri }} style={styles.attachmentThumb} />
          <TouchableOpacity style={styles.removeAttachment} onPress={removeAttachment}>
            <Text style={styles.removeAttachmentText}>{'\u2715'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputRow}>
        {/* Attachment button */}
        {!editingMessage && (
          <TouchableOpacity style={styles.attachButton} onPress={pickImage} activeOpacity={0.6}>
            <Text style={[styles.attachIcon, { color: colors.textSecondary }]}>+</Text>
          </TouchableOpacity>
        )}

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
          onContentSizeChange={handleContentSizeChange}
          multiline
          textAlignVertical="center"
          returnKeyType={Platform.OS === 'ios' ? 'default' : 'send'}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            { backgroundColor: canSend ? colors.primary : colors.bgTertiary },
          ]}
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.7}
        >
          <Text style={[styles.sendIcon, { color: canSend ? '#ffffff' : colors.textSecondary }]}>
            {editingMessage ? '\u2713' : '\u2191'}
          </Text>
        </TouchableOpacity>
      </View>
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
  attachmentPreview: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  attachmentThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeAttachment: {
    position: 'absolute',
    top: 4,
    left: 76,
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
    width: 34,
    height: 34,
    borderRadius: 17,
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
    marginRight: 8,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Platform.OS === 'ios' ? 2 : 0,
  },
  sendIcon: {
    fontSize: 20,
    fontWeight: '700',
  },
});
