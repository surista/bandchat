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
import { getFrequentEmojis, peekFrequentEmojis, trackEmojiUsage } from '../utils/emojiFrequency';
import PressableRow from './PressableRow';
import { selectionFeedback } from '../utils/haptics';
import { MIN_TOUCH_TARGET } from '../utils/touchTarget';

// Custom emoji rendered as images.
//
// Null-prototype on purpose: reactions are looked up here by key, and the server
// accepts any string up to 32 chars as a reaction emoji. With a normal object
// literal, a reaction of the literal text "constructor" (or "toString",
// "__proto__", …) resolves through the prototype chain to a truthy value, and
// every viewer renders it as <Image source={undefined}> instead of as text.
export const CUSTOM_EMOJI = Object.assign(Object.create(null), {
  ':bandchat:': { source: require('../../assets/blue_flame_emoji.png'), alt: 'BandChat' },
});

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

// The user's most-used emojis lead the tab bar and are always selected on open.
const FREQUENT = 'Frequent';
const FREQUENT_COUNT = 21; // three rows of seven
const BASE_CATEGORIES = Object.keys(EMOJI_CATEGORIES);
const CATEGORY_NAMES = [FREQUENT, ...BASE_CATEGORIES];

function EmojiPicker({ visible, onClose, onSelect }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [frequentEmojis, setFrequentEmojis] = useState(() => peekFrequentEmojis(FREQUENT_COUNT));
  const [activeCategory, setActiveCategory] = useState(FREQUENT);
  const tabScrollRef = useRef(null);

  useEffect(() => {
    if (visible) {
      // Dismiss any keyboard that was open before showing the picker,
      // so on Android the 380pt sheet isn't pushed above an open IME.
      Keyboard.dismiss();
      setActiveCategory(FREQUENT);
      tabScrollRef.current?.scrollTo({ x: 0, animated: false });
      getFrequentEmojis(FREQUENT_COUNT).then(setFrequentEmojis);
    }
  }, [visible]);

  const currentEmojis = activeCategory === FREQUENT ? frequentEmojis : (EMOJI_CATEGORIES[activeCategory] || []);

  const handleSelect = (emoji) => {
    selectionFeedback();
    trackEmojiUsage(emoji, FREQUENT_COUNT).then(setFrequentEmojis);
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
            {CATEGORY_NAMES.map(cat => (
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
