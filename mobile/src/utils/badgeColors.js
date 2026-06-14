/**
 * Mode-aware badge colors with adequate WCAG AA contrast.
 *
 * The legacy pattern in gig/status badges was `bg = base + '25'` (15% alpha)
 * + `fg = base`. That works in dark mode (bright fg on dark-tinted bg) but
 * fails AA in light mode — e.g. `#3b82f6` (blue-500) text on a 15% tint of
 * itself over white renders at ~3.5:1, below the 4.5:1 AA bar for 13pt.
 *
 * This helper returns:
 *   - dark mode: unchanged from the legacy pattern
 *   - light mode: same-ish tinted background + a darkened text color
 *     (~40% toward black) that passes AA on white-derived backgrounds
 */

function darkenHex(hex, amount) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = (v) => Math.max(0, Math.round(v * (1 - amount))).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

export function badgeColors(baseHex, mode) {
  if (!baseHex || typeof baseHex !== 'string') {
    return { bg: 'transparent', fg: baseHex };
  }
  if (mode === 'light') {
    return { bg: baseHex + '20', fg: darkenHex(baseHex, 0.4) };
  }
  return { bg: baseHex + '25', fg: baseHex };
}
