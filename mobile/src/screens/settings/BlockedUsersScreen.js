import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import getInitial from '../../utils/getInitial';
import api from '../../services/api';
import { useLayout } from '../../hooks/useLayout';

export default function BlockedUsersScreen() {
  const { colors } = useTheme()
  const { isTablet, contentMaxWidth } = useLayout();
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadBlocked = useCallback(async () => {
    try {
      const data = await api.getBlockedUsers();
      setBlockedUsers(data);
    } catch (err) {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBlocked();
  }, [loadBlocked]);

  const handleUnblock = useCallback((blockedUserId, displayName) => {
    Alert.alert(
      'Unblock User',
      `Unblock ${displayName}? Their messages will be visible again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              await api.unblockUser(blockedUserId);
              setBlockedUsers(prev => prev.filter(b => b.blockedUserId !== blockedUserId));
            } catch (err) {
              Alert.alert('Error', 'Failed to unblock user.');
            }
          },
        },
      ]
    );
  }, []);

  const renderItem = useCallback(({ item }) => (
    <View style={[styles.row, { backgroundColor: colors.bgSecondary }]}>
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <Text style={styles.avatarText}>{getInitial(item.blockedUser?.displayName)}</Text>
      </View>
      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
        {item.blockedUser?.displayName || 'Unknown'}
      </Text>
      <TouchableOpacity
        style={[styles.unblockBtn, { backgroundColor: colors.primary + '20' }]}
        onPress={() => handleUnblock(item.blockedUserId, item.blockedUser?.displayName)}
        activeOpacity={0.6}
      >
        <Text style={[styles.unblockText, { color: colors.primary }]}>Unblock</Text>
      </TouchableOpacity>
    </View>
  ), [colors, handleUnblock]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      {blockedUsers.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            You haven't blocked anyone
          </Text>
        </View>
      ) : (
        <FlatList
          data={blockedUsers}
          keyExtractor={(item) => item.blockedUserId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15 },
  list: { padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  unblockBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  unblockText: { fontSize: 14, fontWeight: '600' },
});
