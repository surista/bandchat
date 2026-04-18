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

// Dedupe within each category so duplicates (e.g. 🎶 twice in music, 💀 in symbols+reactions)
// don't produce duplicate React keys or confuse keyboard nav.
const rawCategories = {
  reactions: [':bandchat:', '👍', '👎', '❤️', '🔥', '😂', '😮', '😢', '😡', '🎉', '🙏', '👏', '💯', '✅', '❌', '👀', '🤔', '💪', '🙌', '😍', '🥳', '🫡', '😬', '🤯', '💀'],
  smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😊', '😇', '🙂', '😉', '😌', '😎', '🥹', '😏', '😒', '😞', '😔', '😟', '🙁', '😣', '😖', '😫', '😩', '🥺', '😤', '😠', '🤬', '🥴', '😵', '🤮', '🤢', '🥶', '🥵', '😶\u200d🌫️', '🫠', '🤥', '😈', '👿', '🤡'],
  hands: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '✊', '👊', '🤛', '🤜', '🫶', '🤝', '💅', '🫵', '☝️'],
  people: ['🧑\u200d🎤', '👨\u200d🎤', '👩\u200d🎤', '💃', '🕺', '🙋', '🤷', '🙅', '🙆', '💁', '🧑\u200d💻', '👨\u200d💻', '👩\u200d💻', '🧑\u200d🎨', '🧑\u200d🔧', '🦸', '🦹', '🧙', '🧛', '👻', '🤖', '👽', '🫃', '🎅', '🧑\u200d🎄'],
  music: ['🎸', '🥁', '🎤', '🎹', '🎵', '🎶', '🎧', '🎼', '🎺', '🎻', '🪘', '🎷', '🪗', '🎚️', '🔊', '🔉', '🔈', '🔇', '📻', '🪕', '🪈', '🎙️', '📯', '🔔'],
  animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🦅', '🦆', '🦉', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐙', '🦑'],
  nature: ['🌸', '🌹', '🌺', '🌻', '🌼', '🌷', '🌱', '🌲', '🌳', '🌴', '🌵', '🍀', '🍁', '🍂', '🍃', '🌍', '🌎', '🌏', '⭐', '🌟', '✨', '⚡', '☀️', '🌤️', '⛅', '🌧️', '⛈️', '🌈', '❄️', '💧'],
  food: ['🍕', '🍔', '🍟', '🌮', '🌯', '🥙', '🍣', '🍜', '🍝', '🍛', '🍲', '🥘', '🍺', '🍷', '🍸', '🍹', '🍾', '🥂', '☕', '🫖', '🍰', '🎂', '🍩', '🍪', '🍫', '🍬', '🍭', '🌭', '🥗', '🥤', '🧃', '🥡', '🥪', '🧇', '🥞', '🥓', '🥚', '🍳', '🧀', '🥐'],
  activities: ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🥊', '🎯', '⛳', '🏄', '🏊', '🚴', '🏋️', '🤸', '⛷️', '🏂', '🛹', '🎮', '🕹️', '🎲', '🧩', '🎳', '🎪', '🎨', '🎭', '🏆'],
  travel: ['🚗', '🚕', '🚌', '🏎️', '🚑', '🚒', '✈️', '🚀', '🛸', '🚁', '⛵', '🚢', '🏠', '🏢', '🏰', '🏟️', '🗼', '🗽', '⛩️', '🕌', '🏝️', '🏖️', '⛰️', '🗻', '🌋', '🏕️', '🎡', '🎢', '🎠', '🗿'],
  objects: ['⌚', '📱', '💻', '⌨️', '🖥️', '🖨️', '📷', '📹', '🎥', '📺', '🔦', '💡', '🔋', '💰', '💎', '🔑', '🗝️', '🔒', '🔓', '📦', '✉️', '📬', '📝', '📚', '📖', '🔗', '✂️', '🗑️', '🧲'],
  symbols: ['🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💝', '💫', '💥', '💤', '💬', '💭', '🏳️\u200d🌈'],
  text: ['LGTM', 'thx', 'thank you', 'lol', 'wtf?', 'nice!', 'nope', 'yep', 'gg', 'brb', 'omg'],
  flags: ['🇺🇸', '🇬🇧', '🇯🇵', '🇩🇪', '🇫🇷', '🇮🇹', '🇪🇸', '🇧🇷', '🇨🇦', '🇦🇺', '🇲🇽', '🇰🇷', '🇳🇱', '🇸🇪', '🇨🇭', '🇮🇳', '🇨🇳', '🇷🇺', '🇿🇦', '🇳🇿', '🇮🇪', '🇵🇹', '🇦🇷', '🇨🇴', '🇵🇱', '🇹🇷', '🇹🇭', '🇻🇳', '🇵🇭', '🇳🇬'],
};
const EMOJI_CATEGORIES = Object.fromEntries(
  Object.entries(rawCategories).map(([k, arr]) => [k, Array.from(new Set(arr))])
);

const CATEGORY_LABELS = {
  frequent: '⭐ Frequent',
  reactions: '😀 Reactions',
  smileys: '😊 Smileys',
  hands: '👋 Hands',
  people: '🧑\u200d🎤 People',
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

const COLS = 7;

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
  const [search, setSearch] = useState('');
  const pickerRef = useRef(null);
  const searchInputRef = useRef(null);

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

  // ESC closes the picker
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Auto-focus the search when the expanded panel opens
  useEffect(() => {
    if (expandedCategory !== null) {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [expandedCategory]);

  const handleSelect = (emoji) => {
    trackEmojiUsage(emoji);
    onSelect(emoji);
  };

  const toggleCategory = (category) => {
    setExpandedCategory(expandedCategory === category ? null : category);
    setSearch('');
  };

  // Grid-aware keyboard nav: Arrow Left/Right/Up/Down + Home/End
  const handlePickerKeyDown = useCallback((e) => {
    const NAV = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!NAV.includes(e.key)) return;
    const container = pickerRef.current;
    if (!container) return;
    const buttons = Array.from(container.querySelectorAll('button[data-emoji]'));
    if (buttons.length === 0) return;
    e.preventDefault();
    const currentIdx = buttons.indexOf(document.activeElement);
    const lastIdx = buttons.length - 1;
    let nextIdx = currentIdx;
    switch (e.key) {
      case 'ArrowRight':
        nextIdx = currentIdx < lastIdx ? currentIdx + 1 : 0;
        break;
      case 'ArrowLeft':
        nextIdx = currentIdx > 0 ? currentIdx - 1 : lastIdx;
        break;
      case 'ArrowDown':
        nextIdx = Math.min(lastIdx, currentIdx + COLS);
        break;
      case 'ArrowUp':
        nextIdx = Math.max(0, currentIdx - COLS);
        break;
      case 'Home':
        nextIdx = 0;
        break;
      case 'End':
        nextIdx = lastIdx;
        break;
      default:
        return;
    }
    buttons[nextIdx]?.focus();
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
        className={`${isText ? 'px-2 min-w-[40px]' : 'w-10'} h-10 sm:h-8 flex items-center justify-center hover:bg-[var(--color-bg-tertiary)] active:bg-[var(--color-bg-primary)] focus:bg-[var(--color-bg-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] rounded transition-colors touch-manipulation ${isText ? 'text-xs font-medium text-[var(--color-text-secondary)]' : 'text-lg'}`}
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

  const searchTerm = search.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!searchTerm) return null;
    const seen = new Set();
    const out = [];
    for (const [cat, list] of Object.entries(EMOJI_CATEGORIES)) {
      for (const e of list) {
        if (seen.has(e)) continue;
        const match = cat === 'text'
          ? e.toLowerCase().includes(searchTerm)
          : e.toLowerCase().includes(searchTerm) || cat.includes(searchTerm);
        if (match) {
          seen.add(e);
          out.push({ emoji: e, isText: cat === 'text' });
        }
      }
    }
    return out;
  }, [searchTerm]);

  return (
    <div ref={pickerRef} className="relative">
      <div
        className="bg-[var(--color-bg-secondary)] rounded-lg shadow-lg border border-[var(--color-border)] overflow-hidden"
        style={{ width: 'min(320px, 92vw)' }}
        role="listbox"
        aria-label="Emoji reactions"
      >
        {/* Quick reactions row */}
        <div className="flex items-center gap-0.5 p-1.5 border-b border-[var(--color-border)]">
          {quickReactions.map(emoji => renderEmojiButton(emoji, !EMOJI_REGEX.test(emoji)))}
          <div className="flex-1" />
          <button
            onClick={() => setExpandedCategory(expandedCategory ? null : 'reactions')}
            className="w-8 h-8 flex items-center justify-center hover:bg-[var(--color-bg-tertiary)] rounded text-[var(--color-text-muted)] text-sm"
            title="More emojis"
            aria-label={expandedCategory ? 'Collapse emoji picker' : 'Expand emoji picker'}
            aria-expanded={expandedCategory !== null}
          >
            {expandedCategory ? '▲' : '▼'}
          </button>
        </div>

        {/* Expanded categories */}
        {expandedCategory !== null && (
          <div className="max-h-64 overflow-y-auto">
            {/* Search input */}
            <div className="p-2 border-b border-[var(--color-border)] sticky top-0 bg-[var(--color-bg-secondary)] z-10">
              <input
                ref={searchInputRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search emoji..."
                className="modal-input w-full text-sm"
                aria-label="Search emoji"
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } }}
              />
            </div>

            {searchResults ? (
              <div className="p-1.5">
                {searchResults.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-muted)] px-2 py-3 text-center">No matches</p>
                ) : (
                  <div className="grid grid-cols-7 gap-0.5">
                    {searchResults.map(({ emoji, isText }) => renderEmojiButton(emoji, isText))}
                  </div>
                )}
              </div>
            ) : (
              Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
                <div key={category} className="border-b border-[var(--color-border)] last:border-b-0">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full px-2 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)] flex items-center justify-between"
                    aria-expanded={expandedCategory === category}
                  >
                    <span>{CATEGORY_LABELS[category]}</span>
                    <span className="text-[var(--color-text-muted)]">{expandedCategory === category ? '−' : '+'}</span>
                  </button>
                  {expandedCategory === category && (
                    <div className="grid grid-cols-7 gap-0.5 p-1.5 pt-0">
                      {emojis.map(emoji => renderEmojiButton(emoji, category === 'text'))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
