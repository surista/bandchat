/**
 * @fileoverview Message list component for displaying chat messages.
 * Handles message rendering, editing, reactions, and thread navigation.
 */

import { useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import ReactionDisplay from './ReactionDisplay';
import ReactionPicker from './ReactionPicker';
import ConfirmDialog from '../common/ConfirmDialog';

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
  onRemoveReaction
}) {
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState(null);
  const [activeMessageId, setActiveMessageId] = useState(null); // For mobile tap-to-reveal actions
  const [deleteMessageId, setDeleteMessageId] = useState(null); // For delete confirmation dialog

  const formatMessageTime = (date) => {
    const d = new Date(date);
    return format(d, 'h:mm a');
  };

  const formatDateHeader = (date) => {
    const d = new Date(date);
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'EEEE, MMMM d');
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
    setMenuOpenId(null);
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

  const handleDownload = async (url, filename) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Download failed:', err);
      // Fallback: open in new tab
      window.open(url, '_blank');
    }
  };

  const renderContent = (content) => {
    // Convert URLs to links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);

    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        // Check if it's a Google Doc/Sheet
        if (part.includes('docs.google.com') || part.includes('sheets.google.com')) {
          return (
            <div key={i} className="my-2">
              <a
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slack-blue hover:underline break-all"
              >
                {part}
              </a>
              <iframe
                src={part.replace('/edit', '/preview')}
                className="w-full h-64 mt-2 rounded border border-gray-600"
                title="Google Doc"
              />
            </div>
          );
        }

        // Check if it's an image
        if (part.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          return (
            <div key={i} className="my-2">
              <img
                src={part}
                alt="Shared image"
                className="max-w-full md:max-w-md max-h-80 rounded"
                loading="lazy"
              />
            </div>
          );
        }

        // Check if it's a video
        if (part.match(/\.(mp4|webm|mov)$/i)) {
          return (
            <div key={i} className="my-2">
              <video
                src={part}
                controls
                className="max-w-full md:max-w-md rounded"
              />
            </div>
          );
        }

        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slack-blue hover:underline break-all"
          >
            {part}
          </a>
        );
      }

      // Convert @mentions
      const mentionRegex = /@(\w+)/g;
      const mentionParts = part.split(mentionRegex);

      return mentionParts.map((p, j) => {
        if (j % 2 === 1) {
          return (
            <span key={`${i}-${j}`} className="bg-blue-900 text-blue-300 px-1 rounded">
              @{p}
            </span>
          );
        }
        return p;
      });
    });
  };

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
    <div className="px-4 py-2" onClick={(e) => {
      // Dismiss active message actions when tapping empty space
      if (e.target === e.currentTarget) {
        setActiveMessageId(null);
        setReactionPickerMessageId(null);
      }
    }}>
      {messages.map((message, index) => (
        <div key={message.id}>
          {/* Date Header */}
          {shouldShowDateHeader(message, index) && (
            <div className="flex items-center my-4">
              <div className="flex-1 border-t border-gray-700" />
              <span className="px-4 text-xs text-gray-400 font-medium">
                {formatDateHeader(message.createdAt)}
              </span>
              <div className="flex-1 border-t border-gray-700" />
            </div>
          )}

          {/* Message */}
          <div
            className={`group flex gap-3 py-2 hover:bg-gray-700/30 rounded px-2 -mx-2 relative ${message.pending ? 'opacity-60' : ''} ${activeMessageId === message.id ? 'bg-gray-700/30' : ''}`}
            onMouseLeave={() => setMenuOpenId(null)}
            onClick={(e) => {
              // On mobile, tap to reveal actions (but not if clicking on buttons/links)
              if (e.target.closest('button') || e.target.closest('a') || e.target.closest('textarea')) return;
              const newId = activeMessageId === message.id ? null : message.id;
              setActiveMessageId(newId);
              if (!newId) setReactionPickerMessageId(null);
            }}
          >
            {/* Avatar */}
            <div className="w-9 h-9 rounded bg-slack-green flex-shrink-0 flex items-center justify-center text-white font-medium">
              {message.author.avatarUrl ? (
                <img
                  src={message.author.avatarUrl}
                  alt={message.author.displayName}
                  className="w-full h-full rounded object-cover"
                />
              ) : (
                message.author.displayName.charAt(0).toUpperCase()
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-white">
                  {message.author.displayName}
                </span>
                <span className="text-xs text-gray-400">
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
                    className="w-full bg-gray-700 text-white rounded p-2 resize-none"
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
                      className="text-gray-400 hover:text-white"
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
                <div className="text-gray-200 break-words whitespace-pre-wrap">
                  {renderContent(message.content)}
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
                            src={att.url}
                            alt={att.filename}
                            className="max-w-full md:max-w-md max-h-80 rounded cursor-pointer"
                            loading="lazy"
                            onClick={() => window.open(att.url, '_blank')}
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
                        <div className="bg-gray-700 rounded-lg p-3 max-w-full md:max-w-md">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center flex-shrink-0">
                              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                              </svg>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-white truncate">{att.filename}</div>
                              {att.size && (
                                <div className="text-xs text-gray-400">
                                  {(att.size / (1024 * 1024)).toFixed(1)} MB
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleDownload(att.url, att.filename)}
                              className="p-2 text-gray-400 hover:text-white transition-colors"
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
                  className="mt-2 text-slack-blue text-sm hover:underline flex items-center gap-1"
                >
                  <span>{message._count.replies} replies</span>
                  <span className="text-gray-400">→</span>
                </button>
              )}
            </div>

            {/* Actions - visible on hover (desktop) or tap (mobile) */}
            <div className={`absolute right-2 -top-3 transition-opacity ${
              activeMessageId === message.id
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100'
            }`}>
              {reactionPickerMessageId === message.id && (
                <div className="absolute right-0 bottom-full mb-1 z-10">
                  <ReactionPicker
                    onSelect={(emoji) => handleReactionSelect(message.id, emoji)}
                    onClose={() => setReactionPickerMessageId(null)}
                  />
                </div>
              )}
              <div className="flex items-center gap-1 bg-gray-700 rounded border border-gray-600">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setReactionPickerMessageId(
                      reactionPickerMessageId === message.id ? null : message.id
                    );
                  }}
                  className="p-2 sm:p-1.5 hover:bg-gray-600 rounded text-gray-300 hover:text-white min-w-[36px] sm:min-w-0"
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
                  className="p-2 sm:p-1.5 hover:bg-gray-600 rounded text-gray-300 hover:text-white min-w-[36px] sm:min-w-0"
                  title="Reply in thread"
                  aria-label="Reply in thread"
                >
                  💬
                </button>
                {message.author.id === currentUser.id && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(message);
                      }}
                      className="p-2 sm:p-1.5 hover:bg-gray-600 rounded text-gray-300 hover:text-white min-w-[36px] sm:min-w-0"
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
                      className="p-2 sm:p-1.5 hover:bg-gray-600 rounded text-gray-300 hover:text-red-400 min-w-[36px] sm:min-w-0"
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
        setActiveMessageId(null);
      }}
      onCancel={() => setDeleteMessageId(null)}
    />
    </>
  );
}

export default MessageList;
