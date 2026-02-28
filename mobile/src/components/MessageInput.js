import { useState, useRef, useCallback, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const MAX_HEIGHT = 120;

export default function MessageInput({ onSend, onTyping }) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(40);
  const typingTimeoutRef = useRef(null);

  // Clean up typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const handleChangeText = useCallback((value) => {
    setText(value);

    if (onTyping) {
      onTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 2000);
    }
  }, [onTyping]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;

    onSend(trimmed);
    setText('');
    setInputHeight(40);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (onTyping) onTyping(false);
  }, [text, onSend, onTyping]);

  const handleContentSizeChange = useCallback((e) => {
    const height = e.nativeEvent.contentSize.height;
    setInputHeight(Math.min(Math.max(40, height), MAX_HEIGHT));
  }, []);

  const canSend = text.trim().length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.bgSecondary, borderTopColor: colors.border }]}>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.bgTertiary,
            color: colors.textPrimary,
            height: inputHeight,
          },
        ]}
        placeholder="Message..."
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
          {'\u2191'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
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
