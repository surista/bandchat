import { useState, useRef } from 'react';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function MessageInput({ channelName, onSend, onTyping }) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if ((!content.trim() && selectedFiles.length === 0) || sending) return;

    setSending(true);
    setError('');
    try {
      await onSend(content.trim(), selectedFiles);
      setContent('');
      setSelectedFiles([]);
      setPreviews([]);
      textareaRef.current?.focus();
    } catch (err) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleChange = (e) => {
    setContent(e.target.value);
    onTyping();
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
          // Check file size
          if (file.size > MAX_FILE_SIZE) {
            setError(`Pasted image exceeds 10MB limit`);
            continue;
          }
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault(); // Prevent default paste behavior for images
      setSelectedFiles(prev => [...prev, ...imageFiles]);

      // Create previews
      imageFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPreviews(prev => [...prev, {
            name: file.name || `pasted-image-${Date.now()}.png`,
            url: e.target.result,
            size: file.size
          }]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setError('');

    // Validate files
    const validFiles = [];
    for (const file of files) {
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        setError(`File "${file.name}" exceeds 10MB limit`);
        continue;
      }

      // Check file type
      if (!file.type.startsWith('image/')) {
        setError(`File "${file.name}" is not an image`);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);

      // Create previews
      validFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPreviews(prev => [...prev, {
            name: file.name,
            url: e.target.result,
            size: file.size
          }]);
        };
        reader.readAsDataURL(file);
      });
    }

    // Reset input
    e.target.value = '';
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
      {/* Error message */}
      {error && (
        <div className="mb-2 text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* File previews */}
      {previews.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {previews.map((preview, index) => (
            <div
              key={index}
              className="relative group bg-gray-700 rounded-lg p-2 flex items-center gap-2"
            >
              <img
                src={preview.url}
                alt={preview.name}
                className="w-16 h-16 object-cover rounded"
              />
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
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 flex items-center justify-center"
                title="Remove"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-700 rounded-lg">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={handlePaste}
          placeholder={`Message #${channelName}`}
          className="w-full bg-transparent text-white px-4 py-3 resize-none outline-none placeholder-gray-400"
          rows={1}
          disabled={sending}
        />
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-600">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1 text-gray-400 hover:text-white transition-colors"
              title="Add image (max 10MB)"
              disabled={sending}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-white transition-colors"
              title="Add emoji (coming soon)"
            >
              <span className="text-lg">+</span>
            </button>
          </div>
          <button
            type="submit"
            disabled={(!content.trim() && selectedFiles.length === 0) || sending}
            className="bg-slack-green text-white px-4 py-1.5 rounded font-medium hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Press <kbd className="bg-gray-700 px-1 rounded">Enter</kbd> to send,{' '}
        <kbd className="bg-gray-700 px-1 rounded">Shift + Enter</kbd> for new line
      </p>
    </form>
  );
}

export default MessageInput;
