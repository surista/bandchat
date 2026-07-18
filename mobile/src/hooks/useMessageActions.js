import { useState, useEffect, useCallback } from 'react';
import { Alert, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';
import { File, Directory, Paths } from 'expo-file-system/next';
import { getUiState, setUiState } from '../services/storage';
import userPreferences from '../services/userPreferences';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { successNotification, errorNotification, selectionFeedback } from '../utils/haptics';
import api from '../services/api';
import { APP_BASE_URL } from '../utils/constants';

/**
 * Shared message action logic for ChannelScreen and ThreadScreen.
 * Handles long-press, copy, edit, delete, save image, reactions, preview toggle.
 *
 * @param {object} options
 * @param {Function} options.findMessage - Function to find a message by ID from current messages
 * @param {object} options.extraActions - Additional action cases for handleAction switch (e.g., reply, pin, bookmark, report)
 */
export default function useMessageActions({ findMessage, extraActions = {}, workspaceId, channelId } = {}) {
  const { user } = useAuth();
  const toast = useToast();

  const [actionMessage, setActionMessage] = useState(null);
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [viewingImage, setViewingImage] = useState(null);
  const [blockedDomains, setBlockedDomains] = useState(new Set());
  const [linkActionUrl, setLinkActionUrl] = useState(null);
  const [reactionUsers, setReactionUsers] = useState({ visible: false, reactions: [], emoji: null });

  // Load blocked preview domains. Prefer synced preferences; fall back to
  // legacy per-device storage so existing installs don't lose their list.
  // Subscribe so remote patches from other devices apply live.
  useEffect(() => {
    const apply = (list) => {
      if (Array.isArray(list)) setBlockedDomains(new Set(list));
    };
    const hydrate = async () => {
      const fromPrefs = userPreferences.get('messages.blockedPreviewDomains');
      if (Array.isArray(fromPrefs)) { apply(fromPrefs); return; }
      const legacy = await getUiState('bandchat_blocked_preview_domains');
      apply(legacy);
    };
    hydrate();
    const unsub = userPreferences.subscribe(() => {
      const fromPrefs = userPreferences.get('messages.blockedPreviewDomains');
      if (Array.isArray(fromPrefs)) apply(fromPrefs);
    }, 'messages.blockedPreviewDomains');
    return unsub;
  }, []);

  const handleLinkLongPress = useCallback((url) => {
    setLinkActionUrl(url);
  }, []);

  const handleLongPress = useCallback((message) => {
    // Selection haptic per HIG: long-press opens a menu (a "this is now
    // selected" gesture), not a state-changing confirm.
    selectionFeedback();
    setActionMessage(message);
    setShowActions(true);
  }, []);

  const handleAction = useCallback((action) => {
    if (!actionMessage) return;

    // Check for extra actions first (reply, pin, bookmark, report)
    if (extraActions[action]) {
      extraActions[action](actionMessage);
      return;
    }

    switch (action) {
      case 'react':
        setShowEmojiPicker(true);
        break;
      case 'copy':
        if (actionMessage.content) {
          Clipboard.setStringAsync(actionMessage.content);
          successNotification();
          toast.success('Copied to clipboard');
        }
        break;
      case 'copyLink':
        if (workspaceId && channelId && actionMessage.id) {
          const msgUrl = `${APP_BASE_URL}/workspace/${workspaceId}?channel=${channelId}&msg=${actionMessage.id}`;
          Clipboard.setStringAsync(msgUrl);
          successNotification();
          toast.success('Link copied to clipboard');
        }
        break;
      case 'edit':
        setEditingMessage(actionMessage);
        break;
      case 'save':
        (async () => {
          try {
            const img = actionMessage.attachments?.find(a => a.type === 'IMAGE');
            if (!img?.url) return;
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted' && status !== 'limited') {
              Alert.alert(
                'Permission needed',
                'Allow BandChat to save photos to your library.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Open Settings', onPress: () => Linking.openSettings() },
                ]
              );
              return;
            }
            let filename = img.url.split('/').pop()?.split('?')[0] || '';
            filename = filename.replace(/[^a-zA-Z0-9._-]/g, '');
            if (!filename || !filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
              filename = `image-${Date.now()}.jpg`;
            }
            const file = await File.downloadFileAsync(img.url, new Directory(Paths.cache), { idempotent: true });
            await MediaLibrary.saveToLibraryAsync(file.uri);
            Alert.alert('Saved', 'Image saved to your photo library.');
          } catch (err) {
            Alert.alert('Error', err.message || 'Failed to save image.');
          }
        })();
        break;
      case 'delete':
        Alert.alert(
          'Delete Message',
          'Are you sure you want to delete this message?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  await api.deleteMessage(actionMessage.id);
                  successNotification();
                } catch (err) {
                  errorNotification();
                  toast.error('Failed to delete message');
                }
              },
            },
          ]
        );
        break;
    }
  }, [actionMessage, extraActions, toast, workspaceId, channelId]);

  const handleAddReaction = useCallback(async (emoji) => {
    if (!actionMessage) return;
    selectionFeedback();
    try {
      const hasReacted = actionMessage.reactions?.some(
        r => r.emoji === emoji && r.userId === user?.id
      );
      if (hasReacted) {
        await api.removeReaction(actionMessage.id, emoji);
      } else {
        await api.addReaction(actionMessage.id, emoji);
      }
    } catch (err) {
      // silently fail
    }
    setActionMessage(null);
  }, [actionMessage, user?.id]);

  const handleSendEdit = useCallback(async (messageId, content) => {
    try {
      await api.updateMessage(messageId, content);
    } catch (err) {
      // silently fail
    }
    setEditingMessage(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
  }, []);

  const handleReactionPress = useCallback(async (messageId, emoji) => {
    selectionFeedback();
    try {
      const msg = findMessage?.(messageId);
      const hasReacted = msg?.reactions?.some(r => r.emoji === emoji && r.userId === user?.id);
      if (hasReacted) {
        await api.removeReaction(messageId, emoji);
      } else {
        await api.addReaction(messageId, emoji);
      }
    } catch (err) {
      // silently fail
    }
  }, [user?.id, findMessage]);

  const handleImagePress = useCallback((url) => {
    setViewingImage(url);
  }, []);

  const handleReactionLongPress = useCallback((reactions, emoji) => {
    // Selection haptic: opens a sheet showing who reacted, no state change.
    selectionFeedback();
    setReactionUsers({ visible: true, reactions, emoji });
  }, []);

  const closeReactionUsers = useCallback(() => {
    setReactionUsers({ visible: false, reactions: [], emoji: null });
  }, []);

  const handleTogglePreview = useCallback(async (messageId) => {
    try {
      await api.toggleMessagePreview(messageId);
    } catch (err) {
      // silently fail
    }
  }, []);

  const toggleBlockedDomain = useCallback((url) => {
    if (!url) return;
    let domain;
    try { domain = new URL(url).hostname; } catch { return; }
    const next = new Set(blockedDomains);
    if (next.has(domain)) { next.delete(domain); } else { next.add(domain); }
    const arr = [...next];
    setUiState('bandchat_blocked_preview_domains', arr);
    userPreferences.set('messages.blockedPreviewDomains', arr);
    setBlockedDomains(next);
    setLinkActionUrl(null);
  }, [blockedDomains]);

  return {
    // State
    actionMessage,
    showActions,
    showEmojiPicker,
    editingMessage,
    viewingImage,
    blockedDomains,
    linkActionUrl,
    reactionUsers,
    // Setters
    setActionMessage,
    setShowActions,
    setShowEmojiPicker,
    setViewingImage,
    setLinkActionUrl,
    // Handlers
    handleLongPress,
    handleAction,
    handleAddReaction,
    handleSendEdit,
    handleCancelEdit,
    handleReactionPress,
    handleReactionLongPress,
    closeReactionUsers,
    handleImagePress,
    handleTogglePreview,
    handleLinkLongPress,
    toggleBlockedDomain,
  };
}
