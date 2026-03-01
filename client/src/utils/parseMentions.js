/**
 * Build a regex that matches @mentions of workspace member names.
 * Names are sorted longest-first so "Simon Lucas" matches before "Simon".
 * Requires a non-word character (or start-of-string) before @ to avoid
 * matching email addresses like user@example.com.
 *
 * @param {Array} members - Workspace members array with { user: { displayName } }
 * @returns {RegExp|null} - Regex with capture group for the name, or null if no members
 */
export function buildMentionRegex(members) {
  const names = members
    .map(m => m.user?.displayName || m.displayName)
    .filter(Boolean);

  // Deduplicate
  const unique = [...new Set(names)];
  if (!unique.length) return null;

  // Sort longest first so multi-word names match before shorter prefixes
  unique.sort((a, b) => b.length - a.length);

  const escaped = unique.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Lookbehind: must be preceded by whitespace or start of string (not a word char, avoids emails)
  return new RegExp(`(^|[\\s])@(${escaped.join('|')})`, 'g');
}
