/**
 * One-time script to reconnect the Frozen Assets website to BandChat.
 * Run with: node --experimental-modules src/scripts/fix-frozen-website.js
 */
import prisma from '../lib/prisma.js';

async function main() {
  // Find the Frozen Assets workspace by name
  const workspace = await prisma.workspace.findFirst({
    where: { name: { contains: 'Frozen', mode: 'insensitive' } },
    select: { id: true, name: true, slug: true, websiteEnabled: true, websiteRepoName: true, websiteVercelId: true, websiteDeployHook: true, websiteUrl: true, websiteStatus: true },
  });

  if (!workspace) {
    console.error('Frozen Assets workspace not found');
    process.exit(1);
  }

  console.log('Found workspace:', workspace.name, workspace.id);
  console.log('Current website state:', {
    websiteEnabled: workspace.websiteEnabled,
    websiteRepoName: workspace.websiteRepoName,
    websiteVercelId: workspace.websiteVercelId,
    websiteDeployHook: workspace.websiteDeployHook,
    websiteUrl: workspace.websiteUrl,
    websiteStatus: workspace.websiteStatus,
  });

  // Update with the existing Vercel project details
  const updated = await prisma.workspace.update({
    where: { id: workspace.id },
    data: {
      websiteEnabled: true,
      websiteRepoName: 'frozen',
      websiteVercelId: 'prj_d4oaupDdReBt9tzUhZtyDBn3WWzK',
      websiteDeployHook: 'https://api.vercel.com/v1/integrations/deploy/prj_d4oaupDdReBt9tzUhZtyDBn3WWzK/SIB9I4Cfh8',
      websiteUrl: 'https://frozen-assets.bandchat.app',
      websiteStatus: 'active',
    },
  });

  console.log('Updated workspace:', updated.name);
  console.log('Website now connected. triggerWebsiteSync() will use the deploy hook going forward.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
