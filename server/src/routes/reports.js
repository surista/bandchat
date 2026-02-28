import express from 'express';
import { Resend } from 'resend';
import { authenticate } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'surista@gmail.com';

// Report a message
router.post('/', authenticate, async (req, res) => {
  try {
    const { messageId, reason } = req.body;

    if (!messageId || !reason?.trim()) {
      return res.status(400).json({ error: 'Message ID and reason are required' });
    }

    // Fetch message with context
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        author: { select: { id: true, displayName: true, email: true } },
        channel: {
          select: {
            name: true,
            workspace: { select: { id: true, name: true } }
          }
        }
      }
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Can't report your own messages
    if (message.authorId === req.user.id) {
      return res.status(400).json({ error: 'You cannot report your own messages' });
    }

    // Create report (unique constraint prevents duplicates)
    const report = await prisma.report.create({
      data: {
        reporterId: req.user.id,
        messageId,
        reason: reason.trim()
      }
    });

    // Send email notification
    const reporter = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { displayName: true, email: true }
    });

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #dc2626;">Content Report</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px 0; color: #6b7280; width: 120px;">Workspace</td><td style="padding: 8px 0; font-weight: 600;">${message.channel.workspace.name}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Channel</td><td style="padding: 8px 0;">#${message.channel.name}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Reported by</td><td style="padding: 8px 0;">${reporter.displayName} (${reporter.email})</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Message author</td><td style="padding: 8px 0;">${message.author?.displayName || 'Deleted User'} (${message.author?.email || 'N/A'})</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Message date</td><td style="padding: 8px 0;">${new Date(message.createdAt).toLocaleString()}</td></tr>
        </table>
        <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <div style="color: #6b7280; font-size: 12px; margin-bottom: 4px;">Message content:</div>
          <div style="color: #111827;">${message.content}</div>
        </div>
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <div style="color: #6b7280; font-size: 12px; margin-bottom: 4px;">Reason for report:</div>
          <div style="color: #991b1b;">${reason.trim()}</div>
        </div>
      </div>
    `;

    if (resend) {
      await resend.emails.send({
        from: `BandChat <noreply@${process.env.RESEND_DOMAIN || 'resend.dev'}>`,
        to: ADMIN_EMAIL,
        subject: `[BandChat] Content Report — ${message.channel.workspace.name}`,
        html: emailHtml
      }).catch(err => console.error('Failed to send report email:', err));
    } else {
      console.log('[DEV] Content report email would be sent to:', ADMIN_EMAIL);
      console.log('[DEV] Report:', { reporter: reporter.displayName, messageAuthor: message.author?.displayName, reason: reason.trim() });
    }

    res.status(201).json({ message: 'Report submitted successfully' });
  } catch (error) {
    // Handle unique constraint violation (duplicate report)
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'You have already reported this message' });
    }
    console.error('Report error:', error);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

export default router;
