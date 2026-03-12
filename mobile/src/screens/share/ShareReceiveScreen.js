import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShareIntent } from 'expo-share-intent';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';

export default function ShareReceiveScreen({ navigation }) {
  const { isAuthenticated } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const { shareIntent, resetShareIntent } = useShareIntent();

  const [workspaces, setWorkspaces] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  // Get shared files from the intent
  const sharedFiles = shareIntent?.files || [];

  // Load workspaces on mount
  useEffect(() => {
    if (!isAuthenticated) {
      // User not logged in - navigate to login
      Alert.alert(
        'Sign in Required',
        'Please sign in to BandChat to share images.',
        [{ text: 'OK', onPress: () => handleCancel() }]
      );
      return;
    }

    loadWorkspaces();
  }, [isAuthenticated]);

  const loadWorkspaces = async () => {
    try {
      const data = await api.getWorkspaces();
      setWorkspaces(data);

      // Auto-select if only one workspace
      if (data.length === 1) {
        setSelectedWorkspace(data[0]);
        loadChannels(data[0].id);
      } else {
        setLoading(false);
      }
    } catch (err) {
      toast.error('Failed to load workspaces');
      setLoading(false);
    }
  };

  const loadChannels = async (workspaceId) => {
    try {
      const data = await api.getChannels(workspaceId);
      // Filter to only show channels user can post to (exclude DMs for simplicity)
      const postableChannels = data.filter(ch => !ch.isDM);
      setChannels(postableChannels);
    } catch (err) {
      toast.error('Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectWorkspace = (workspace) => {
    setSelectedWorkspace(workspace);
    setSelectedChannel(null);
    setChannels([]);
    setLoading(true);
    loadChannels(workspace.id);
  };

  const handleSelectChannel = (channel) => {
    setSelectedChannel(channel);
  };

  const handleSend = async () => {
    if (!selectedChannel || sharedFiles.length === 0) return;

    setSending(true);
    try {
      // Upload each file and collect the results
      const uploadedAttachments = [];
      for (let i = 0; i < sharedFiles.length; i++) {
        const file = sharedFiles[i];
        setUploadProgress((i / sharedFiles.length) * 100);

        const uploaded = await api.uploadFileWithProgress(
          file.path,
          file.fileName || `shared-image-${Date.now()}.jpg`,
          file.mimeType || 'image/jpeg',
          (progress) => {
            const overallProgress = ((i + progress) / sharedFiles.length) * 100;
            setUploadProgress(overallProgress);
          },
          selectedWorkspace.id
        );
        uploadedAttachments.push(uploaded);
      }

      // Send the message with attachments
      await api.sendMessage(selectedChannel.id, message.trim() || '', null, uploadedAttachments);

      toast.success('Shared successfully!');
      resetShareIntent();

      // Navigate to the channel
      navigation.reset({
        index: 1,
        routes: [
          { name: 'WorkspaceList' },
          { name: 'Workspace', params: { id: selectedWorkspace.id, name: selectedWorkspace.name } },
        ],
      });
      setTimeout(() => {
        navigation.navigate('Channel', { channel: selectedChannel, workspaceId: selectedWorkspace.id });
      }, 100);
    } catch (err) {
      toast.error(err.message || 'Failed to share');
    } finally {
      setSending(false);
      setUploadProgress(null);
    }
  };

  const handleCancel = () => {
    resetShareIntent();
    navigation.goBack();
  };

  // Render image preview
  const renderImagePreview = () => {
    if (sharedFiles.length === 0) {
      return (
        <View style={[styles.noImages, { backgroundColor: colors.bgSecondary }]}>
          <Text style={[styles.noImagesText, { color: colors.textSecondary }]}>
            No images to share
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.imagePreviewContainer}
      >
        {sharedFiles.map((file, index) => (
          <Image
            key={index}
            source={{ uri: file.path }}
            style={styles.previewImage}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
    );
  };

  // Render workspace item
  const renderWorkspaceItem = ({ item }) => {
    const isSelected = selectedWorkspace?.id === item.id;
    return (
      <TouchableOpacity
        style={[
          styles.listItem,
          { backgroundColor: colors.bgSecondary },
          isSelected && { backgroundColor: colors.primary + '30', borderColor: colors.primary, borderWidth: 2 },
        ]}
        onPress={() => handleSelectWorkspace(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.itemInfo}>
          <Text style={[styles.itemName, { color: colors.textPrimary }]}>{item.name}</Text>
          <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
            {item._count?.members || 0} members
          </Text>
        </View>
        {isSelected && <Text style={{ color: colors.primary, fontSize: 18 }}>&#10003;</Text>}
      </TouchableOpacity>
    );
  };

  // Render channel item
  const renderChannelItem = ({ item }) => {
    const isSelected = selectedChannel?.id === item.id;
    const prefix = item.isPrivate ? '\u{1F512} ' : '# ';
    return (
      <TouchableOpacity
        style={[
          styles.listItem,
          { backgroundColor: colors.bgSecondary },
          isSelected && { backgroundColor: colors.primary + '30', borderColor: colors.primary, borderWidth: 2 },
        ]}
        onPress={() => handleSelectChannel(item)}
        activeOpacity={0.7}
      >
        <Text style={[styles.channelPrefix, { color: colors.textSecondary }]}>{prefix}</Text>
        <Text style={[styles.channelName, { color: colors.textPrimary }]}>{item.name}</Text>
        {isSelected && (
          <Text style={{ color: colors.primary, fontSize: 18, marginLeft: 'auto' }}>&#10003;</Text>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[styles.cancelButton, { color: colors.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Share to BandChat</Text>
        <TouchableOpacity
          onPress={handleSend}
          disabled={!selectedChannel || sending}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text
              style={[
                styles.sendButton,
                { color: selectedChannel ? colors.primary : colors.textSecondary },
              ]}
            >
              Send
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Upload Progress */}
      {uploadProgress !== null && (
        <View style={[styles.progressBar, { backgroundColor: colors.bgSecondary }]}>
          <View
            style={[styles.progressFill, { backgroundColor: colors.primary, width: `${uploadProgress}%` }]}
          />
        </View>
      )}

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {/* Image Preview */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          {sharedFiles.length} {sharedFiles.length === 1 ? 'image' : 'images'}
        </Text>
        {renderImagePreview()}

        {/* Optional Message */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 20 }]}>
          Add a message (optional)
        </Text>
        <TextInput
          style={[
            styles.messageInput,
            { backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderColor: colors.border },
          ]}
          placeholder="Say something about this..."
          placeholderTextColor={colors.textSecondary}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={2000}
        />

        {/* Workspace Selection */}
        {workspaces.length > 1 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 20 }]}>
              Select Workspace
            </Text>
            <FlatList
              data={workspaces}
              keyExtractor={(item) => item.id}
              renderItem={renderWorkspaceItem}
              scrollEnabled={false}
              contentContainerStyle={styles.listContainer}
            />
          </>
        )}

        {/* Channel Selection */}
        {selectedWorkspace && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 20 }]}>
              Select Channel{workspaces.length === 1 ? ` in ${selectedWorkspace.name}` : ''}
            </Text>
            {channels.length === 0 ? (
              <View style={[styles.noChannels, { backgroundColor: colors.bgSecondary }]}>
                <Text style={[styles.noChannelsText, { color: colors.textSecondary }]}>
                  No channels available
                </Text>
              </View>
            ) : (
              <FlatList
                data={channels}
                keyExtractor={(item) => item.id}
                renderItem={renderChannelItem}
                scrollEnabled={false}
                contentContainerStyle={styles.listContainer}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  cancelButton: {
    fontSize: 16,
  },
  sendButton: {
    fontSize: 16,
    fontWeight: '600',
  },
  progressBar: {
    height: 4,
    width: '100%',
  },
  progressFill: {
    height: '100%',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  imagePreviewContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  previewImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  noImages: {
    padding: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  noImagesText: {
    fontSize: 14,
  },
  messageInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  listContainer: {
    gap: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '500',
  },
  itemMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  channelPrefix: {
    fontSize: 16,
    marginRight: 4,
  },
  channelName: {
    fontSize: 16,
    fontWeight: '500',
  },
  noChannels: {
    padding: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  noChannelsText: {
    fontSize: 14,
  },
});
