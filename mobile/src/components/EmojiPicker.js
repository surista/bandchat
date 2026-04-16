import { useState, useEffect, memo } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { getRecentEmojis, addRecentEmoji } from '../services/storage';
import PressableRow from './PressableRow';

// Custom emoji rendered as images
export const CUSTOM_EMOJI = {
  ':bandchat:': { source: require('../../assets/blue_flame_emoji.png'), alt: 'BandChat' },
};

export function renderCustomEmoji(emoji, size = 18) {
  const custom = CUSTOM_EMOJI[emoji];
  if (custom) {
    return <Image source={custom.source} style={{ width: size, height: size, borderRadius: 3 }} />;
  }
  return null;
}

const EMOJI_CATEGORIES = {
  Reactions: [':bandchat:', '👍', '👎', '❤️', '🔥', '😂', '😮', '😢', '😡', '🎉', '🙏', '👏', '💯', '✅', '❌', '👀', '🤔', '💪', '🙌', '😍', '🥳', '🫡', '😬', '🤯', '💀'],
  Smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😊', '😇', '🙂', '😉', '😌', '😎', '🥹', '😏', '😒', '😞', '😔', '😟', '🙁', '😣', '😖', '😫', '😩', '🥺', '😤', '😠', '🤬', '🥴', '😵', '🤮', '🤢', '🥶', '🥵', '😶‍🌫️', '🫠', '🤥', '😈', '👿', '🤡'],
  Hands: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '👍', '👎', '✊', '👊', '🤛', '🤜', '🫶', '🤝', '💅', '🫵', '☝️', '🙏'],
  People: ['🧑‍🎤', '👨‍🎤', '👩‍🎤', '💃', '🕺', '🙋', '🤷', '🙅', '🙆', '💁', '🧑‍💻', '👨‍💻', '👩‍💻', '🧑‍🎨', '🧑‍🔧', '🦸', '🦹', '🧙', '🧛', '💀', '👻', '🤖', '👽', '🫃', '🎅', '🧑‍🎄'],
  Music: ['🎸', '🥁', '🎤', '🎹', '🎵', '🎶', '🎧', '🎼', '🎺', '🎻', '🪘', '🎷', '🪗', '🎚️', '🔊', '🔉', '🔈', '🔇', '📻', '🪕', '🪈', '🎙️', '📯', '🔔', '🎶'],
  Animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🦅', '🦆', '🦉', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐙', '🦑'],
  Nature: ['🌸', '🌹', '🌺', '🌻', '🌼', '🌷', '🌱', '🌲', '🌳', '🌴', '🌵', '🍀', '🍁', '🍂', '🍃', '🌍', '🌎', '🌏', '⭐', '🌟', '✨', '⚡', '☀️', '🌤️', '⛅', '🌧️', '⛈️', '🌈', '❄️', '💧'],
  Food: ['🍕', '🍔', '🍟', '🌮', '🌯', '🥙', '🍣', '🍜', '🍝', '🍛', '🍲', '🥘', '🍺', '🍷', '🍸', '🍹', '🍾', '🥂', '☕', '🫖', '🍰', '🎂', '🍩', '🍪', '🍫', '🍬', '🍭', '🌭', '🥗', '🥤', '🧃', '🥡', '🥪', '🧇', '🥞', '🥓', '🥚', '🍳', '🧀', '🥐'],
  Activities: ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🥊', '🎯', '⛳', '🏄', '🏊', '🚴', '🏋️', '🤸', '⛷️', '🏂', '🛹', '🎮', '🕹️', '🎲', '🧩', '🎳', '🎪', '🎨', '🎭', '🏆'],
  Travel: ['🚗', '🚕', '🚌', '🏎️', '🚑', '🚒', '✈️', '🚀', '🛸', '🚁', '⛵', '🚢', '🏠', '🏢', '🏰', '🏟️', '🗼', '🗽', '⛩️', '🕌', '🏝️', '🏖️', '⛰️', '🗻', '🌋', '🏕️', '🎡', '🎢', '🎠', '🗿'],
  Objects: ['⌚', '📱', '💻', '⌨️', '🖥️', '🖨️', '📷', '📹', '🎥', '📺', '📻', '🔦', '💡', '🔋', '💰', '💎', '🔑', '🗝️', '🔒', '🔓', '📦', '✉️', '📬', '📝', '📚', '📖', '🔗', '✂️', '🗑️', '🧲'],
  Symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💝', '⭐', '🌟', '💫', '✨', '⚡', '🔥', '💥', '🎵', '🎶', '💤', '💬', '💭', '🏳️‍🌈'],
  Flags: ['🇺🇸', '🇬🇧', '🇯🇵', '🇩🇪', '🇫🇷', '🇮🇹', '🇪🇸', '🇧🇷', '🇨🇦', '🇦🇺', '🇲🇽', '🇰🇷', '🇳🇱', '🇸🇪', '🇨🇭', '🇮🇳', '🇨🇳', '🇷🇺', '🇿🇦', '🇳🇿', '🇮🇪', '🇵🇹', '🇦🇷', '🇨🇴', '🇵🇱', '🇹🇷', '🇹🇭', '🇻🇳', '🇵🇭', '🇳🇬'],
};

const BASE_CATEGORIES = Object.keys(EMOJI_CATEGORIES);

function EmojiPicker({ visible, onClose, onSelect }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [recentEmojis, setRecentEmojis] = useState([]);
  const [activeCategory, setActiveCategory] = useState(BASE_CATEGORIES[0]);

  useEffect(() => {
    if (visible) {
      getRecentEmojis().then(recent => {
        setRecentEmojis(recent);
        if (recent.length > 0) setActiveCategory('Recent');
      });
    }
  }, [visible]);

  const categoryNames = recentEmojis.length > 0 ? ['Recent', ...BASE_CATEGORIES] : BASE_CATEGORIES;
  const currentEmojis = activeCategory === 'Recent' ? recentEmojis : (EMOJI_CATEGORIES[activeCategory] || []);

  const handleSelect = (emoji) => {
    addRecentEmoji(emoji).then(setRecentEmojis);
    onSelect(emoji);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose} accessibilityRole="button" accessibilityLabel="Dismiss emoji picker">
        <Pressable style={[styles.container, { backgroundColor: colors.modalBg, paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* Drag handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Category tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabBar, { borderBottomColor: colors.border }]} contentContainerStyle={styles.tabBarContent}>
            {categoryNames.map(cat => (
              <PressableRow
                key={cat}
                style={[
                  styles.tab,
                  activeCategory === cat && [styles.activeTab, { borderBottomColor: colors.primary }],
                ]}
                onPress={() => setActiveCategory(cat)}
                accessibilityRole="button"
                accessibilityLabel={`${cat} category${activeCategory === cat ? ', selected' : ''}`}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: activeCategory === cat ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {cat}
                </Text>
              </PressableRow>
            ))}
          </ScrollView>

          {/* Emoji grid */}
          <ScrollView contentContainerStyle={styles.grid}>
            {currentEmojis.map((emoji, idx) => {
              const custom = CUSTOM_EMOJI[emoji];
              return (
                <PressableRow
                  key={`${emoji}-${idx}`}
                  style={styles.emojiButton}
                  onPress={() => handleSelect(emoji)}
                  borderless
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${custom?.alt || emoji}`}
                >
                  {custom ? (
                    <Image source={custom.source} style={{ width: 28, height: 28, borderRadius: 4 }} />
                  ) : (
                    <Text style={styles.emoji}>{emoji}</Text>
                  )}
                </PressableRow>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default memo(EmojiPicker);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: 380,
    paddingTop: 8,
    paddingBottom: 16,
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  tabBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexGrow: 0,
  },
  tabBarContent: {
    flexDirection: 'row',
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  emojiButton: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 28,
  },
});
