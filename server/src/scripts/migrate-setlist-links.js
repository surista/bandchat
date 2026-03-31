import prisma from '../lib/prisma.js';

/**
 * One-time migration: Convert legacy Gig.setlistId to GigSetlist entries.
 *
 * For each gig that has setlistId but no GigSetlist entries:
 *   - Creates a GigSetlist entry with setNumber: 1
 *   - Clears the legacy setlistId field
 *
 * This prepares the database for the consolidated GigSetlist-only approach.
 *
 * Usage: node --experimental-specifier-resolution=node src/scripts/migrate-setlist-links.js
 *        node --experimental-specifier-resolution=node src/scripts/migrate-setlist-links.js --dry-run
 */

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`\n=== Migrate Legacy Setlist Links to GigSetlist ===`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE'}\n`);

  // Find all gigs with setlistId but no GigSetlist entries
  const gigsToMigrate = await prisma.gig.findMany({
    where: {
      setlistId: { not: null },
      setlists: { none: {} }
    },
    include: {
      workspace: { select: { id: true, name: true } },
      setlist: { select: { id: true, name: true } }
    },
    orderBy: { date: 'desc' }
  });

  if (gigsToMigrate.length === 0) {
    console.log('No gigs found with legacy setlistId that need migration.');
    console.log('All setlist links are already using GigSetlist table.\n');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${gigsToMigrate.length} gig(s) to migrate:\n`);

  // Group by workspace for cleaner output
  const byWorkspace = new Map();
  for (const gig of gigsToMigrate) {
    const wsName = gig.workspace.name;
    if (!byWorkspace.has(wsName)) byWorkspace.set(wsName, []);
    byWorkspace.get(wsName).push(gig);
  }

  let migratedCount = 0;
  let errorCount = 0;

  for (const [wsName, gigs] of byWorkspace) {
    console.log(`[${wsName}] ${gigs.length} gig(s) to migrate:`);

    for (const gig of gigs) {
      const dateStr = gig.date.toISOString().split('T')[0];
      console.log(`  - "${gig.title}" (${dateStr}) → setlist: "${gig.setlist?.name || 'Unknown'}"`);

      if (!DRY_RUN) {
        try {
          await prisma.$transaction([
            // Create GigSetlist entry
            prisma.gigSetlist.create({
              data: {
                gigId: gig.id,
                setlistId: gig.setlistId,
                setNumber: 1
              }
            }),
            // Clear legacy setlistId
            prisma.gig.update({
              where: { id: gig.id },
              data: { setlistId: null }
            })
          ]);
          migratedCount++;
        } catch (error) {
          console.error(`    ERROR: ${error.message}`);
          errorCount++;
        }
      } else {
        migratedCount++;
      }
    }
    console.log('');
  }

  console.log('=== Summary ===');
  console.log(`Total gigs found: ${gigsToMigrate.length}`);
  console.log(`Successfully migrated: ${migratedCount}`);
  if (errorCount > 0) {
    console.log(`Errors: ${errorCount}`);
  }

  if (DRY_RUN) {
    console.log('\nThis was a dry run. Run without --dry-run to apply changes.');
  } else {
    console.log('\nMigration complete!');
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Migration failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
