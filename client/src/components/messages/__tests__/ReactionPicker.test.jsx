import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ReactionPicker, { renderEmoji, CUSTOM_EMOJI } from '../ReactionPicker';

// This environment's global `localStorage` is Node's experimental Web Storage
// shadowing jsdom's, and it exposes no methods at all — so services/storage.js
// silently falls back to defaults and nothing can be seeded. Stub a working
// in-memory one, scoped to this file.
const memStore = new Map();
vi.stubGlobal('localStorage', {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => { memStore.set(k, String(v)); },
  removeItem: (k) => { memStore.delete(k); },
  clear: () => { memStore.clear(); },
});

/** The picker reads its frequent list from this key on mount. */
function seedFrequency(map) {
  localStorage.setItem('emojiFrequency', JSON.stringify(map));
}

/** Emoji in the always-visible quick row, in display order. */
function quickRowOrder(container) {
  const row = container.querySelector('[role="listbox"] > div');
  return Array.from(row.querySelectorAll('button[data-emoji]')).map(b => b.dataset.emoji);
}

// Matched by dataset rather than an attribute selector: jsdom's selector engine
// does not reliably match astral-plane emoji inside [data-emoji="…"].
function emojiButton(container, emoji) {
  const btn = Array.from(container.querySelectorAll('button[data-emoji]'))
    .find(b => b.dataset.emoji === emoji);
  if (!btn) throw new Error(`No button for ${emoji}. Present: ${quickRowOrder(container).join(' ')}`);
  return btn;
}

beforeEach(() => {
  localStorage.clear();
});

describe('renderEmoji — custom emoji lookup', () => {
  it('renders the custom :bandchat: emoji as an image', () => {
    const { container } = render(<span>{renderEmoji(':bandchat:')}</span>);
    expect(container.querySelector('img')).toBeInTheDocument();
  });

  // The server accepts any string <= 32 chars as a reaction emoji, so another
  // user can react with the literal text "constructor". A plain object literal
  // would resolve that through the prototype chain to a truthy value and render
  // <img src={undefined}> for every viewer.
  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])(
    'renders the reaction %s as text, not as a broken image',
    (hostile) => {
      const { container } = render(<span>{renderEmoji(hostile)}</span>);
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toBe(hostile);
    }
  );

  it('does not expose inherited Object properties as custom emoji', () => {
    expect(CUSTOM_EMOJI['constructor']).toBeUndefined();
    expect(CUSTOM_EMOJI['toString']).toBeUndefined();
    expect(CUSTOM_EMOJI[':bandchat:']).toBeDefined();
  });
});

describe('ReactionPicker quick row', () => {
  it('leads with the most-used emojis, highest count first', () => {
    seedFrequency({ '🎸': { n: 3, t: 1 }, '🔥': { n: 9, t: 1 }, '😂': { n: 5, t: 1 } });
    const { container } = render(<ReactionPicker onSelect={() => {}} onClose={() => {}} />);
    expect(quickRowOrder(container).slice(0, 3)).toEqual(['🔥', '😂', '🎸']);
  });

  it('pads with defaults so the row is never short', () => {
    seedFrequency({ '🎸': { n: 3, t: 1 } });
    const { container } = render(<ReactionPicker onSelect={() => {}} onClose={() => {}} />);
    const order = quickRowOrder(container);
    expect(order).toHaveLength(6);
    expect(order[0]).toBe('🎸');
    expect(new Set(order).size).toBe(6);
  });

  // MessageInput keeps the picker open for multiple inserts. Re-ranking on each
  // pick reorders the row under the cursor — one tap can shift three positions,
  // so the next click lands on a different emoji than the one aimed at.
  it('does not reorder while the picker stays open', () => {
    seedFrequency({
      '👍': { n: 10, t: 1 }, '❤️': { n: 9, t: 2 }, '🔥': { n: 8, t: 3 },
      '😂': { n: 8, t: 4 }, '🎉': { n: 5, t: 5 }, '🎸': { n: 4, t: 6 },
    });
    const { container } = render(<ReactionPicker onSelect={() => {}} onClose={() => {}} />);
    const before = quickRowOrder(container);

    fireEvent.click(emojiButton(container, '🔥'));

    expect(quickRowOrder(container)).toEqual(before);
  });

  it('still records the pick, so the next open reflects it', () => {
    seedFrequency({ '👍': { n: 10, t: 1 }, '🎸': { n: 1, t: 2 } });
    const { container, unmount } = render(<ReactionPicker onSelect={() => {}} onClose={() => {}} />);

    for (let i = 0; i < 12; i++) {
      fireEvent.click(emojiButton(container, '🎸'));
    }
    unmount();

    const reopened = render(<ReactionPicker onSelect={() => {}} onClose={() => {}} />);
    expect(quickRowOrder(reopened.container)[0]).toBe('🎸');
  });

  it('reports the selected emoji to the caller', () => {
    const picked = [];
    const { container } = render(
      <ReactionPicker onSelect={(e) => picked.push(e)} onClose={() => {}} />
    );
    fireEvent.click(emojiButton(container, '👍'));
    expect(picked).toEqual(['👍']);
  });
});
