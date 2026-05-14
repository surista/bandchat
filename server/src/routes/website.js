import express from 'express';
import { Resend } from 'resend';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';
import { deployLimiter, publicFormLimiter } from '../middleware/rateLimit.js';
import prisma from '../lib/prisma.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Sanitize strings for email headers (prevent header injection)
function sanitizeHeader(str) {
  if (!str) return '';
  return String(str).replace(/[\r\n<>"]/g, '').trim().slice(0, 100);
}

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
import {
  forkTemplate,
  writeSiteConfig,
  createVercelProject,
  setVercelEnvVars,
  addVercelDomain,
  createDeployHook,
  triggerDeploy,
  createDeployment,
  deleteVercelProject,
  deleteGithubRepo,
  generateApiToken,
  verifyApiToken,
} from '../services/websiteDeployment.js';

const router = express.Router();

const MAX_STRING = 500;
const MAX_LONG_STRING = 2000;

// GET /:workspaceId — get website config/status (any member)
router.get('/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: req.params.workspaceId },
      select: {
        websiteEnabled: true,
        websiteUrl: true,
        websiteConfig: true,
        websiteDeployedAt: true,
        websiteStatus: true,
      },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.json(workspace);
  } catch (error) {
    console.error('Get website config error:', error);
    res.status(500).json({ error: 'Failed to get website config' });
  }
});

// PUT /:workspaceId/config — save config without deploying (admin only)
// Accepts the full site.config.js structure from the client and stores as JSON.
router.put('/:workspaceId/config', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const body = req.body;

    if (JSON.stringify(body).length > 50000) {
      return res.status(400).json({ error: 'Config too large (max 50KB)' });
    }

    const bandName = body.bandName || body.band?.name;

    if (!bandName || typeof bandName !== 'string' || bandName.length > MAX_STRING) {
      return res.status(400).json({ error: 'Band name is required (max 500 chars)' });
    }

    // Validate string lengths on key fields
    const stringChecks = [
      [body.tagline, 'Tagline', MAX_STRING],
      [body.description, 'Description', MAX_LONG_STRING],
      [body.contactEmail, 'Contact email', MAX_STRING],
      [body.location, 'Location', MAX_STRING],
      [body.genre, 'Genre', MAX_STRING],
      [body.seo?.title, 'SEO title', MAX_STRING],
      [body.seo?.description, 'SEO description', MAX_STRING],
    ];
    for (const [val, name, max] of stringChecks) {
      if (val && (typeof val !== 'string' || val.length > max)) {
        return res.status(400).json({ error: `${name} too long (max ${max} chars)` });
      }
    }

    // Store the entire config object as-is (matches site.config.js structure)
    const workspace = await prisma.workspace.update({
      where: { id: req.params.workspaceId },
      data: { websiteConfig: body },
      select: { websiteConfig: true },
    });

    res.json({ config: workspace.websiteConfig });
  } catch (error) {
    console.error('Update website config error:', error);
    res.status(500).json({ error: 'Failed to update website config' });
  }
});

// POST /:workspaceId/deploy — full deploy pipeline (admin, rate-limited)
router.post('/:workspaceId/deploy', authenticate, isWorkspaceAdmin, deployLimiter, async (req, res) => {
  const { workspaceId } = req.params;

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        slug: true,
        name: true,
        websiteEnabled: true,
        websiteVercelId: true,
        websiteRepoName: true,
        websiteConfig: true,
      },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    if (!workspace.websiteConfig) {
      return res.status(400).json({ error: 'Please save website config first' });
    }

    // Generate slug from workspace slug, config band name, or workspace name
    const rawSlug = workspace.slug
      || workspace.websiteConfig?.bandName
      || workspace.name
      || workspaceId.slice(0, 8);
    const bandSlug = rawSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

    // Mark as deploying
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { websiteStatus: 'deploying' },
    });

    try {
      const isRedeploy = workspace.websiteEnabled && workspace.websiteRepoName && workspace.websiteVercelId;

      let repoName, vercelProjectId, deployHookUrl, domain;

      if (isRedeploy) {
        // Redeploy: update config in existing repo and trigger rebuild
        repoName = workspace.websiteRepoName;
        vercelProjectId = workspace.websiteVercelId;
        domain = workspace.websiteUrl?.replace('https://', '') || `${bandSlug}.bandchat.app`;

        // Update site config in existing repo
        await writeSiteConfig(repoName, workspace.websiteConfig);

        // Trigger rebuild via deploy hook (or direct if no hook)
        const ws = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { websiteDeployHook: true },
        });
        deployHookUrl = ws?.websiteDeployHook;
        if (deployHookUrl) {
          await triggerDeploy(deployHookUrl);
        }
      } else {
        // Fresh deploy: create repo, Vercel project, everything
        repoName = await forkTemplate(bandSlug);

        // Write site config
        await writeSiteConfig(repoName, workspace.websiteConfig);

        // Create Vercel project
        vercelProjectId = await createVercelProject(repoName, bandSlug);

        // Generate API token for data sync
        const apiToken = await generateApiToken(workspaceId);

        // Set env vars on Vercel
        const apiUrl = process.env.API_URL || (process.env.RAILWAY_PUBLIC_DOMAIN
          ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api`
          : 'http://localhost:3001/api');
        domain = `${bandSlug}.bandchat.app`;
        const config = workspace.websiteConfig;
        await setVercelEnvVars(vercelProjectId, {
          BANDCHAT_API_URL: apiUrl,
          BANDCHAT_API_TOKEN: apiToken,
          BANDCHAT_WORKSPACE_ID: workspaceId,
          VITE_BANDCHAT_URL: apiUrl,
          VITE_WORKSPACE_ID: workspaceId,
          SYNC_BANDCHAT_URL: apiUrl,
          SYNC_WORKSPACE_ID: workspaceId,
          SYNC_API_TOKEN: apiToken,
          SITE_DOMAIN: domain,
          BAND_NAME: config.bandName || workspace.name,
          CONTACT_EMAIL: config.contactEmail || '',
          ...(process.env.RESEND_API_KEY && { RESEND_API_KEY: process.env.RESEND_API_KEY }),
          ...(process.env.RESEND_FROM_EMAIL && { RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL }),
        });

        // Add custom domain
        await addVercelDomain(vercelProjectId, domain);

        // Create deploy hook
        deployHookUrl = await createDeployHook(vercelProjectId);

        // Trigger initial deploy — use direct API deployment (deploy hooks don't work for first build)
        await createDeployment(vercelProjectId, repoName);
      }

      // 9. Update workspace
      const updated = await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          websiteEnabled: true,
          websiteUrl: `https://${domain}`,
          websiteRepoName: repoName,
          websiteVercelId: vercelProjectId,
          websiteDeployHook: deployHookUrl,
          websiteDeployedAt: new Date(),
          websiteStatus: 'active',
        },
        select: {
          websiteEnabled: true,
          websiteUrl: true,
          websiteDeployedAt: true,
          websiteStatus: true,
        },
      });

      res.json(updated);
    } catch (deployError) {
      // Mark as error
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { websiteStatus: 'error' },
      });
      throw deployError;
    }
  } catch (error) {
    console.error('Website deploy error:', error);
    res.status(500).json({ error: error.message || 'Deployment failed' });
  }
});

// POST /:workspaceId/sync — push latest config to GitHub repo + trigger
// Vercel rebuild via deploy hook. Admin only.
//
// Previously this only triggered the rebuild without writing site.config.js
// to the band's repo first — which meant changes saved in the BandChat UI
// (via PUT /config) sat in the DB but never reached the deployed site until
// the next full Deploy. Now Sync = "push my current config + rebuild," which
// matches the user's mental model.
router.post('/:workspaceId/sync', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: req.params.workspaceId },
      select: {
        websiteEnabled: true,
        websiteDeployHook: true,
        websiteVercelId: true,
        websiteRepoName: true,
        websiteConfig: true,
      },
    });

    if (!workspace?.websiteEnabled) {
      return res.status(400).json({ error: 'Website not deployed' });
    }

    // Push latest config to the band's GitHub repo so the rebuild picks it up.
    // Non-fatal if it fails — the rebuild will still happen with whatever's in
    // the repo, which is no worse than the old behavior.
    if (workspace.websiteRepoName && workspace.websiteConfig) {
      try {
        await writeSiteConfig(workspace.websiteRepoName, workspace.websiteConfig);
      } catch (err) {
        console.warn(`[website-sync] writeSiteConfig failed for ${req.params.workspaceId}:`, err.message);
      }
    }

    let triggered = false;
    if (workspace.websiteDeployHook) {
      await triggerDeploy(workspace.websiteDeployHook);
      triggered = true;
    } else if (workspace.websiteVercelId && workspace.websiteRepoName) {
      // Fallback: trigger via deployment API
      await createDeployment(workspace.websiteVercelId, workspace.websiteRepoName);
      triggered = true;
    } else {
      return res.status(400).json({ error: 'No deploy hook or project configured' });
    }

    // Optimistically clear the stuck 'error' state so the BandChat UI shows
    // the site as healthy after a successful sync trigger. Vercel does the
    // actual build async — if it fails, the user will notice on the site
    // itself and can retry. Previously this field never updated on sync, so
    // a workspace that errored once would forever show the red banner even
    // though Sync was happily rebuilding the site behind the scenes.
    if (triggered) {
      await prisma.workspace.update({
        where: { id: req.params.workspaceId },
        data: { websiteStatus: 'active', websiteDeployedAt: new Date() },
      }).catch((err) => {
        console.warn(`[website-sync] status update failed for ${req.params.workspaceId}:`, err.message);
      });
    }

    res.json({ message: 'Sync triggered', status: 'active' });
  } catch (error) {
    console.error('Website sync error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// DELETE /:workspaceId — tear down website (admin)
router.delete('/:workspaceId', authenticate, isWorkspaceAdmin, async (req, res) => {
  const { workspaceId } = req.params;

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        websiteVercelId: true,
        websiteRepoName: true,
      },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Delete Vercel project
    if (workspace.websiteVercelId) {
      await deleteVercelProject(workspace.websiteVercelId).catch(err =>
        console.error('Vercel deletion warning:', err.message)
      );
    }

    // Delete GitHub repo
    if (workspace.websiteRepoName) {
      await deleteGithubRepo(workspace.websiteRepoName).catch(err =>
        console.error('GitHub deletion warning:', err.message)
      );
    }

    // Delete API tokens
    await prisma.websiteApiToken.deleteMany({ where: { workspaceId } });

    // Clear workspace website fields
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        websiteEnabled: false,
        websiteUrl: null,
        websiteRepoName: null,
        websiteVercelId: null,
        websiteConfig: null,
        websiteDeployedAt: null,
        websiteStatus: null,
        websiteDeployHook: null,
      },
    });

    res.json({ message: 'Website deleted' });
  } catch (error) {
    console.error('Website delete error:', error);
    res.status(500).json({ error: 'Failed to delete website' });
  }
});

// GET /:workspaceId/status — check Vercel deploy status (any member)
router.get('/:workspaceId/status', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: req.params.workspaceId },
      select: {
        websiteStatus: true,
        websiteDeployedAt: true,
        websiteUrl: true,
      },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.json({
      status: workspace.websiteStatus,
      deployedAt: workspace.websiteDeployedAt,
      url: workspace.websiteUrl,
    });
  } catch (error) {
    console.error('Website status error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// GET /api/:workspaceId/data — public data endpoint for website sync (WebsiteApiToken auth)
router.get('/api/:workspaceId/data', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing API token' });
    }

    const token = authHeader.split(' ')[1];
    const verifiedWorkspaceId = await verifyApiToken(token);

    if (!verifiedWorkspaceId || verifiedWorkspaceId !== req.params.workspaceId) {
      return res.status(401).json({ error: 'Invalid API token' });
    }

    const workspaceId = req.params.workspaceId;

    // Fetch all public band data in parallel
    const [workspace, gigs, songs, setlists, bandMembers] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          name: true,
          slug: true,
          websiteConfig: true,
        },
      }),
      prisma.gig.findMany({
        where: {
          workspaceId,
          isPersonal: false,
          type: 'GIG',
          status: { not: 'CANCELLED' },
        },
        select: {
          id: true,
          title: true,
          type: true,
          date: true,
          endDate: true,
          venue: true,
          address: true,
          notes: true,
          status: true,
          soundCheckTime: true,
          eventStartTime: true,
          performanceStartTime: true,
          pay: true,
          media: {
            select: {
              id: true,
              type: true,
              url: true,
              caption: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { date: 'asc' },
      }),
      prisma.song.findMany({
        where: { workspaceId },
        select: {
          id: true,
          title: true,
          artist: true,
          duration: true,
          key: true,
          bpm: true,
        },
        orderBy: { title: 'asc' },
      }),
      prisma.setlist.findMany({
        where: { workspaceId },
        select: {
          id: true,
          name: true,
          description: true,
          performedAt: true,
          venue: true,
          songs: {
            select: {
              position: true,
              type: true,
              label: true,
              duration: true,
              song: {
                select: { id: true, title: true, artist: true },
              },
            },
            orderBy: { position: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.bandMember.findMany({
        where: { workspaceId },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          notes: true,
          isGuest: true,
          stints: {
            select: {
              instruments: true,
              startDate: true,
              endDate: true,
            },
            orderBy: { startDate: 'desc' },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Apply the advanced-customizations kill switch. When the band flips
    // useCustomizations to false from the BandChat Settings → Website tab,
    // strip the `customizations` sub-object from the deployed-site payload.
    // The data is preserved server-side (it's still in websiteConfig in the
    // DB) so flipping back ON restores everything without re-entry.
    const config = workspace.websiteConfig || {};
    const useCustomizations = config.useCustomizations === true;
    const safeConfig = useCustomizations
      ? config
      : { ...config, customizations: undefined };

    // Tier 2: Auto-pull first image from each gig's media as a convenience
    // `posterUrl`. Templates that want "show a poster for this gig" can read
    // gig.posterUrl directly instead of re-implementing the lookup. Falls
    // back to null if the gig has no image media.
    const enrichedGigs = gigs.map((g) => {
      const firstImage = g.media?.find((m) => m.type === 'image');
      return { ...g, posterUrl: firstImage?.url || null };
    });

    res.json({
      workspace: {
        name: workspace.name,
        slug: workspace.slug,
        config: safeConfig,
      },
      gigs: enrichedGigs,
      songs,
      setlists,
      bandMembers,
    });
  } catch (error) {
    console.error('Website data endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// POST /api/:workspaceId/song-request — public song request submission
router.post('/api/:workspaceId/song-request', publicFormLimiter, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { songTitle, artist, submitterName, submitterEmail, notes } = req.body;

    // Validation
    if (!songTitle?.trim()) {
      return res.status(400).json({ error: 'Song title is required' });
    }
    if (!submitterName?.trim()) {
      return res.status(400).json({ error: 'Your name is required' });
    }
    if (songTitle.length > MAX_STRING) {
      return res.status(400).json({ error: 'Song title too long (max 500 chars)' });
    }
    if (artist && artist.length > MAX_STRING) {
      return res.status(400).json({ error: 'Artist name too long (max 500 chars)' });
    }
    if (submitterName.length > MAX_STRING) {
      return res.status(400).json({ error: 'Name too long (max 500 chars)' });
    }
    if (submitterEmail && submitterEmail.length > MAX_STRING) {
      return res.status(400).json({ error: 'Email too long (max 500 chars)' });
    }
    if (notes && notes.length > MAX_LONG_STRING) {
      return res.status(400).json({ error: 'Notes too long (max 2000 chars)' });
    }

    // Workspace must exist and not be deleted
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: { id: true, name: true, websiteConfig: true },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Band not found' });
    }

    // Check if song requests are enabled
    const config = workspace.websiteConfig;
    if (!config?.features?.songRequests) {
      return res.status(400).json({ error: 'Song requests are not enabled for this band' });
    }

    // Store the request
    await prisma.songRequest.create({
      data: {
        workspaceId,
        songTitle: songTitle.trim(),
        artist: artist?.trim() || null,
        submitterName: submitterName.trim(),
        submitterEmail: submitterEmail?.trim() || null,
        notes: notes?.trim() || null,
      },
    });

    // Get workspace admins for email
    const admins = await prisma.workspaceMember.findMany({
      where: { workspaceId, role: 'ADMIN' },
      include: { user: { select: { email: true, displayName: true } } },
    });

    if (admins.length > 0) {
      const bandName = config?.bandName || workspace.name;
      const timestamp = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #059669;">New Song Request</h2>
          <p style="color: #6b7280;">Someone submitted a song request via your band website.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px 0; color: #6b7280; width: 120px;">From</td><td style="padding: 8px 0; font-weight: 600;">${escapeHtml(submitterName.trim())}</td></tr>
            ${submitterEmail ? `<tr><td style="padding: 8px 0; color: #6b7280;">Email</td><td style="padding: 8px 0;"><a href="mailto:${escapeHtml(submitterEmail.trim())}" style="color: #2563eb;">${escapeHtml(submitterEmail.trim())}</a></td></tr>` : ''}
            <tr><td style="padding: 8px 0; color: #6b7280;">Song</td><td style="padding: 8px 0; font-weight: 600;">${escapeHtml(songTitle.trim())}</td></tr>
            ${artist ? `<tr><td style="padding: 8px 0; color: #6b7280;">Artist</td><td style="padding: 8px 0;">${escapeHtml(artist.trim())}</td></tr>` : ''}
            <tr><td style="padding: 8px 0; color: #6b7280;">Received</td><td style="padding: 8px 0;">${timestamp}</td></tr>
          </table>
          ${notes ? `
          <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <div style="color: #6b7280; font-size: 12px; margin-bottom: 4px;">Notes:</div>
            <div style="color: #111827;">${escapeHtml(notes.trim())}</div>
          </div>
          ` : ''}
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">This request was submitted through your ${escapeHtml(bandName)} website.</p>
        </div>
      `;

      // Send email to each admin
      for (const admin of admins) {
        if (resend && admin.user.email) {
          await resend.emails.send({
            from: `${sanitizeHeader(bandName)} via BandChat <noreply@${process.env.RESEND_DOMAIN || 'resend.dev'}>`,
            to: admin.user.email,
            subject: `🎵 Song Request: ${sanitizeHeader(songTitle.trim().slice(0, 50))}`,
            html: emailHtml,
          }).catch(err => console.error('Failed to send song request email:', err));
        } else if (!resend) {
          console.log('[DEV] Song request email would be sent to:', admin.user.email);
        }
      }
    }

    res.status(201).json({ message: 'Song request submitted successfully' });
  } catch (error) {
    console.error('Song request error:', error);
    res.status(500).json({ error: 'Failed to submit song request' });
  }
});

// POST /api/:workspaceId/contact — public contact form submission
router.post('/api/:workspaceId/contact', publicFormLimiter, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { name, email, subject, message } = req.body;

    // Validation
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email?.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (name.length > MAX_STRING) {
      return res.status(400).json({ error: 'Name too long (max 500 chars)' });
    }
    if (email.length > MAX_STRING) {
      return res.status(400).json({ error: 'Email too long (max 500 chars)' });
    }
    if (subject && subject.length > MAX_STRING) {
      return res.status(400).json({ error: 'Subject too long (max 500 chars)' });
    }
    if (message.length > MAX_LONG_STRING) {
      return res.status(400).json({ error: 'Message too long (max 2000 chars)' });
    }

    // Email validation
    if (!EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Workspace must exist and not be deleted
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: { id: true, name: true, websiteConfig: true },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Band not found' });
    }

    // Store the submission
    await prisma.contactSubmission.create({
      data: {
        workspaceId,
        name: name.trim(),
        email: email.trim(),
        subject: subject?.trim() || null,
        message: message.trim(),
      },
    });

    // Get workspace admins for email
    const admins = await prisma.workspaceMember.findMany({
      where: { workspaceId, role: 'ADMIN' },
      include: { user: { select: { email: true, displayName: true } } },
    });

    if (admins.length > 0) {
      const config = workspace.websiteConfig;
      const bandName = config?.bandName || workspace.name;
      const timestamp = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">New Contact Message</h2>
          <p style="color: #6b7280;">Someone sent a message via your band website contact form.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px 0; color: #6b7280; width: 120px;">From</td><td style="padding: 8px 0; font-weight: 600;">${escapeHtml(name.trim())}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">Email</td><td style="padding: 8px 0;"><a href="mailto:${escapeHtml(email.trim())}" style="color: #2563eb;">${escapeHtml(email.trim())}</a></td></tr>
            ${subject ? `<tr><td style="padding: 8px 0; color: #6b7280;">Subject</td><td style="padding: 8px 0;">${escapeHtml(subject.trim())}</td></tr>` : ''}
            <tr><td style="padding: 8px 0; color: #6b7280;">Received</td><td style="padding: 8px 0;">${timestamp}</td></tr>
          </table>
          <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <div style="color: #6b7280; font-size: 12px; margin-bottom: 4px;">Message:</div>
            <div style="color: #111827; white-space: pre-wrap;">${escapeHtml(message.trim())}</div>
          </div>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">This message was sent through your ${escapeHtml(bandName)} website. Reply directly to the sender at <a href="mailto:${escapeHtml(email.trim())}" style="color: #2563eb;">${escapeHtml(email.trim())}</a></p>
        </div>
      `;

      // Send email to each admin
      for (const admin of admins) {
        if (resend && admin.user.email) {
          await resend.emails.send({
            from: `${sanitizeHeader(bandName)} via BandChat <noreply@${process.env.RESEND_DOMAIN || 'resend.dev'}>`,
            to: admin.user.email,
            replyTo: email.trim(),
            subject: subject ? `📬 ${sanitizeHeader(subject.trim().slice(0, 50))}` : `📬 Contact from ${sanitizeHeader(name.trim().slice(0, 30))}`,
            html: emailHtml,
          }).catch(err => console.error('Failed to send contact email:', err));
        } else if (!resend) {
          console.log('[DEV] Contact email would be sent to:', admin.user.email);
        }
      }
    }

    res.status(201).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
