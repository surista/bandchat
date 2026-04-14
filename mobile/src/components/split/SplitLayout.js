import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

/**
 * Two-pane master/detail layout used exclusively on iPad iOS landscape.
 * Caller controls sidebar width via the `sidebarWidth` prop.
 *
 * Never rendered on iPhone or Android — mount guard lives in the caller
 * via `useLayout().isSplitView`.
 */
function SplitLayout({ left, right, sidebarWidth = 380 }) {
  const { colors } = useTheme();
  return (
    <View style={styles.root}>
      <View
        style={[
          styles.sidebar,
          {
            width: sidebarWidth,
            borderRightColor: colors.border,
            backgroundColor: colors.channelListBg,
          },
        ]}
      >
        {left}
      </View>
      <View style={[styles.detail, { backgroundColor: colors.bgPrimary }]}>
        {right}
      </View>
    </View>
  );
}

export default memo(SplitLayout);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  detail: {
    flex: 1,
  },
});
