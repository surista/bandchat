import { useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, ScrollView, Pressable, StyleSheet, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getUiString, setUiString } from '../services/storage';
import { RELEASE_NOTES, getUnseenNotes } from '../data/releaseNotes';
import { selectionFeedback } from '../utils/haptics';
import { MIN_TOUCH_TARGET } from '../utils/touchTarget';

/**
 * Two modes (mirrors WhatsNewModal.jsx on web):
 *
 * `mode='auto'` (default) — opens on mount when the bundled app version is
 * newer than the last version this device has stamped. Stamps the new
 * version to storage on dismiss so it doesn't re-open. First install (no
 * stamp yet) is silently stamped and no dialog is shown — onboarding wins.
 *
 * `mode='manual'` — controlled by `visible` + `onClose`. Shows ALL notes,
 * regardless of last-seen. Used by Settings → About BandChat.
 */

const STORAGE_KEY = 'bandchat-last-seen-version';

const CURRENT_VERSION = Constants.expoConfig?.version || '0.0.0';

const KIND_LABEL = {
  added: 'New',
  fixed: 'Fixed',
  changed: 'Changed',
  security: 'Security',
};

// Tint colors per kind. Foreground stays high-contrast on dark and light.
const KIND_COLOR = {
  added: { bg: 'rgba(34,197,94,0.18)', fg: '#22c55e', border: 'rgba(34,197,94,0.4)' },
  fixed: { bg: 'rgba(59,130,246,0.18)', fg: '#60a5fa', border: 'rgba(59,130,246,0.4)' },
  changed: { bg: 'rgba(245,158,11,0.18)', fg: '#f59e0b', border: 'rgba(245,158,11,0.4)' },
  security: { bg: 'rgba(168,85,247,0.18)', fg: '#c084fc', border: 'rgba(168,85,247,0.4)' },
};

export default function WhatsNewModal({ mode = 'auto', visible: visibleProp, onClose: onCloseProp }) {
  const { isAuthenticated, loading } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [autoVisible, setAutoVisible] = useState(false);
  const [autoNotes, setAutoNotes] = useState([]);

  useEffect(() => {
    if (mode !== 'auto') return;
    if (loading || !isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const lastSeen = await getUiString(STORAGE_KEY);
      if (cancelled) return;
      let effectiveLastSeen = lastSeen;
      if (!lastSeen) {
        // No stamp on this device. Either a genuinely new install (stay
        // quiet, onboarding is enough) or an existing user upgrading to the
        // version that introduced this feature (should see release notes).
        // Heuristic: ThemeContext writes `bandchat-theme` on first effect
        // run of any session, so any prior launch leaves it behind. There's
        // a tiny race for true fresh installs where ThemeContext beats this
        // effect — worst case is one harmless dialog on first launch.
        const existingThemeMarker = await getUiString('bandchat-theme');
        await setUiString(STORAGE_KEY, CURRENT_VERSION);
        if (cancelled) return;
        if (!existingThemeMarker) return;
        effectiveLastSeen = '0.00.00';
      }
      const unseen = getUnseenNotes(effectiveLastSeen, CURRENT_VERSION);
      if (!cancelled && unseen.length > 0) {
        setAutoNotes(unseen);
        setAutoVisible(true);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, isAuthenticated, loading]);

  const visible = mode === 'auto' ? autoVisible : !!visibleProp;
  const notes = mode === 'auto' ? autoNotes : RELEASE_NOTES;

  const handleClose = async () => {
    selectionFeedback();
    if (mode === 'auto') {
      await setUiString(STORAGE_KEY, CURRENT_VERSION);
      setAutoVisible(false);
    } else {
      onCloseProp?.();
    }
  };

  const title = mode === 'auto' ? `What's new in v${CURRENT_VERSION}` : 'About BandChat';

  // Memoize section styles so RN doesn't rebuild them per render.
  const sectionStyle = useMemo(
    () => ({ borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 16, marginBottom: 16 }),
    [colors.border]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Pressable
        style={styles.overlay}
        onPress={handleClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss release notes"
      >
        <Pressable
          // Inner Pressable swallows backdrop taps so users can scroll/tap
          // inside the sheet without dismissing it.
          onPress={() => {}}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.modalBg,
              paddingBottom: Math.max(insets.bottom, 16),
              maxHeight: '85%',
            },
          ]}
          accessibilityViewIsModal
        >
          {/* Drag handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <Text
              style={[styles.title, { color: colors.textPrimary }]}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.5}
            >
              {title}
            </Text>
            {mode === 'manual' && (
              <Text
                style={[styles.subtitle, { color: colors.textSecondary }]}
                maxFontSizeMultiplier={1.5}
              >
                You&apos;re running v{CURRENT_VERSION}
              </Text>
            )}
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
          >
            {notes.length === 0 ? (
              <Text
                style={{ color: colors.textSecondary, fontSize: 14 }}
                maxFontSizeMultiplier={1.5}
              >
                No release notes available yet.
              </Text>
            ) : (
              notes.map((release, idx) => (
                <View key={release.version} style={idx === notes.length - 1 ? null : sectionStyle}>
                  <View style={styles.versionRow}>
                    <Text
                      style={[styles.versionLabel, { color: colors.textPrimary }]}
                      maxFontSizeMultiplier={1.5}
                    >
                      v{release.version}
                    </Text>
                    <Text
                      style={[styles.versionDate, { color: colors.textSecondary }]}
                      maxFontSizeMultiplier={1.5}
                    >
                      {release.date}
                    </Text>
                  </View>
                  {release.items.map((item, i) => {
                    const kindColor = KIND_COLOR[item.kind] || KIND_COLOR.changed;
                    return (
                      <View key={i} style={styles.item}>
                        <View
                          style={[
                            styles.badge,
                            { backgroundColor: kindColor.bg, borderColor: kindColor.border },
                          ]}
                        >
                          <Text
                            style={[styles.badgeText, { color: kindColor.fg }]}
                            maxFontSizeMultiplier={1.3}
                          >
                            {KIND_LABEL[item.kind] || item.kind}
                          </Text>
                        </View>
                        <Text
                          style={[styles.itemText, { color: colors.textPrimary }]}
                          maxFontSizeMultiplier={1.6}
                        >
                          {item.text}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [
                styles.dismissButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Dismiss release notes"
            >
              <Text
                style={[styles.dismissText, { color: colors.primaryText }]}
                maxFontSizeMultiplier={1.4}
              >
                Got it
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  scroll: {
    flexGrow: 0,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 8,
  },
  versionLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  versionDate: {
    fontSize: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Platform.OS === 'ios' ? 2 : 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  itemText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  dismissButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
