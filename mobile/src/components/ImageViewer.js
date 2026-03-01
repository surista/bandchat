import { memo, useState, useCallback } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  Text,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  Image,
} from 'react-native';

function ImageViewer({ visible, imageUrl, onClose }) {
  const [loading, setLoading] = useState(true);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const handleClose = useCallback(() => {
    setLoading(true);
    onClose();
  }, [onClose]);

  if (!imageUrl) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.closeButton} onPress={handleClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Close image viewer">
          <Text style={styles.closeText}>{'\u2715'}</Text>
        </TouchableOpacity>
        {loading && (
          <ActivityIndicator style={styles.loader} size="large" color="#ffffff" />
        )}
        <Image
          source={{ uri: imageUrl }}
          style={{ width: screenWidth, height: screenHeight * 0.75 }}
          resizeMode="contain"
          onLoadEnd={() => setLoading(false)}
          accessibilityLabel="Full size image"
        />
      </View>
    </Modal>
  );
}

export default memo(ImageViewer);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  loader: {
    position: 'absolute',
  },
});
