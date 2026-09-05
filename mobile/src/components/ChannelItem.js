import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import getAvatarColor from '../utils/getAvatarColor';
import PressableRow from './PressableRow';
import { MIN_TOUCH_TARGET } from '../utils/touchTarget';

function ChannelItem({ channel, isDM, dmMembers, onPress, onLongPress, unreadCount, accessibilityHint }) {
  const { colors } = useTheme();

  const renderIcon = () => {
    if (isDM) {
      const name = dmMembers || 'D';
      const initial = name.charAt(0).toUpperCase();
      return (
        <View style={[styles.dmAvatar, { backgroundColor: getAvatarColor(name) }]}>
          <Text style={styles.dmAvatarText} maxFontSizeMultiplier={1.3}>{initial}</Text>
        </View>
      );
    }
    if (channel.isPrivate) {
      return (
        <View style={styles.channelIconWrap}>
          <Ionicons name="lock-closed" size={14} color={colors.channelListText} />
        </View>
      );
    }
    return (
      <Text style={[styles.channelIcon, { color: colors.channelListText }]}>
        #
      </Text>
    );
  };

  const displayName = isDM ? dmMembers : channel.name;
  const hasUnread = unreadCount > 0;

  return (
    <PressableRow
      style={styles.container}
      onPress={onPress}
      onLongPress={onLongPress ? () => onLongPress(channel) : undefined}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`${isDM ? 'Direct message with' : 'Channel'} ${displayName}${!isDM && channel.starred ? ', starred' : ''}${hasUnread ? `, ${unreadCount} unread` : ''}`}
      accessibilityHint={accessibilityHint || (isDM ? 'Open conversation' : 'Open channel')}
    >
      {renderIcon()}
      <Text
        style={[
          styles.name,
          { color: hasUnread ? colors.channelListTextBold : colors.channelListText },
          hasUnread && styles.nameBold,
        ]}
        numberOfLines={1}
      >
        {displayName}
      </Text>
      {!isDM && channel.starred && (
        <Ionicons name="star" size={12} color="#facc15" style={{ marginLeft: 4 }} accessibilityLabel="Starred channel" />
      )}
      {!isDM && channel.pinnedSetlistId && (
        <Ionicons name="musical-notes" size={12} color="#4ade80" style={{ marginLeft: 4 }} />
      )}
      {hasUnread && (
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text style={styles.badgeText} maxFontSizeMultiplier={1.3}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </PressableRow>
  );
}

export default memo(ChannelItem);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginHorizontal: 8,
    marginVertical: 1,
    minHeight: MIN_TOUCH_TARGET,
  },
  channelIcon: {
    fontSize: 18,
    fontWeight: '700',
    width: 28,
    textAlign: 'center',
  },
  channelIconWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dmAvatar: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dmAvatarText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  name: {
    fontSize: 15,
    marginLeft: 8,
    flex: 1,
  },
  nameBold: {
    fontWeight: '700',
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
