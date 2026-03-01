import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Image,
  StyleSheet,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

function getInitial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

function SettingsRow({ icon, label, onPress, color, colors, showArrow = true }) {
  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.bgSecondary }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={[styles.rowLabel, { color: color || colors.textPrimary }]}>{label}</Text>
      {showArrow && (
        <Text style={[styles.rowArrow, { color: colors.textSecondary }]}>{'\u203A'}</Text>
      )}
    </TouchableOpacity>
  );
}

function SectionHeader({ title, colors }) {
  return (
    <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{title}</Text>
  );
}

export default function SettingsScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkRole = async () => {
      try {
        const ws = await api.getWorkspace(workspaceId);
        const membership = ws.members?.find(m => m.userId === user?.id);
        setIsAdmin(membership?.role === 'admin');
      } catch {
        // Default to non-admin
      }
    };
    checkRole();
  }, [workspaceId, user?.id]);

  const handleLogout = useCallback(() => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  }, [logout]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* User Card */}
        <TouchableOpacity
          style={[styles.userCard, { backgroundColor: colors.bgSecondary }]}
          onPress={() => navigation.navigate('EditProfile')}
          activeOpacity={0.6}
        >
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatarImg} />
          ) : (
            <View style={[styles.avatarImg, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{getInitial(user?.displayName)}</Text>
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: colors.textPrimary }]}>
              {user?.displayName || 'User'}
            </Text>
            <Text style={[styles.userEmail, { color: colors.textSecondary }]}>
              {user?.email || ''}
            </Text>
          </View>
          <Text style={[styles.rowArrow, { color: colors.textSecondary }]}>{'\u203A'}</Text>
        </TouchableOpacity>

        {/* Account */}
        <SectionHeader title="ACCOUNT" colors={colors} />
        <View style={styles.group}>
          <SettingsRow
            icon={'\uD83D\uDC64'}
            label="Profile"
            onPress={() => navigation.navigate('EditProfile')}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon={'\uD83D\uDD12'}
            label="Security"
            onPress={() => navigation.navigate('Security')}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon={'\uD83D\uDEAB'}
            label="Blocked Users"
            onPress={() => navigation.navigate('BlockedUsers')}
            colors={colors}
          />
        </View>

        {/* Preferences */}
        <SectionHeader title="PREFERENCES" colors={colors} />
        <View style={styles.group}>
          <SettingsRow
            icon={'\uD83C\uDFA8'}
            label="Appearance"
            onPress={() => navigation.navigate('Appearance')}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon={'\uD83D\uDD14'}
            label="Notifications"
            onPress={() => navigation.navigate('Notifications')}
            colors={colors}
          />
        </View>

        {/* Workspace */}
        <SectionHeader title="WORKSPACE" colors={colors} />
        <View style={styles.group}>
          {isAdmin && (
            <>
              <SettingsRow
                icon={'\uD83D\uDC65'}
                label="Members"
                onPress={() => navigation.navigate('WorkspaceMembers', { workspaceId })}
                colors={colors}
              />
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
              <SettingsRow
                icon={'\uD83D\uDCE5'}
                label="Export Workspace"
                onPress={async () => {
                  try {
                    const data = await api.exportWorkspaceData(workspaceId);
                    const json = JSON.stringify(data, null, 2);
                    const path = `${FileSystem.cacheDirectory}bandchat-workspace-export.json`;
                    await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
                    await Sharing.shareAsync(path, { mimeType: 'application/json' });
                  } catch (err) {
                    Alert.alert('Error', err.message || 'Failed to export workspace');
                  }
                }}
                colors={colors}
              />
              <View style={[styles.separator, { backgroundColor: colors.border }]} />
            </>
          )}
          <SettingsRow
            icon={'\u2709\uFE0F'}
            label="Invite People"
            onPress={() => navigation.navigate('Invite', { workspaceId })}
            colors={colors}
          />
        </View>

        {/* Legal */}
        <SectionHeader title="LEGAL" colors={colors} />
        <View style={styles.group}>
          <SettingsRow
            icon={'\uD83D\uDD12'}
            label="Privacy Policy"
            onPress={() => Linking.openURL('https://bandchat.app/privacy')}
            colors={colors}
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon={'\uD83D\uDCC4'}
            label="Terms of Service"
            onPress={() => Linking.openURL('https://bandchat.app/terms')}
            colors={colors}
          />
        </View>

        {/* App */}
        <SectionHeader title="APP" colors={colors} />
        <View style={styles.group}>
          <SettingsRow
            icon={'\uD83D\uDEAA'}
            label="Log Out"
            onPress={handleLogout}
            color="#ef4444"
            colors={colors}
            showArrow={false}
          />
        </View>

        <Text style={[styles.version, { color: colors.textSecondary }]}>
          BandChat Mobile v{Constants.expoConfig?.version || '1.0.0'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  // User card
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  avatarImg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { color: '#ffffff', fontSize: 22, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  userEmail: { fontSize: 14 },
  // Section
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  group: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowIcon: { fontSize: 18, width: 30, textAlign: 'center' },
  rowLabel: { fontSize: 16, flex: 1, marginLeft: 4 },
  rowArrow: { fontSize: 22, fontWeight: '300' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 50 },
  version: { fontSize: 13, textAlign: 'center', marginTop: 32 },
});
