# Changelog

All notable changes to BandChat will be documented in this file.

## [1.02.13] - 2026-01-21

### Added
- **Cross-workspace calendar**: Toggle "Other Bands" to see calendar events from all your workspaces. External events display with muted colors and dashed borders, showing workspace name on hover.
- **Time ranges on calendar**: Events now show start-end times (e.g., 19:00-21:00) in both calendar and list views.
- **Delete button in event form**: Can now delete events directly from the edit form.
- **12-hour time picker**: Time input uses 12-hour format with AM/PM toggle, minutes limited to :00 and :30.
- **Keyboard navigation**: Use left/right arrow keys to navigate between months in calendar view.

### Fixed
- **Copy event preserves time**: Duplicating an event now preserves the original start/end times, venue, and all other details.

## [1.02.00] - 2026-01-20

### Added
- **Multi-set setlists**: Gigs can now have multiple setlists (Set 1, Set 2, Set 3) displayed in columns on desktop.
- **Drag-and-drop between sets**: Move songs between different sets in the setlist builder.
- **Resizable setlist panels**: Drag to resize the setlist panel and individual set columns.
- **Copy setlists**: Duplicate setlists for reuse with the copy button.
- **Drag-and-drop calendar**: Drag events to new dates with Move/Copy dialog.
- **Edge scrolling**: Drag events to calendar edges to navigate between months.
- **Copy calendar events**: Duplicate gigs and rehearsals to new dates.

### Fixed
- **Cross-set drag collision**: Fixed drag-and-drop not reaching Set 3 by using pointer-based collision detection.

## [1.01.00] - 2026-01-15

### Added
- **Song metadata fetching**: Auto-fetch BPM, key, and duration from SongBPM.com.
- **Mobile navigation**: Bottom navigation bar for mobile devices.
- **Sidebar padding**: Added bottom padding to prevent mobile nav overlap.

### Fixed
- **API rate limiting**: Increased rate limit and added delays to metadata fetching.

## [1.00.00] - 2026-01-01

### Initial Release
- Real-time messaging with channels and direct messages
- Thread replies and emoji reactions
- File/image sharing (up to 10MB)
- Song repertoire management with metadata
- Drag-and-drop setlist builder
- Calendar for gigs, rehearsals, and recording sessions
- Push notifications
- Google Sign-In authentication
- Workspace management for multiple bands
