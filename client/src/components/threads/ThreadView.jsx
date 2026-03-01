import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import ReactionDisplay from '../messages/ReactionDisplay';
import ReactionPicker from '../messages/ReactionPicker';
import ImageLightbox from '../common/ImageLightbox';
import Skeleton from '../common/Skeleton';
import useSwipeGesture from '../../hooks/useSwipeGesture';
import { handleDownload } from '../../utils/download';
import { formatFileSize } from '../../utils/format';
import { MAX_IMAGE_SIZE, MAX_AUDIO_SIZE, isImageFile, isAudioFile } from '../../utils/fileValidation';

function ThreadView({ message, channelId, onClose, onThreadRead }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [parentReactions, setParentReactions] = useState(message.reactions || []);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [fileError, setFileError] = useState('');
  const [lightboxImage, setLightboxImage] = useState(null);
  const repliesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const swipeRef = useSwipeGesture({
    onSwipeRight: onClose,
  });

  useEffect(() => {
    loadReplies();
    // Mark thread as read on open (only if there are unread replies)
    if (message.unreadReplies > 0) {
      api.markThreadRead(message.id).catch(err => console.warn('markThreadRead failed:', err.message));
      if (onThreadRead) onThreadRead(message.id);
    }
  }, [message.id]);

  useEffect(() => {
    if (socket) {
      socket.on('message:reply', handleNewReply);
      socket.on('message:updated', handleUpdatedReply);
      socket.on('message:deleted', handleDeletedReply);
      socket.on('reaction:added', handleReactionAdded);
      socket.on('reaction:removed', handleReactionRemoved);

      return () => {
        socket.off('message:reply', handleNewReply);
        socket.off('message:updated', handleUpdatedReply);
        socket.off('message:deleted', handleDeletedReply);
        socket.off('reaction:added', handleReactionAdded);
        socket.off('reaction:removed', handleReactionRemoved);
      };
    }
  }, [socket, message.id]);

  const loadReplies = async () => {
    setLoading(true);
    try {
      const data = await api.getReplies(message.id);
      setReplies(data.replies || []);
      scrollToBottom();
    } catch (err) {
      console.error('Failed to load replies:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNewReply = ({ parentId, message: newReply }) => {
    if (parentId === message.id) {
      setReplies(prev => [...prev, newReply]);
      scrollToBottom();
      // Mark thread as read when new replies arrive from others
      if (newReply.author.id !== user.id) {
        api.markThreadRead(message.id).catch(err => console.warn('markThreadRead failed:', err.message));
      }
    }
  };

  const handleUpdatedReply = (updatedReply) => {
    setReplies(prev =>
      prev.map(r => (r.id === updatedReply.id ? updatedReply : r))
    );
  };

  const handleDeletedReply = ({ messageId, parentId }) => {
    if (parentId === message.id) {
      setReplies(prev => prev.filter(r => r.id !== messageId));
    }
  };

  const handleReactionAdded = ({ messageId, reaction }) => {
    if (messageId === message.id) {
      // Parent message reaction
      setParentReactions(prev => {
        const exists = prev.some(r => r.id === reaction.id);
        if (!exists) {
          return [...prev, reaction];
        }
        return prev;
      });
    } else {
      // Reply reaction
      setReplies(prev =>
        prev.map(r => {
          if (r.id === messageId) {
            const reactions = r.reactions || [];
            const exists = reactions.some(rx => rx.id === reaction.id);
            if (!exists) {
              return { ...r, reactions: [...reactions, reaction] };
            }
          }
          return r;
        })
      );
    }
  };

  const handleReactionRemoved = ({ messageId, emoji, userId }) => {
    if (messageId === message.id) {
      // Parent message reaction
      setParentReactions(prev =>
        prev.filter(r => !(r.emoji === emoji && r.user.id === userId))
      );
    } else {
      // Reply reaction
      setReplies(prev =>
        prev.map(r => {
          if (r.id === messageId) {
            const reactions = (r.reactions || []).filter(
              rx => !(rx.emoji === emoji && rx.user.id === userId)
            );
            return { ...r, reactions };
          }
          return r;
        })
      );
    }
  };

  const handleAddReaction = async (messageId, emoji) => {
    try {
      await api.addReaction(messageId, emoji);
    } catch (err) {
      console.error('Failed to add reaction:', err);
    }
    setReactionPickerMessageId(null);
  };

  const handleRemoveReaction = async (messageId, emoji) => {
    try {
      await api.removeReaction(messageId, emoji);
    } catch (err) {
      console.error('Failed to remove reaction:', err);
    }
  };

  const handleToggleReaction = (messageId, emoji, hasReacted) => {
    if (hasReacted) {
      handleRemoveReaction(messageId, emoji);
    } else {
      handleAddReaction(messageId, emoji);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setFileError('');

    const validFiles = [];
    for (const file of files) {
      const isImage = isImageFile(file);
      const isAudio = isAudioFile(file);

      if (!isImage && !isAudio) {
        setFileError(`File "${file.name}" is not a supported type`);
        continue;
      }

      const maxSize = isAudio ? MAX_AUDIO_SIZE : MAX_IMAGE_SIZE;
      const limitMB = maxSize / (1024 * 1024);
      if (file.size > maxSize) {
        setFileError(`File "${file.name}" exceeds ${limitMB}MB limit`);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);

      validFiles.forEach(file => {
        if (isImageFile(file)) {
          const reader = new FileReader();
          reader.onload = (e) => {
            setPreviews(prev => [...prev, {
              name: file.name,
              url: e.target.result,
              size: file.size,
              type: 'image'
            }]);
          };
          reader.readAsDataURL(file);
        } else {
          setPreviews(prev => [...prev, {
            name: file.name,
            url: null,
            size: file.size,
            type: 'audio'
          }]);
        }
      });
    }

    e.target.value = '';
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if ((!content.trim() && selectedFiles.length === 0) || sending) return;

    setSending(true);
    setFileError('');
    try {
      // Upload files first if any
      let attachments = [];
      if (selectedFiles.length > 0) {
        if (selectedFiles.length === 1) {
          const uploaded = await api.uploadFile(selectedFiles[0]);
          attachments = [{ type: uploaded.type, url: uploaded.url, filename: uploaded.filename, size: uploaded.size }];
        } else {
          const result = await api.uploadFiles(selectedFiles);
          attachments = result.files.map(f => ({ type: f.type, url: f.url, filename: f.filename, size: f.size }));
        }
      }

      await api.sendMessage(channelId, content.trim(), message.id, attachments);
      setContent('');
      setSelectedFiles([]);
      setPreviews([]);
    } catch (err) {
      console.error('Failed to send reply:', err);
      setFileError(err.message || 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (date) => format(new Date(date), 'MMM d, h:mm a');

  return (
    <div ref={swipeRef} className="flex flex-col h-full bg-[var(--color-bg-secondary)]">
      {/* Header */}
      <div className="h-14 border-b border-[var(--color-border)] px-4 flex items-center justify-between">
        <h3 className="text-[var(--color-text-primary)] font-semibold">Thread</h3>
        <button
          onClick={onClose}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors text-xl"
        >
          ×
        </button>
      </div>

      {/* Original Message */}
      <div className="p-4 border-b border-[var(--color-border)] group relative">
        <div className="flex gap-3">
          <div className="w-9 h-9 rounded bg-slack-green flex-shrink-0 flex items-center justify-center text-white font-medium">
            {message.author?.avatarUrl ? (
              <img src={message.author.avatarUrl} alt={message.author.displayName} className="w-full h-full rounded object-cover" />
            ) : (
              (message.author?.displayName || message.removedUserName || 'Deleted User').charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-[var(--color-text-primary)]">
                {message.author?.displayName || message.removedUserName || 'Deleted User'}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {formatTime(message.createdAt)}
              </span>
            </div>
            <div className="text-[var(--color-text-secondary)] break-words whitespace-pre-wrap">
              {message.content}
            </div>
            <ReactionDisplay
              reactions={parentReactions}
              currentUserId={user.id}
              onToggleReaction={(emoji, hasReacted) => handleToggleReaction(message.id, emoji, hasReacted)}
            />
          </div>
        </div>
        <div className="mt-2 text-xs text-[var(--color-text-muted)]">
          {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </div>
        {/* Reaction button for parent message */}
        <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity">
          {reactionPickerMessageId === message.id && (
            <div className="absolute right-0 top-full mt-1 z-10">
              <ReactionPicker
                onSelect={(emoji) => handleAddReaction(message.id, emoji)}
                onClose={() => setReactionPickerMessageId(null)}
              />
            </div>
          )}
          <button
            onClick={() => setReactionPickerMessageId(
              reactionPickerMessageId === message.id ? null : message.id
            )}
            className="p-1.5 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)] rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            title="Add reaction"
          >
            😀
          </button>
        </div>
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4">
            {Array.from({length: 3}).map((_, i) => <Skeleton.Message key={i} />)}
          </div>
        ) : replies.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-[var(--color-text-muted)] text-sm">
            No replies yet. Start the conversation!
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {replies.map((reply) => (
              <div key={reply.id} className="flex gap-3 group relative">
                <div className="w-8 h-8 rounded bg-slack-green flex-shrink-0 flex items-center justify-center text-white text-sm font-medium">
                  {reply.author?.avatarUrl ? (
                    <img src={reply.author.avatarUrl} alt={reply.author.displayName} className="w-full h-full rounded object-cover" />
                  ) : (
                    (reply.author?.displayName || reply.removedUserName || 'Deleted User').charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-[var(--color-text-primary)] text-sm">
                      {reply.author?.displayName || reply.removedUserName || 'Deleted User'}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {formatTime(reply.createdAt)}
                    </span>
                  </div>
                  <div className="text-[var(--color-text-secondary)] text-sm break-words whitespace-pre-wrap">
                    {reply.content}
                  </div>
                  {/* Attachments */}
                  {reply.attachments?.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {reply.attachments.map((att) => (
                        <div key={att.id}>
                          {att.type === 'IMAGE' && (
                            <div className="relative inline-block group/img">
                              <img
                                src={att.url}
                                alt={att.filename}
                                className="max-w-sm max-h-60 rounded cursor-pointer"
                                loading="lazy"
                                onClick={() => setLightboxImage({ src: att.url, alt: att.filename })}
                              />
                              <div className="absolute bottom-2 right-2 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(att.url, att.filename);
                                  }}
                                  className="bg-gray-900/80 text-white px-2 py-1 rounded text-xs hover:bg-gray-900 flex items-center gap-1"
                                  title="Download"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                </button>
                              </div>
                              <div className="text-xs text-[var(--color-text-muted)] mt-1">{att.filename}</div>
                            </div>
                          )}
                          {att.type === 'VIDEO' && (
                            <video src={att.url} controls className="max-w-sm rounded" />
                          )}
                          {att.type === 'AUDIO' && (
                            <div className="bg-[var(--color-bg-tertiary)] rounded-lg p-2 max-w-sm">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 bg-[var(--color-bg-secondary)] rounded flex items-center justify-center flex-shrink-0">
                                  <svg className="w-4 h-4 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                  </svg>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs text-[var(--color-text-primary)] truncate">{att.filename}</div>
                                </div>
                                <button
                                  onClick={() => handleDownload(att.url, att.filename)}
                                  className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                                  title="Download"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                </button>
                              </div>
                              <audio src={att.url} controls preload="metadata" className="w-full" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Reactions */}
                  <ReactionDisplay
                    reactions={reply.reactions}
                    currentUserId={user.id}
                    onToggleReaction={(emoji, hasReacted) => handleToggleReaction(reply.id, emoji, hasReacted)}
                  />
                </div>
                {/* Reaction button for reply */}
                <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {reactionPickerMessageId === reply.id && (
                    <div className="absolute right-0 top-full mt-1 z-10">
                      <ReactionPicker
                        onSelect={(emoji) => handleAddReaction(reply.id, emoji)}
                        onClose={() => setReactionPickerMessageId(null)}
                      />
                    </div>
                  )}
                  <button
                    onClick={() => setReactionPickerMessageId(
                      reactionPickerMessageId === reply.id ? null : reply.id
                    )}
                    className="p-1 bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)] rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-sm"
                    title="Add reaction"
                  >
                    😀
                  </button>
                </div>
              </div>
            ))}
            <div ref={repliesEndRef} />
          </div>
        )}
      </div>

      {/* Reply Input */}
      <form onSubmit={handleSend} className="p-4 border-t border-[var(--color-border)]">
        {/* File error */}
        {fileError && (
          <div className="mb-2 text-red-400 text-xs">{fileError}</div>
        )}

        {/* File previews */}
        {previews.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {previews.map((preview, index) => (
              <div
                key={preview.name + '-' + preview.size}
                className="relative bg-[var(--color-bg-tertiary)] rounded p-2 flex items-center gap-2"
              >
                {preview.type === 'audio' ? (
                  <div className="w-10 h-10 bg-[var(--color-bg-secondary)] rounded flex items-center justify-center">
                    <svg className="w-5 h-5 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                ) : (
                  <img
                    src={preview.url}
                    alt={preview.name}
                    className="w-10 h-10 object-cover rounded"
                  />
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-xs text-[var(--color-text-primary)] truncate max-w-[100px]">
                    {preview.name}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {formatFileSize(preview.size)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="bg-[var(--color-bg-tertiary)] rounded-lg">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder="Reply..."
            className="w-full bg-transparent text-[var(--color-text-primary)] px-4 py-3 resize-none outline-none placeholder-gray-400 text-sm"
            rows={2}
            disabled={sending}
          />
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,audio/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                title="Add file"
                disabled={sending}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            <button
              type="submit"
              disabled={(!content.trim() && selectedFiles.length === 0) || sending}
              className="bg-slack-green text-white px-3 py-1 rounded text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? '...' : 'Reply'}
            </button>
          </div>
        </div>
      </form>
      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage.src}
          alt={lightboxImage.alt}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  );
}

export default ThreadView;
