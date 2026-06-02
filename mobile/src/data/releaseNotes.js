/**
 * Release notes shown in the "What's new" dialog (auto-opens once per
 * post-update launch) and the Settings → About BandChat entry.
 *
 * Keep entries short and user-facing — this is a summary, not the full
 * CHANGELOG.md prose. Omit versions with no user-visible changes (e.g.
 * security-only patches, no-op redeploys). Order: newest first.
 *
 * Keep this file in sync with mobile/src/data/releaseNotes.js — they must
 * have identical content. (Duplication is intentional; see ADR in the
 * v1.07.11 commit message for the trade-off discussion.)
 *
 * Each entry: { version, date, items: [{ kind, text }] }
 *   kind: 'added' | 'fixed' | 'changed' | 'security'
 */

export const RELEASE_NOTES = [
  {
    version: '1.07.17',
    date: '2026-06-02',
    items: [
      { kind: 'changed', text: 'Audio and video attachments can now be up to 500 MB (was 50 MB). Heads-up: FREE workspaces still cap total storage at 500 MB, so a single big file will fill it. PRO workspaces have 10 GB to play with.' },
    ],
  },
  {
    version: '1.07.16',
    date: '2026-06-02',
    items: [
      { kind: 'fixed', text: 'Mobile: tapping a thread reply in All Messages now opens the thread directly, instead of dropping you in the channel with no way to find your reply.' },
    ],
  },
  {
    version: '1.07.14',
    date: '2026-05-28',
    items: [
      { kind: 'fixed', text: 'Web: printed/PDF setlists with multiple sets now center each set in its half of the page (songs stay left-aligned) instead of running flush to the page edges.' },
    ],
  },
  {
    version: '1.07.13',
    date: '2026-05-28',
    items: [
      { kind: 'changed', text: 'Tablets and foldables can now rotate freely; phones still stay locked to portrait. Prepares the Android build for Android 16, which forces large screens to ignore portrait locks. iPad has always rotated freely so no change there.' },
    ],
  },
  {
    version: '1.07.12',
    date: '2026-05-28',
    items: [
      { kind: 'fixed', text: "This dialog now appears for users upgrading from an earlier version (in v1.07.11 it was silently skipping the first run on devices that had never seen the feature before)." },
    ],
  },
  {
    version: '1.07.11',
    date: '2026-05-27',
    items: [
      { kind: 'added', text: "What's new: this dialog! Auto-opens once after each update. Find it again any time under Settings → About BandChat." },
    ],
  },
  {
    version: '1.07.09',
    date: '2026-05-27',
    items: [
      { kind: 'fixed', text: 'Mobile: sound check, doors, and stage times now save correctly on gigs (they were silently reverting if you only edited a time without also changing another field).' },
    ],
  },
  {
    version: '1.07.08',
    date: '2026-05-26',
    items: [
      { kind: 'added', text: 'Mobile: attach MP3 / audio files in any channel or DM (previously the attach sheet only offered PDF and ZIP).' },
    ],
  },
  {
    version: '1.07.07',
    date: '2026-05-26',
    items: [
      { kind: 'added', text: 'Web: insert emojis into your messages (not just as reactions). Tap the smile icon next to the @ button.' },
      { kind: 'changed', text: 'Public booking inbox is now opt-in. Enable it explicitly from the Booking Inbox (web) or Website settings (mobile) before the public link goes live.' },
      { kind: 'fixed', text: 'Changing your password no longer logs you out of the device you used to change it.' },
      { kind: 'fixed', text: 'Reconnecting after a network blip no longer drops the older messages you had paged in.' },
      { kind: 'security', text: 'Tightened authorization on private channel invites, pinned messages, and gig attendee assignments.' },
    ],
  },
  {
    version: '1.07.06',
    date: '2026-05-26',
    items: [
      { kind: 'fixed', text: 'Mobile: the "N replies" badge under thread parents now survives an app restart.' },
    ],
  },
  {
    version: '1.07.05',
    date: '2026-05-25',
    items: [
      { kind: 'fixed', text: 'Tapping a thread-reply notification now opens the thread instead of dropping you in the channel.' },
    ],
  },
  {
    version: '1.07.04',
    date: '2026-05-24',
    items: [
      { kind: 'fixed', text: 'Website settings: the "Upgrade Template" prompt no longer appears (and silently downgrades) when your repo is ahead of the template.' },
    ],
  },
];

/**
 * Compare two semver-ish version strings like "1.07.09". Returns negative if
 * `a < b`, positive if `a > b`, 0 if equal. Defensively handles missing
 * segments by treating them as zero, so "1.07" === "1.07.0".
 */
export function cmpVersion(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

/**
 * Notes with `version > lastSeen && version <= current`. Used by the
 * auto-open dialog. Returns [] on first install (lastSeen falsy) so brand-new
 * users don't get a "what's new" dialog on top of their onboarding.
 */
export function getUnseenNotes(lastSeen, current) {
  if (!lastSeen || !current) return [];
  return RELEASE_NOTES.filter(
    n => cmpVersion(n.version, lastSeen) > 0 && cmpVersion(n.version, current) <= 0
  );
}
