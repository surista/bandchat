import prisma from './prisma.js';

/**
 * Log an audit event.
 * @param {string} action - Event type (e.g., "user.created", "workspace.deleted")
 * @param {object} options
 * @param {string} [options.actorId] - User who performed the action
 * @param {string} [options.targetId] - ID of the affected entity
 * @param {object} [options.metadata] - Additional context
 */
export async function logAudit(action, { actorId = null, targetId = null, metadata = null } = {}) {
  try {
    await prisma.auditLog.create({
      data: { action, actorId, targetId, metadata },
    });
  } catch (err) {
    // Audit logging should never break the main flow
    console.warn('[Audit] Failed to log event:', action, err.message);
  }
}
