import { memo } from 'react';
import { View, Text, Modal, Pressable, StyleSheet, ScrollView, Platform } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { selectionFeedback } from '../utils/haptics';
import PressableRow from './PressableRow';

/**
 * Workspace switcher modal component.
 * Shows all user's workspaces with quick-switch navigation.
 */
function WorkspaceSwitcher({ visible, currentWorkspace, workspaces = [], onSelect, onManageAll, onClose }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  // Sort other workspaces alphabetically
  const otherWorkspaces = workspaces
    .filter(ws => ws.id !== currentWorkspace?.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleSelect = (workspace) => {
    selectionFeedback();
    onSelect(workspace);
  };

  const handleManageAll = () => {
    selectionFeedback();
    onManageAll();
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss workspace switcher"
      >
        <Pressable
          onPress={() => {}}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.modalBg,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>Switch Workspace</Text>

          {/* Current Workspace */}
          <View style={[styles.currentSection, { backgroundColor: colors.bgTertiary }]}>
            <View style={styles.workspaceRow}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                {currentWorkspace?.avatarUrl ? (
                  <Image source={{ uri: currentWorkspace.avatarUrl }} style={styles.avatarImage} accessible={false} />
                ) : (
                  <Text style={styles.avatarText}>
                    {currentWorkspace?.name?.charAt(0).toUpperCase() || '?'}
                  </Text>
                )}
              </View>
              <View style={styles.workspaceInfo}>
                <Text style={[styles.workspaceName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {currentWorkspace?.name}
                </Text>
                <Text style={[styles.workspaceSubtext, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                  Current workspace
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            </View>
          </View>

          {/* Other Workspaces */}
          {otherWorkspaces.length > 0 && (
            <ScrollView style={styles.listSection} showsVerticalScrollIndicator={false}>
              {otherWorkspaces.map((workspace) => (
                <PressableRow
                  key={workspace.id}
                  style={styles.workspaceRow}
                  onPress={() => handleSelect(workspace)}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${workspace.name}`}
                >
                  <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                    {workspace.avatarUrl ? (
                      <Image source={{ uri: workspace.avatarUrl }} style={styles.avatarImage} accessible={false} />
                    ) : (
                      <Text style={styles.avatarText}>
                        {workspace.name.charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={styles.workspaceInfo}>
                    <Text style={[styles.workspaceName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {workspace.name}
                    </Text>
                    <Text style={[styles.workspaceSubtext, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                      {workspace._count?.members || 0} member{workspace._count?.members !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  {workspace.unreadCount > 0 && (
                    <View style={[styles.badge, { backgroundColor: colors.error }]}>
                      <Text style={styles.badgeText} maxFontSizeMultiplier={1.3}>
                        {workspace.unreadCount > 99 ? '99+' : workspace.unreadCount}
                      </Text>
                    </View>
                  )}
                </PressableRow>
              ))}
            </ScrollView>
          )}

          {/* All Workspaces link */}
          <PressableRow
            style={[styles.footerRow, { borderTopColor: colors.border }]}
            onPress={handleManageAll}
            accessibilityRole="button"
            accessibilityLabel="All workspaces"
          >
            <Ionicons name="grid-outline" size={20} color={colors.textSecondary} />
            <Text style={[styles.footerText, { color: colors.textPrimary }]}>All Workspaces</Text>
          </PressableRow>

          {/* Cancel — iOS only */}
          {Platform.OS === 'ios' && (
            <PressableRow
              style={[styles.cancelRow, { borderTopColor: colors.border }]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </PressableRow>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default memo(WorkspaceSwitcher);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
    maxHeight: '70%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingBottom: 16,
    textAlign: 'center',
  },
  currentSection: {
    marginHorizontal: 12,
    borderRadius: 12,
    paddingVertical: 4,
    marginBottom: 8,
  },
  listSection: {
    maxHeight: 250,
    paddingHorizontal: 12,
  },
  workspaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  workspaceInfo: {
    flex: 1,
    minWidth: 0,
  },
  workspaceName: {
    fontSize: 16,
    fontWeight: '600',
  },
  workspaceSubtext: {
    fontSize: 13,
    marginTop: 2,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
    marginHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: {
    fontSize: 16,
  },
  cancelRow: {
    paddingVertical: 16,
    marginHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
  },
});
