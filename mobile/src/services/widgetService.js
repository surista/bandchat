import { Platform } from 'react-native';
import api from './api';

let WidgetBridge = null;

if (Platform.OS === 'ios') {
  try {
    WidgetBridge = require('../../modules/widget-bridge');
  } catch {
    // Widget bridge not available (e.g. Expo Go)
  }
}

/**
 * Fetch the user's next upcoming gig across all workspaces
 * and push it to the iOS widget via App Group UserDefaults.
 */
export async function updateWidgetGigData() {
  if (!WidgetBridge) return;

  try {
    const gigs = await api.getGigsFromAllWorkspaces(null, {
      from: new Date().toISOString(),
    });

    if (!gigs || !Array.isArray(gigs)) {
      WidgetBridge.updateWidgetData('null');
      return;
    }

    // Filter to scheduled, non-personal, future gigs and sort by date
    const now = new Date();
    const upcoming = gigs
      .filter(g => g.status === 'SCHEDULED' && new Date(g.date) >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const nextGig = upcoming[0];

    if (nextGig) {
      const payload = {
        gigId: nextGig.id,
        workspaceId: nextGig.workspaceId,
        title: nextGig.title,
        date: nextGig.date,
        endDate: nextGig.endDate || null,
        venue: nextGig.venueRecord?.name || nextGig.venue || null,
        type: nextGig.type || 'GIG',
        attendanceStatus: nextGig.myAttendance || null,
        workspaceName: nextGig.workspace?.name || null,
        soundCheckTime: nextGig.soundCheckTime || null,
        eventStartTime: nextGig.eventStartTime || null,
        performanceStartTime: nextGig.performanceStartTime || null,
      };
      WidgetBridge.updateWidgetData(JSON.stringify(payload));
    } else {
      WidgetBridge.updateWidgetData('null');
    }
  } catch (err) {
    // Silently fail — widget data is non-critical
    console.warn('Widget update failed:', err.message);
  }
}

/**
 * Force reload all widget timelines (e.g. after a gig change).
 */
export function reloadWidgets() {
  if (!WidgetBridge) return;
  try {
    WidgetBridge.reloadWidgets();
  } catch {
    // Silently fail
  }
}
