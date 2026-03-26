import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';
import { File, Directory, Paths } from 'expo-file-system/next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { mediumImpact, successNotification, errorNotification } from '../utils/haptics';
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

  // Load blocked preview domains
  useEffect(() => {
    AsyncStorage.getItem('bandchat_blocked_preview_domains').then(val => {
      if (val) {
        try { setBlockedDomains(new Set(JSON.parse(val))); } catch (e) {
          console.error('Failed to parse blocked preview domains:', e);
        }
      }
    });
  }, []);

  const handleLinkLongPress = useCallback((url) => {
    setLinkActionUrl(url);
  }, []);

  const handleLongPress = useCallback((message) => {
    mediumImpact();
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
              Alert.alert('Permission needed', 'Allow BandChat to save photos to your library.');
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
        errorNotification();
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
                } catch (err) {
                  // silently fail
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
    AsyncStorage.setItem('bandchat_blocked_preview_domains', JSON.stringify([...next]));
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
    handleImagePress,
    handleTogglePreview,
    handleLinkLongPress,
    toggleBlockedDomain,
  };
}
