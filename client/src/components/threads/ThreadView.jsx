import { useState, useEffect, useRef, useCallback } from 'react';
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
import { buildMentionRegex } from '../../utils/parseMentions';
import MemberProfile from '../common/MemberProfile';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import getInitial from '../../utils/getInitial';

function ThreadView({ message, channelId, workspaceId, onClose, onThreadRead, members, onStartDM }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const toast = useToast();
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
  const [profileUserId, setProfileUserId] = useState(null);
  const [editingReplyId, setEditingReplyId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [deleteReplyId, setDeleteReplyId] = useState(null);
  const repliesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const replyTextareaRef = useRef(null);
  const editTextareaRef = useRef(null);
  const contentRef = useRef('');

  const wrapReplySelection = useCallback((before, after) => {
    const ta = replyTextareaRef.current;
    if (!ta) return;
    const val = contentRef.current;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = val.slice(start, end);
    const newContent = val.slice(0, start) + before + selected + (after || before) + val.slice(end);
    setContent(newContent);
    contentRef.current = newContent;
    const cursorPos = selected ? start + before.length + selected.length + (after || before).length : start + before.length;
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(selected ? start : cursorPos, selected ? start + before.length + selected.length + (after || before).length : cursorPos);
    }, 0);
  }, []);

  const insertReplyLinePrefix = useCallback((prefix) => {
    const ta = replyTextareaRef.current;
    if (!ta) return;
    const val = contentRef.current;
    const start = ta.selectionStart;
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const newContent = val.slice(0, lineStart) + prefix + val.slice(lineStart);
    setContent(newContent);
    contentRef.current = newContent;
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + prefix.length, start + prefix.length); }, 0);
  }, []);
  const swipeRef = useSwipeGesture({
    onSwipeRight: onClose,
  });

  // Build avatar lookup from workspace members (includes BandMember fallback)
  const memberAvatarMap = new Map();
  if (members) {
    for (const m of members) {
      if (m.user?.avatarUrl) memberAvatarMap.set(m.user.id, m.user.avatarUrl);
    }
  }

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

  const handleStartEditReply = (reply) => {
    setEditingReplyId(reply.id);
    setEditContent(reply.content);
  };

  const handleCancelEditReply = () => {
    setEditingReplyId(null);
    setEditContent('');
  };

  const handleSaveEditReply = async () => {
    const trimmed = editContent.trim();
    const original = replies.find(r => r.id === editingReplyId);
    if (!trimmed || trimmed === original?.content) {
      handleCancelEditReply();
      return;
    }
    try {
      const updated = await api.updateMessage(editingReplyId, trimmed);
      setReplies(prev => prev.map(r => (r.id === updated.id ? updated : r)));
    } catch (err) {
      toast.error(err.message || 'Failed to edit message');
      return;
    }
    handleCancelEditReply();
  };

  const handleDeleteReply = async () => {
    const id = deleteReplyId;
    setDeleteReplyId(null);
    if (!id) return;
    try {
      await api.deleteMessage(id);
      setReplies(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      toast.error(err.message || 'Failed to delete message');
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
      // Respect prefers-reduced-motion: CSS @media query suppresses CSS
      // animations but JS-driven scrollIntoView ignores it without this guard.
      const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      repliesEndRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
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
          const uploaded = await api.uploadFile(selectedFiles[0], workspaceId);
          attachments = [{ type: uploaded.type, url: uploaded.url, filename: uploaded.filename, size: uploaded.size }];
        } else {
          const result = await api.uploadFiles(selectedFiles, workspaceId);
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

  const formatTime = (date) => format(new Date(date), 'dd-MMM-yyyy, h:mm a');

  const renderMentionContent = (text) => {
    if (!text) return null;
    const mentionRegex = buildMentionRegex(members || []);
    if (!mentionRegex) return text;
    const parts = text.split(mentionRegex);
    const result = [];
    for (let j = 0; j < parts.length; j += 3) {
      if (parts[j]) result.push(parts[j]);
      if (j + 2 < parts.length) {
        if (parts[j + 1]) result.push(parts[j + 1]);
        result.push(
          <span key={j} className="bg-blue-900 text-blue-300 px-1 rounded">
            @{parts[j + 2]}
          </span>
        );
      }
    }
    return result;
  };

  return (
    <aside
      ref={swipeRef}
      role="complementary"
      aria-label="Thread"
      className="flex flex-col h-full bg-[var(--color-bg-secondary)]"
    >
      {/* Header */}
      <div className="h-14 border-b border-[var(--color-border)] px-4 flex items-center justify-between">
        <h2 className="text-[var(--color-text-primary)] font-semibold">Thread</h2>
        <button
          onClick={onClose}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors text-xl"
          aria-label="Close thread"
          title="Close thread"
        >
          ×
        </button>
      </div>

      {/* Original Message */}
      <div className="p-4 border-b border-[var(--color-border)] group relative">
        <div className="flex gap-3">
          <div
            className={`w-9 h-9 rounded bg-slack-green flex-shrink-0 flex items-center justify-center text-white font-medium ${message.author?.id ? 'cursor-pointer hover:opacity-80' : ''}`}
            onClick={() => message.author?.id && setProfileUserId(message.author.id)}
            role={message.author?.id ? 'button' : undefined}
            tabIndex={message.author?.id ? 0 : undefined}
            onKeyDown={(e) => {
              if (message.author?.id && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                setProfileUserId(message.author.id);
              }
            }}
            aria-label={message.author?.id ? `View profile of ${message.author.displayName || 'user'}` : undefined}
          >
            {(() => {
              const avatarSrc = message.author?.avatarUrl || (message.author?.id && memberAvatarMap.get(message.author.id));
              return avatarSrc ? (
                <img src={avatarSrc} alt={message.author?.displayName || 'User'} className="w-full h-full rounded object-cover" />
              ) : (
                getInitial(message.author?.displayName || message.removedUserName || 'Deleted User')
              );
            })()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span
                className={`font-semibold text-[var(--color-text-primary)] ${message.author?.id ? 'cursor-pointer hover:underline' : ''}`}
                onClick={() => message.author?.id && setProfileUserId(message.author.id)}
                role={message.author?.id ? 'button' : undefined}
                tabIndex={message.author?.id ? 0 : undefined}
                onKeyDown={(e) => {
                  if (message.author?.id && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    setProfileUserId(message.author.id);
                  }
                }}
              >
                {message.author?.displayName || message.removedUserName || 'Deleted User'}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {formatTime(message.createdAt)}
              </span>
            </div>
            <div className="text-[var(--color-text-secondary)] break-words whitespace-pre-wrap">
              {renderMentionContent(message.content)}
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
        <div className="absolute right-4 top-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
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
            aria-label="Add reaction"
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
                <div
                  className={`w-8 h-8 rounded bg-slack-green flex-shrink-0 flex items-center justify-center text-white text-sm font-medium ${reply.author?.id ? 'cursor-pointer hover:opacity-80' : ''}`}
                  onClick={() => reply.author?.id && setProfileUserId(reply.author.id)}
                  role={reply.author?.id ? 'button' : undefined}
                  tabIndex={reply.author?.id ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (reply.author?.id && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      setProfileUserId(reply.author.id);
                    }
                  }}
                  aria-label={reply.author?.id ? `View profile of ${reply.author.displayName || 'user'}` : undefined}
                >
                  {(() => {
                    const avatarSrc = reply.author?.avatarUrl || (reply.author?.id && memberAvatarMap.get(reply.author.id));
                    return avatarSrc ? (
                      <img src={avatarSrc} alt={reply.author?.displayName || 'User'} className="w-full h-full rounded object-cover" />
                    ) : (
                      getInitial(reply.author?.displayName || reply.removedUserName || 'Deleted User')
                    );
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`font-semibold text-[var(--color-text-primary)] text-sm ${reply.author?.id ? 'cursor-pointer hover:underline' : ''}`}
                      onClick={() => reply.author?.id && setProfileUserId(reply.author.id)}
                      role={reply.author?.id ? 'button' : undefined}
                      tabIndex={reply.author?.id ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (reply.author?.id && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          setProfileUserId(reply.author.id);
                        }
                      }}
                    >
                      {reply.author?.displayName || reply.removedUserName || 'Deleted User'}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {formatTime(reply.createdAt)}
                    </span>
                  </div>
                  {editingReplyId === reply.id ? (
                    <div className="mt-1">
                      <textarea
                        ref={(el) => {
                          editTextareaRef.current = el;
                          if (el) {
                            el.style.height = 'auto';
                            el.style.height = el.scrollHeight + 'px';
                          }
                        }}
                        value={editContent}
                        onChange={(e) => {
                          setEditContent(e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        className="w-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] rounded p-2 resize-vertical min-h-[2.5rem] text-sm"
                        rows={1}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSaveEditReply();
                          }
                          if (e.key === 'Escape') {
                            handleCancelEditReply();
                          }
                        }}
                      />
                      <div className="flex items-center text-xs mt-1 gap-2">
                        <span className="text-[var(--color-text-muted)] flex-1">
                          <kbd className="px-1 bg-[var(--color-bg-tertiary)] rounded">Enter</kbd> save · <kbd className="px-1 bg-[var(--color-bg-tertiary)] rounded">Esc</kbd> cancel
                        </span>
                        <button onClick={handleCancelEditReply} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">Cancel</button>
                        <button onClick={handleSaveEditReply} className="text-slack-blue hover:underline">Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[var(--color-text-secondary)] text-sm break-words whitespace-pre-wrap">
                      {renderMentionContent(reply.content)}
                      {reply.updatedAt && reply.createdAt && new Date(reply.updatedAt).getTime() - new Date(reply.createdAt).getTime() > 1000 && (
                        <span className="text-xs text-[var(--color-text-muted)] ml-1">(edited)</span>
                      )}
                    </div>
                  )}
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
                              <audio src={att.url} controls preload="none" className="w-full" />
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
                {/* Hover toolbar for reply: react, edit (own), delete (own) */}
                {editingReplyId !== reply.id && (
                  <div className="absolute right-0 top-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded">
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
                      className="p-1 hover:bg-[var(--color-bg-secondary)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-sm"
                      title="Add reaction"
                      aria-label="Add reaction"
                    >
                      😀
                    </button>
                    {reply.author?.id === user.id && (
                      <>
                        <button
                          onClick={() => handleStartEditReply(reply)}
                          className="p-1 hover:bg-[var(--color-bg-secondary)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-sm"
                          title="Edit"
                          aria-label="Edit reply"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => setDeleteReplyId(reply.id)}
                          className="p-1 hover:bg-[var(--color-bg-secondary)] rounded text-[var(--color-text-secondary)] hover:text-red-400 text-sm"
                          title="Delete"
                          aria-label="Delete reply"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                )}
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
            ref={replyTextareaRef}
            value={content}
            onChange={(e) => { setContent(e.target.value); contentRef.current = e.target.value; }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
              if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
                if (e.key === 'b') { e.preventDefault(); wrapReplySelection('**'); }
                if (e.key === 'i') { e.preventDefault(); wrapReplySelection('*'); }
                if (e.key === 'e') { e.preventDefault(); wrapReplySelection('`'); }
              }
              if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'X') {
                e.preventDefault(); wrapReplySelection('~~');
              }
            }}
            placeholder="Reply..."
            className="w-full bg-transparent text-[var(--color-text-primary)] px-4 py-3 resize-none outline-none placeholder-gray-400 text-sm"
            rows={2}
            disabled={sending}
          />
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-1">
              {/* Formatting toolbar */}
              <div className="hidden md:flex items-center gap-0.5 pr-2 mr-1 border-r border-[var(--color-border)]">
                <button type="button" onClick={() => wrapReplySelection('**')} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-secondary)]" title="Bold (Ctrl+B)" disabled={sending}>
                  <span className="font-bold text-xs w-4 h-4 flex items-center justify-center">B</span>
                </button>
                <button type="button" onClick={() => wrapReplySelection('*')} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-secondary)]" title="Italic (Ctrl+I)" disabled={sending}>
                  <span className="italic text-xs w-4 h-4 flex items-center justify-center">I</span>
                </button>
                <button type="button" onClick={() => wrapReplySelection('~~')} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-secondary)]" title="Strikethrough" disabled={sending}>
                  <span className="line-through text-xs w-4 h-4 flex items-center justify-center">S</span>
                </button>
                <button type="button" onClick={() => wrapReplySelection('`')} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-secondary)]" title="Code (Ctrl+E)" disabled={sending}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                </button>
                <button type="button" onClick={() => insertReplyLinePrefix('> ')} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-secondary)]" title="Quote" disabled={sending}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                </button>
              </div>
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

      {profileUserId && (
        <MemberProfile
          userId={profileUserId}
          workspaceId={workspaceId}
          onClose={() => setProfileUserId(null)}
          onStartDM={profileUserId !== user?.id ? onStartDM : null}
        />
      )}

      <ConfirmDialog
        isOpen={deleteReplyId !== null}
        title="Delete Reply"
        message="Are you sure you want to delete this reply? This cannot be undone."
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={handleDeleteReply}
        onCancel={() => setDeleteReplyId(null)}
      />
    </aside>
  );
}

export default ThreadView;
