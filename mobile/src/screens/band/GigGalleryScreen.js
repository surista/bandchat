import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../context/ThemeContext';
import ImageViewer from '../../components/ImageViewer';
import api from '../../services/api';

const NUM_COLUMNS = 3;
const GAP = 2;

export default function GigGalleryScreen({ route }) {
  const { gigId, gigTitle } = route.params;
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImage, setViewerImage] = useState(null);

  const itemSize = (screenWidth - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

  const loadMedia = useCallback(async () => {
    try {
      const data = await api.getGigMedia(gigId);
      setMedia(data);
    } catch (err) {
      console.error('Failed to load gig media:', err);
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
      ? format(parseISO(item.createdAt), 'MMM d')
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
            resizeMode="cover"
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
            <Text style={{ color: colors.textSecondary, fontSize: 24 }}>{'\uD83D\uDD17'}</Text>
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
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      <FlatList
        data={media}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
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
