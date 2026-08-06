import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { getFrequentEmojis, trackEmojiUsage, DEFAULT_FREQUENT } from '../../utils/emojiFrequency';

// Pre-compiled regex for emoji detection (avoid creating on every render)
const EMOJI_REGEX = /\p{Emoji}/u;

// Custom emoji that renders as an image.
//
// Null-prototype on purpose: reactions are looked up here by key, and the server
// accepts any string up to 32 chars as a reaction emoji. With a normal object
// literal, a reaction of the literal text "constructor" (or "toString",
// "__proto__", …) resolves through the prototype chain to a truthy value, and
// every viewer renders it as <img src={undefined}> instead of as text.
export const CUSTOM_EMOJI = Object.assign(Object.create(null), {
  ':bandchat:': { src: '/blue_flame_emoji.png', alt: 'BandChat' },
});

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

// Word reactions ('LGTM') render as pill buttons rather than glyphs. The custom
// :bandchat: emoji has no emoji codepoints but renders as an image, so it isn't text.
const isTextReaction = (value) => !EMOJI_REGEX.test(value) && !CUSTOM_EMOJI[value];

// Quick row sits next to the expand chevron, so it holds one row minus one slot.
const QUICK_COUNT = COLS - 1;
// Three full rows in the expanded "Frequent" section.
const FREQUENT_COUNT = COLS * 3;

export default function ReactionPicker({ onSelect, onClose, actionLabel = 'React with' }) {
  // null = collapsed to the quick row. Expanding opens 'frequent' first, so the
  // user's own emojis are what they land on.
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [frequentEmojis, setFrequentEmojis] = useState(() => getFrequentEmojis(FREQUENT_COUNT));
  const [search, setSearch] = useState('');
  const pickerRef = useRef(null);
  const searchInputRef = useRef(null);

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
    // Deliberately NOT re-reading the frequent list here. MessageInput keeps this
    // picker open for multiple inserts, so re-ranking on each pick would reorder
    // the quick row under the user's cursor mid-interaction — one tap can shift
    // three positions, and the next click lands on a different emoji. The list is
    // read once per mount, and the picker remounts every time it opens.
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
        title={`${actionLabel} ${custom?.alt || emoji}`}
        aria-label={`${actionLabel} ${custom?.alt || emoji}`}
      >
        {custom ? <img src={custom.src} alt={custom.alt} className="w-5 h-5 rounded-sm" /> : emoji}
      </button>
    );
  };

  // Quick reactions row — always the user's most-used emojis. Word reactions
  // ("LGTM") are skipped here because the row is fixed-width and single-line;
  // they still show in the expanded Frequent grid. Padded with defaults so the
  // row is never short.
  const quickReactions = useMemo(() => {
    const out = frequentEmojis.filter(e => !isTextReaction(e)).slice(0, QUICK_COUNT);
    for (const emoji of DEFAULT_FREQUENT) {
      if (out.length >= QUICK_COUNT) break;
      if (!out.includes(emoji)) out.push(emoji);
    }
    return out;
  }, [frequentEmojis]);

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
        aria-label={actionLabel === 'Insert' ? 'Emoji picker' : 'Emoji reactions'}
      >
        {/* Quick reactions row */}
        <div className="flex items-center gap-0.5 p-1.5 border-b border-[var(--color-border)]">
          {quickReactions.map(emoji => renderEmojiButton(emoji))}
          <div className="flex-1" />
          <button
            onClick={() => setExpandedCategory(expandedCategory ? null : 'frequent')}
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
              <>
                {/* Most-used emojis, ahead of every fixed category */}
                <div className="border-b border-[var(--color-border)]">
                  <button
                    onClick={() => toggleCategory('frequent')}
                    className="w-full px-2 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)] flex items-center justify-between"
                    aria-expanded={expandedCategory === 'frequent'}
                  >
                    <span>{CATEGORY_LABELS.frequent}</span>
                    <span className="text-[var(--color-text-muted)]">{expandedCategory === 'frequent' ? '−' : '+'}</span>
                  </button>
                  {expandedCategory === 'frequent' && (
                    <div className="grid grid-cols-7 gap-0.5 p-1.5 pt-0">
                      {frequentEmojis.map(emoji => renderEmojiButton(emoji, isTextReaction(emoji)))}
                    </div>
                  )}
                </div>
                {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
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
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
