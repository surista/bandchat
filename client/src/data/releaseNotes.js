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
    version: '1.07.49',
    date: '2026-09-04',
    items: [
      { kind: 'added', text: 'Web: Setlist Print / Export now opens a preview first, with a −/+ button to size the text up or down a point at a time before you print or download — no more squinting at a fixed size.' },
    ],
  },
  {
    version: '1.07.48',
    date: '2026-09-02',
    items: [
      { kind: 'fixed', text: 'Web: setlist PDF/Word export — the printed set start and end times now match what’s shown in the app. They were computed two different ways and could disagree by several minutes.' },
    ],
  },
  {
    version: '1.07.47',
    date: '2026-08-24',
    items: [
      { kind: 'fixed', text: 'Login reliability: a stale background token refresh could occasionally sign you right back out immediately after logging in.' },
    ],
  },
  {
    version: '1.07.45',
    date: '2026-08-23',
    items: [
      { kind: 'fixed', text: 'Printed setlists: one long personal note no longer shrinks every song title on the page. A note now costs a little height instead of the whole sheet\u2019s type size, so a short set still prints big.' },
      { kind: 'fixed', text: 'Printed setlists: the time range in the header now agrees with the per-set times printed in the columns.' },
      { kind: 'fixed', text: 'Live Mode: MC sections with no set length show their time again instead of a blank \u2014 auto-advance was already using 30 seconds for them.' },
      { kind: 'changed', text: 'Live Mode: auto-advance now shows a countdown and buzzes 5 seconds before it flips the page, so it no longer changes under you with no warning. It also catches up correctly if your phone locks mid-set.' },
      { kind: 'changed', text: 'Live Mode: easier to read on a dark stage \u2014 stronger contrast throughout, a bigger MC/break countdown, and the counter no longer sits under the home indicator. Auto-advance is announced to VoiceOver and TalkBack.' },
      { kind: 'added', text: 'MC section length is now editable. Tap the duration on mobile, or pick it from the dropdown on web \u2014 previously the only way to change it was to delete the section and add it back.' },
      { kind: 'added', text: 'Mobile: your personal setlist notes now appear on printed and shared setlists, matching the web export.' },
    ],
  },
  {
    version: '1.07.44',
    date: '2026-08-10',
    items: [
      { kind: 'changed', text: 'Catching up: this entry covers v1.07.27 through v1.07.44, which shipped without release notes. Highlights below.' },
      { kind: 'added', text: 'Every emoji picker now leads with the emojis you actually use most, on both web and mobile.' },
      { kind: 'added', text: 'Printed setlists are laid out for reading off the floor: a single-line header instead of five stacked rows, and song type sized to fill the page rather than fixed \u2014 short sets print large, long ones still fit on one page.' },
      { kind: 'changed', text: 'MC sections now default to 30 seconds instead of 60. Existing sections keep whatever length they were saved with.' },
      { kind: 'added', text: 'Mobile: setlists gained the short/full song name toggle web already had, and it now applies to the PDF export too.' },
      { kind: 'added', text: 'Web: the main sidebar sections (Channels / Direct Messages / Band) can be reordered, and the order follows you across workspaces.' },
      { kind: 'fixed', text: 'Opening a channel with unread messages now takes you to the first unread one, instead of the bottom of the loaded page or a stale position from a previous visit.' },
      { kind: 'fixed', text: 'Web: signing in no longer bounced you straight back to the login page, and your session survives a page refresh without asking for your password again.' },
      { kind: 'fixed', text: 'Mobile: fixed a crash on every app launch, and a bug where tapping an image opened a black screen until you rotated the phone.' },
      { kind: 'fixed', text: 'Mobile: the full-screen image viewer now rotates with your device, and saving a photo to your library works reliably instead of occasionally producing a file your gallery would not open.' },
      { kind: 'fixed', text: 'Web: message text can be selected again, and right-clicking a link or a selection now gives you the browser\u2019s own menu (Copy, Open in new tab) rather than suppressing it.' },
      { kind: 'fixed', text: 'Web: links, embeds, formatting and code blocks now render inside thread replies \u2014 they previously showed as plain text while the same message looked right in the channel.' },
      { kind: 'fixed', text: 'Public show pages now load. They had been failing on every request since the feature launched in v1.06.85.' },
      { kind: 'fixed', text: 'Setlist song counts no longer include MC sections and set breaks \u2014 a 7-song setlist with 4 MC breaks was reporting 11 songs.' },
      { kind: 'fixed', text: 'Photos taken in landscape no longer show sideways thumbnails in the message list.' },
      { kind: 'fixed', text: 'Your settings \u2014 themes, collapsed groups, sidebar preferences \u2014 now sync reliably across your devices, including clearing one.' },
      { kind: 'security', text: 'Your band\u2019s per-gig fee is no longer included in the data feed sent to public band websites.' },
      { kind: 'security', text: 'File uploads are now always attributed to a workspace and checked against its storage quota, and several vulnerable dependencies were patched.' },
    ],
  },
  {
    version: '1.07.26',
    date: '2026-06-21',
    items: [
      { kind: 'added', text: 'Channel groups (folders) can now be sorted three ways: A→Z, Z→A, or Custom. Tap the small sort indicator next to the group expand arrow to switch. Per-device — set your own preference on each device.' },
    ],
  },
  {
    version: '1.07.25',
    date: '2026-06-16',
    items: [
      { kind: 'fixed', text: 'Mobile: HOTFIX — app crashed when opening a channel or long-pressing a message. Sorry. Fixed.' },
    ],
  },
  {
    version: '1.07.24',
    date: '2026-06-14',
    items: [
      { kind: 'fixed', text: 'Mobile: Save Message now shows immediate confirmation (toast + haptic). Saved Messages screen now refreshes every time you open it, plus pull-to-refresh.' },
      { kind: 'fixed', text: 'iOS: top entry in Songs / Setlists / Members / Contacts / Calendar / etc no longer hides behind the large title header.' },
    ],
  },
  {
    version: '1.07.23',
    date: '2026-06-14',
    items: [
      { kind: 'fixed', text: 'Mobile: Live Mode (on-stage setlist viewer) now respects large accessibility text sizes properly — song titles and lyrics scale up without blowing out the layout.' },
      { kind: 'fixed', text: 'Mobile: gig type and status badges (REHEARSAL / GIG / Done / Cancelled / Locked) are now properly readable in light mode (text was washed out before).' },
    ],
  },
  {
    version: '1.07.22',
    date: '2026-06-14',
    items: [
      { kind: 'changed', text: 'iOS: many bottom action menus (per-song, per-setlist, per-gig, per-member, per-poll, channel + group actions) now use the native iOS action sheet — same one you see in Photos, Mail, Messages — instead of a custom drawer. Cleaner, more familiar, with proper destructive-button red styling.' },
    ],
  },
  {
    version: '1.07.21',
    date: '2026-06-14',
    items: [
      { kind: 'fixed', text: 'Mobile: VoiceOver / TalkBack focus no longer slips behind a modal dialog while it\'s open — finishes the accessibility sweep started in v1.07.19 across all 47 modals in the app.' },
      { kind: 'fixed', text: 'Mobile: a render error in one screen no longer blanks the whole app. You can hit Try Again, or navigate back to other parts of the app.' },
      { kind: 'changed', text: 'Mobile: keyboard handling and toggle switches now feel more like the platform you\'re on — iOS green switches, Android-native keyboard avoidance.' },
    ],
  },
  {
    version: '1.07.20',
    date: '2026-06-14',
    items: [
      { kind: 'changed', text: 'Mobile: only one voice / audio message plays at a time now — starting a second one pauses the first. iMessage-style.' },
      { kind: 'changed', text: 'Android: notification vibration now feels different per type — mentions pulse longer than regular messages, events feel softer.' },
      { kind: 'changed', text: 'Mobile: when the OS asks you to allow camera / photo / calendar access and you decline, the error now offers an Open Settings button instead of a dead-end alert.' },
      { kind: 'changed', text: 'Android: tap targets in chat (reactions, reply badges, link preview close) are now properly sized for the platform — Apple\'s 44pt minimum on iOS, Material\'s 48dp on Android.' },
    ],
  },
  {
    version: '1.07.19',
    date: '2026-06-14',
    items: [
      { kind: 'added', text: 'Mobile: appearance now has an Auto option that follows your phone\'s system theme live — toggling iOS / Android dark mode mid-session updates the app immediately. Auto / Light / Dark in Settings → Appearance.' },
      { kind: 'changed', text: 'Mobile: tapping (not holding) the voice-message mic now also shows a hint so it\'s clearer that the gesture is hold-to-record.' },
      { kind: 'fixed', text: 'Mobile: drag-to-reorder lists (setlist editor etc.) are now usable with VoiceOver / TalkBack — swipe up or down on the drag handle to move an item by one.' },
      { kind: 'fixed', text: 'Mobile: tapping back into the channel list no longer triggers unnecessary network requests.' },
    ],
  },
  {
    version: '1.07.18',
    date: '2026-06-14',
    items: [
      { kind: 'fixed', text: 'Mobile: rapid back-to-back messages no longer occasionally appear as duplicates.' },
      { kind: 'fixed', text: 'Mobile: your own reactions no longer briefly show with count 2.' },
      { kind: 'fixed', text: 'Mobile: status bar now restores correctly after exiting Live Mode (was staying hidden).' },
      { kind: 'changed', text: 'Android: cleaned up unused legacy permissions ahead of upcoming Play Store policy enforcement. No user-visible change.' },
    ],
  },
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
