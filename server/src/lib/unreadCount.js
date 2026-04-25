import prisma from './prisma.js';

/**
 * Compute the total unread message count across all channels for a user.
 *
 * Counts messages where:
 *   - user is a channel member with lastRead before the message
 *   - user is not the author (don't count your own messages)
 *   - message is a top-level message (no threads)
 *   - channel is not muted for this user
 *   - parent workspace is not soft-deleted
 *
 * Used as the single source of truth for the iOS/Android app icon badge.
 * Must be kept in sync with the unread calculations in channels.js and workspaces.js.
 */
/**
 * Returns the count as an integer, or null on DB error. Callers that drive
 * the iOS app icon badge should treat null as "don't change the badge" —
 * silently returning 0 on error would actively CLEAR badges on devices
 * that still have unreads during a transient outage.
 */
export async function getUnreadCount(userId) {
  try {
    // EXISTS guard on WorkspaceMember prevents orphan ChannelMember rows
    // (user left workspace but their ChannelMember row wasn't cascaded) from
    // inflating the badge count. See v1.05.78 for the cascade fix on leave.
    const result = await prisma.$queryRaw`
      SELECT COUNT(m.id)::int AS count
      FROM "ChannelMember" cm
      JOIN "Channel" c ON c.id = cm."channelId"
      JOIN "Workspace" w ON w.id = c."workspaceId" AND w."deletedAt" IS NULL
      JOIN "Message" m ON m."channelId" = cm."channelId"
        AND m."createdAt" > cm."lastRead"
        AND m."authorId" != cm."userId"
        AND m."parentId" IS NULL
      WHERE cm."userId" = ${userId}
        AND cm.muted = false
        AND EXISTS (
          SELECT 1 FROM "WorkspaceMember" wm
          WHERE wm."userId" = cm."userId"
            AND wm."workspaceId" = c."workspaceId"
        )
    `;
    return result[0]?.count || 0;
  } catch (err) {
    console.warn('getUnreadCount failed:', err.message);
    return null;
  }
}

/**
 * Compute the unread count for a user and emit a badge:update event
 * to all of that user's connected sockets. Best-effort — errors are logged
 * but do not propagate.
 *
 * Call this from every endpoint that changes a user's unread count:
 *   - channel mark-read / mark-unread
 *   - workspace mark-read-all
 *   - new message arrives (for each recipient)
 *   - unread message deleted
 *   - channel muted / unmuted
 */
export async function emitBadgeUpdate(io, userId) {
  if (!io || !userId) return;
  try {
    const count = await getUnreadCount(userId);
    // Don't emit on DB error — we'd send the wrong number and overwrite a
    // correct client-side badge with a spurious value.
    if (count === null) return;
    io.to(`user:${userId}`).emit('badge:update', { count });
    return count;
  } catch (err) {
    console.warn('emitBadgeUpdate failed:', err.message);
  }
}
