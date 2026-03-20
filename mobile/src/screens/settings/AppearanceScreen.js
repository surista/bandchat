import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, themes } from '../../context/ThemeContext';
import { useLayout } from '../../hooks/useLayout';
import { selectionFeedback } from '../../utils/haptics';

const themeKeys = Object.keys(themes);

export default function AppearanceScreen({ route }) {
  const workspaceId = route?.params?.workspaceId;
  const { currentTheme, setTheme, mode, toggleMode, colors, globalTheme, setGlobalTheme, setWorkspaceTheme, getWorkspaceTheme } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();

  const hasCustomTheme = workspaceId ? !!getWorkspaceTheme(workspaceId) : false;

  const handleThemeSelect = (key) => {
    selectionFeedback();
    if (workspaceId && hasCustomTheme) {
      setWorkspaceTheme(workspaceId, key);
    } else {
      setGlobalTheme(key);
    }
  };

  const handleToggleCustomTheme = () => {
    selectionFeedback();
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
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>MODE</Text>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          <View style={styles.modeRow} accessibilityRole="switch" accessibilityLabel={`Dark Mode, ${mode === 'dark' ? 'on' : 'off'}`}>
            <Text style={[styles.modeLabel, { color: colors.textPrimary }]}>Dark Mode</Text>
            <Switch
              value={mode === 'dark'}
              onValueChange={toggleMode}
              trackColor={{ false: '#767577', true: colors.primary }}
              thumbColor="#ffffff"
              accessibilityLabel="Toggle dark mode"
            />
          </View>
        </View>

        {/* Per-band theme toggle */}
        {workspaceId && (
          <>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>BAND THEME</Text>
            <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
              <View style={styles.modeRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[styles.modeLabel, { color: colors.textPrimary }]}>Custom theme for this band</Text>
                  <Text style={[styles.hint, { color: colors.textSecondary }]}>
                    {hasCustomTheme ? 'This band has its own look' : 'Uses your default theme'}
                  </Text>
                </View>
                <Switch
                  value={hasCustomTheme}
                  onValueChange={handleToggleCustomTheme}
                  trackColor={{ false: '#767577', true: colors.primary }}
                  thumbColor="#ffffff"
                  accessibilityLabel="Custom theme for this band"
                />
              </View>
            </View>
          </>
        )}

        {/* Theme Grid */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
          {workspaceId && hasCustomTheme ? 'BAND THEME' : 'THEME'}
        </Text>
        <View style={styles.grid}>
          {themeKeys.map(key => {
            const theme = themes[key];
            const isActive = key === currentTheme;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.themeItem,
                  { backgroundColor: colors.bgSecondary },
                  isActive && { borderColor: colors.primary, borderWidth: 2 },
                ]}
                onPress={() => handleThemeSelect(key)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${theme.name} theme${isActive ? ', selected' : ''}`}
              >
                <View style={[styles.swatch, { backgroundColor: theme.sidebar }]}>
                  <View style={[styles.swatchInner, { backgroundColor: theme.primary }]} />
                  {isActive && (
                    <View style={styles.checkContainer}>
                      <Text style={styles.checkmark}>{'\u2713'}</Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[styles.themeName, { color: isActive ? colors.primary : colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {theme.name}
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
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 24,
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
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  themeName: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
});
