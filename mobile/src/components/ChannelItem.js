import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import getAvatarColor from '../utils/getAvatarColor';

function ChannelItem({ channel, isDM, dmMembers, onPress, unreadCount }) {
  const { colors } = useTheme();

  const renderIcon = () => {
    if (isDM) {
      const name = dmMembers || 'D';
      const initial = name.charAt(0).toUpperCase();
      return (
        <View style={[styles.dmAvatar, { backgroundColor: getAvatarColor(name) }]}>
          <Text style={styles.dmAvatarText}>{initial}</Text>
        </View>
      );
    }
    return (
      <Text style={[styles.channelIcon, { color: colors.channelListText }]}>
        {channel.isPrivate ? '\u{1F512}' : '#'}
      </Text>
    );
  };

  const displayName = isDM ? dmMembers : channel.name;
  const hasUnread = unreadCount > 0;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.6}
      delayPressIn={80}
      accessibilityRole="button"
      accessibilityLabel={`${isDM ? 'Direct message with' : 'Channel'} ${displayName}${hasUnread ? `, ${unreadCount} unread` : ''}`}
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
      {!isDM && channel.pinnedSetlistId && (
        <Text style={{ color: '#4ade80', fontSize: 12, marginLeft: 4 }}>♫</Text>
      )}
      {hasUnread && (
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default memo(ChannelItem);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginHorizontal: 8,
    marginVertical: 1,
  },
  channelIcon: {
    fontSize: 18,
    fontWeight: '700',
    width: 28,
    textAlign: 'center',
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
