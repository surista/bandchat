import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../lib/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SLACK_EXPORT_DIR = path.resolve(__dirname, '../../../Slack_export');
const OUTPUT_FILE = path.resolve(__dirname, 'slack-user-mapping.json');

async function main() {
  // Read Slack users
  const slackUsers = JSON.parse(fs.readFileSync(path.join(SLACK_EXPORT_DIR, 'users.json'), 'utf-8'));

  // Filter out bots
  const humanUsers = slackUsers.filter(u => !u.is_bot);

  console.log(`Found ${slackUsers.length} Slack users total, ${humanUsers.length} non-bot users`);

  // Get all existing BandChat users
  const bandchatUsers = await prisma.user.findMany({
    select: { id: true, email: true, displayName: true }
  });

  console.log(`Found ${bandchatUsers.length} existing BandChat users`);

  // Build email lookup
  const emailToUser = new Map();
  for (const u of bandchatUsers) {
    emailToUser.set(u.email.toLowerCase(), u);
  }

  // Build mapping
  const mapping = {};
  let matched = 0;
  let unmatched = 0;

  for (const slackUser of humanUsers) {
    const email = slackUser.profile?.email?.toLowerCase() || null;
    const displayName = slackUser.profile?.display_name || slackUser.profile?.real_name || slackUser.real_name || slackUser.name;
    const bandchatUser = email ? emailToUser.get(email) : null;

    if (bandchatUser) matched++;
    else unmatched++;

    mapping[slackUser.id] = {
      slackName: slackUser.real_name || slackUser.name,
      slackEmail: email,
      deleted: slackUser.deleted || false,
      bandchatUserId: bandchatUser?.id || null,
      bandchatDisplayName: bandchatUser?.displayName || null,
      displayName: displayName
    };
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mapping, null, 2));
  console.log(`\nWrote mapping to ${OUTPUT_FILE}`);
  console.log(`  Auto-matched: ${matched}`);
  console.log(`  Unmatched (needs manual mapping or will create new user): ${unmatched}`);
  console.log(`\nEdit the file to set bandchatUserId for unmatched users, or leave null to create new accounts.`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
