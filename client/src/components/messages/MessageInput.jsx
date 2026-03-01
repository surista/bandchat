/**
 * @fileoverview Message input component with file uploads, @mentions, and voice recording.
 * Supports image paste, drag-drop files, autocomplete for member mentions, and
 * voice message recording via MediaRecorder API.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { hapticLight } from '../../services/haptic';
import { formatFileSize } from '../../utils/format';
import { MAX_IMAGE_SIZE, MAX_AUDIO_SIZE, MAX_VIDEO_SIZE, ALLOWED_IMAGE_TYPES, ALLOWED_AUDIO_TYPES, ALLOWED_VIDEO_TYPES, isImageFile, isAudioFile, isVideoFile } from '../../utils/fileValidation';


/**
 * Message composition input with file attachments, @mention support, and voice recording.
 *
 * @param {Object} props
 * @param {string} props.channelName - Channel name for placeholder text
 * @param {function} props.onSend - Callback when message is sent (content, files)
 * @param {function} props.onTyping - Callback when user is typing
 * @param {Array} props.members - Workspace members for @mention autocomplete
 */
function MessageInput({ channelName, onSend, onTyping, members = [], disabled = false }) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [error, setError] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

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

  // Reset mention index when filter changes
  useEffect(() => {
    setMentionIndex(0);
  }, [mentionFilter]);

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
            await onSend('', [audioFile]);
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
  }, [onSend]);

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

  const handleKeyDown = (e) => {
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
  };

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
            setError(`Pasted image exceeds 10MB limit`);
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

      if (!isImage && !isAudio && !isVideo) {
        setError(`File "${file.name}" is not a supported type (images, audio, or video only)`);
        continue;
      }

      const maxSize = isVideo ? MAX_VIDEO_SIZE : isAudio ? MAX_AUDIO_SIZE : MAX_IMAGE_SIZE;
      const limitMB = maxSize / (1024 * 1024);
      if (file.size > maxSize) {
        setError(`File "${file.name}" exceeds ${limitMB}MB limit`);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);

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
    <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700 safe-area-bottom">
      {/* Error message */}
      {error && (
        <div className="mb-2 text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Voice recording indicator bar */}
      {isRecording && (
        <div className="mb-2 flex items-center gap-3 bg-gray-800 px-4 py-3 rounded-lg">
          <span className="inline-block w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white font-mono text-sm">{formatRecordingTime(recordingDuration)}</span>
          <span className="text-gray-400 text-sm flex-1">Recording...</span>
          <button
            type="button"
            onClick={cancelRecording}
            className="p-2 text-gray-400 hover:text-red-400 transition-colors"
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
              className="relative group bg-gray-700 rounded-lg p-2 flex items-center gap-2"
            >
              {preview.type === 'audio' ? (
                <div className="w-16 h-16 bg-gray-600 rounded flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
              ) : preview.type === 'video' ? (
                <div className="w-16 h-16 bg-gray-600 rounded flex items-center justify-center relative overflow-hidden">
                  <video src={preview.url} className="w-full h-full object-cover" muted />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              ) : (
                <img
                  src={preview.url}
                  alt={preview.name}
                  className="w-16 h-16 object-cover rounded"
                />
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-sm text-white truncate max-w-[150px]">
                  {preview.name}
                </span>
                <span className="text-xs text-gray-400">
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

      <div className="bg-gray-700 rounded-lg relative">
        {/* @Mention dropdown */}
        {showMentions && filteredMembers.length > 0 && (
          <div
            className="absolute bottom-full left-0 mb-1 w-64 bg-gray-800 rounded-lg shadow-lg border border-gray-600 py-1 max-h-48 overflow-y-auto z-50"
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
                  idx === mentionIndex ? 'bg-blue-600' : 'hover:bg-gray-700'
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-xs text-white">
                  {member.user.displayName.charAt(0).toUpperCase()}
                </div>
                <span className="text-white">{member.user.displayName}</span>
                {member.role === 'ADMIN' && (
                  <span className="text-xs text-gray-400">admin</span>
                )}
              </button>
            ))}
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
          aria-expanded={showMentions}
          aria-controls="mention-listbox"
          className={`w-full bg-transparent text-white px-4 py-3 resize-none outline-none placeholder-gray-400 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          rows={1}
          disabled={sending || disabled || isRecording}
        />
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-600">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*,video/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 -m-1 text-gray-400 hover:text-white transition-colors"
              title="Add file (images 10MB, audio 30MB, video 50MB)"
              disabled={sending || isRecording}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
            {/* Voice recording button */}
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-2 -m-1 transition-colors ${isRecording ? 'text-red-400 hover:text-red-300' : 'text-gray-400 hover:text-white'}`}
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
              className="p-2 -m-1 text-gray-400 hover:text-white transition-colors"
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
      <p className="hidden md:block text-xs text-gray-500 mt-2">
        Press <kbd className="bg-gray-700 px-1 rounded">Enter</kbd> to send,{' '}
        <kbd className="bg-gray-700 px-1 rounded">Shift + Enter</kbd> for new line,{' '}
        <kbd className="bg-gray-700 px-1 rounded">@</kbd> to mention
      </p>
    </form>
  );
}

export default MessageInput;
