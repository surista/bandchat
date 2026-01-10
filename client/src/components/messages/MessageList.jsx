import { useState, useCallback } from 'react';
import { format, isToday, isYesterday } from 'date-fns';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function MessageList({
  messages,
  currentUser,
  onOpenThread,
  onEditMessage,
  onDeleteMessage
}) {
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [menuOpenId, setMenuOpenId] = useState(null);

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
                className="text-slack-blue hover:underline"
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
                className="max-w-md max-h-80 rounded"
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
                className="max-w-md rounded"
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
            className="text-slack-blue hover:underline"
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
            <span key={`${i}-${j}`} className="mention">
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
    <div className="px-4 py-2">
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
            className="group flex gap-3 py-2 hover:bg-gray-700/30 rounded px-2 -mx-2 relative"
            onMouseLeave={() => setMenuOpenId(null)}
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
                {message.updatedAt !== message.createdAt && (
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
                            className="max-w-md max-h-80 rounded cursor-pointer"
                            loading="lazy"
                            onClick={() => window.open(att.url, '_blank')}
                          />
                          <div className="absolute bottom-2 right-2 opacity-0 group-hover/img:opacity-100 transition-opacity flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(att.url, att.filename);
                              }}
                              className="bg-gray-900/80 text-white px-2 py-1 rounded text-xs hover:bg-gray-900 flex items-center gap-1"
                              title="Download"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Download
                            </button>
                          </div>
                          <div className="text-xs text-gray-400 mt-1">{att.filename}</div>
                        </div>
                      )}
                      {att.type === 'VIDEO' && (
                        <video src={att.url} controls className="max-w-md rounded" />
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

            {/* Actions */}
            <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-1 bg-gray-700 rounded border border-gray-600">
                <button
                  onClick={() => onOpenThread(message)}
                  className="p-1.5 hover:bg-gray-600 rounded text-gray-300 hover:text-white"
                  title="Reply in thread"
                >
                  💬
                </button>
                {message.author.id === currentUser.id && (
                  <>
                    <button
                      onClick={() => handleStartEdit(message)}
                      className="p-1.5 hover:bg-gray-600 rounded text-gray-300 hover:text-white"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this message?')) {
                          onDeleteMessage(message.id);
                        }
                      }}
                      className="p-1.5 hover:bg-gray-600 rounded text-gray-300 hover:text-red-400"
                      title="Delete"
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
  );
}

export default MessageList;
