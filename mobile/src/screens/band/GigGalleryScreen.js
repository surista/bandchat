import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../context/ThemeContext';
import ImageViewer from '../../components/ImageViewer';
import api from '../../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useLayout } from '../../hooks/useLayout';
import ErrorState from '../../components/ErrorState';

const GAP = 2;
const TABLET_BREAKPOINT = 768;

export default function GigGalleryScreen({ route }) {
  const { gigId, gigTitle } = route.params;
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();
  const { width: screenWidth } = useWindowDimensions();

  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImage, setViewerImage] = useState(null);

  const numColumns = screenWidth >= TABLET_BREAKPOINT ? 5 : 3;
  const itemSize = (screenWidth - GAP * (numColumns - 1)) / numColumns;

  const loadMedia = useCallback(async () => {
    try {
      setLoadError(null);
      const data = await api.getGigMedia(gigId);
      setMedia(data);
    } catch (err) {
      setLoadError('Failed to load media');
    } finally {
      setLoading(false);
    }
  }, [gigId]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  const handleImagePress = useCallback((item) => {
    if (item.type === 'image') {
      setViewerImage(item.url);
      setViewerVisible(true);
    }
  }, []);

  const renderItem = useCallback(({ item }) => {
    const isVideo = item.type === 'video';
    const isImage = item.type === 'image';
    const uploaderName = item.uploadedBy?.displayName || 'Unknown';
    const uploadDate = item.createdAt
      ? format(parseISO(item.createdAt), 'dd-MMM')
      : '';

    return (
      <TouchableOpacity
        style={[styles.gridItem, { width: itemSize, height: itemSize }]}
        onPress={() => handleImagePress(item)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${isVideo ? 'Video' : 'Photo'}${item.caption ? `: ${item.caption}` : ''} by ${uploaderName}`}
      >
        {isImage ? (
          <Image
            source={{ uri: item.url }}
            style={styles.thumbnail}
            contentFit="cover"
            accessibilityLabel={item.caption || 'Gig photo'}
          />
        ) : isVideo ? (
          <View style={[styles.thumbnail, styles.videoPlaceholder, { backgroundColor: colors.bgTertiary }]}>
            <View style={styles.playIconContainer}>
              <Text style={styles.playIcon}>{'\u25B6'}</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.thumbnail, { backgroundColor: colors.bgTertiary, justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="link-outline" size={24} color={colors.textSecondary} />
          </View>
        )}
        {/* Overlay with uploader info */}
        <View style={styles.overlay}>
          <Text style={styles.overlayText} numberOfLines={1}>
            {uploaderName}
          </Text>
          {uploadDate ? (
            <Text style={styles.overlayDate}>{uploadDate}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }, [itemSize, colors, handleImagePress]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <ErrorState message={loadError} onRetry={loadMedia} iconName="images-outline" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      <FlatList
        data={media}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        key={numColumns}
        numColumns={numColumns}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[styles.listContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No photos or videos yet
            </Text>
          </View>
        }
      />

      <ImageViewer
        visible={viewerVisible}
        imageUrl={viewerImage}
        onClose={() => {
          setViewerVisible(false);
          setViewerImage(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  listContent: { flexGrow: 1 },
  row: { gap: GAP },
  gridItem: {
    position: 'relative',
    overflow: 'hidden',
    marginBottom: GAP,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  videoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    color: '#ffffff',
    fontSize: 18,
    marginLeft: 3,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  overlayText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  overlayDate: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
  },
  emptyText: { fontSize: 15 },
});
