/**
 * @fileoverview Message list component for displaying chat messages.
 * Handles message rendering, editing, reactions, and thread navigation.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import ReactionDisplay from './ReactionDisplay';
import ReactionPicker from './ReactionPicker';
import ConfirmDialog from '../common/ConfirmDialog';
import Modal from '../common/Modal';
import ContextMenu from '../common/ContextMenu';
import ImageLightbox from '../common/ImageLightbox';
import useLongPress from '../../hooks/useLongPress';
import { hapticLight } from '../../services/haptic';
import LinkPreviewCard from './LinkPreviewCard';
import { useToast } from '../../context/ToastContext';
import { handleDownload } from '../../utils/download';
import { buildMentionRegex, buildChannelRegex, buildGroupMentionRegex } from '../../utils/parseMentions';
import api from '../../services/api';
import EmbedCard from './EmbedCard';
import '../../../styles/markdown.css';

// ─── Blocked preview domains (localStorage) ───
const BLOCKED_DOMAINS_KEY = 'bandchat_blocked_preview_domains';

function getBlockedDomains() {
  try { return new Set(JSON.parse(localStorage.getItem(BLOCKED_DOMAINS_KEY) || '[]')); }
  catch { return new Set(); }
}

function persistBlockedDomains(domains) {
  localStorage.setItem(BLOCKED_DOMAINS_KEY, JSON.stringify([...domains]));
}

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

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
function renderUrlPart(part, i, message, onOpenLightbox, onAddToLibrary, isOwn, onTogglePreview, blockedDomains) {
  if (!isValidHttpUrl(part)) return <span key={i}>{part}</span>;

  // Google Doc/Sheet
  let isGoogleDoc = false;
  try {
    const parsedUrl = new URL(part);
    isGoogleDoc = parsedUrl.hostname === 'docs.google.com' || parsedUrl.hostname === 'sheets.google.com';
  } catch {
    // Expected: URL parsing may fail for invalid input
  }
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

  const domain = getDomain(part);
  const domainBlocked = blockedDomains?.has(domain);
  return (
    <span key={i}>
      <a href={part} target="_blank" rel="noopener noreferrer" className="text-slack-blue hover:underline break-all">{part}</a>
      {!message?.hidePreview && !domainBlocked && <LinkPreviewCard url={part} onAddToLibrary={onAddToLibrary} isOwn={isOwn} onDismiss={onTogglePreview ? () => onTogglePreview(message.id) : undefined} />}
    </span>
  );
}

/** Process a text segment through embed detection, URL splitting, mention highlighting, and inline markdown */
function processTextSegment(text, segKey, message, onOpenLightbox, members, onAddToLibrary, workspaceId, isOwn, onTogglePreview, blockedDomains, channels, onSelectChannel) {
  // Detect embed tokens [type:uuid]
  const embedRegex = /\[(song|setlist|gig|poll):([a-f0-9-]+)\]/gi;
  const embedParts = text.split(embedRegex);

  // embedRegex with 2 capture groups: [before, type, id, between, type, id, ...]
  if (embedParts.length > 1) {
    const result = [];
    for (let ei = 0; ei < embedParts.length; ei += 3) {
      const textPart = embedParts[ei];
      if (textPart) {
        result.push(...processTextInner(textPart, `${segKey}-e${ei}`, message, onOpenLightbox, members, onAddToLibrary, isOwn, onTogglePreview, blockedDomains, channels, onSelectChannel));
      }
      if (ei + 2 < embedParts.length) {
        const embedType = embedParts[ei + 1];
        const embedId = embedParts[ei + 2];
        result.push(<EmbedCard key={`${segKey}-embed${ei}`} type={embedType} id={embedId} workspaceId={workspaceId} />);
      }
    }
    return result;
  }

  return processTextInner(text, segKey, message, onOpenLightbox, members, onAddToLibrary, isOwn, onTogglePreview, blockedDomains, channels, onSelectChannel);
}

/** Inner text processing: URL splitting, mentions, channel references, inline markdown */
function processTextInner(text, segKey, message, onOpenLightbox, members, onAddToLibrary, isOwn, onTogglePreview, blockedDomains, channels, onSelectChannel) {
  const urlRegex = /(https?:\/\/[^\s\[\]<>]+?)(?=[\[\])\s]|[.,;:!?"'](?:\s|$)|$)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, i) => {
    if (part.match(/^https?:\/\//)) {
      return renderUrlPart(part, `${segKey}-${i}`, message, onOpenLightbox, onAddToLibrary, isOwn, onTogglePreview, blockedDomains);
    }

    // First: pull out @channel/@here/@everyone group mentions (rendered as a warning-tinted pill)
    const groupRegex = buildGroupMentionRegex();
    const groupParts = part.split(groupRegex);
    const afterGroup = [];

    for (let g = 0; g < groupParts.length; g += 3) {
      const txt = groupParts[g];
      if (txt) afterGroup.push(txt);
      if (g + 2 < groupParts.length) {
        const ws = groupParts[g + 1];
        const name = groupParts[g + 2];
        if (ws) afterGroup.push(ws);
        afterGroup.push(
          <span key={`${segKey}-${i}-g${g}`} className="bg-yellow-500/20 text-yellow-400 px-1 rounded font-medium">@{name.toLowerCase()}</span>
        );
      }
    }

    // Then: per-user @mentions on remaining text fragments
    const mentionRegex = buildMentionRegex(members || []) || /(^|[\s])@(\w+)/g;
    const afterMentions = [];

    for (const frag of afterGroup) {
      if (typeof frag !== 'string') {
        afterMentions.push(frag);
        continue;
      }
      const mentionParts = frag.split(mentionRegex);
      for (let j = 0; j < mentionParts.length; j += 3) {
        const txt = mentionParts[j];
        if (txt) afterMentions.push(txt);
        if (j + 2 < mentionParts.length) {
          const ws = mentionParts[j + 1];
          const name = mentionParts[j + 2];
          if (ws) afterMentions.push(ws);
          afterMentions.push(
            <span key={`${segKey}-${i}-m${j}-${afterMentions.length}`} className="bg-blue-900 text-blue-300 px-1 rounded">@{name}</span>
          );
        }
      }
    }

    // Apply #channel references on text fragments
    const channelRegex = (channels && channels.length > 0) ? buildChannelRegex(channels) : null;
    const result = [];
    for (const fragment of afterMentions) {
      if (typeof fragment !== 'string' || !channelRegex) {
        if (typeof fragment === 'string') {
          result.push(...applyInlineMarkdown(fragment, `${segKey}-${i}-ch`));
        } else {
          result.push(fragment);
        }
        continue;
      }
      // Reset regex state
      channelRegex.lastIndex = 0;
      const chParts = fragment.split(channelRegex);
      for (let k = 0; k < chParts.length; k += 3) {
        const txt = chParts[k];
        if (txt) result.push(...applyInlineMarkdown(txt, `${segKey}-${i}-${k}`));
        if (k + 2 < chParts.length) {
          const ws = chParts[k + 1];
          const chName = chParts[k + 2];
          if (ws) result.push(ws);
          const matchedChannel = channels.find(c => c.name === chName);
          result.push(
            <span
              key={`${segKey}-${i}-ch${k}`}
              className="bg-teal-900/50 text-teal-300 hover:bg-teal-800/50 cursor-pointer px-1 rounded"
              role="link"
              tabIndex={0}
              aria-label={`Go to channel ${chName}`}
              onClick={() => matchedChannel && onSelectChannel?.(matchedChannel)}
              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && matchedChannel) { e.preventDefault(); onSelectChannel?.(matchedChannel); } }}
            >#{chName}</span>
          );
        }
      }
    }
    return result;
  });
}

/**
 * Memoized component for rendering message content with markdown formatting,
 * URL detection, embeds (Google Docs, YouTube), images, videos, and @mentions.
 */
const MessageContent = React.memo(({ content, message, onOpenLightbox, members, onAddToLibrary, workspaceId, isOwn, onTogglePreview, blockedDomains, channels, onSelectChannel }) => {
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
                {processTextSegment(l, `${key}-${li}`, message, onOpenLightbox, members, onAddToLibrary, workspaceId, isOwn, onTogglePreview, blockedDomains, channels, onSelectChannel)}
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
              <li key={li}>{processTextSegment(l, `${key}-${li}`, message, onOpenLightbox, members, onAddToLibrary, workspaceId, isOwn, onTogglePreview, blockedDomains, channels, onSelectChannel)}</li>
            ))}
          </ul>
        );
      }
      return <React.Fragment key={key}>{processTextSegment(block.value, key, message, onOpenLightbox, members, onAddToLibrary, workspaceId, isOwn, onTogglePreview, blockedDomains, channels, onSelectChannel)}</React.Fragment>;
    });
  });

  return hasMarkdown ? <span className="msg-markdown">{rendered}</span> : <>{rendered}</>;
});
MessageContent.displayName = 'MessageContent';

// Module-scope formatters (don't capture closure state, free of re-creation
// cost and safe to use inside MessageRow without coupling).
function formatMessageTimeImpl(date) {
  return format(new Date(date), 'h:mm a');
}

function formatDateHeaderImpl(date) {
  const d = new Date(date);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, dd-MMM-yyyy');
}

/**
 * Memoized message row. Receives a stable `ctx` containing handlers/data
 * + per-row primitives (booleans, current edit content). Default shallow
 * comparison: when `message` reference is unchanged AND none of the per-row
 * primitives changed AND `ctx` reference is the same, the row skips
 * re-rendering entirely. The parent (MessageList → ChannelView) updates
 * messages with `prev.map(m => m.id === id ? {...m, ...} : m)`, so unchanged
 * rows keep their object reference and the memo bypass kicks in.
 *
 * Net effect: a single reaction in a 5,000-message channel re-renders 1 row
 * instead of 5,000.
 */
const MessageRow = memo(function MessageRow({
  message, showDateHeader, showUnreadDivider,
  isEditing, isHighlighted, isReactionPickerOpen, isPinned, isSaved,
  showSeenBy, seenByCount, editContent, ctx,
}) {
  const {
    members, channels, blockedDomains, memberAvatarMap, workspaceId, currentUser,
    onAvatarClick, onOpenThread, onAddToLibrary, onTogglePreview, onSelectChannel,
    onPinMessage, onUnpinMessage, onSaveMessage, onUnsaveMessage,
    setMsgContextMenu, setDeleteMessageId, setReactionPickerMessageId,
    handleStartEdit, handleToggleReaction, handleReactionSelect, openLightbox,
    editTextareaRef, setEditContent, handleSaveEdit, handleCancelEdit,
    wrapEditSelection, insertEditLinePrefix,
  } = ctx;

  return (
    <div>
      {showDateHeader && (
        <div className="flex items-center my-4">
          <div className="flex-1 border-t border-[var(--color-border)]" />
          <span className="px-4 text-xs text-[var(--color-text-muted)] font-medium">
            {formatDateHeaderImpl(message.createdAt)}
          </span>
          <div className="flex-1 border-t border-[var(--color-border)]" />
        </div>
      )}

      {showUnreadDivider && (
        <div className="unread-divider flex items-center my-3" role="separator" aria-label="New messages below">
          <div className="flex-1 border-t border-red-500" aria-hidden="true" />
          <span className="px-3 text-xs text-red-500 font-semibold">New messages</span>
          <div className="flex-1 border-t border-red-500" aria-hidden="true" />
        </div>
      )}

      <div
        data-message-id={message.id}
        className={`group flex gap-3 py-2 hover:bg-[var(--color-bg-tertiary)]/30 rounded px-2 -mx-2 relative ${message.pending ? 'opacity-60' : ''} ${isHighlighted ? 'msg-highlight' : ''}`}
        onContextMenu={(e) => {
          e.preventDefault();
          const previewEl = e.target.closest('[data-preview-url]');
          const linkEl = e.target.closest('a[href^="http"]');
          const linkUrl = previewEl?.dataset?.previewUrl || linkEl?.href || null;
          setMsgContextMenu({ messageId: message.id, x: e.clientX, y: e.clientY, linkUrl });
        }}
      >
        <div
          className={`w-9 h-9 rounded bg-slack-green flex-shrink-0 flex items-center justify-center text-white font-medium ${message.author?.id && onAvatarClick ? 'cursor-pointer hover:opacity-80' : ''}`}
          onClick={() => message.author?.id && onAvatarClick?.(message.author.id)}
        >
          {(() => {
            const avatarSrc = message.author?.avatarUrl || (message.author?.id && memberAvatarMap.get(message.author.id));
            return avatarSrc ? (
              <img src={avatarSrc} alt={message.author?.displayName || message.removedUserName || 'Deleted User'} className="w-full h-full rounded object-cover" />
            ) : (
              (message.author?.displayName || message.removedUserName || 'Deleted User').charAt(0).toUpperCase()
            );
          })()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span
              className={`font-semibold text-[var(--color-text-primary)] ${message.author?.id && onAvatarClick ? 'cursor-pointer hover:underline' : ''}`}
              onClick={() => message.author?.id && onAvatarClick?.(message.author.id)}
            >
              {message.author?.displayName || message.removedUserName || 'Deleted User'}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {formatMessageTimeImpl(message.createdAt)}
            </span>
            {message.pending && <span className="text-xs text-gray-500">(sending...)</span>}
            {!message.pending && message.updatedAt !== message.createdAt && (
              <span className="text-xs text-gray-500">(edited)</span>
            )}
          </div>

          {isEditing ? (
            <div className="mt-1">
              <textarea
                ref={(el) => {
                  editTextareaRef.current = el;
                  if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
                }}
                value={editContent ?? ''}
                onChange={(e) => {
                  setEditContent(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                className="w-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] rounded-t p-2 resize-vertical min-h-[2.5rem]"
                rows={1}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                  if (e.key === 'Escape') { handleCancelEdit(); }
                  if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
                    if (e.key === 'b') { e.preventDefault(); wrapEditSelection('**'); }
                    if (e.key === 'i') { e.preventDefault(); wrapEditSelection('*'); }
                    if (e.key === 'e') { e.preventDefault(); wrapEditSelection('`'); }
                  }
                  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'X') { e.preventDefault(); wrapEditSelection('~~'); }
                }}
              />
              <div className="flex items-center justify-between bg-[var(--color-bg-tertiary)] rounded-b px-2 py-1 border-t border-[var(--color-border)]">
                <div className="hidden md:flex items-center gap-0.5">
                  <button type="button" onClick={() => wrapEditSelection('**')} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-secondary)]" aria-label="Bold" title="Bold (Ctrl+B)"><span className="font-bold text-xs w-5 h-5 flex items-center justify-center">B</span></button>
                  <button type="button" onClick={() => wrapEditSelection('*')} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-secondary)]" aria-label="Italic" title="Italic (Ctrl+I)"><span className="italic text-xs w-5 h-5 flex items-center justify-center">I</span></button>
                  <button type="button" onClick={() => wrapEditSelection('~~')} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-secondary)]" aria-label="Strikethrough" title="Strikethrough (Ctrl+Shift+X)"><span className="line-through text-xs w-5 h-5 flex items-center justify-center">S</span></button>
                  <button type="button" onClick={() => wrapEditSelection('`')} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-secondary)]" aria-label="Inline code" title="Code (Ctrl+E)"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg></button>
                  <button type="button" onClick={() => wrapEditSelection('```\n', '\n```')} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-secondary)]" aria-label="Code block" title="Code block"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h10" /></svg></button>
                  <button type="button" onClick={() => insertEditLinePrefix('> ')} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-secondary)]" aria-label="Quote" title="Quote"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg></button>
                  <button type="button" onClick={() => insertEditLinePrefix('- ')} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-secondary)]" aria-label="Bullet list" title="Bullet list"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /><circle cx="2" cy="6" r="1" fill="currentColor" /><circle cx="2" cy="12" r="1" fill="currentColor" /><circle cx="2" cy="18" r="1" fill="currentColor" /></svg></button>
                </div>
                <div className="flex gap-2 text-xs ml-auto">
                  <button onClick={handleCancelEdit} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">Cancel</button>
                  <button onClick={handleSaveEdit} className="text-slack-blue hover:underline">Save</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="message-content text-[var(--color-text-secondary)] break-words whitespace-pre-wrap">
              <MessageContent content={message.content} message={message} onOpenLightbox={openLightbox} members={members} onAddToLibrary={onAddToLibrary} workspaceId={workspaceId} isOwn={message.author?.id === currentUser?.id} onTogglePreview={onTogglePreview} blockedDomains={blockedDomains} channels={channels} onSelectChannel={onSelectChannel} />
            </div>
          )}

          {message.attachments?.length > 0 && (
            <div className="mt-2 space-y-2">
              {message.attachments.map((att) => (
                <div key={att.id}>
                  {att.type === 'IMAGE' && (
                    <div className="relative inline-block group/img">
                      <img src={att.thumbnailUrl || att.url} alt={att.filename} className="max-w-full md:max-w-md max-h-80 rounded cursor-pointer" loading="lazy" onClick={() => openLightbox(message, att.url)} />
                      <div className="absolute bottom-2 right-2 opacity-100 sm:opacity-0 sm:group-hover/img:opacity-100 transition-opacity flex gap-1">
                        <button onClick={(e) => { e.stopPropagation(); handleDownload(att.url, att.filename); }} className="bg-gray-900/80 text-white px-3 py-2 sm:px-2 sm:py-1 rounded text-sm sm:text-xs hover:bg-gray-900 flex items-center gap-1 min-h-[36px] sm:min-h-0" title="Download" aria-label={`Download ${att.filename}`}>
                          <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          Download
                        </button>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{att.filename}</div>
                    </div>
                  )}
                  {att.type === 'VIDEO' && (
                    <video src={att.url} controls playsInline preload="none" className="max-w-full md:max-w-md rounded" />
                  )}
                  {att.type === 'AUDIO' && (
                    <div className="bg-[var(--color-bg-tertiary)] rounded-lg p-3 max-w-full md:max-w-md">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-[var(--color-bg-secondary)] rounded flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-[var(--color-text-primary)] truncate">{att.filename}</div>
                          {att.size && (<div className="text-xs text-[var(--color-text-muted)]">{(att.size / (1024 * 1024)).toFixed(1)} MB</div>)}
                        </div>
                        <button onClick={() => handleDownload(att.url, att.filename)} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors" title="Download">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </button>
                      </div>
                      <audio src={att.url} controls preload="none" className="w-full" />
                    </div>
                  )}
                  {att.type === 'DOCUMENT' && (
                    <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-slack-blue hover:underline">{att.filename}</a>
                  )}
                </div>
              ))}
            </div>
          )}

          <ReactionDisplay
            reactions={message.reactions}
            currentUserId={currentUser.id}
            onToggleReaction={(emoji, hasReacted) => handleToggleReaction(message.id, emoji, hasReacted)}
          />

          {message._count?.replies > 0 && (
            <button
              onClick={() => onOpenThread(message)}
              className={`mt-2 text-sm hover:underline flex items-center gap-1 ${message.unreadReplies > 0 ? 'text-slack-blue font-bold' : 'text-gray-500'}`}
              aria-label={message.unreadReplies > 0
                ? `${message.unreadReplies} unread ${message.unreadReplies === 1 ? 'reply' : 'replies'}, open thread`
                : `${message._count.replies} ${message._count.replies === 1 ? 'reply' : 'replies'}, open thread`}
            >
              <span>
                {message.unreadReplies > 0
                  ? `${message.unreadReplies} new ${message.unreadReplies === 1 ? 'reply' : 'replies'}`
                  : `${message._count.replies} ${message._count.replies === 1 ? 'reply' : 'replies'}`}
              </span>
              <span className="text-gray-400" aria-hidden="true">→</span>
            </button>
          )}

          {showSeenBy && (
            <div className="mt-1 text-xs text-[var(--color-text-muted)]">Seen by {seenByCount}</div>
          )}
        </div>

        <button
          className="absolute right-2 top-2 text-gray-500 hover:text-gray-300 transition-opacity opacity-0 group-hover:opacity-0 focus:opacity-100 hidden sm:block text-sm p-1"
          onClick={(e) => { e.stopPropagation(); setMsgContextMenu({ messageId: message.id, x: e.clientX, y: e.clientY }); }}
          aria-label="Message actions"
          tabIndex={0}
        >...</button>

        <div className={`absolute right-2 -top-3 z-10 transition-opacity hidden sm:block ${isReactionPickerOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
          {isReactionPickerOpen && (
            <div className="absolute right-0 bottom-full mb-1 z-10">
              <ReactionPicker
                onSelect={(emoji) => handleReactionSelect(message.id, emoji)}
                onClose={() => setReactionPickerMessageId(null)}
              />
            </div>
          )}
          <div className="flex items-center gap-1 bg-[var(--color-bg-tertiary)] rounded border border-[var(--color-border)]">
            <button onClick={(e) => { e.stopPropagation(); setReactionPickerMessageId(isReactionPickerOpen ? null : message.id); }} className="p-2 sm:p-1.5 hover:bg-[var(--color-bg-secondary)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] min-w-[36px] sm:min-w-0" title="Add reaction" aria-label="Add reaction">😀</button>
            <button onClick={(e) => { e.stopPropagation(); onOpenThread(message); }} className="p-2 sm:p-1.5 hover:bg-[var(--color-bg-secondary)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] min-w-[36px] sm:min-w-0" title="Reply in thread" aria-label="Reply in thread">💬</button>
            {onPinMessage && onUnpinMessage && (
              <button
                onClick={(e) => { e.stopPropagation(); if (isPinned) onUnpinMessage(message.id); else onPinMessage(message.id); }}
                className={`p-2 sm:p-1.5 hover:bg-[var(--color-bg-secondary)] rounded min-w-[36px] sm:min-w-0 ${isPinned ? 'text-yellow-400' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                title={isPinned ? 'Unpin message' : 'Pin message'}
                aria-label={isPinned ? 'Unpin message' : 'Pin message'}
              >📌</button>
            )}
            {onSaveMessage && onUnsaveMessage && (
              <button
                onClick={(e) => { e.stopPropagation(); if (isSaved) onUnsaveMessage(message.id); else onSaveMessage(message.id); }}
                className={`p-2 sm:p-1.5 hover:bg-[var(--color-bg-secondary)] rounded min-w-[36px] sm:min-w-0 ${isSaved ? 'text-blue-400' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                title={isSaved ? 'Unsave message' : 'Save message'}
                aria-label={isSaved ? 'Unsave message' : 'Save message'}
              >🔖</button>
            )}
            {message.author?.id === currentUser.id && (
              <>
                <button onClick={(e) => { e.stopPropagation(); handleStartEdit(message); }} className="p-2 sm:p-1.5 hover:bg-[var(--color-bg-secondary)] rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] min-w-[36px] sm:min-w-0" title="Edit" aria-label="Edit message">✏️</button>
                <button onClick={(e) => { e.stopPropagation(); setDeleteMessageId(message.id); }} className="p-2 sm:p-1.5 hover:bg-[var(--color-bg-secondary)] rounded text-[var(--color-text-secondary)] hover:text-red-400 min-w-[36px] sm:min-w-0" title="Delete" aria-label="Delete message">🗑️</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

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
  workspaceId,
  channels,
  onSelectChannel,
  highlightMessageId
}) {
  const toast = useToast();
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContentState] = useState('');
  const editTextareaRef = useRef(null);
  const editContentRef = useRef('');
  // setEditContent is defined below (useCallback) so it's stable across renders.
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);
  const [deleteMessageId, setDeleteMessageId] = useState(null); // For delete confirmation dialog
  const [reportMessageId, setReportMessageId] = useState(null); // For report dialog
  const [reportReason, setReportReason] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [lightboxData, setLightboxData] = useState(null); // { images: [{src, alt}], index }
  const [msgContextMenu, setMsgContextMenu] = useState(null); // { messageId, x, y, linkUrl? }
  const [seenByCount, setSeenByCount] = useState(null);
  const [seenByMessageId, setSeenByMessageId] = useState(null);
  const [blockedDomains, setBlockedDomains] = useState(() => getBlockedDomains());
  const [highlightedId, setHighlightedId] = useState(null);

  // Scroll to and highlight a specific message when highlightMessageId changes
  useEffect(() => {
    if (!highlightMessageId || !/^[a-zA-Z0-9_-]+$/.test(highlightMessageId)) return;
    // Wait for DOM to render, then scroll
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-message-id="${highlightMessageId}"]`);
      if (el) {
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
        setHighlightedId(highlightMessageId);
        setTimeout(() => setHighlightedId(null), 2000);
      } else {
        toast.info('Linked message is not in the current view');
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [highlightMessageId]);

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

  const openLightbox = useCallback((message, src) => {
    const images = getMessageImages(message);
    const index = images.findIndex(img => img.src === src);
    setLightboxData({ images, index: Math.max(0, index) });
  }, []);

  // formatMessageTime / formatDateHeader / shouldShowDateHeader were moved to
  // module scope (formatMessageTimeImpl, formatDateHeaderImpl) and inlined into
  // messages.map below — they don't capture closure state, so keeping them on
  // the function instance was needless re-creation cost.

  // Mirror editingId in a ref so memoized handlers can read its current value
  // without listing it as a useCallback dep (which would defeat memoization).
  const editingIdRef = useRef(null);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);

  // Stable setEditContent: avoids changing reference every render which would
  // break the ctx memo for MessageRow.
  const setEditContent = useCallback((val) => {
    editContentRef.current = val;
    setEditContentState(val);
  }, []);

  const handleStartEdit = useCallback((message) => {
    setEditingId(message.id);
    editingIdRef.current = message.id;
    setEditContent(message.content);
  }, [setEditContent]);

  const handleSaveEdit = useCallback(async () => {
    const id = editingIdRef.current;
    const content = editContentRef.current;
    if (!id) return;
    if (content?.trim()) {
      await onEditMessage(id, content);
    }
    setEditingId(null);
    editingIdRef.current = null;
    setEditContent('');
  }, [onEditMessage, setEditContent]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    editingIdRef.current = null;
    setEditContent('');
  }, [setEditContent]);

  const wrapEditSelection = useCallback((before, after) => {
    const ta = editTextareaRef.current;
    if (!ta) return;
    const content = editContentRef.current;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end);
    const newContent = content.slice(0, start) + before + selected + (after || before) + content.slice(end);
    setEditContent(newContent);
    const cursorPos = selected ? start + before.length + selected.length + (after || before).length : start + before.length;
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(
        selected ? start : cursorPos,
        selected ? start + before.length + selected.length + (after || before).length : cursorPos
      );
    }, 0);
  }, []);

  const insertEditLinePrefix = useCallback((prefix) => {
    const ta = editTextareaRef.current;
    if (!ta) return;
    const content = editContentRef.current;
    const start = ta.selectionStart;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    setEditContent(content.slice(0, lineStart) + prefix + content.slice(lineStart));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + prefix.length, start + prefix.length); }, 0);
  }, [setEditContent]);
  // Note: previously listed [editContent] which busted the ctx memo on every
  // keystroke (every-row re-render). The function reads editContentRef.current,
  // not editContent, so the dep was both wrong and harmful for memoization.

  const handleToggleReaction = useCallback((messageId, emoji, hasReacted) => {
    hapticLight();
    if (hasReacted) {
      onRemoveReaction(messageId, emoji);
    } else {
      onAddReaction(messageId, emoji);
    }
  }, [onAddReaction, onRemoveReaction]);

  const handleReactionSelect = useCallback((messageId, emoji) => {
    onAddReaction(messageId, emoji);
    setReactionPickerMessageId(null);
  }, [onAddReaction]);

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

  // Stable per-render context bundle passed to every MessageRow. By packaging
  // all the handlers + reference data into one memoized object, MessageRow's
  // React.memo only has to do a shallow compare on `ctx` (one ref check)
  // instead of 25+ individual props. Result: when a single message changes
  // (e.g. someone adds a reaction), only that message's row re-renders;
  // all 4,999 others short-circuit because their props are identical.
  const ctx = useMemo(() => ({
    members,
    channels,
    blockedDomains,
    memberAvatarMap,
    workspaceId,
    currentUser,
    onAvatarClick,
    onOpenThread,
    onAddToLibrary,
    onTogglePreview,
    onSelectChannel,
    onPinMessage,
    onUnpinMessage,
    onSaveMessage,
    onUnsaveMessage,
    setMsgContextMenu,
    setDeleteMessageId,
    setReactionPickerMessageId,
    handleStartEdit,
    handleToggleReaction,
    handleReactionSelect,
    openLightbox,
    editTextareaRef,
    setEditContent,
    handleSaveEdit,
    handleCancelEdit,
    wrapEditSelection,
    insertEditLinePrefix,
  }), [
    members, channels, blockedDomains, memberAvatarMap, workspaceId, currentUser,
    onAvatarClick, onOpenThread, onAddToLibrary, onTogglePreview, onSelectChannel,
    onPinMessage, onUnpinMessage, onSaveMessage, onUnsaveMessage,
    handleStartEdit, handleToggleReaction, handleReactionSelect, openLightbox,
    setEditContent, handleSaveEdit, handleCancelEdit, wrapEditSelection, insertEditLinePrefix,
  ]);

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
      {messages.map((message, index) => (
        <MessageRow
          key={message.id}
          message={message}
          showDateHeader={index === 0 || new Date(messages[index - 1].createdAt).toDateString() !== new Date(message.createdAt).toDateString()}
          showUnreadDivider={index === firstUnreadIndex}
          isEditing={editingId === message.id}
          isHighlighted={highlightedId === message.id}
          isReactionPickerOpen={reactionPickerMessageId === message.id}
          isPinned={!!pinnedMessageIds?.has(message.id)}
          isSaved={!!savedMessageIds?.has(message.id)}
          showSeenBy={message.id === seenByMessageId && seenByCount > 0}
          seenByCount={seenByCount}
          editContent={editingId === message.id ? editContent : undefined}
          ctx={ctx}
        />
      ))}
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
        const linkUrl = msgContextMenu?.linkUrl;
        const linkDomain = linkUrl ? getDomain(linkUrl) : null;
        const isDomainBlocked = linkDomain ? blockedDomains.has(linkDomain) : false;
        return [
          { label: 'Reply in Thread', icon: '💬', onClick: () => onOpenThread(msg) },
          { label: 'Add Reaction', icon: '😀', onClick: () => setReactionPickerMessageId(msg.id) },
          { label: 'Copy Text', icon: '📋', onClick: () => handleCopyText(msg.id) },
          { label: 'Copy Link', icon: '🔗', onClick: () => {
            const url = `${window.location.origin}/workspace/${workspaceId}?channel=${msg.channelId}&msg=${msg.id}`;
            navigator.clipboard.writeText(url)
              .then(() => toast.success('Link copied'))
              .catch(() => toast.error('Failed to copy link'));
          } },
          { label: isPinned ? 'Unpin Message' : 'Pin Message', icon: '📌', onClick: () => isPinned ? onUnpinMessage?.(msg.id) : onPinMessage?.(msg.id), show: !!(onPinMessage && onUnpinMessage) },
          { label: savedMessageIds?.has(msg.id) ? 'Unsave Message' : 'Save Message', icon: '🔖', onClick: () => savedMessageIds?.has(msg.id) ? onUnsaveMessage?.(msg.id) : onSaveMessage?.(msg.id), show: !!(onSaveMessage && onUnsaveMessage) },
          { divider: true, label: 'link-divider', onClick: () => {}, show: !!linkDomain },
          { label: isDomainBlocked ? `Show previews from ${linkDomain}` : `Block previews from ${linkDomain}`, icon: isDomainBlocked ? '👁️' : '🚫', onClick: () => {
            const domains = getBlockedDomains();
            if (isDomainBlocked) { domains.delete(linkDomain); } else { domains.add(linkDomain); }
            persistBlockedDomains(domains);
            setBlockedDomains(new Set(domains));
          }, show: !!linkDomain },
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
    <Modal isOpen={!!reportMessageId} onClose={() => { setReportMessageId(null); setReportReason(''); setReportError(''); }} title="Report Message">
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
        <button onClick={() => { setReportMessageId(null); setReportReason(''); setReportError(''); }} className="btn btn-secondary">Cancel</button>
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
    </Modal>
    </>
  );
}

export default MessageList;
