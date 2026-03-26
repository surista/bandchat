import { useState, useEffect, memo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Linking,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';

const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const cache = new Map();
const MAX_CACHE = 100;

export function clearLinkPreviewCache() {
  cache.clear();
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function LinkPreview({ content, isOwn, onDismiss, onLongPress, blockedDomains }) {
  const { colors } = useTheme();
  const [preview, setPreview] = useState(null);
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!content) return;

    const match = content.match(URL_REGEX);
    if (!match || match.length === 0) return;

    const firstUrl = match[0].replace(/[)}\]>,;.!?]+$/, '');
    setUrl(firstUrl);

    // Check if domain is blocked
    try {
      const domain = new URL(firstUrl).hostname;
      if (blockedDomains?.has(domain)) return;
    } catch {
      // Expected: URL parsing may fail for invalid input
    }

    if (cache.has(firstUrl)) {
      const cached = cache.get(firstUrl);
      if (cached) setPreview(cached);
      return;
    }

    let cancelled = false;

    api.getLinkPreview(firstUrl)
      .then(data => {
        if (cancelled) return;
        // Evict oldest if at capacity
        if (cache.size >= MAX_CACHE) {
          const firstKey = cache.keys().next().value;
          cache.delete(firstKey);
        }
        cache.set(firstUrl, data);
        setPreview(data);
      })
      .catch(() => {
        // Don't cache errors — allow retry on next render
      });

    return () => { cancelled = true; };
  }, [content, blockedDomains]);

  if (!preview || !url) return null;
  if (!preview.title && !preview.description) return null;

  // Hide if domain is blocked (checked at render time for reactivity)
  try {
    if (blockedDomains?.has(new URL(url).hostname)) return null;
  } catch {
    // Expected: URL parsing may fail for invalid input
  }

  const handlePress = () => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.wrapper}>
      {isOwn && onDismiss && (
        <TouchableOpacity
          style={[styles.dismissButton, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
          onPress={onDismiss}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          accessibilityRole="button"
          accessibilityLabel="Remove link preview"
        >
          <Text style={[styles.dismissText, { color: colors.textSecondary }]}>{'\u00D7'}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.container, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
        onPress={handlePress}
        onLongPress={() => onLongPress?.(url)}
        delayLongPress={400}
        activeOpacity={0.7}
        accessibilityRole="link"
        accessibilityLabel={`Link preview: ${preview.title || getHostname(url)}`}
      >
        <View style={styles.textContent}>
          <Text style={[styles.domain, { color: colors.textSecondary }]} numberOfLines={1}>
            {getHostname(url)}
          </Text>
          {preview.title && (
            <Text style={[styles.title, { color: colors.primary }]} numberOfLines={2}>
              {preview.title}
            </Text>
          )}
          {preview.description && (
            <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
              {preview.description}
            </Text>
          )}
        </View>
        {preview.image && (
          <Image
            source={{ uri: preview.image }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        )}
      </TouchableOpacity>
    </View>
  );
}

export default memo(LinkPreview);

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    marginTop: 6,
  },
  dismissButton: {
    position: 'absolute',
    top: -8,
    right: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  container: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  textContent: {
    flex: 1,
    padding: 10,
    justifyContent: 'center',
  },
  domain: {
    fontSize: 11,
    marginBottom: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
  },
  thumbnail: {
    width: 60,
    height: 60,
    alignSelf: 'center',
    margin: 8,
    borderRadius: 6,
  },
});
