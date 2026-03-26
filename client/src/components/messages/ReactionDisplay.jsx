import { useMemo } from 'react';
import { renderEmoji } from './ReactionPicker';

export default function ReactionDisplay({ reactions, currentUserId, onToggleReaction }) {
  // Group reactions by emoji and count them
  const groupedReactions = useMemo(() => {
    const groups = {};

    reactions?.forEach(reaction => {
      if (!groups[reaction.emoji]) {
        groups[reaction.emoji] = {
          emoji: reaction.emoji,
          count: 0,
          users: [],
          hasReacted: false
        };
      }
      groups[reaction.emoji].count++;
      groups[reaction.emoji].users.push(reaction.user);
      if (reaction.user.id === currentUserId) {
        groups[reaction.emoji].hasReacted = true;
      }
    });

    return Object.values(groups);
  }, [reactions, currentUserId]);

  if (!groupedReactions.length) {
    return null;
  }

  const handleClick = (emoji, hasReacted) => {
    onToggleReaction(emoji, hasReacted);
  };

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {groupedReactions.map(({ emoji, count, users, hasReacted }) => (
        <button
          key={emoji}
          onClick={() => handleClick(emoji, hasReacted)}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-colors ${
            hasReacted
              ? 'bg-blue-500/30 border border-blue-500 text-blue-300'
              : 'bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
          }`}
          title={users.map(u => u.displayName).join(', ')}
        >
          <span>{renderEmoji(emoji, 16)}</span>
          <span className="text-xs">{count}</span>
        </button>
      ))}
    </div>
  );
}
