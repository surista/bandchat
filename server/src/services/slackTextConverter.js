/**
 * Converts Slack-formatted message text to plain text.
 *
 * @param {string} text - Slack message text
 * @param {Object} userMap - Map of Slack user ID → display name
 * @returns {string} Plain text
 */
export function convertSlackText(text, userMap = {}) {
  if (!text) return '';

  let result = text;

  // User mentions: <@U12345> or <@U12345|name>
  result = result.replace(/<@(U[A-Z0-9]+)(?:\|([^>]*))?>/g, (_, userId, fallback) => {
    const name = userMap[userId] || fallback || userId;
    return `@${name}`;
  });

  // Channel mentions: <#C12345|channel-name> or <#C12345>
  result = result.replace(/<#(C[A-Z0-9]+)(?:\|([^>]+))?>/g, (_, id, name) => `#${name || id}`);

  // Special mentions
  result = result.replace(/<!here\|?[^>]*>/g, '@here');
  result = result.replace(/<!channel\|?[^>]*>/g, '@channel');
  result = result.replace(/<!everyone\|?[^>]*>/g, '@everyone');

  // Links: <url|text> → url, <url> → url
  result = result.replace(/<(https?:\/\/[^|>]+)\|[^>]+>/g, '$1');
  result = result.replace(/<(https?:\/\/[^>]+)>/g, '$1');

  // mailto links
  result = result.replace(/<mailto:([^|>]+)\|[^>]+>/g, '$1');
  result = result.replace(/<mailto:([^>]+)>/g, '$1');

  // HTML entities
  result = result.replace(/&amp;/g, '&');
  result = result.replace(/&lt;/g, '<');
  result = result.replace(/&gt;/g, '>');

  return result;
}
