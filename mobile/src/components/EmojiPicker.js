import { useState, useEffect, useRef, memo } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { getRecentEmojis, addRecentEmoji } from '../services/storage';
import PressableRow from './PressableRow';
import { selectionFeedback } from '../utils/haptics';
import { MIN_TOUCH_TARGET } from '../utils/touchTarget';

// Custom emoji rendered as images
export const CUSTOM_EMOJI = {
  ':bandchat:': { source: require('../../assets/blue_flame_emoji.png'), alt: 'BandChat' },
};

export function renderCustomEmoji(emoji, size = 18) {
  const custom = CUSTOM_EMOJI[emoji];
  if (custom) {
    return <Image source={custom.source} style={{ width: size, height: size, borderRadius: 3 }} accessible={false} />;
  }
  return null;
}

const rawCategories = {
  Reactions: [':bandchat:', '👍', '👎', '❤️', '🔥', '😂', '😮', '😢', '😡', '🎉', '🙏', '👏', '💯', '✅', '❌', '👀', '🤔', '💪', '🙌', '😍', '🥳', '🫡', '😬', '🤯', '💀'],
  Smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😊', '😇', '🙂', '😉', '😌', '😎', '🥹', '😏', '😒', '😞', '😔', '😟', '🙁', '😣', '😖', '😫', '😩', '🥺', '😤', '😠', '🤬', '🥴', '😵', '🤮', '🤢', '🥶', '🥵', '😶‍🌫️', '🫠', '🤥', '😈', '👿', '🤡'],
  Hands: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '✊', '👊', '🤛', '🤜', '🫶', '🤝', '💅', '🫵', '☝️'],
  People: ['🧑‍🎤', '👨‍🎤', '👩‍🎤', '💃', '🕺', '🙋', '🤷', '🙅', '🙆', '💁', '🧑‍💻', '👨‍💻', '👩‍💻', '🧑‍🎨', '🧑‍🔧', '🦸', '🦹', '🧙', '🧛', '👻', '🤖', '👽', '🫃', '🎅', '🧑‍🎄'],
  Music: ['🎸', '🥁', '🎤', '🎹', '🎵', '🎶', '🎧', '🎼', '🎺', '🎻', '🪘', '🎷', '🪗', '🎚️', '🔊', '🔉', '🔈', '🔇', '📻', '🪕', '🪈', '🎙️', '📯', '🔔'],
  Animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🦅', '🦆', '🦉', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐙', '🦑'],
  Nature: ['🌸', '🌹', '🌺', '🌻', '🌼', '🌷', '🌱', '🌲', '🌳', '🌴', '🌵', '🍀', '🍁', '🍂', '🍃', '🌍', '🌎', '🌏', '⭐', '🌟', '✨', '⚡', '☀️', '🌤️', '⛅', '🌧️', '⛈️', '🌈', '❄️', '💧'],
  Food: ['🍕', '🍔', '🍟', '🌮', '🌯', '🥙', '🍣', '🍜', '🍝', '🍛', '🍲', '🥘', '🍺', '🍷', '🍸', '🍹', '🍾', '🥂', '☕', '🫖', '🍰', '🎂', '🍩', '🍪', '🍫', '🍬', '🍭', '🌭', '🥗', '🥤', '🧃', '🥡', '🥪', '🧇', '🥞', '🥓', '🥚', '🍳', '🧀', '🥐'],
  Activities: ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🥊', '🎯', '⛳', '🏄', '🏊', '🚴', '🏋️', '🤸', '⛷️', '🏂', '🛹', '🎮', '🕹️', '🎲', '🧩', '🎳', '🎪', '🎨', '🎭', '🏆'],
  Travel: ['🚗', '🚕', '🚌', '🏎️', '🚑', '🚒', '✈️', '🚀', '🛸', '🚁', '⛵', '🚢', '🏠', '🏢', '🏰', '🏟️', '🗼', '🗽', '⛩️', '🕌', '🏝️', '🏖️', '⛰️', '🗻', '🌋', '🏕️', '🎡', '🎢', '🎠', '🗿'],
  Objects: ['⌚', '📱', '💻', '⌨️', '🖥️', '🖨️', '📷', '📹', '🎥', '📺', '🔦', '💡', '🔋', '💰', '💎', '🔑', '🗝️', '🔒', '🔓', '📦', '✉️', '📬', '📝', '📚', '📖', '🔗', '✂️', '🗑️', '🧲'],
  Symbols: ['🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💝', '💫', '💥', '💤', '💬', '💭', '🏳️‍🌈'],
  Flags: ['🇺🇸', '🇬🇧', '🇯🇵', '🇩🇪', '🇫🇷', '🇮🇹', '🇪🇸', '🇧🇷', '🇨🇦', '🇦🇺', '🇲🇽', '🇰🇷', '🇳🇱', '🇸🇪', '🇨🇭', '🇮🇳', '🇨🇳', '🇷🇺', '🇿🇦', '🇳🇿', '🇮🇪', '🇵🇹', '🇦🇷', '🇨🇴', '🇵🇱', '🇹🇷', '🇹🇭', '🇻🇳', '🇵🇭', '🇳🇬'],
};
const EMOJI_CATEGORIES = Object.fromEntries(
  Object.entries(rawCategories).map(([k, arr]) => [k, Array.from(new Set(arr))])
);

const BASE_CATEGORIES = Object.keys(EMOJI_CATEGORIES);

function EmojiPicker({ visible, onClose, onSelect }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [recentEmojis, setRecentEmojis] = useState([]);
  const [activeCategory, setActiveCategory] = useState(BASE_CATEGORIES[0]);
  const tabScrollRef = useRef(null);

  useEffect(() => {
    if (visible) {
      // Dismiss any keyboard that was open before showing the picker,
      // so on Android the 380pt sheet isn't pushed above an open IME.
      Keyboard.dismiss();
      getRecentEmojis().then(recent => {
        setRecentEmojis(recent);
        if (recent.length > 0) setActiveCategory('Recent');
      });
    }
  }, [visible]);

  const categoryNames = recentEmojis.length > 0 ? ['Recent', ...BASE_CATEGORIES] : BASE_CATEGORIES;
  const currentEmojis = activeCategory === 'Recent' ? recentEmojis : (EMOJI_CATEGORIES[activeCategory] || []);

  const handleSelect = (emoji) => {
    selectionFeedback();
    addRecentEmoji(emoji).then(setRecentEmojis);
    onSelect(emoji);
    onClose();
  };

  const handleCategoryTap = (cat) => {
    selectionFeedback();
    setActiveCategory(cat);
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
        <Pressable style={[styles.container, { backgroundColor: colors.modalBg, paddingBottom: Math.max(insets.bottom, 16) }]} accessibilityViewIsModal>
          {/* Drag handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Category tabs */}
          <ScrollView
            ref={tabScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.tabBar, { borderBottomColor: colors.border }]}
            contentContainerStyle={styles.tabBarContent}
          >
            {categoryNames.map(cat => (
              <PressableRow
                key={cat}
                style={[
                  styles.tab,
                  activeCategory === cat && [styles.activeTab, { borderBottomColor: colors.primary }],
                ]}
                onPress={() => handleCategoryTap(cat)}
                accessibilityRole="button"
                accessibilityLabel={`${cat} category${activeCategory === cat ? ', selected' : ''}`}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: activeCategory === cat ? colors.primary : colors.textSecondary },
                  ]}
                  maxFontSizeMultiplier={1.3}
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
                    <Image source={custom.source} style={{ width: 28, height: 28, borderRadius: 4 }} accessible={false} />
                  ) : (
                    <Text style={styles.emoji} maxFontSizeMultiplier={1.3}>{emoji}</Text>
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
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 28,
  },
});
