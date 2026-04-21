import { useMemo, memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import ChannelScreen from '../../screens/workspace/ChannelScreen';

/**
 * Renders ChannelScreen inside the right pane of the iPad split layout.
 *
 * ChannelScreen expects `navigation` and `route` props. We synthesize both:
 *   - `route` carries the selected channel + workspaceId
 *   - `navigation` is a proxy that intercepts `setOptions` (no-op — there's no
 *     inline header) and `navigate('Channel', ...)` (switches active channel
 *     in the host). Everything else passes through to the real stack nav so
 *     Thread, ChannelSettings, PinnedMessages, MemberProfile still push as
 *     full-screen overlays.
 *
 * iPhone and Android phones never mount this — it's only rendered from
 * ChannelListScreen when `useLayout().isSplitView` is true, which is itself
 * gated on `Platform.isPad && isLandscape`.
 */
function ChannelPaneHost({ channel, workspaceId, parentNavigation, onSwitchChannel }) {
  const { colors } = useTheme();

  // Synthesize a stable route — key on channel.id so ChannelScreen's effects
  // re-run correctly when the user switches channels in the list.
  // `_splitPane: true` signals to ChannelScreen that it should render its
  // channel-options button inline instead of via `navigation.setOptions`,
  // because the proxy navigation intentionally drops setOptions calls.
  const syntheticRoute = useMemo(
    () => ({
      key: `split-channel-${channel?.id ?? 'none'}`,
      name: 'Channel',
      params: { channel, workspaceId, _splitPane: true },
    }),
    [channel, workspaceId],
  );

  // Proxy navigation: forward most calls, intercept Channel + setOptions
  const proxyNavigation = useMemo(() => {
    const proxy = {
      // Header options would render on ChannelListScreen's header — we
      // deliberately drop them and render our own inline controls instead.
      setOptions: () => {},
      // In split mode, tapping a #channel reference swaps the pane rather
      // than pushing a new screen.
      navigate: (screen, params) => {
        if (screen === 'Channel' && params?.channel) {
          onSwitchChannel(params.channel);
          return;
        }
        parentNavigation.navigate(screen, params);
      },
      goBack: () => onSwitchChannel(null),
      push: (screen, params) => parentNavigation.navigate(screen, params),
      replace: (screen, params) => parentNavigation.navigate(screen, params),
      pop: () => onSwitchChannel(null),
      dispatch: (action) => parentNavigation.dispatch(action),
      addListener: (event, callback) => parentNavigation.addListener(event, callback),
      removeListener: (event, callback) => parentNavigation.removeListener?.(event, callback),
      canGoBack: () => true,
      isFocused: () => parentNavigation.isFocused(),
      getState: () => parentNavigation.getState(),
      getParent: () => parentNavigation.getParent(),
      getId: () => 'split-channel-pane',
    };
    return proxy;
  }, [parentNavigation, onSwitchChannel]);

  if (!channel) {
    return (
      <SafeAreaView style={[styles.placeholder, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <Ionicons name="chatbubbles-outline" size={64} color={colors.textSecondary} />
        <Text style={[styles.placeholderTitle, { color: colors.textPrimary }]}>
          Select a channel
        </Text>
        <Text style={[styles.placeholderSubtitle, { color: colors.textSecondary }]}>
          Pick a channel from the list to start reading messages.
        </Text>
      </SafeAreaView>
    );
  }

  // Bottom safe-area padding so the MessageInput in the right pane never
  // sits flush against the iPad home indicator. The `key={channel.id}` is
  // intentional — it forces ChannelScreen to remount on channel switch so
  // messages/loading/socket state resets to a clean slate instead of
  // briefly flashing the previous channel's messages.
  return (
    <SafeAreaView style={styles.paneContainer} edges={['bottom']}>
      <ChannelScreen
        key={channel.id}
        navigation={proxyNavigation}
        route={syntheticRoute}
      />
    </SafeAreaView>
  );
}

export default memo(ChannelPaneHost);

const styles = StyleSheet.create({
  paneContainer: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  placeholderSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 20,
  },
});
