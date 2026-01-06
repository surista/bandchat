import { useState, useRef } from 'react';

function MessageInput({ channelName, onSend, onTyping }) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim() || sending) return;

    setSending(true);
    try {
      await onSend(content.trim());
      setContent('');
      textareaRef.current?.focus();
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

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
      <div className="bg-gray-700 rounded-lg">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={`Message #${channelName}`}
          className="w-full bg-transparent text-white px-4 py-3 resize-none outline-none placeholder-gray-400"
          rows={1}
          disabled={sending}
        />
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-600">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-white transition-colors"
              title="Add attachment (coming soon)"
            >
              📎
            </button>
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-white transition-colors"
              title="Add emoji (coming soon)"
            >
              😊
            </button>
          </div>
          <button
            type="submit"
            disabled={!content.trim() || sending}
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
