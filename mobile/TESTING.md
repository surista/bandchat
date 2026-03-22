# Mobile Testing Checklist

Run before every App Store / Play Store submission.

## Automated Checks

```bash
cd mobile
npm run lint:critical   # ESLint no-undef check (catches broken references)
npm run lint            # Full ESLint (warnings + errors)
npm test                # Jest smoke tests (catches import/module errors)
```

## Manual Device Checklist

### Critical Path (must verify every release)

- [ ] **Open a channel** — MessageInput renders, can type
- [ ] **Open an empty channel** — "No messages yet" displays right-side-up
- [ ] **Send a text message** — appears in chat
- [ ] **Send a photo** — pick from library, preview shows, uploads and sends
- [ ] **Send multiple photos** — pick 2-3, all preview, all upload
- [ ] **Send in a thread** — reply with text and photo works
- [ ] **Long-press a text message** — action sheet appears
- [ ] **Long-press an image-only message** — action sheet appears
- [ ] **Edit a message** — edit banner shows, save works
- [ ] **Keyboard doesn't cover input** — type in channel, text field stays visible
- [ ] **Switch workspaces** — theme changes if per-band theme is set
- [ ] **Unread badges** — show on workspace list, clear on entry

### Song/Setlist

- [ ] **Song list** — compact/card toggle works
- [ ] **Add song to setlist** — picker opens, keyboard doesn't cover songs
- [ ] **Export PDF** — share sheet appears with formatted PDF

### Settings

- [ ] **Appearance** — dark/light toggle, theme selection, per-band toggle
- [ ] **Settings > Members** — avatars display

### Platform-Specific

#### iOS
- [ ] App icon badge shows correct unread count
- [ ] Badge clears when opening app
- [ ] Push notification navigates to correct channel

#### Android
- [ ] Keyboard doesn't cover input (softwareKeyboardLayoutMode)
- [ ] LayoutAnimation works (view toggle, theme toggle)
- [ ] Back button dismisses modals
- [ ] Empty state text is right-side-up

### Edge Cases

- [ ] Offline → reconnect → messages load, unread clears
- [ ] Background → foreground → channel marked as read
- [ ] Very long message displays without crash
- [ ] 5-photo limit enforced (can't select 6th)
