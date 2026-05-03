import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  LayoutAnimation,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, themes } from '../../context/ThemeContext';
import { useLayout } from '../../hooks/useLayout';
import { selectionFeedback } from '../../utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';

const themeKeys = Object.keys(themes);

// Note: FREE_THEME_IDS is also defined in server/src/lib/planLimits.js
const FREE_THEME_IDS = ['default', 'midnight', 'ocean'];

export default function AppearanceScreen({ route }) {
  const workspaceId = route?.params?.workspaceId;
  const { currentTheme, mode, toggleMode, colors, globalTheme, setGlobalTheme, setWorkspaceTheme, getWorkspaceTheme } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();

  const [workspaceName, setWorkspaceName] = useState(null);
  const [effectivePlan, setEffectivePlan] = useState(null);

  useEffect(() => {
    if (workspaceId) {
      api.getWorkspace(workspaceId).then(ws => {
        setWorkspaceName(ws.name);
        setEffectivePlan(ws.effectivePlan);
      }).catch(() => {});
    }
  }, [workspaceId]);

  const hasCustomTheme = workspaceId ? !!getWorkspaceTheme(workspaceId) : false;

  const handleThemeSelect = (key) => {
    const isLocked = effectivePlan !== 'PRO' && !FREE_THEME_IDS.includes(key);
    if (isLocked) return;
    selectionFeedback();
    if (workspaceId && hasCustomTheme) {
      setWorkspaceTheme(workspaceId, key);
    } else {
      setGlobalTheme(key);
    }
  };

  const handleToggleCustomTheme = () => {
    selectionFeedback();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (hasCustomTheme) {
      setWorkspaceTheme(workspaceId, null);
    } else {
      setWorkspaceTheme(workspaceId, currentTheme);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      <ScrollView contentContainerStyle={[styles.content, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
        {/* Mode Toggle */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]} accessibilityRole="header">MODE</Text>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          <View style={styles.modeRow}>
            <Text style={[styles.modeLabel, { color: colors.textPrimary }]}>Dark Mode</Text>
            <Switch
              value={mode === 'dark'}
              onValueChange={() => { selectionFeedback(); toggleMode(); }}
              trackColor={{ false: colors.bgTertiary, true: colors.primary }}
              thumbColor="#ffffff"
              accessibilityLabel={`Dark Mode, ${mode === 'dark' ? 'on' : 'off'}`}
            />
          </View>
        </View>

        {/* Per-band theme toggle */}
        {workspaceId && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]} accessibilityRole="header">BAND THEME</Text>
            <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
              <View style={styles.modeRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[styles.modeLabel, { color: colors.textPrimary }]}>
                    Custom theme for {workspaceName || 'this band'}
                  </Text>
                  <Text style={[styles.hint, { color: colors.textSecondary }]}>
                    {hasCustomTheme
                      ? `Using ${themes[getWorkspaceTheme(workspaceId)]?.name || 'custom'}`
                      : `Uses your default (${themes[globalTheme]?.name || 'Default'})`}
                  </Text>
                </View>
                <Switch
                  value={hasCustomTheme}
                  onValueChange={handleToggleCustomTheme}
                  trackColor={{ false: colors.bgTertiary, true: colors.primary }}
                  thumbColor="#ffffff"
                  accessibilityLabel={`Custom theme for ${workspaceName || 'this band'}, ${hasCustomTheme ? 'on' : 'off'}`}
                />
              </View>
            </View>
          </>
        )}

        {/* Theme Grid */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]} accessibilityRole="header">
          {workspaceId && hasCustomTheme ? 'CHOOSE THEME' : 'THEME'}
        </Text>
        <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Theme selector">
          {themeKeys.map(key => {
            const theme = themes[key];
            const isActive = key === currentTheme;
            const isLocked = effectivePlan !== null && effectivePlan !== 'PRO' && !FREE_THEME_IDS.includes(key);
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.themeItem,
                  { backgroundColor: colors.bgSecondary },
                  isActive && { borderColor: colors.primary, borderWidth: 2 },
                  isLocked && { opacity: 0.5 },
                ]}
                onPress={() => handleThemeSelect(key)}
                disabled={isLocked}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ checked: isActive, disabled: isLocked }}
                accessibilityLabel={`${theme.name} theme${isLocked ? ', locked, upgrade to PRO' : ''}`}
              >
                <View style={[styles.swatch, { backgroundColor: theme.sidebar }]}>
                  <View style={[styles.swatchInner, { backgroundColor: theme.primary }]} />
                  {isActive && (
                    <View style={[styles.checkContainer, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.checkmark, { color: colors.primaryText }]}>{'\u2713'}</Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[styles.themeName, { color: isActive ? colors.primary : colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {isLocked ? <><Ionicons name="lock-closed" size={10} color={colors.textSecondary} />{' '}</> : null}{theme.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 12,
    padding: 16,
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modeLabel: { fontSize: 16, fontWeight: '500' },
  hint: { fontSize: 13, marginTop: 2 },
  // Theme grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  themeItem: {
    width: '22.5%',
    aspectRatio: 0.85,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  swatchInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  checkContainer: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: { fontSize: 12, fontWeight: '700' },
  themeName: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
});
