/**
 * @fileoverview Message list component for displaying chat messages.
 * Handles message rendering, editing, reactions, and thread navigation.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import ReactionDisplay from './ReactionDisplay';
import ReactionPicker from './ReactionPicker';
import ConfirmDialog from '../common/ConfirmDialog';
import ContextMenu from '../common/ContextMenu';
import ImageLightbox from '../common/ImageLightbox';
import useLongPress from '../../hooks/useLongPress';
import { hapticLight } from '../../services/haptic';
import LinkPreviewCard from './LinkPreviewCard';
import { handleDownload } from '../../utils/download';
import { buildMentionRegex } from '../../utils/parseMentions';
import api from '../../services/api';
import EmbedCard from './EmbedCard';
import '../../../styles/markdown.css';

/**
 * Validates a URL string for safety before rendering as a link.
 * Prevents javascript: URLs, data: URLs, and malformed URLs.
 */
function isValidHttpUrl(urlString) {
  try {
    const url = new URL(urlString);
    // Only allow http/https protocols
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    // Block URLs with credentials in them (user:pass@host)
    if (url.username || url.password) {
      return false;
    }
    // Must have a valid hostname (at least one dot for TLD)
    if (!url.hostname || (!url.hostname.includes('.') && url.hostname !== 'localhost')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply inline markdown formatting: `code`, **bold**, *italic*, ~~strikethrough~~
 * Returns array of React elements / strings.
 */
function applyInlineMarkdown(text, keyPrefix = '') {
  if (!text) return [text];

  // Split by inline code first (code skips other formatting)
  const result = [];
  const codeRegex = /`([^`\n]+)`/g;
  let lastIdx = 0;
  let m;

  while ((m = codeRegex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      result.push(...applyBoldItalicStrike(text.slice(lastIdx, m.index), `${keyPrefix}t${lastIdx}`));
    }
    result.push(<code key={`${keyPrefix}c${m.index}`}>{m[1]}</code>);
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    result.push(...applyBoldItalicStrike(text.slice(lastIdx), `${keyPrefix}t${lastIdx}`));
  }
  return result.length > 0 ? result : [text];
}

/** Apply **bold**, *italic*, ~~strikethrough~~ formatting */
function applyBoldItalicStrike(text, keyPrefix) {
  if (!text) return [text];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~)/g;
  const result = [];
  let lastIdx = 0;
  let m;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) result.push(text.slice(lastIdx, m.index));
    if (m[2]) result.push(<strong key={`${keyPrefix}b${m.index}`}>{m[2]}</strong>);
    else if (m[3]) result.push(<em key={`${keyPrefix}i${m.index}`}>{m[3]}</em>);
    else if (m[4]) result.push(<del key={`${keyPrefix}s${m.index}`}>{m[4]}</del>);
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) result.push(text.slice(lastIdx));
  return result.length > 0 ? result : [text];
}

/** Render a URL part as the appropriate embed (YouTube, image, video, Google Doc, or link) */
function renderUrlPart(part, i, message, onOpenLightbox, onAddToLibrary, isOwn, onTogglePreview) {
  if (!isValidHttpUrl(part)) return <span key={i}>{part}</span>;

  // Google Doc/Sheet
  let isGoogleDoc = false;
  try {
    const parsedUrl = new URL(part);
    isGoogleDoc = parsedUrl.hostname === 'docs.google.com' || parsedUrl.hostname === 'sheets.google.com';
  } catch {}
  if (isGoogleDoc) {
    return (
      <div key={i} className="my-2">
        <a href={part} target="_blank" rel="noopener noreferrer" className="text-slack-blue hover:underline break-all">{part}</a>
        <a href={part} target="_blank" rel="noopener noreferrer" className="block mt-2 p-3 rounded border border-gray-600 hover:bg-gray-700/50 transition-colors">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zm-3 9h4v2h-4v-2zm0-3h4v2h-4V10zm-2 6h8v2H8v-2z"/></svg>
            <span className="text-blue-400 underline text-sm">Open Google Doc</span>
          </div>
        </a>
      </div>
    );
  }

  // YouTube
  const ytMatch = part.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/|m\.youtube\.com\/watch\?v=)([\w-]{11})/);
  if (ytMatch) {
    const videoId = ytMatch[1];
    return (
      <div key={i} className="my-2">
        <a href={part} target="_blank" rel="noopener noreferrer" className="text-slack-blue hover:underline break-all">{part}</a>
        <a href={part} target="_blank" rel="noopener noreferrer" className="block relative max-w-full md:max-w-md mt-1 rounded overflow-hidden group">
          <img src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} alt="YouTube video thumbnail" className="w-full rounded" loading="lazy" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 bg-red-600 bg-opacity-90 rounded-2xl flex items-center justify-center group-hover:bg-opacity-100 transition-opacity">
              <svg viewBox="0 0 24 24" fill="white" className="w-8 h-8 ml-1"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        </a>
      </div>
    );
  }

  // Image
  if (part.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
    return (
      <div key={i} className="my-2">
        <img src={part} alt="Shared image" className="max-w-full md:max-w-md max-h-80 rounded cursor-pointer" loading="lazy" onClick={() => message && onOpenLightbox(message, part)} />
      </div>
    );
  }

  // Video
  if (part.match(/\.(mp4|webm|mov)$/i)) {
    return (
      <div key={i} className="my-2">
        <video src={part} controls className="max-w-full md:max-w-md rounded" />
      </div>
    );
  }

  return (
    <span key={i}>
      <a href={part} target="_blank" rel="noopener noreferrer" className="text-slack-blue hover:underline break-all">{part}</a>
      {!message?.hidePreview && <LinkPreviewCard url={part} onAddToLibrary={onAddToLibrary} isOwn={isOwn} onDismiss={onTogglePreview ? () => onTogglePreview(message.id) : undefined} />}
    </span>
  );
}

/** Process a text segment through embed detection, URL splitting, mention highlighting, and inline markdown */
function processTextSegment(text, segKey, message, onOpenLightbox, members, onAddToLibrary, workspaceId, isOwn, onTogglePreview) {
  // Detect embed tokens [type:uuid]
  const embedRegex = /\[(song|setlist|gig|poll):([a-f0-9-]+)\]/gi;
  const embedParts = text.split(embedRegex);

  // embedRegex with 2 capture groups: [before, type, id, between, type, id, ...]
  if (embedParts.length > 1) {
    const result = [];
    for (let ei = 0; ei < embedParts.length; ei += 3) {
      const textPart = embedParts[ei];
      if (textPart) {
        result.push(...processTextInner(textPart, `${segKey}-e${ei}`, message, onOpenLightbox, members, onAddToLibrary, isOwn, onTogglePreview));
      }
      if (ei + 2 < embedParts.length) {
        const embedType = embedParts[ei + 1];
        const embedId = embedParts[ei + 2];
        result.push(<EmbedCard key={`${segKey}-embed${ei}`} type={embedType} id={embedId} workspaceId={workspaceId} />);
      }
    }
    return result;
  }

  return processTextInner(text, segKey, message, onOpenLightbox, members, onAddToLibrary, isOwn, onTogglePreview);
}

/** Inner text processing: URL splitting, mentions, inline markdown */
function processTextInner(text, segKey, message, onOpenLightbox, members, onAddToLibrary, isOwn, onTogglePreview) {
  const urlRegex = /(https?:\/\/[^\s\[\]<>]+?)(?=[\[\])\s]|[.,;:!?"'](?:\s|$)|$)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, i) => {
    if (part.match(/^https?:\/\//)) {
      return renderUrlPart(part, `${segKey}-${i}`, message, onOpenLightbox, onAddToLibrary, isOwn, onTogglePreview);
    }

    // Apply @mentions then inline markdown on remaining text
    const mentionRegex = buildMentionRegex(members || []) || /(^|[\s])@(\w+)/g;
    const mentionParts = part.split(mentionRegex);
    const result = [];

    for (let j = 0; j < mentionParts.length; j += 3) {
      const txt = mentionParts[j];
      if (txt) result.push(...applyInlineMarkdown(txt, `${segKey}-${i}-${j}`));
      if (j + 2 < mentionParts.length) {
        const ws = mentionParts[j + 1];
        const name = mentionParts[j + 2];
        if (ws) result.push(ws);
        result.push(
          <span key={`${segKey}-${i}-m${j}`} className="bg-blue-900 text-blue-300 px-1 rounded">@{name}</span>
        );
      }
    }
    return result;
  });
}

/**
 * Memoized component for rendering message content with markdown formatting,
 * URL detection, embeds (Google Docs, YouTube), images, videos, and @mentions.
 */
const MessageContent = React.memo(({ content, message, onOpenLightbox, members, onAddToLibrary, workspaceId, isOwn, onTogglePreview }) => {
  // Step 1: Extract fenced code blocks
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  const segments = [];
  let lastIdx = 0;
  let m;

  while ((m = codeBlockRegex.exec(content)) !== null) {
    if (m.index > lastIdx) {
      segments.push({ type: 'text', value: content.slice(lastIdx, m.index) });
    }
    segments.push({ type: 'code', lang: m[1], value: m[2].replace(/\n$/, '') });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIdx) });
  }
  if (segments.length === 0) segments.push({ type: 'text', value: content });

  // Check if any markdown syntax is present (skip wrapping for plain messages)
  const hasMarkdown = /[`*~]|^>|^[-*] /m.test(content);

  const rendered = segments.map((seg, si) => {
    if (seg.type === 'code') {
      return <pre key={`cb${si}`}><code>{seg.value}</code></pre>;
    }

    // Step 2: Process block-level markdown (blockquotes, lists) on text segments
    const lines = seg.value.split('\n');
    const blocks = [];
    let currentBlock = null;

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];

      if (line.startsWith('> ')) {
        if (currentBlock?.type !== 'blockquote') {
          if (currentBlock) blocks.push(currentBlock);
          currentBlock = { type: 'blockquote', lines: [] };
        }
        currentBlock.lines.push(line.slice(2));
      } else if (/^[-*] /.test(line)) {
        if (currentBlock?.type !== 'list') {
          if (currentBlock) blocks.push(currentBlock);
          currentBlock = { type: 'list', lines: [] };
        }
        currentBlock.lines.push(line.slice(2));
      } else {
        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = null;
        }
        blocks.push({ type: 'text', value: line + (li < lines.length - 1 ? '\n' : '') });
      }
    }
    if (currentBlock) blocks.push(currentBlock);

    return blocks.map((block, bi) => {
      const key = `${si}-${bi}`;
      if (block.type === 'blockquote') {
        return (
          <blockquote key={key}>
            {block.lines.map((l, li) => (
              <React.Fragment key={li}>
                {processTextSegment(l, `${key}-${li}`, message, onOpenLightbox, members, onAddToLibrary, workspaceId, isOwn, onTogglePreview)}
                {li < block.lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </blockquote>
        );
      }
      if (block.type === 'list') {
        return (
          <ul key={key}>
            {block.lines.map((l, li) => (
              <li key={li}>{processTextSegment(l, `${key}-${li}`, message, onOpenLightbox, members, onAddToLibrary, workspaceId, isOwn, onTogglePreview)}</li>
            ))}
          </ul>
        );
      }
      return <React.Fragment key={key}>{processTextSegment(block.value, key, message, onOpenLightbox, members, onAddToLibrary, workspaceId, isOwn, onTogglePreview)}</React.Fragment>;
    });
  });

  return hasMarkdown ? <span className="msg-markdown">{rendered}</span> : <>{rendered}</>;
});
MessageContent.displayName = 'MessageContent';

/**
 * Renders a list of messages with date headers, reactions, and action buttons.
 *
 * @param {Object} props
 * @param {Array} props.messages - Array of message objects to display
 * @param {Object} props.currentUser - Current authenticated user
 * @param {function} props.onOpenThread - Callback to open thread view for a message
 * @param {function} props.onEditMessage - Callback to edit a message (messageId, content)
 * @param {function} props.onDeleteMessage - Callback to delete a message (messageId)
 * @param {function} props.onAddReaction - Callback to add reaction (messageId, emoji)
 * @param {function} props.onRemoveReaction - Callback to remove reaction (messageId, emoji)
 */
function MessageList({
  messages,
  currentUser,
  onOpenThread,
  onEditMessage,
  onDeleteMessage,
  onAddReaction,
  onRemoveReaction,
  onPinMessage,
  onUnpinMessage,
  pinnedMessageIds,
  onSaveMessage,
  onUnsaveMessage,
  savedMessageIds,
  lastReadAt,
  members,
  onAvatarClick,
  onAddToLibrary,
  onTogglePreview,
  workspaceId
}) {
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);
  const [deleteMessageId, setDeleteMessageId] = useState(null); // For delete confirmation dialog
  const [reportMessageId, setReportMessageId] = useState(null); // For report dialog
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [lightboxData, setLightboxData] = useState(null); // { images: [{src, alt}], index }
  const [msgContextMenu, setMsgContextMenu] = useState(null); // { messageId, x, y }
  const [seenByCount, setSeenByCount] = useState(null);
  const [seenByMessageId, setSeenByMessageId] = useState(null);

  // Build avatar lookup from workspace members (includes BandMember fallback)
  const memberAvatarMap = useMemo(() => {
    const map = new Map();
    if (members) {
      for (const m of members) {
        if (m.user?.avatarUrl) map.set(m.user.id, m.user.avatarUrl);
      }
    }
    return map;
  }, [members]);

  // Find the last message by the current user and fetch seen-by count
  const lastOwnMessage = useMemo(() => {
    if (!currentUser?.id || !messages.length) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].author?.id === currentUser.id && !messages[i].pending) {
        return messages[i];
      }
    }
    return null;
  }, [messages, currentUser?.id]);

  useEffect(() => {
    if (!lastOwnMessage || lastOwnMessage.id === seenByMessageId) return;
    setSeenByMessageId(lastOwnMessage.id);
    api.getMessageSeenBy(lastOwnMessage.id)
      .then(data => setSeenByCount(data.count ?? data.length ?? 0))
      .catch(() => setSeenByCount(null));
  }, [lastOwnMessage]);

  /** Collect all images from a message (inline URLs + IMAGE attachments) */
  const getMessageImages = (message) => {
    const images = [];
    // Inline image URLs from content
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = message.content?.match(urlRegex) || [];
    parts.forEach(url => {
      if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        images.push({ src: url, alt: 'Shared image' });
      }
    });
    // Image attachments
    (message.attachments || []).forEach(att => {
      if (att.type === 'IMAGE') {
        images.push({ src: att.url, alt: att.filename });
      }
    });
    return images;
  };

  const openLightbox = (message, src) => {
    const images = getMessageImages(message);
    const index = images.findIndex(img => img.src === src);
    setLightboxData({ images, index: Math.max(0, index) });
  };

  const formatMessageTime = (date) => {
    const d = new Date(date);
    return format(d, 'h:mm a');
  };

  const formatDateHeader = (date) => {
    const d = new Date(date);
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'EEEE, dd-MMM-yyyy');
  };

  const shouldShowDateHeader = (message, index) => {
    if (index === 0) return true;
    const prevMessage = messages[index - 1];
    const prevDate = new Date(prevMessage.createdAt).toDateString();
    const currDate = new Date(message.createdAt).toDateString();
    return prevDate !== currDate;
  };

  const handleStartEdit = (message) => {
    setEditingId(message.id);
    setEditContent(message.content);
  };

  const handleSaveEdit = async () => {
    if (editContent.trim() && editContent !== messages.find(m => m.id === editingId)?.content) {
      await onEditMessage(editingId, editContent);
    }
    setEditingId(null);
    setEditContent('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const handleToggleReaction = (messageId, emoji, hasReacted) => {
    hapticLight();
    if (hasReacted) {
      onRemoveReaction(messageId, emoji);
    } else {
      onAddReaction(messageId, emoji);
    }
  };

  const handleReactionSelect = (messageId, emoji) => {
    onAddReaction(messageId, emoji);
    setReactionPickerMessageId(null);
  };

  const handleCopyText = useCallback((messageId) => {
    const message = messages.find(m => m.id === messageId);
    if (message?.content) {
      navigator.clipboard.writeText(message.content).catch(() => {});
    }
  }, [messages]);


  const firstUnreadIndex = useMemo(() => {
    if (!lastReadAt) return -1;
    const lastReadTime = new Date(lastReadAt).getTime();
    return messages.findIndex(m =>
      m.author?.id !== currentUser?.id &&
      new Date(m.createdAt).getTime() > lastReadTime
    );
  }, [messages, lastReadAt, currentUser?.id]);

  // Long-press handler for mobile — uses event delegation via data-message-id
  const messageLongPress = useLongPress({
    onLongPress: ({ x, y }) => {
      // The touch target is captured from the event, but useLongPress
      // gives us coordinates. We need to find the message element under those coords.
      const el = document.elementFromPoint(x, y);
      const msgEl = el?.closest?.('[data-message-id]');
      if (msgEl) {
        const messageId = msgEl.getAttribute('data-message-id');
        if (messageId) {
          setMsgContextMenu({ messageId, x, y });
        }
      }
    },
  });

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 p-8">
        <div className="text-center">
          <p className="text-lg mb-2">No messages yet</p>
          <p className="text-sm">Start the conversation!</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div
      className="px-4 py-2"
      onTouchStart={messageLongPress.onTouchStart}
      onTouchMove={messageLongPress.onTouchMove}
      onTouchEnd={messageLongPress.onTouchEnd}
      onTouchCancel={messageLongPress.onTouchCancel}
    >
      {(() => {
        // Cap rendered messages to avoid DOM bloat — show most recent 150
        const MAX_RENDERED = 150;
        const truncated = messages.length > MAX_RENDERED;
        const visibleMessages = truncated ? messages.slice(messages.length - MAX_RENDERED) : messages;
        return (
          <>
            {truncated && (
              <div className="text-center py-3">
                <span className="text-xs text-[var(--color-text-muted)]">
                  Showing latest {MAX_RENDERED} of {messages.length} messages
                </span>
              </div>
            )}
            {visibleMessages.map((message, index) => {
              // Adjust index for date header checks against the full array
              const fullIndex = truncated ? index + (messages.length - MAX_RENDERED) : index;
              return (
                <div key={message.id}>
          {/* Date Header */}
          {shouldShowDateHeader(message, fullIndex) && (
            <div className="flex items-center my-4">
              <div className="flex-1 border-t border-[var(--color-border)]" />
              <span className="px-4 text-xs text-[var(--color-text-muted)] font-medium">
                {formatDateHeader(message.createdAt)}
              </span>
              <div className="flex-1 border-t border-[var(--color-border)]" />
            </div>
          )}

          {/* Unread Divider */}
          {fullIndex === firstUnreadIndex && (
            <div className="unread-divider flex items-center my-3">
              <div className="flex-1 border-t border-red-500" />
              <span className="px-3 text-xs text-red-500 font-semibold">New messages</span>
              <div className="flex-1 border-t border-red-500" />
            </div>
          )}

          {/* Message */}
          <div
            data-message-id={message.id}
            className={`group flex gap-3 py-2 hover:bg-[var(--color-bg-tertiary)]/30 rounded px-2 -mx-2 relative ${message.pending ? 'opacity-60' : ''}`}
            onContextMenu={(e) => {
              e.preventDefault();
              setMsgContextMenu({ messageId: message.id, x: e.clientX, y: e.clientY });
            }}
          >
            {/* Avatar */}
            <div
              className={`w-9 h-9 rounded bg-slack-green flex-shrink-0 flex items-center justify-center text-white font-medium ${message.author?.id && onAvatarClick ? 'cursor-pointer hover:opacity-80' : ''}`}
              onClick={() => message.author?.id && onAvatarClick?.(message.author.id)}
            >
              {(() => {
                const avatarSrc = message.author?.avatarUrl || (message.author?.id && memberAvatarMap.get(message.author.id));
                return avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={message.author?.displayName || message.removedUserName || 'Deleted User'}
                    className="w-full h-full rounded object-cover"
                  />
                ) : (
                  (message.author?.displayName || message.removedUserName || 'Deleted User').charAt(0).toUpperCase()
                );
              })()}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-semibold text-[var(--color-text-primary)] ${message.author?.id && onAvatarClick ? 'cursor-pointer hover:underline' : ''}`}
                  onClick={() => message.author?.id && onAvatarClick?.(message.author.id)}
                >
                  {message.author?.displayName || message.removedUserName || 'Deleted User'}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {formatMessageTime(message.createdAt)}
                </span>
                {message.pending && (
                  <span className="text-xs text-gray-500">(sending...)</span>
                )}
                {!message.pending && message.updatedAt !== message.createdAt && (
                  <span className="text-xs text-gray-500">(edited)</span>
                )}
              </div>

              {editingId === message.id ? (
                <div className="mt-1">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] rounded p-2 resize-none"
                    rows={2}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSaveEdit();
                      }
                      if (e.key === 'Escape') {
                        handleCancelEdit();
                      }
                    }}
                  />
                  <div className="flex gap-2 mt-1 text-xs">
                    <button
                      onClick={handleCancelEdit}
                      className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="text-slack-blue hover:underline"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="message-content text-[var(--color-text-secondary)] break-words whitespace-pre-wrap">
                  <MessageContent content={message.content} message={message} onOpenLightbox={openLightbox} members={members} onAddToLibrary={onAddToLibrary} workspaceId={workspaceId} isOwn={message.author?.id === currentUser?.id} onTogglePreview={onTogglePreview} />
                </div>
              )}

              {/* Attachments */}
              {message.attachments?.length > 0 && (
                <div className="mt-2 space-y-2">
                  {message.attachments.map((att) => (
                    <div key={att.id}>
                      {att.type === 'IMAGE' && (
                        <div className="relative inline-block group/img">
                          <img
                            src={att.thumbnailUrl || att.url}
                            alt={att.filename}
                            className="max-w-full md:max-w-md max-h-80 rounded cursor-pointer"
                            loading="lazy"
                            onClick={() => openLightbox(message, att.url)}
                          />
                          {/* Download button - always visible on mobile, hover on desktop */}
                          <div className="absolute bottom-2 right-2 opacity-100 sm:opacity-0 sm:group-hover/img:opacity-100 transition-opacity flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(att.url, att.filename);
                              }}
                              className="bg-gray-900/80 text-white px-3 py-2 sm:px-2 sm:py-1 rounded text-sm sm:text-xs hover:bg-gray-900 flex items-center gap-1 min-h-[36px] sm:min-h-0"
                              title="Download"
                              aria-label={`Download ${att.filename}`}
                            >
                              <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Download
                            </button>
                          </div>
                          <div className="text-xs text-gray-400 mt-1">{att.filename}</div>
                        </div>
                      )}
                      {att.type === 'VIDEO' && (
                        <video src={att.url} controls className="max-w-full md:max-w-md rounded" />
                      )}
                      {att.type === 'AUDIO' && (
                        <div className="bg-[var(--color-bg-tertiary)] rounded-lg p-3 max-w-full md:max-w-md">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-[var(--color-bg-secondary)] rounded flex items-center justify-center flex-shrink-0">
                              <svg className="w-5 h-5 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-[var(--color-text-primary)] truncate">{att.filename}</div>
                              {att.size && (
                                <div className="text-xs text-[var(--color-text-muted)]">
                                  {(att.size / (1024 * 1024)).toFixed(1)} MB
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleDownload(att.url, att.filename)}
                              className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                              title="Download"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </button>
                          </div>
                          <audio
                            src={att.url}
                            controls
                            preload="metadata"
                            className="w-full"
                          />
                        </div>
                      )}
                      {att.type === 'DOCUMENT' && (
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slack-blue hover:underline"
                        >
                          {att.filename}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Reactions */}
              <ReactionDisplay
                reactions={message.reactions}
                currentUserId={currentUser.id}
                onToggleReaction={(emoji, hasReacted) => handleToggleReaction(message.id, emoji, hasReacted)}
              />

              {/* Thread indicator */}
              {message._count?.replies > 0 && (
                <button
                  onClick={() => onOpenThread(message)}
                  className={`mt-2 text-sm hover:underline flex items-center gap-1 ${
                    message.unreadReplies > 0
                      ? 'text-slack-blue font-bold'
                      : 'text-gray-500'
                  }`}
                >
                  <span>
                    {message.unreadReplies > 0
                      ? `${message.unreadReplies} new ${message.unreadReplies === 1 ? 'reply' : 'replies'}`
                      : `${message._count.replies} ${message._count.replies === 1 ? 'reply' : 'replies'}`
                    }
                  </span>
                  <span className="text-gray-400">→</span>
                </button>
              )}

              {/* Seen by indicator */}
              {message.id === seenByMessageId && seenByCount > 0 && (
                <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Seen by {seenByCount}
                </div>
              )}
            </div>

            {/* Always-visible more button for keyboard/non-hover users */}
            <button
              className="absolute right-2 top-2 text-gray-500 hover:text-gray-300 transition-opacity opacity-0 group-hover:opacity-0 focus:opacity-100 hidden sm:block text-sm p-1"
              onClick={(e) => {
                e.stopPropagation();
                setMsgContextMenu({ messageId: message.id, x: e.clientX, y: e.clientY });
              }}
              aria-label="Message actions"
              tabIndex={0}
            >
              ...
            </button>
            {/* Actions - visible on hover (desktop only), hidden on mobile (use long-press context menu) */}
            <div className={`absolute right-2 -top-3 z-10 transition-opacity hidden sm:block ${reactionPickerMessageId === message.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
              {reactionPickerMessageId === message.id && (
                <div className="absolute right-0 bottom-full mb-1 z-10">
                  <ReactionPicker
                    onSelect={(emoji) => handleReactionSelect(message.id, emoji)}
                    onClose={() => setReactionPickerMessageId(null)}
                  />
                </div>
              )}
              <div className="flex items-center gap-1 bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border)]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setReactionPickerMessageId(
                      reactionPickerMessageId === message.id ? null : message.id
                    );
                  }}
                  className="p-2 sm:p-1.5 hover:bg-[var(--color-bg-secondary)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] min-w-[36px] sm:min-w-0"
                  title="Add reaction"
                  aria-label="Add reaction"
                >
                  😀
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenThread(message);
                  }}
                  className="p-2 sm:p-1.5 hover:bg-[var(--color-bg-secondary)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] min-w-[36px] sm:min-w-0"
                  title="Reply in thread"
                  aria-label="Reply in thread"
                >
                  💬
                </button>
                {onPinMessage && onUnpinMessage && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (pinnedMessageIds?.has(message.id)) {
                        onUnpinMessage(message.id);
                      } else {
                        onPinMessage(message.id);
                      }
                    }}
                    className={`p-2 sm:p-1.5 hover:bg-[var(--color-bg-secondary)] rounded min-w-[36px] sm:min-w-0 ${
                      pinnedMessageIds?.has(message.id) ? 'text-yellow-400' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                    title={pinnedMessageIds?.has(message.id) ? 'Unpin message' : 'Pin message'}
                    aria-label={pinnedMessageIds?.has(message.id) ? 'Unpin message' : 'Pin message'}
                  >
                    📌
                  </button>
                )}
                {onSaveMessage && onUnsaveMessage && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (savedMessageIds?.has(message.id)) {
                        onUnsaveMessage(message.id);
                      } else {
                        onSaveMessage(message.id);
                      }
                    }}
                    className={`p-2 sm:p-1.5 hover:bg-[var(--color-bg-secondary)] rounded min-w-[36px] sm:min-w-0 ${
                      savedMessageIds?.has(message.id) ? 'text-blue-400' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                    title={savedMessageIds?.has(message.id) ? 'Unsave message' : 'Save message'}
                    aria-label={savedMessageIds?.has(message.id) ? 'Unsave message' : 'Save message'}
                  >
                    🔖
                  </button>
                )}
                {message.author?.id === currentUser.id && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(message);
                      }}
                      className="p-2 sm:p-1.5 hover:bg-[var(--color-bg-secondary)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] min-w-[36px] sm:min-w-0"
                      title="Edit"
                      aria-label="Edit message"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteMessageId(message.id);
                      }}
                      className="p-2 sm:p-1.5 hover:bg-[var(--color-bg-secondary)] rounded text-[var(--color-text-secondary)] hover:text-red-400 min-w-[36px] sm:min-w-0"
                      title="Delete"
                      aria-label="Delete message"
                    >
                      🗑️
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
              );
            })}
          </>
        );
      })()}
    </div>

    <ConfirmDialog
      isOpen={deleteMessageId !== null}
      title="Delete Message"
      message="Are you sure you want to delete this message? This cannot be undone."
      confirmText="Delete"
      confirmVariant="danger"
      onConfirm={() => {
        onDeleteMessage(deleteMessageId);
        setDeleteMessageId(null);
      }}
      onCancel={() => setDeleteMessageId(null)}
    />

    {/* Mobile Reaction Picker (triggered from context menu) */}
    {reactionPickerMessageId && (
      <div className="sm:hidden fixed inset-0 z-[10000]">
        <div className="absolute inset-0 bg-black/50" onClick={() => setReactionPickerMessageId(null)} />
        <div className="absolute bottom-0 left-0 right-0 pb-[env(safe-area-inset-bottom)]">
          <ReactionPicker
            onSelect={(emoji) => handleReactionSelect(reactionPickerMessageId, emoji)}
            onClose={() => setReactionPickerMessageId(null)}
          />
        </div>
      </div>
    )}

    <ContextMenu
      isOpen={msgContextMenu !== null}
      position={msgContextMenu || { x: 0, y: 0 }}
      onClose={() => setMsgContextMenu(null)}
      items={(() => {
        const msg = messages.find(m => m.id === msgContextMenu?.messageId);
        if (!msg) return [];
        const isOwn = msg.author?.id === currentUser?.id;
        const isPinned = pinnedMessageIds?.has(msg.id);
        return [
          { label: 'Reply in Thread', icon: '💬', onClick: () => onOpenThread(msg) },
          { label: 'Add Reaction', icon: '😀', onClick: () => setReactionPickerMessageId(msg.id) },
          { label: 'Copy Text', icon: '📋', onClick: () => handleCopyText(msg.id) },
          { label: isPinned ? 'Unpin Message' : 'Pin Message', icon: '📌', onClick: () => isPinned ? onUnpinMessage?.(msg.id) : onPinMessage?.(msg.id), show: !!(onPinMessage && onUnpinMessage) },
          { label: savedMessageIds?.has(msg.id) ? 'Unsave Message' : 'Save Message', icon: '🔖', onClick: () => savedMessageIds?.has(msg.id) ? onUnsaveMessage?.(msg.id) : onSaveMessage?.(msg.id), show: !!(onSaveMessage && onUnsaveMessage) },
          { divider: true, label: 'divider', onClick: () => {}, show: isOwn },
          { label: 'Edit Message', icon: '✏️', onClick: () => handleStartEdit(msg), show: isOwn },
          { label: 'Delete Message', icon: '🗑️', variant: 'danger', onClick: () => setDeleteMessageId(msg.id), show: isOwn },
          { divider: true, label: 'divider2', onClick: () => {}, show: !isOwn },
          { label: 'Report Message', icon: '⚠️', variant: 'danger', onClick: () => { setReportMessageId(msg.id); setReportReason(''); setReportError(''); }, show: !isOwn },
        ];
      })()}
    />
    {lightboxData && (
      <ImageLightbox
        images={lightboxData.images}
        initialIndex={lightboxData.index}
        onClose={() => setLightboxData(null)}
      />
    )}

    {/* Report Message Dialog */}
    {reportMessageId && (
      <div className="modal-backdrop z-[10001]" onClick={(e) => { if (e.target === e.currentTarget) { setReportMessageId(null); } }}>
        <div className="modal-content max-w-md w-full">
          <div className="modal-header">
            <h3>Report Message</h3>
            <button onClick={() => setReportMessageId(null)} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
          </div>
          <div className="modal-body px-6 py-4">
            <p className="text-sm text-[var(--color-text-secondary)] mb-3">
              This message will be reported to the BandChat team for review.
            </p>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="modal-input w-full px-3 py-2.5 text-sm min-h-[80px] resize-y"
              placeholder="Why are you reporting this message?"
              autoFocus
            />
            {reportError && (
              <p className="text-[13px] text-red-500 mt-2" role="alert">{reportError}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 px-6 py-3 border-t border-[var(--color-modal-border)]">
            <button onClick={() => setReportMessageId(null)} className="btn btn-secondary">Cancel</button>
            <button
              onClick={async () => {
                if (!reportReason.trim()) {
                  setReportError('Please provide a reason');
                  return;
                }
                setReportLoading(true);
                setReportError('');
                try {
                  await api.reportMessage(reportMessageId, reportReason.trim());
                  setReportMessageId(null);
                  setReportReason('');
                } catch (err) {
                  setReportError(err.message);
                } finally {
                  setReportLoading(false);
                }
              }}
              className="btn btn-primary bg-red-600 hover:bg-red-700"
              disabled={reportLoading || !reportReason.trim()}
            >
              {reportLoading ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default MessageList;
