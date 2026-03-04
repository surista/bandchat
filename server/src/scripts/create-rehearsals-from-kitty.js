import prisma from '../lib/prisma.js';

/**
 * One-time script: Create rehearsal calendar events from Band Kitty "studio" expenses.
 *
 * For each studio expense without an existing gigId:
 *   - Groups by date (one rehearsal per unique date)
 *   - Creates a locked REHEARSAL gig at 19:00-21:00 JST
 *   - Links the kitty transaction(s) back to the gig
 *
 * Usage: node --experimental-specifier-resolution=node src/scripts/create-rehearsals-from-kitty.js
 */

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  // Find the workspace's kitty
  const kitties = await prisma.bandKitty.findMany({
    include: {
      workspace: { select: { id: true, name: true } },
      transactions: {
        where: {
          type: 'EXPENSE',
          category: 'studio',
          gigId: null
        },
        orderBy: { date: 'asc' }
      }
    }
  });

  for (const kitty of kitties) {
    const txns = kitty.transactions;
    if (txns.length === 0) {
      console.log(`[${kitty.workspace.name}] No unlinked studio expenses found.`);
      continue;
    }

    console.log(`[${kitty.workspace.name}] Found ${txns.length} unlinked studio expense(s).`);

    // Group transactions by calendar date (in JST = UTC+9)
    const byDate = new Map();
    for (const tx of txns) {
      // Convert to JST and extract YYYY-MM-DD
      const jstDate = new Date(tx.date.getTime() + 9 * 60 * 60 * 1000);
      const dateKey = jstDate.toISOString().split('T')[0];
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey).push(tx);
    }

    console.log(`  → ${byDate.size} unique date(s).`);

    // Check for existing rehearsals on those dates to avoid duplicates
    const existingGigs = await prisma.gig.findMany({
      where: {
        workspaceId: kitty.workspace.id,
        type: 'REHEARSAL',
        venue: 'Ebisu Noah'
      },
      select: { id: true, date: true }
    });

    const existingDates = new Set();
    for (const g of existingGigs) {
      const jstDate = new Date(g.date.getTime() + 9 * 60 * 60 * 1000);
      existingDates.add(jstDate.toISOString().split('T')[0]);
    }

    let created = 0;
    let skipped = 0;
    let linked = 0;

    for (const [dateKey, dateTxns] of byDate) {
      if (existingDates.has(dateKey)) {
        console.log(`  SKIP ${dateKey} — rehearsal already exists`);
        skipped += dateTxns.length;
        continue;
      }

      // 19:00 JST = 10:00 UTC, 21:00 JST = 12:00 UTC
      const startUTC = new Date(`${dateKey}T10:00:00.000Z`);
      const endUTC = new Date(`${dateKey}T12:00:00.000Z`);

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would create: Ebisu rehearsal on ${dateKey} (${dateTxns.length} txn(s))`);
        created++;
        linked += dateTxns.length;
        continue;
      }

      const gig = await prisma.gig.create({
        data: {
          title: 'Ebisu rehearsal',
          type: 'REHEARSAL',
          date: startUTC,
          endDate: endUTC,
          venue: 'Ebisu Noah',
          isLocked: true,
          workspaceId: kitty.workspace.id,
          status: 'COMPLETED'
        }
      });

      // Link transactions to the new gig
      await prisma.kittyTransaction.updateMany({
        where: { id: { in: dateTxns.map(t => t.id) } },
        data: { gigId: gig.id }
      });

      console.log(`  CREATED ${dateKey} → ${gig.id} (${dateTxns.length} txn(s) linked)`);
      created++;
      linked += dateTxns.length;
    }

    console.log(`\n  Summary: ${created} rehearsal(s) created, ${linked} transaction(s) linked, ${skipped} skipped.`);
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
