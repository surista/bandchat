import { useState, useRef, useEffect } from 'react';

const EMOJI_CATEGORIES = {
  reactions: ['👍', '👎', '❤️', '🔥', '😂', '😮', '😢', '😡', '🎉', '🙏', '👏', '💯', '✅', '❌', '👀', '🤔', '💪', '🙌', '😍', '🥳'],
  text: ['LGTM', 'thx', 'lol', 'wtf?', 'nice!', 'nope', 'yep', 'gg', 'brb', 'omg'],
  food: ['🍕', '🍔', '🍟', '🌮', '🍣', '🍜', '🍺', '🍷', '☕', '🍰', '🍩', '🌭', '🥗', '🍝', '🥤'],
  music: ['🎸', '🥁', '🎤', '🎹', '🎵', '🎶', '🎧', '🎼', '🎺', '🎻', '🪘', '🎷', '🪗', '🎚️', '🔊'],
  people: ['😀', '😎', '🤘', '🤟', '👋', '🙋', '💃', '🕺', '🧑‍🎤', '👨‍🎤', '👩‍🎤', '🤷', '🙅', '🙆', '💁'],
  flags: ['🇺🇸', '🇬🇧', '🇯🇵', '🇩🇪', '🇫🇷', '🇮🇹', '🇪🇸', '🇧🇷', '🇨🇦', '🇦🇺', '🇲🇽', '🇰🇷', '🇳🇱', '🇸🇪', '🇨🇭']
};

const CATEGORY_LABELS = {
  frequent: '⭐ Frequent',
  reactions: '😀 Reactions',
  text: '💬 Text',
  food: '🍕 Food',
  music: '🎸 Music',
  people: '👋 People',
  flags: '🏳️ Flags'
};

const getFrequentEmojis = () => {
  try {
    const freq = JSON.parse(localStorage.getItem('emojiFrequency') || '{}');
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([emoji]) => emoji);
  } catch {
    return [];
  }
};

const trackEmojiUsage = (emoji) => {
  try {
    const freq = JSON.parse(localStorage.getItem('emojiFrequency') || '{}');
    freq[emoji] = (freq[emoji] || 0) + 1;
    localStorage.setItem('emojiFrequency', JSON.stringify(freq));
  } catch {
    // Ignore localStorage errors
  }
};

export default function ReactionPicker({ onSelect, onClose }) {
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [frequentEmojis, setFrequentEmojis] = useState([]);
  const pickerRef = useRef(null);

  useEffect(() => {
    setFrequentEmojis(getFrequentEmojis());
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        onClose?.();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleSelect = (emoji) => {
    trackEmojiUsage(emoji);
    onSelect(emoji);
  };

  const toggleCategory = (category) => {
    setExpandedCategory(expandedCategory === category ? null : category);
  };

  const renderEmojiButton = (emoji, isText = false) => (
    <button
      key={emoji}
      onClick={() => handleSelect(emoji)}
      className={`${isText ? 'px-2 min-w-[40px]' : 'w-10'} h-10 sm:h-8 flex items-center justify-center hover:bg-gray-700 active:bg-gray-600 rounded transition-colors touch-manipulation ${isText ? 'text-xs font-medium text-gray-200' : 'text-lg'}`}
      title={`React with ${emoji}`}
      aria-label={`React with ${emoji}`}
    >
      {emoji}
    </button>
  );

  // Quick reactions row (frequent + top reactions)
  const quickReactions = frequentEmojis.length > 0
    ? frequentEmojis
    : EMOJI_CATEGORIES.reactions.slice(0, 5);

  return (
    <div ref={pickerRef} className="relative">
      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-600 overflow-hidden" style={{ minWidth: '280px', maxWidth: '320px' }}>
        {/* Quick reactions row */}
        <div className="flex items-center gap-0.5 p-1.5 border-b border-gray-700">
          {quickReactions.map(emoji => renderEmojiButton(emoji, !emoji.match(/\p{Emoji}/u)))}
          <div className="flex-1" />
          <button
            onClick={() => setExpandedCategory(expandedCategory ? null : 'reactions')}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-700 rounded text-gray-400 text-sm"
            title="More emojis"
          >
            {expandedCategory ? '▲' : '▼'}
          </button>
        </div>

        {/* Expanded categories */}
        {expandedCategory !== null && (
          <div className="max-h-64 overflow-y-auto">
            {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
              <div key={category} className="border-b border-gray-700 last:border-b-0">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full px-2 py-1.5 text-left text-xs font-medium text-gray-400 hover:bg-gray-750 flex items-center justify-between"
                >
                  <span>{CATEGORY_LABELS[category]}</span>
                  <span className="text-gray-500">{expandedCategory === category ? '−' : '+'}</span>
                </button>
                {expandedCategory === category && (
                  <div className="flex flex-wrap gap-0.5 p-1.5 pt-0">
                    {emojis.map(emoji => renderEmojiButton(emoji, category === 'text'))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
