import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { slackEmojiToUnicode } from './slack-emoji-map.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SLACK_EXPORT_DIR = path.resolve(__dirname, '../../../Slack_export');
const MAPPING_FILE = path.resolve(__dirname, 'slack-user-mapping.json');
const BATCH_SIZE = 100;

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const workspaceIdx = args.indexOf('--workspace');
const channelIdx = args.indexOf('--channel');
const WORKSPACE_ID = workspaceIdx !== -1 ? args[workspaceIdx + 1] : null;
const SINGLE_CHANNEL = channelIdx !== -1 ? args[channelIdx + 1] : null;

if (!WORKSPACE_ID) {
  console.error('Usage: node src/scripts/import-slack.js --workspace <ID> [--dry-run] [--channel <name>]');
  process.exit(1);
}

// Collect errors/warnings for summary
const errors = [];
const warnings = [];

function warn(msg) {
  warnings.push(msg);
  console.warn(`  WARN: ${msg}`);
}

function logError(msg, err) {
  errors.push(msg);
  console.error(`  ERROR: ${msg}`, err?.message || '');
}

// ─── Phase 1: Users ───────────────────────────────────────────────

async function importUsers() {
  console.log('\n═══ Phase 1: Users ═══');

  const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'));
  const slackUsers = JSON.parse(fs.readFileSync(path.join(SLACK_EXPORT_DIR, 'users.json'), 'utf-8'));

  // Build set of bot user IDs
  const botUserIds = new Set(slackUsers.filter(u => u.is_bot).map(u => u.id));

  // Map: slackUserId → bandchatUserId
  const userMap = new Map();
  let created = 0;
  let mapped = 0;

  for (const [slackId, entry] of Object.entries(mapping)) {
    if (botUserIds.has(slackId)) continue;

    if (entry.bandchatUserId) {
      userMap.set(slackId, entry.bandchatUserId);
      mapped++;
      continue;
    }

    // Create new user
    const displayName = entry.displayName || entry.slackName || 'Unknown User';
    const email = entry.slackEmail || `slack-import-${slackId}@placeholder.local`;
    const password = crypto.randomBytes(32).toString('hex');

    console.log(`  Creating user: ${displayName} (${email})`);

    if (!DRY_RUN) {
      try {
        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await prisma.user.upsert({
          where: { email: email.toLowerCase() },
          update: {},
          create: {
            email: email.toLowerCase(),
            password: hashedPassword,
            displayName,
            emailVerified: false,
          },
          select: { id: true }
        });
        userMap.set(slackId, user.id);
        created++;
      } catch (err) {
        logError(`Failed to create user ${displayName} (${email})`, err);
      }
    } else {
      userMap.set(slackId, `dry-run-${slackId}`);
      created++;
    }
  }

  // Ensure all mapped users are workspace members
  console.log(`  Ensuring workspace membership for ${userMap.size} users...`);
  if (!DRY_RUN) {
    for (const bandchatUserId of userMap.values()) {
      try {
        await prisma.workspaceMember.upsert({
          where: {
            userId_workspaceId: {
              userId: bandchatUserId,
              workspaceId: WORKSPACE_ID
            }
          },
          update: {},
          create: {
            userId: bandchatUserId,
            workspaceId: WORKSPACE_ID,
            role: 'MEMBER'
          }
        });
      } catch (err) {
        logError(`Failed to add workspace member ${bandchatUserId}`, err);
      }
    }
  }

  console.log(`  Mapped: ${mapped}, Created: ${created}, Total: ${userMap.size}`);
  return { userMap, botUserIds };
}

// ─── Phase 2: Channels ───────────────────────────────────────────

async function importChannels(userMap) {
  console.log('\n═══ Phase 2: Channels ═══');

  const slackChannels = JSON.parse(fs.readFileSync(path.join(SLACK_EXPORT_DIR, 'channels.json'), 'utf-8'));

  // Create channel groups
  const GIG_GROUP_NAME = 'Gig Channels';
  const SLACK_GROUP_NAME = 'Slack Channels';
  const gigPattern = /^\d{4}-\d{2}-\d{2}-/;

  let gigGroupId = null;
  let slackGroupId = null;

  if (!DRY_RUN) {
    const gigGroup = await prisma.channelGroup.upsert({
      where: { workspaceId_name: { workspaceId: WORKSPACE_ID, name: GIG_GROUP_NAME } },
      update: {},
      create: { workspaceId: WORKSPACE_ID, name: GIG_GROUP_NAME, position: 100 }
    });
    gigGroupId = gigGroup.id;

    const slackGroup = await prisma.channelGroup.upsert({
      where: { workspaceId_name: { workspaceId: WORKSPACE_ID, name: SLACK_GROUP_NAME } },
      update: {},
      create: { workspaceId: WORKSPACE_ID, name: SLACK_GROUP_NAME, position: 101 }
    });
    slackGroupId = slackGroup.id;
  }

  console.log(`  Created channel groups: "${GIG_GROUP_NAME}", "${SLACK_GROUP_NAME}"`);

  // channelMap: slackChannelName → bandchatChannelId
  const channelMap = new Map();
  let created = 0;

  const channelsToProcess = SINGLE_CHANNEL
    ? slackChannels.filter(c => c.name === SINGLE_CHANNEL)
    : slackChannels;

  for (const sc of channelsToProcess) {
    const normalizedName = sc.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const description = sc.purpose?.value || null;
    const isGig = gigPattern.test(sc.name);
    const groupId = isGig ? gigGroupId : slackGroupId;

    console.log(`  Channel: ${normalizedName} (${isGig ? 'gig' : 'slack'}) - ${sc.members?.length || 0} members`);

    if (!DRY_RUN) {
      try {
        const channel = await prisma.channel.upsert({
          where: { workspaceId_name: { workspaceId: WORKSPACE_ID, name: normalizedName } },
          update: { description: description || undefined, groupId },
          create: {
            name: normalizedName,
            description,
            workspaceId: WORKSPACE_ID,
            groupId,
            isPrivate: false,
            isDirect: false
          }
        });
        channelMap.set(sc.name, channel.id);

        // Add channel members
        const memberIds = (sc.members || [])
          .map(slackId => userMap.get(slackId))
          .filter(Boolean);

        for (const userId of memberIds) {
          try {
            await prisma.channelMember.upsert({
              where: { userId_channelId: { userId, channelId: channel.id } },
              update: {},
              create: { userId, channelId: channel.id }
            });
          } catch (err) {
            if (err.code !== 'P2002') {
              logError(`Failed to add channel member ${userId} to ${normalizedName}`, err);
            }
          }
        }

        created++;
      } catch (err) {
        logError(`Failed to create channel ${normalizedName}`, err);
      }
    } else {
      channelMap.set(sc.name, `dry-run-${normalizedName}`);
      created++;
    }
  }

  console.log(`  Channels processed: ${created}`);
  return channelMap;
}

// ─── Phase 3: Messages ───────────────────────────────────────────

function transformText(text, userMap, slackUsers) {
  if (!text) return '';

  let result = text;

  // Replace user mentions: <@U05SMMKC6KD> → @DisplayName
  result = result.replace(/<@(U[A-Z0-9]+)>/g, (match, userId) => {
    const displayName = slackUsers.get(userId);
    return displayName ? `@${displayName}` : match;
  });

  // Replace channel mentions: <#C05SQ883ZPE|channel-name> → #channel-name
  result = result.replace(/<#C[A-Z0-9]+\|([^>]+)>/g, '#$1');

  // Replace URLs: <https://url|text> → text (url)
  result = result.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '$2 ($1)');

  // Replace bare URLs: <https://url> → https://url
  result = result.replace(/<(https?:\/\/[^>]+)>/g, '$1');

  // HTML entities
  result = result.replace(/&amp;/g, '&');
  result = result.replace(/&lt;/g, '<');
  result = result.replace(/&gt;/g, '>');

  return result;
}

async function importMessages(userMap, botUserIds, channelMap) {
  console.log('\n═══ Phase 3: Messages ═══');

  // Build display name lookup from Slack users
  const slackUsersRaw = JSON.parse(fs.readFileSync(path.join(SLACK_EXPORT_DIR, 'users.json'), 'utf-8'));
  const slackUserNames = new Map();
  for (const u of slackUsersRaw) {
    const name = u.profile?.display_name || u.profile?.real_name || u.real_name || u.name;
    slackUserNames.set(u.id, name);
  }

  // Track messages with reactions for Phase 4
  // Map: channelId → Array<{ createdAt, authorId, reactions }>
  const reactionsQueue = new Map();

  let totalMessages = 0;
  let skippedMessages = 0;

  // Get channel directories
  const exportDirs = fs.readdirSync(SLACK_EXPORT_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const channelsToProcess = SINGLE_CHANNEL
    ? exportDirs.filter(d => d === SINGLE_CHANNEL)
    : exportDirs;

  for (const channelDir of channelsToProcess) {
    const channelId = channelMap.get(channelDir);
    if (!channelId) {
      warn(`No channel mapping for directory: ${channelDir}`);
      continue;
    }

    // Check if channel already has messages (idempotency)
    if (!DRY_RUN) {
      const existingCount = await prisma.message.count({ where: { channelId } });
      if (existingCount > 0) {
        console.log(`  Skipping ${channelDir} - already has ${existingCount} messages`);
        continue;
      }
    }

    const channelPath = path.join(SLACK_EXPORT_DIR, channelDir);
    const jsonFiles = fs.readdirSync(channelPath)
      .filter(f => f.endsWith('.json'))
      .sort(); // chronological order (YYYY-MM-DD.json)

    let channelMessages = 0;
    let channelSkipped = 0;
    const channelReactions = [];
    const batch = [];
    let firstMsg = null;
    let lastMsg = null;

    for (const jsonFile of jsonFiles) {
      try {
        const messages = JSON.parse(fs.readFileSync(path.join(channelPath, jsonFile), 'utf-8'));

        for (const msg of messages) {
          // Skip messages with any subtype
          if (msg.subtype) {
            channelSkipped++;
            continue;
          }

          // Skip bot users
          if (msg.user && botUserIds.has(msg.user)) {
            channelSkipped++;
            continue;
          }

          // Skip if we can't map the user
          const authorId = userMap.get(msg.user);
          if (!authorId) {
            if (msg.user) warn(`Unmapped user ${msg.user} in ${channelDir}/${jsonFile}`);
            channelSkipped++;
            continue;
          }

          const createdAt = new Date(parseFloat(msg.ts) * 1000);
          const content = transformText(msg.text, userMap, slackUserNames);

          if (!content && !msg.files?.length) {
            channelSkipped++;
            continue;
          }

          // Track first/last for verification
          if (!firstMsg || createdAt < firstMsg.date) {
            firstMsg = { date: createdAt, text: content.substring(0, 80) };
          }
          if (!lastMsg || createdAt > lastMsg.date) {
            lastMsg = { date: createdAt, text: content.substring(0, 80) };
          }

          batch.push({
            content: content || '(attachment)',
            authorId,
            channelId,
            createdAt,
            updatedAt: createdAt
          });

          // Queue reactions for Phase 4
          if (msg.reactions?.length) {
            channelReactions.push({ createdAt, authorId, reactions: msg.reactions });
          }

          channelMessages++;

          // Flush batch
          if (batch.length >= BATCH_SIZE && !DRY_RUN) {
            try {
              await prisma.message.createMany({ data: [...batch] });
            } catch (err) {
              logError(`Batch insert failed in ${channelDir}`, err);
            }
            batch.length = 0;
          }
        }
      } catch (err) {
        logError(`Failed to parse ${channelDir}/${jsonFile}`, err);
      }
    }

    // Flush remaining batch
    if (batch.length > 0 && !DRY_RUN) {
      try {
        await prisma.message.createMany({ data: [...batch] });
      } catch (err) {
        logError(`Final batch insert failed in ${channelDir}`, err);
      }
    }

    if (channelReactions.length > 0) {
      reactionsQueue.set(channelId, channelReactions);
    }

    totalMessages += channelMessages;
    skippedMessages += channelSkipped;

    if (firstMsg && lastMsg) {
      console.log(`  ${channelDir}: ${channelMessages} msgs, ${channelSkipped} skipped`);
      console.log(`    First: ${firstMsg.date.toISOString()} - "${firstMsg.text}"`);
      console.log(`    Last:  ${lastMsg.date.toISOString()} - "${lastMsg.text}"`);
    } else {
      console.log(`  ${channelDir}: ${channelMessages} msgs, ${channelSkipped} skipped (empty)`);
    }
  }

  console.log(`  Total messages: ${totalMessages}, Skipped: ${skippedMessages}`);
  return reactionsQueue;
}

// ─── Phase 4: Reactions ──────────────────────────────────────────

async function importReactions(userMap, reactionsQueue) {
  console.log('\n═══ Phase 4: Reactions ═══');

  let totalReactions = 0;
  let unknownEmojis = new Set();

  for (const [channelId, channelReactions] of reactionsQueue) {
    const reactionBatch = [];

    // Build a lookup map: "createdAt|authorId" → messageId
    // This ensures we match the exact message even if timestamps collide
    let msgLookup = new Map();
    if (!DRY_RUN) {
      const timestamps = channelReactions.map(r => r.createdAt);
      const msgs = await prisma.message.findMany({
        where: { channelId, createdAt: { in: timestamps } },
        select: { id: true, createdAt: true, authorId: true }
      });
      for (const m of msgs) {
        const key = `${m.createdAt.getTime()}|${m.authorId}`;
        msgLookup.set(key, m.id);
      }
    }

    for (const { createdAt, authorId, reactions } of channelReactions) {
      const key = `${createdAt.getTime()}|${authorId}`;
      const messageId = DRY_RUN ? `dry-run-msg` : msgLookup.get(key);

      if (!messageId && !DRY_RUN) {
        warn(`Could not find message for reactions at ${createdAt.toISOString()} in channel ${channelId}`);
        continue;
      }

      for (const reaction of reactions) {
        const emoji = slackEmojiToUnicode(reaction.name);
        if (!emoji) {
          unknownEmojis.add(reaction.name);
          continue;
        }

        for (const slackUserId of reaction.users) {
          const userId = userMap.get(slackUserId);
          if (!userId) continue;

          reactionBatch.push({
            emoji,
            userId,
            messageId,
          });
          totalReactions++;
        }
      }
    }

    // Insert reactions in batches
    if (reactionBatch.length > 0 && !DRY_RUN) {
      // createMany with skipDuplicates for idempotency
      for (let i = 0; i < reactionBatch.length; i += BATCH_SIZE) {
        const chunk = reactionBatch.slice(i, i + BATCH_SIZE);
        try {
          await prisma.reaction.createMany({
            data: chunk,
            skipDuplicates: true
          });
        } catch (err) {
          logError(`Reaction batch insert failed`, err);
        }
      }
    }
  }

  if (unknownEmojis.size > 0) {
    console.log(`  Unknown emojis (no Unicode mapping): ${[...unknownEmojis].join(', ')}`);
  }

  console.log(`  Total reactions: ${totalReactions}`);
  return totalReactions;
}

// ─── Phase 5: Summary ────────────────────────────────────────────

async function main() {
  console.log(`\nSlack Import ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log(`Workspace: ${WORKSPACE_ID}`);
  if (SINGLE_CHANNEL) console.log(`Single channel: ${SINGLE_CHANNEL}`);
  console.log(`Export dir: ${SLACK_EXPORT_DIR}`);

  // Verify workspace exists
  if (!DRY_RUN) {
    const workspace = await prisma.workspace.findUnique({ where: { id: WORKSPACE_ID } });
    if (!workspace) {
      console.error(`Workspace ${WORKSPACE_ID} not found!`);
      process.exit(1);
    }
    console.log(`Workspace name: ${workspace.name}`);
  }

  const { userMap, botUserIds } = await importUsers();
  const channelMap = await importChannels(userMap);
  const reactionsQueue = await importMessages(userMap, botUserIds, channelMap);
  const totalReactions = await importReactions(userMap, reactionsQueue);

  console.log('\n═══ Phase 5: Summary ═══');
  console.log(`  Users mapped: ${userMap.size}`);
  console.log(`  Channels: ${channelMap.size}`);
  console.log(`  Reactions: ${totalReactions}`);
  console.log(`  Warnings: ${warnings.length}`);
  console.log(`  Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n  Error details:');
    errors.forEach((e, i) => console.log(`    ${i + 1}. ${e}`));
  }

  if (warnings.length > 0) {
    console.log('\n  Warning details:');
    warnings.forEach((w, i) => console.log(`    ${i + 1}. ${w}`));
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
