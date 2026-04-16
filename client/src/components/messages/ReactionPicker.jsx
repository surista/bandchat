import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

// Pre-compiled regex for emoji detection (avoid creating on every render)
const EMOJI_REGEX = /\p{Emoji}/u;

// Custom emoji that renders as an image
export const CUSTOM_EMOJI = {
  ':bandchat:': { src: '/blue_flame_emoji.png', alt: 'BandChat' },
};

export function renderEmoji(emoji, size = 18) {
  const custom = CUSTOM_EMOJI[emoji];
  if (custom) {
    return <img src={custom.src} alt={custom.alt} style={{ width: size, height: size, display: 'inline-block', verticalAlign: 'middle', borderRadius: 3 }} />;
  }
  return emoji;
}

const EMOJI_CATEGORIES = {
  reactions: [':bandchat:', '👍', '👎', '❤️', '🔥', '😂', '😮', '😢', '😡', '🎉', '🙏', '👏', '💯', '✅', '❌', '👀', '🤔', '💪', '🙌', '😍', '🥳', '🫡', '😬', '🤯', '💀'],
  smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😊', '😇', '🙂', '😉', '😌', '😎', '🥹', '😏', '😒', '😞', '😔', '😟', '🙁', '😣', '😖', '😫', '😩', '🥺', '😤', '😠', '🤬', '🥴', '😵', '🤮', '🤢', '🥶', '🥵', '😶‍🌫️', '🫠', '🤥', '😈', '👿', '🤡'],
  hands: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '👍', '👎', '✊', '👊', '🤛', '🤜', '🫶', '🤝', '💅', '🫵', '☝️', '🙏'],
  people: ['🧑‍🎤', '👨‍🎤', '👩‍🎤', '💃', '🕺', '🙋', '🤷', '🙅', '🙆', '💁', '🧑‍💻', '👨‍💻', '👩‍💻', '🧑‍🎨', '🧑‍🔧', '🦸', '🦹', '🧙', '🧛', '💀', '👻', '🤖', '👽', '🫃', '🎅', '🧑‍🎄'],
  music: ['🎸', '🥁', '🎤', '🎹', '🎵', '🎶', '🎧', '🎼', '🎺', '🎻', '🪘', '🎷', '🪗', '🎚️', '🔊', '🔉', '🔈', '🔇', '📻', '🪕', '🪈', '🎙️', '📯', '🔔', '🎶'],
  animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🦅', '🦆', '🦉', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐙', '🦑'],
  nature: ['🌸', '🌹', '🌺', '🌻', '🌼', '🌷', '🌱', '🌲', '🌳', '🌴', '🌵', '🍀', '🍁', '🍂', '🍃', '🌍', '🌎', '🌏', '⭐', '🌟', '✨', '⚡', '☀️', '🌤️', '⛅', '🌧️', '⛈️', '🌈', '❄️', '💧'],
  food: ['🍕', '🍔', '🍟', '🌮', '🌯', '🥙', '🍣', '🍜', '🍝', '🍛', '🍲', '🥘', '🍺', '🍷', '🍸', '🍹', '🍾', '🥂', '☕', '🫖', '🍰', '🎂', '🍩', '🍪', '🍫', '🍬', '🍭', '🌭', '🥗', '🥤', '🧃', '🥡', '🥪', '🧇', '🥞', '🥓', '🥚', '🍳', '🧀', '🥐'],
  activities: ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🥊', '🎯', '⛳', '🏄', '🏊', '🚴', '🏋️', '🤸', '⛷️', '🏂', '🛹', '🎮', '🕹️', '🎲', '🧩', '🎳', '🎪', '🎨', '🎭', '🏆'],
  travel: ['🚗', '🚕', '🚌', '🏎️', '🚑', '🚒', '✈️', '🚀', '🛸', '🚁', '⛵', '🚢', '🏠', '🏢', '🏰', '🏟️', '🗼', '🗽', '⛩️', '🕌', '🏝️', '🏖️', '⛰️', '🗻', '🌋', '🏕️', '🎡', '🎢', '🎠', '🗿'],
  objects: ['⌚', '📱', '💻', '⌨️', '🖥️', '🖨️', '📷', '📹', '🎥', '📺', '📻', '🔦', '💡', '🔋', '💰', '💎', '🔑', '🗝️', '🔒', '🔓', '📦', '✉️', '📬', '📝', '📚', '📖', '🔗', '✂️', '🗑️', '🧲'],
  symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💝', '⭐', '🌟', '💫', '✨', '⚡', '🔥', '💥', '🎵', '🎶', '💤', '💬', '💭', '🏳️‍🌈'],
  text: ['LGTM', 'thx', 'thank you', 'lol', 'wtf?', 'nice!', 'nope', 'yep', 'gg', 'brb', 'omg'],
  flags: ['🇺🇸', '🇬🇧', '🇯🇵', '🇩🇪', '🇫🇷', '🇮🇹', '🇪🇸', '🇧🇷', '🇨🇦', '🇦🇺', '🇲🇽', '🇰🇷', '🇳🇱', '🇸🇪', '🇨🇭', '🇮🇳', '🇨🇳', '🇷🇺', '🇿🇦', '🇳🇿', '🇮🇪', '🇵🇹', '🇦🇷', '🇨🇴', '🇵🇱', '🇹🇷', '🇹🇭', '🇻🇳', '🇵🇭', '🇳🇬']
};

const CATEGORY_LABELS = {
  frequent: '⭐ Frequent',
  reactions: '😀 Reactions',
  smileys: '😊 Smileys',
  hands: '👋 Hands',
  people: '🧑‍🎤 People',
  music: '🎸 Music',
  animals: '🐶 Animals',
  nature: '🌿 Nature',
  food: '🍕 Food',
  activities: '⚽ Activities',
  travel: '🚗 Travel',
  objects: '💻 Objects',
  symbols: '❤️ Symbols',
  text: '💬 Text',
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
        // Only close if this picker instance is actually visible (not hidden by CSS)
        // Prevents hidden mobile picker from closing the desktop picker and vice versa
        if (pickerRef.current.offsetWidth > 0) {
          onClose?.();
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [onClose]);

  const handleSelect = (emoji) => {
    trackEmojiUsage(emoji);
    onSelect(emoji);
  };

  const toggleCategory = (category) => {
    setExpandedCategory(expandedCategory === category ? null : category);
  };

  // Arrow key navigation within the picker
  const handlePickerKeyDown = useCallback((e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const container = pickerRef.current;
    if (!container) return;
    const buttons = Array.from(container.querySelectorAll('button[data-emoji]'));
    if (buttons.length === 0) return;
    const currentIdx = buttons.indexOf(document.activeElement);
    let nextIdx;
    if (e.key === 'ArrowRight') {
      nextIdx = currentIdx < buttons.length - 1 ? currentIdx + 1 : 0;
    } else {
      nextIdx = currentIdx > 0 ? currentIdx - 1 : buttons.length - 1;
    }
    buttons[nextIdx].focus();
  }, []);

  const renderEmojiButton = (emoji, isText = false) => {
    const custom = CUSTOM_EMOJI[emoji];
    return (
      <button
        key={emoji}
        role="option"
        data-emoji={emoji}
        onClick={() => handleSelect(emoji)}
        onKeyDown={handlePickerKeyDown}
        className={`${isText ? 'px-2 min-w-[40px]' : 'w-10'} h-10 sm:h-8 flex items-center justify-center hover:bg-[var(--color-bg-tertiary)] active:bg-[var(--color-bg-primary)] rounded transition-colors touch-manipulation ${isText ? 'text-xs font-medium text-[var(--color-text-secondary)]' : 'text-lg'}`}
        title={`React with ${custom?.alt || emoji}`}
        aria-label={`React with ${custom?.alt || emoji}`}
      >
        {custom ? <img src={custom.src} alt={custom.alt} className="w-5 h-5 rounded-sm" /> : emoji}
      </button>
    );
  };

  // Quick reactions row (frequent + top reactions)
  const quickReactions = frequentEmojis.length > 0
    ? frequentEmojis
    : EMOJI_CATEGORIES.reactions.slice(0, 5);

  return (
    <div ref={pickerRef} className="relative">
      <div className="bg-[var(--color-bg-secondary)] rounded-lg shadow-lg border border-[var(--color-border)] overflow-hidden" style={{ minWidth: '280px', maxWidth: '320px' }} role="listbox" aria-label="Emoji reactions">
        {/* Quick reactions row */}
        <div className="flex items-center gap-0.5 p-1.5 border-b border-[var(--color-border)]">
          {quickReactions.map(emoji => renderEmojiButton(emoji, !EMOJI_REGEX.test(emoji)))}
          <div className="flex-1" />
          <button
            onClick={() => setExpandedCategory(expandedCategory ? null : 'reactions')}
            className="w-8 h-8 flex items-center justify-center hover:bg-[var(--color-bg-tertiary)] rounded text-[var(--color-text-muted)] text-sm"
            title="More emojis"
          >
            {expandedCategory ? '▲' : '▼'}
          </button>
        </div>

        {/* Expanded categories */}
        {expandedCategory !== null && (
          <div className="max-h-64 overflow-y-auto">
            {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
              <div key={category} className="border-b border-[var(--color-border)] last:border-b-0">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full px-2 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)] flex items-center justify-between"
                >
                  <span>{CATEGORY_LABELS[category]}</span>
                  <span className="text-[var(--color-text-muted)]">{expandedCategory === category ? '−' : '+'}</span>
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
