import prisma from '../lib/prisma.js';

const DEFAULT_GIG_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours fallback

/**
 * Compute the effective time window for a gig attendance,
 * factoring in padding before/after.
 */
function computeEffectiveWindow(gig, attendee) {
  const gigStart = new Date(gig.date);
  const gigEnd = gig.endDate ? new Date(gig.endDate) : new Date(gigStart.getTime() + DEFAULT_GIG_DURATION_MS);

  const paddingBeforeMs = (attendee?.paddingBefore || 0) * 60 * 1000;
  const paddingAfterMs = (attendee?.paddingAfter || 0) * 60 * 1000;

  return {
    start: new Date(gigStart.getTime() - paddingBeforeMs),
    end: new Date(gigEnd.getTime() + paddingAfterMs),
  };
}

/**
 * Check if two time windows overlap.
 */
function windowsOverlap(a, b) {
  return a.start < b.end && a.end > b.start;
}

/**
 * Get all gigs a user is ATTENDING across all workspaces,
 * with their effective time windows.
 */
async function getUserAttendingGigs(userId, dateRange = {}) {
  // Find all BandMember records linked to this user
  const bandMembers = await prisma.bandMember.findMany({
    where: { linkedUserId: userId },
    select: { id: true, workspaceId: true },
  });

  if (bandMembers.length === 0) return [];

  const bandMemberIds = bandMembers.map(bm => bm.id);
  const bmWorkspaceMap = Object.fromEntries(bandMembers.map(bm => [bm.id, bm.workspaceId]));

  // Find all ATTENDING gig attendee records for these band members
  const dateFilter = {};
  if (dateRange.from) dateFilter.gte = new Date(dateRange.from);
  if (dateRange.to) dateFilter.lte = new Date(dateRange.to);

  const attendees = await prisma.gigAttendee.findMany({
    where: {
      bandMemberId: { in: bandMemberIds },
      status: 'ATTENDING',
      gig: {
        status: 'SCHEDULED',
        isPersonal: false,
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      },
    },
    include: {
      gig: {
        include: {
          workspace: { select: { id: true, name: true } },
          venueRecord: { select: { name: true } },
        },
      },
    },
  });

  return attendees.map(att => {
    const window = computeEffectiveWindow(att.gig, att);
    return {
      gigId: att.gig.id,
      gigTitle: att.gig.title,
      gigType: att.gig.type,
      gigDate: att.gig.date,
      workspaceId: att.gig.workspaceId,
      workspaceName: att.gig.workspace.name,
      venue: att.gig.venueRecord?.name || att.gig.venue || null,
      paddingBefore: att.paddingBefore,
      paddingAfter: att.paddingAfter,
      effectiveStart: window.start,
      effectiveEnd: window.end,
      bandMemberId: att.bandMemberId,
    };
  });
}

/**
 * Get all scheduling conflicts for a user across all workspaces.
 * A conflict is when two gigs from different workspaces have overlapping time windows.
 *
 * @param {string} userId
 * @param {object} dateRange - { from?: string, to?: string }
 * @returns {Array} conflicts with visibility-filtered details
 */
export async function getConflictsForUser(userId, dateRange = {}) {
  const gigs = await getUserAttendingGigs(userId, dateRange);

  if (gigs.length < 2) return [];

  // Find all pairs of gigs from different workspaces that overlap
  const conflicts = [];

  for (let i = 0; i < gigs.length; i++) {
    for (let j = i + 1; j < gigs.length; j++) {
      const a = gigs[i];
      const b = gigs[j];

      // Only flag cross-workspace conflicts
      if (a.workspaceId === b.workspaceId) continue;

      if (windowsOverlap(
        { start: a.effectiveStart, end: a.effectiveEnd },
        { start: b.effectiveStart, end: b.effectiveEnd }
      )) {
        conflicts.push({ gigA: a, gigB: b });
      }
    }
  }

  return conflicts;
}

/**
 * Find all workspace IDs affected by a user's attendance change.
 * Used to emit socket events to the right rooms.
 */
export async function getAffectedWorkspaceIds(userId) {
  const bandMembers = await prisma.bandMember.findMany({
    where: { linkedUserId: userId },
    select: { workspaceId: true },
  });
  return [...new Set(bandMembers.map(bm => bm.workspaceId))];
}
