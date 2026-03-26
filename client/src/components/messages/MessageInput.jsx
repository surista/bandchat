/**
 * @fileoverview Message input component with file uploads, @mentions, and voice recording.
 * Supports image paste, drag-drop files, autocomplete for member mentions, and
 * voice message recording via MediaRecorder API.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { hapticLight } from '../../services/haptic';
import { formatFileSize } from '../../utils/format';
import { MAX_IMAGE_SIZE, MAX_AUDIO_SIZE, MAX_VIDEO_SIZE, MAX_DOCUMENT_SIZE, ALLOWED_IMAGE_TYPES, ALLOWED_AUDIO_TYPES, ALLOWED_VIDEO_TYPES, isImageFile, isAudioFile, isVideoFile, isDocumentFile } from '../../utils/fileValidation';


/**
 * Message composition input with file attachments, @mention support, and voice recording.
 *
 * @param {Object} props
 * @param {string} props.channelName - Channel name for placeholder text
 * @param {function} props.onSend - Callback when message is sent (content, files)
 * @param {function} props.onTyping - Callback when user is typing
 * @param {Array} props.members - Workspace members for @mention autocomplete
 */
const SLASH_COMMANDS = [
  { command: '/setlist', label: 'Share a setlist', icon: '📋' },
  { command: '/gig', label: 'Share a gig', icon: '🎤' },
  { command: '/song', label: 'Share a song', icon: '🎵' },
  { command: '/poll', label: 'Create a poll', icon: '📊' },
];

function MessageInput({ channelName, onSend, onTyping, members = [], disabled = false, workspaceId, onSlashCommand, channels = [] }) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [error, setError] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [showChannels, setShowChannels] = useState(false);
  const [channelFilter, setChannelFilter] = useState('');
  const [channelStart, setChannelStart] = useState(-1);
  const [channelIndex, setChannelIndex] = useState(0);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const onSendRef = useRef(onSend);
  useEffect(() => { onSendRef.current = onSend; }, [onSend]);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const durationIntervalRef = useRef(null);

  // Filter members based on mention filter
  const filteredMembers = members.filter(m =>
    m.user.displayName.toLowerCase().includes(mentionFilter.toLowerCase())
  ).slice(0, 6);

  // Filter slash commands
  const filteredSlashCommands = SLASH_COMMANDS.filter(c =>
    c.command.startsWith('/' + slashFilter)
  );

  // Filter channels for # autocomplete (exclude DM channels)
  const filteredChannels = channels
    .filter(c => !c.isDirect && c.name?.toLowerCase().includes(channelFilter.toLowerCase()))
    .slice(0, 6);

  // Reset mention index when filter changes
  useEffect(() => {
    setMentionIndex(0);
  }, [mentionFilter]);

  // Reset channel index when filter changes
  useEffect(() => {
    setChannelIndex(0);
  }, [channelFilter]);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const formatRecordingTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const startRecording = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }

        // Add to selected files and auto-send
        setSelectedFiles([audioFile]);
        setPreviews([{
          name: audioFile.name,
          url: null,
          size: audioFile.size,
          type: 'audio',
        }]);

        // Auto-submit after a short delay to allow state update
        setTimeout(async () => {
          setSending(true);
          hapticLight();
          try {
            await onSendRef.current('', [audioFile]);
            setSelectedFiles([]);
            setPreviews([]);
          } catch (err) {
            setError(err.message || 'Failed to send voice message');
          } finally {
            setSending(false);
          }
        }, 50);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone access denied. Please allow microphone permission in your browser settings.');
      } else {
        setError('Could not start recording. Please check your microphone.');
      }
      console.error('Failed to start recording:', err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];

    // Stop MediaRecorder without triggering onstop send logic
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }

    // Stop audio stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if ((!content.trim() && selectedFiles.length === 0) || sending) return;

    setSending(true);
    setError('');
    setShowMentions(false);
    setShowChannels(false);
    hapticLight();
    try {
      await onSend(content.trim(), selectedFiles);
      setContent('');
      // Revoke blob URLs before clearing previews
      previews.forEach(p => {
        if (p?.url?.startsWith('blob:')) URL.revokeObjectURL(p.url);
      });
      setSelectedFiles([]);
      setPreviews([]);
    } catch (err) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const insertMention = (displayName) => {
    if (mentionStart === -1) return;

    const before = content.slice(0, mentionStart);
    const after = content.slice(textareaRef.current?.selectionStart || content.length);
    const newContent = `${before}@${displayName} ${after}`;

    setContent(newContent);
    setShowMentions(false);
    setMentionFilter('');
    setMentionStart(-1);

    // Focus and set cursor position after the inserted mention
    setTimeout(() => {
      const newPos = mentionStart + displayName.length + 2; // +2 for @ and space
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const insertChannel = (channelName) => {
    if (channelStart === -1) return;

    const before = content.slice(0, channelStart);
    const after = content.slice(textareaRef.current?.selectionStart || content.length);
    const newContent = `${before}#${channelName} ${after}`;

    setContent(newContent);
    setShowChannels(false);
    setChannelFilter('');
    setChannelStart(-1);

    setTimeout(() => {
      const newPos = channelStart + channelName.length + 2; // +2 for # and space
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleKeyDown = (e) => {
    // Handle slash command dropdown navigation
    if (showSlashCommands && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex(prev => (prev + 1) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex(prev => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const cmd = filteredSlashCommands[slashIndex];
        setContent('');
        setShowSlashCommands(false);
        onSlashCommand?.(cmd.command.slice(1)); // Remove leading /
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashCommands(false);
        return;
      }
    }

    // Handle channel dropdown navigation
    if (showChannels && filteredChannels.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setChannelIndex(prev => (prev + 1) % filteredChannels.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setChannelIndex(prev => (prev - 1 + filteredChannels.length) % filteredChannels.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertChannel(filteredChannels[channelIndex].name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowChannels(false);
        return;
      }
    }

    // Handle mention dropdown navigation
    if (showMentions && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % filteredMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMembers[mentionIndex].user.displayName);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }

    // Formatting keyboard shortcuts
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      if (e.key === 'b') { e.preventDefault(); wrapSelection('**'); return; }
      if (e.key === 'i') { e.preventDefault(); wrapSelection('*'); return; }
      if (e.key === 'e') { e.preventDefault(); wrapSelection('`'); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'X') {
      e.preventDefault(); wrapSelection('~~'); return;
    }

    // Normal enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleChange = (e) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setContent(value);
    onTyping();

    // Check for @ mention trigger
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setShowMentions(true);
      setMentionFilter(atMatch[1]);
      setMentionStart(cursorPos - atMatch[0].length);
    } else {
      setShowMentions(false);
      setMentionFilter('');
      setMentionStart(-1);
    }

    // Check for # channel trigger
    const hashMatch = textBeforeCursor.match(/#([\w-]*)$/);
    if (hashMatch) {
      setShowChannels(true);
      setChannelFilter(hashMatch[1]);
      setChannelStart(cursorPos - hashMatch[0].length);
    } else {
      setShowChannels(false);
      setChannelFilter('');
      setChannelStart(-1);
    }

    // Check for slash command trigger (/ at start of input)
    const slashMatch = value.match(/^\/(\w*)$/);
    if (slashMatch) {
      setShowSlashCommands(true);
      setSlashFilter(slashMatch[1]);
      setSlashIndex(0);
    } else {
      setShowSlashCommands(false);
    }
  };

  // Wrap selected text with markdown markers (or insert markers at cursor)
  const wrapSelection = useCallback((before, after) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end);
    const newContent = content.slice(0, start) + before + selected + (after || before) + content.slice(end);
    setContent(newContent);
    // Set cursor position after update
    const cursorPos = selected ? start + before.length + selected.length + (after || before).length : start + before.length;
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(
        selected ? start : cursorPos,
        selected ? start + before.length + selected.length + (after || before).length : cursorPos
      );
    }, 0);
  }, [content]);

  // Auto-resize textarea
  const handleInput = (e) => {
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  };

  // Handle paste event for images
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          if (file.size > MAX_IMAGE_SIZE) {
            setError(`Pasted image exceeds ${MAX_IMAGE_SIZE / (1024 * 1024)}MB limit`);
            continue;
          }
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      setSelectedFiles(prev => [...prev, ...imageFiles]);

      imageFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPreviews(prev => [...prev, {
            name: file.name || `pasted-image-${Date.now()}.png`,
            url: e.target.result,
            size: file.size,
            type: 'image'
          }]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setError('');

    const validFiles = [];
    for (const file of files) {
      const isImage = isImageFile(file);
      const isAudio = isAudioFile(file);
      const isVideo = isVideoFile(file);
      const isDocument = isDocumentFile(file);

      if (!isImage && !isAudio && !isVideo && !isDocument) {
        setError(`File "${file.name}" is not a supported type (images, audio, video, PDF, or ZIP only)`);
        continue;
      }

      const maxSize = isVideo ? MAX_VIDEO_SIZE : isAudio ? MAX_AUDIO_SIZE : isDocument ? MAX_DOCUMENT_SIZE : MAX_IMAGE_SIZE;
      const limitMB = maxSize / (1024 * 1024);
      if (file.size > maxSize) {
        setError(`File "${file.name}" exceeds ${limitMB}MB limit`);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => {
        const combined = [...prev, ...validFiles];
        if (combined.length > 5) {
          setError('Maximum 5 files per message');
          return combined.slice(0, 5);
        }
        return combined;
      });

      validFiles.forEach(file => {
        if (isImageFile(file)) {
          // Generate image preview
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
        } else if (isVideoFile(file)) {
          // Video files get a thumbnail preview
          const videoUrl = URL.createObjectURL(file);
          setPreviews(prev => [...prev, {
            name: file.name,
            url: videoUrl,
            size: file.size,
            type: 'video'
          }]);
        } else if (isDocumentFile(file)) {
          // Document files (PDF, ZIP) get a placeholder preview
          setPreviews(prev => [...prev, {
            name: file.name,
            url: null,
            size: file.size,
            type: 'document'
          }]);
        } else {
          // Audio files get a placeholder preview (no image)
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
    const preview = previews[index];
    if (preview?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(preview.url);
    }
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Track current previews via ref so unmount cleanup captures latest state
  const previewsRef = useRef(previews);
  previewsRef.current = previews;

  // Cleanup blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      previewsRef.current.forEach(p => {
        if (p?.url?.startsWith('blob:')) URL.revokeObjectURL(p.url);
      });
    };
  }, []);

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t border-[var(--color-border)] safe-area-bottom">
      {/* Error message */}
      {error && (
        <div role="alert" className="mb-2 text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Voice recording indicator bar */}
      {isRecording && (
        <div className="mb-2 flex items-center gap-3 bg-[var(--color-bg-secondary)] px-4 py-3 rounded-lg">
          <span className="inline-block w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[var(--color-text-primary)] font-mono text-sm">{formatRecordingTime(recordingDuration)}</span>
          <span className="text-[var(--color-text-muted)] text-sm flex-1">Recording...</span>
          <button
            type="button"
            onClick={cancelRecording}
            className="p-2 text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
            title="Cancel recording"
            aria-label="Cancel voice recording"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={stopRecording}
            className="bg-slack-green text-white px-3 py-1.5 rounded font-medium hover:bg-green-600 transition-colors min-h-[36px]"
            title="Stop and send"
            aria-label="Stop recording and send voice message"
          >
            Send
          </button>
        </div>
      )}

      {/* File previews */}
      {previews.length > 0 && !isRecording && (
        <div className="mb-3 flex flex-wrap gap-2">
          {previews.map((preview, index) => (
            <div
              key={preview.name + '-' + preview.size}
              className="relative group bg-[var(--color-bg-tertiary)] rounded-lg p-2 flex items-center gap-2"
            >
              {preview.type === 'audio' ? (
                <div className="w-16 h-16 bg-[var(--color-bg-secondary)] rounded flex items-center justify-center">
                  <svg className="w-8 h-8 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
              ) : preview.type === 'video' ? (
                <div className="w-16 h-16 bg-[var(--color-bg-secondary)] rounded flex items-center justify-center relative overflow-hidden">
                  <video src={preview.url} className="w-full h-full object-cover" muted />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              ) : preview.type === 'document' ? (
                <div className="w-16 h-16 bg-[var(--color-bg-secondary)] rounded flex items-center justify-center">
                  <svg className="w-8 h-8 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
              ) : (
                <img
                  src={preview.url}
                  alt={preview.name}
                  className="w-16 h-16 object-cover rounded"
                />
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-sm text-[var(--color-text-primary)] truncate max-w-[150px]">
                  {preview.name}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {formatFileSize(preview.size)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="absolute -top-3 -right-3 w-8 h-8 bg-red-500 text-white rounded-full text-sm hover:bg-red-600 flex items-center justify-center"
                title="Remove"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--color-bg-tertiary)] rounded-lg relative">
        {/* Slash command dropdown */}
        {showSlashCommands && filteredSlashCommands.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 w-64 bg-[var(--color-bg-secondary)] rounded-lg shadow-lg border border-[var(--color-border)] py-1 z-50">
            <div className="px-3 py-1.5 text-xs text-[var(--color-text-muted)] font-medium uppercase">Commands</div>
            {filteredSlashCommands.map((cmd, idx) => (
              <button
                key={cmd.command}
                type="button"
                onClick={() => {
                  setContent('');
                  setShowSlashCommands(false);
                  onSlashCommand?.(cmd.command.slice(1));
                }}
                className={`w-full px-3 py-2 text-left flex items-center gap-3 ${
                  idx === slashIndex ? 'bg-blue-600' : 'hover:bg-[var(--color-bg-tertiary)]'
                }`}
              >
                <span className="text-lg">{cmd.icon}</span>
                <div>
                  <div className="text-[var(--color-text-primary)] text-sm font-medium">{cmd.command}</div>
                  <div className="text-[var(--color-text-muted)] text-xs">{cmd.label}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* @Mention dropdown */}
        {showMentions && filteredMembers.length > 0 && (
          <div
            className="absolute bottom-full left-0 mb-1 w-64 bg-[var(--color-bg-secondary)] rounded-lg shadow-lg border border-[var(--color-border)] py-1 max-h-48 overflow-y-auto z-50"
            role="listbox"
            id="mention-listbox"
          >
            {filteredMembers.map((member, idx) => (
              <button
                key={member.user.id}
                type="button"
                role="option"
                aria-selected={idx === mentionIndex}
                onClick={() => insertMention(member.user.displayName)}
                className={`w-full px-3 py-2 text-left flex items-center gap-2 ${
                  idx === mentionIndex ? 'bg-blue-600' : 'hover:bg-[var(--color-bg-tertiary)]'
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center text-xs text-[var(--color-text-primary)]">
                  {member.user.displayName.charAt(0).toUpperCase()}
                </div>
                <span className="text-[var(--color-text-primary)]">{member.user.displayName}</span>
                {member.role === 'ADMIN' && (
                  <span className="text-xs text-[var(--color-text-muted)]">admin</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* #Channel dropdown */}
        {showChannels && (
          <div
            className="absolute bottom-full left-0 mb-1 w-64 bg-[var(--color-bg-secondary)] rounded-lg shadow-lg border border-[var(--color-border)] py-1 max-h-48 overflow-y-auto z-50"
            role="listbox"
            id="channel-listbox"
          >
            {filteredChannels.length > 0 ? filteredChannels.map((ch, idx) => (
              <button
                key={ch.id}
                type="button"
                role="option"
                aria-selected={idx === channelIndex}
                onClick={() => insertChannel(ch.name)}
                className={`w-full px-3 py-2 text-left flex items-center gap-2 ${
                  idx === channelIndex ? 'bg-blue-600' : 'hover:bg-[var(--color-bg-tertiary)]'
                }`}
              >
                <span className="text-[var(--color-text-muted)]">{ch.isPrivate ? '🔒' : '#'}</span>
                <span className="text-[var(--color-text-primary)]">{ch.name}</span>
              </button>
            )) : (
              <div className="px-3 py-2 text-sm text-[var(--color-text-muted)]">No channels found</div>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={handlePaste}
          placeholder={disabled ? "You're offline" : `Message #${channelName}`}
          aria-label={`Message ${channelName}`}
          aria-expanded={showMentions || showChannels}
          aria-controls={showChannels ? 'channel-listbox' : showMentions ? 'mention-listbox' : undefined}
          className={`w-full bg-transparent text-[var(--color-text-primary)] px-4 py-3 resize-none outline-none placeholder-[var(--color-text-muted)] ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          rows={1}
          disabled={sending || disabled || isRecording}
        />
        <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            {/* Formatting toolbar */}
            <div className="hidden md:flex items-center gap-0.5 pr-2 mr-2 border-r border-[var(--color-border)]">
              <button type="button" onClick={() => wrapSelection('**')} className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-tertiary)]" title="Bold (Ctrl+B)" disabled={sending || isRecording}>
                <span className="font-bold text-sm w-5 h-5 flex items-center justify-center">B</span>
              </button>
              <button type="button" onClick={() => wrapSelection('*')} className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-tertiary)]" title="Italic (Ctrl+I)" disabled={sending || isRecording}>
                <span className="italic text-sm w-5 h-5 flex items-center justify-center">I</span>
              </button>
              <button type="button" onClick={() => wrapSelection('~~')} className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-tertiary)]" title="Strikethrough (Ctrl+Shift+X)" disabled={sending || isRecording}>
                <span className="line-through text-sm w-5 h-5 flex items-center justify-center">S</span>
              </button>
              <button type="button" onClick={() => wrapSelection('`')} className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-tertiary)]" title="Code (Ctrl+E)" disabled={sending || isRecording}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
              </button>
              <button type="button" onClick={() => wrapSelection('```\n', '\n```')} className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-tertiary)]" title="Code block" disabled={sending || isRecording}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h10" /></svg>
              </button>
              <button type="button" onClick={() => { const ta = textareaRef.current; if (ta) { const start = ta.selectionStart; const lineStart = content.lastIndexOf('\n', start - 1) + 1; setContent(content.slice(0, lineStart) + '> ' + content.slice(lineStart)); setTimeout(() => { ta.focus(); ta.setSelectionRange(start + 2, start + 2); }, 0); }}} className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-tertiary)]" title="Quote" disabled={sending || isRecording}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              </button>
              <button type="button" onClick={() => { const ta = textareaRef.current; if (ta) { const start = ta.selectionStart; const lineStart = content.lastIndexOf('\n', start - 1) + 1; setContent(content.slice(0, lineStart) + '- ' + content.slice(lineStart)); setTimeout(() => { ta.focus(); ta.setSelectionRange(start + 2, start + 2); }, 0); }}} className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors rounded hover:bg-[var(--color-bg-tertiary)]" title="Bullet list" disabled={sending || isRecording}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /><circle cx="2" cy="6" r="1" fill="currentColor" /><circle cx="2" cy="12" r="1" fill="currentColor" /><circle cx="2" cy="18" r="1" fill="currentColor" /></svg>
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*,video/*,.pdf,.zip"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 -m-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              title="Attach file (images, audio, video, PDF, ZIP)"
              aria-label="Attach file"
              disabled={sending || isRecording}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            {/* Voice recording button */}
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-2 -m-1 transition-colors ${isRecording ? 'text-red-400 hover:text-red-300' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
              title={isRecording ? 'Stop recording' : 'Record voice message'}
              aria-label={isRecording ? 'Stop voice recording' : 'Record voice message'}
              disabled={sending}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                setContent(prev => prev + '@');
                setShowMentions(true);
                setMentionStart(content.length);
                setMentionFilter('');
                textareaRef.current?.focus();
              }}
              className="p-2 -m-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              title="Mention someone"
            >
              <span className="text-lg font-bold">@</span>
            </button>
          </div>
          <button
            type="submit"
            disabled={(!content.trim() && selectedFiles.length === 0) || sending || isRecording}
            className="bg-slack-green text-white px-4 py-1.5 rounded font-medium hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
      <p className="hidden md:block text-xs text-[var(--color-text-muted)] mt-2">
        <kbd className="bg-[var(--color-bg-tertiary)] px-1 rounded">Enter</kbd> send{' · '}
        <kbd className="bg-[var(--color-bg-tertiary)] px-1 rounded">Shift+Enter</kbd> new line{' · '}
        <kbd className="bg-[var(--color-bg-tertiary)] px-1 rounded">@</kbd> mention{' · '}
        <kbd className="bg-[var(--color-bg-tertiary)] px-1 rounded">#</kbd> channel{' · '}
        <kbd className="bg-[var(--color-bg-tertiary)] px-1 rounded">Ctrl+B</kbd> bold{' · '}
        <kbd className="bg-[var(--color-bg-tertiary)] px-1 rounded">Ctrl+I</kbd> italic
      </p>
    </form>
  );
}

export default MessageInput;
