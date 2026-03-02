import { useState, useEffect, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { getRecentEmojis, addRecentEmoji } from '../services/storage';

const EMOJI_CATEGORIES = {
  Reactions: ['👍', '👎', '❤️', '🔥', '😂', '😮', '😢', '😡', '🎉', '🙏', '👏', '💯', '✅', '❌', '👀', '🤔', '💪', '🙌', '😍', '🥳'],
  Music: ['🎸', '🥁', '🎤', '🎹', '🎵', '🎶', '🎧', '🎼', '🎺', '🎻', '🪘', '🎷', '🪗', '🎚️', '🔊'],
  People: ['😀', '😎', '🤘', '🤟', '👋', '🙋', '💃', '🕺', '🧑‍🎤', '👨‍🎤', '👩‍🎤', '🤷', '🙅', '🙆', '💁'],
  Food: ['🍕', '🍔', '🍟', '🌮', '🍣', '🍜', '🍺', '🍷', '☕', '🍰', '🍩', '🌭', '🥗', '🍝', '🥤'],
};

const BASE_CATEGORIES = Object.keys(EMOJI_CATEGORIES);

function EmojiPicker({ visible, onClose, onSelect }) {
  const { colors } = useTheme();
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.container, { backgroundColor: colors.modalBg }]}>
          {/* Category tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabBar, { borderBottomColor: colors.border }]} contentContainerStyle={styles.tabBarContent}>
            {categoryNames.map(cat => (
              <TouchableOpacity
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
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Emoji grid */}
          <ScrollView contentContainerStyle={styles.grid}>
            {currentEmojis.map((emoji, idx) => (
              <TouchableOpacity
                key={`${emoji}-${idx}`}
                style={styles.emojiButton}
                onPress={() => handleSelect(emoji)}
                activeOpacity={0.5}
                accessibilityRole="button"
                accessibilityLabel={`Select ${emoji}`}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
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
    maxHeight: 350,
    paddingBottom: 34,
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
