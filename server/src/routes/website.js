import express from 'express';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';
import { deployLimiter } from '../middleware/rateLimit.js';
import prisma from '../lib/prisma.js';
import {
  forkTemplate,
  writeSiteConfig,
  createVercelProject,
  setVercelEnvVars,
  addVercelDomain,
  createDeployHook,
  triggerDeploy,
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

    const bandSlug = workspace.slug || workspaceId.slice(0, 8);

    // Mark as deploying
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { websiteStatus: 'deploying' },
    });

    try {
      // 1. Fork template repo
      const repoName = await forkTemplate(bandSlug);

      // 2. Write site config
      await writeSiteConfig(repoName, workspace.websiteConfig);

      // 3. Create Vercel project
      const vercelProjectId = await createVercelProject(repoName, bandSlug);

      // 4. Generate API token for data sync
      const apiToken = await generateApiToken(workspaceId);

      // 5. Set env vars on Vercel
      const apiUrl = process.env.API_URL || (process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api`
        : 'http://localhost:3001/api');
      const domain = `${bandSlug}.bandchat.com`;
      const config = workspace.websiteConfig;
      await setVercelEnvVars(vercelProjectId, {
        // Sync credentials (API token replaces email/password)
        BANDCHAT_API_URL: apiUrl,
        BANDCHAT_API_TOKEN: apiToken,
        BANDCHAT_WORKSPACE_ID: workspaceId,
        // Template-expected vars
        VITE_BANDCHAT_URL: apiUrl,
        VITE_WORKSPACE_ID: workspaceId,
        SYNC_BANDCHAT_URL: apiUrl,
        SYNC_WORKSPACE_ID: workspaceId,
        SYNC_API_TOKEN: apiToken,
        SITE_DOMAIN: domain,
        BAND_NAME: config.bandName || workspace.name,
        CONTACT_EMAIL: config.contactEmail || '',
        // Shared keys (if configured)
        ...(process.env.RESEND_API_KEY && { RESEND_API_KEY: process.env.RESEND_API_KEY }),
        ...(process.env.RESEND_FROM_EMAIL && { RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL }),
      });

      // 6. Add custom domain
      await addVercelDomain(vercelProjectId, domain);

      // 7. Create deploy hook
      const deployHookUrl = await createDeployHook(vercelProjectId);

      // 8. Trigger initial deploy
      await triggerDeploy(deployHookUrl);

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

// POST /:workspaceId/sync — trigger rebuild via deploy hook (admin)
router.post('/:workspaceId/sync', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: req.params.workspaceId },
      select: { websiteEnabled: true, websiteDeployHook: true },
    });

    if (!workspace?.websiteEnabled || !workspace.websiteDeployHook) {
      return res.status(400).json({ error: 'Website not deployed' });
    }

    await triggerDeploy(workspace.websiteDeployHook);
    res.json({ message: 'Sync triggered' });
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

    res.json({
      workspace: {
        name: workspace.name,
        slug: workspace.slug,
        config: workspace.websiteConfig,
      },
      gigs,
      songs,
      setlists,
      bandMembers,
    });
  } catch (error) {
    console.error('Website data endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

export default router;
