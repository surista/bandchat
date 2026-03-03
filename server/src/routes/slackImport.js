import express from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';
import prisma from '../lib/prisma.js';
import { authenticate, isWorkspaceAdmin } from '../middleware/auth.js';
import { convertSlackText } from '../services/slackTextConverter.js';
import slackEmojiMap from '../services/slackEmojiMap.js';

const router = express.Router();

// In-memory session metadata (ZIP stored on disk, not in memory)
const importSessions = new Map();
const SESSION_TTL = 30 * 60 * 1000;

async function storeSession(id, userId, data) {
  // Remove any existing session for this user (limit 1 per user)
  for (const [key, val] of importSessions) {
    if (val.userId === userId) {
      // Clean up old temp file
      if (val.data.zipPath) {
        fs.unlink(val.data.zipPath).catch(() => {});
      }
      importSessions.delete(key);
    }
  }

  // Write ZIP buffer to temp file instead of holding in memory
  const zipPath = path.join(os.tmpdir(), `bandchat-slack-import-${id}.zip`);
  await fs.writeFile(zipPath, data.zip);

  // Store metadata with file path instead of buffer
  const sessionData = { ...data, zipPath };
  delete sessionData.zip;

  importSessions.set(id, { data: sessionData, userId, createdAt: Date.now() });
  setTimeout(() => cleanupSession(id), SESSION_TTL);
}

function cleanupSession(id) {
  const session = importSessions.get(id);
  if (session?.data?.zipPath) {
    fs.unlink(session.data.zipPath).catch(() => {});
  }
  importSessions.delete(id);
}

function getSession(id) {
  const session = importSessions.get(id);
  if (!session) return null;
  return session;
}

// Multer for ZIP upload (100MB limit)
const zipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' ||
        file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'), false);
    }
  }
});

// Regex for gig channel detection: YYYY-MM-DD-venue-name
const GIG_DATE_REGEX = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

// System message subtypes to filter
const SYSTEM_SUBTYPES = new Set([
  'channel_join', 'channel_leave', 'channel_topic', 'channel_purpose',
  'channel_name', 'channel_rename', 'channel_archive', 'channel_unarchive',
  'group_join', 'group_leave', 'group_topic', 'group_purpose',
  'group_name', 'group_archive', 'group_unarchive',
  'bot_add', 'bot_remove', 'pinned_item', 'unpinned_item',
  'tombstone', 'thread_broadcast'
]);

/**
 * Parse a Slack export ZIP and return metadata for the wizard.
 */
router.post('/workspace/:workspaceId/parse', authenticate, isWorkspaceAdmin,
  zipUpload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No ZIP file uploaded' });
      }

      const zip = new AdmZip(req.file.buffer);
      const entries = zip.getEntries();

      // Find and parse users.json and channels.json
      let slackUsers = [];
      let slackChannels = [];

      // Build a map of directory name → entries for message counting
      const channelDirs = new Map();

      for (const entry of entries) {
        const name = entry.entryName.replace(/\\/g, '/');

        if (name === 'users.json') {
          slackUsers = JSON.parse(entry.getData().toString('utf8'));
        } else if (name === 'channels.json') {
          slackChannels = JSON.parse(entry.getData().toString('utf8'));
        } else if (!entry.isDirectory && name.endsWith('.json')) {
          // Message date files like "channel-name/2024-01-06.json"
          const parts = name.split('/');
          if (parts.length === 2) {
            const dirName = parts[0];
            if (!channelDirs.has(dirName)) {
              channelDirs.set(dirName, []);
            }
            channelDirs.get(dirName).push(name);
          }
        }
      }

      if (slackChannels.length === 0) {
        return res.status(400).json({ error: 'No channels.json found in ZIP. Is this a valid Slack export?' });
      }

      // Auto-match Slack users to BandChat users by email
      const bandchatUsers = await prisma.user.findMany({
        where: {
          workspaces: {
            some: { workspaceId: req.params.workspaceId }
          }
        },
        select: { id: true, displayName: true, email: true, avatarUrl: true }
      });

      const emailMap = new Map(bandchatUsers.map(u => [u.email?.toLowerCase(), u]));

      const usersResult = slackUsers.map(su => {
        const email = su.profile?.email?.toLowerCase();
        const matched = email ? emailMap.get(email) || null : null;
        return {
          slackId: su.id,
          name: su.name,
          realName: su.real_name || su.profile?.real_name || su.name,
          email: su.profile?.email || null,
          isBot: su.is_bot || false,
          isDeleted: su.deleted || false,
          isAdmin: su.is_admin || su.is_owner || false,
          avatarUrl: su.profile?.image_72 || null,
          matchedBandChatUser: matched ? { id: matched.id, displayName: matched.displayName, email: matched.email } : null
        };
      });

      // Build channel results with message counts
      const channelsResult = slackChannels.map(sc => {
        const msgFiles = channelDirs.get(sc.name) || [];
        const gigMatch = GIG_DATE_REGEX.exec(sc.name);
        return {
          slackId: sc.id,
          name: sc.name,
          isGigChannel: !!gigMatch,
          gigDate: gigMatch ? gigMatch[1] : null,
          gigVenue: gigMatch ? gigMatch[2] : null,
          memberCount: sc.members?.length || 0,
          messageFileCount: msgFiles.length,
          isArchived: sc.is_archived || false,
          purpose: sc.purpose?.value || '',
          topic: sc.topic?.value || ''
        };
      });

      const totalBots = usersResult.filter(u => u.isBot).length;
      const totalGigChannels = channelsResult.filter(c => c.isGigChannel).length;
      const autoMatchedUsers = usersResult.filter(u => u.matchedBandChatUser && !u.isBot).length;

      const importSessionId = randomUUID();

      // Store parsed data for the import step (ZIP written to temp file)
      await storeSession(importSessionId, req.user.id, {
        zip: req.file.buffer,
        slackUsers,
        slackChannels,
        channelDirs: Object.fromEntries(channelDirs),
        workspaceId: req.params.workspaceId
      });

      res.json({
        importSessionId,
        slackUsers: usersResult,
        slackChannels: channelsResult,
        bandchatUsers: bandchatUsers.map(u => ({ id: u.id, displayName: u.displayName, email: u.email })),
        stats: {
          totalUsers: usersResult.length,
          totalBots,
          totalChannels: channelsResult.length,
          totalGigChannels,
          totalMessageFiles: Array.from(channelDirs.values()).reduce((sum, files) => sum + files.length, 0),
          autoMatchedUsers
        }
      });
    } catch (error) {
      console.error('Slack import parse error:', error);
      if (error instanceof multer.MulterError) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to parse Slack export' });
    }
  }
);

/**
 * Execute the Slack import with the admin's configuration.
 */
router.post('/workspace/:workspaceId/import', authenticate, isWorkspaceAdmin, async (req, res) => {
  const startTime = Date.now();
  const io = req.app.get('io');
  const userId = req.user.id;
  const { workspaceId } = req.params;

  try {
    const { importSessionId, userMapping, channelSelection, options } = req.body;

    if (!importSessionId) {
      return res.status(400).json({ error: 'Missing importSessionId' });
    }

    const sessionWrapper = getSession(importSessionId);
    if (!sessionWrapper) {
      return res.status(404).json({ error: 'Import session expired. Please re-upload the ZIP file.' });
    }
    if (sessionWrapper.data.workspaceId !== workspaceId) {
      return res.status(403).json({ error: 'Session does not belong to this workspace' });
    }
    if (sessionWrapper.userId !== req.user.id) {
      return res.status(403).json({ error: 'Session does not belong to this user' });
    }

    // Remove session immediately to prevent duplicate imports
    const session = sessionWrapper.data;
    const zipPath = session.zipPath;
    importSessions.delete(importSessionId);

    const {
      importBotMessages = false,
      importSystemMessages = false,
      preserveTimestamps = true,
      createGigs = true
    } = options || {};

    // Read ZIP from temp file on disk
    const zipBuffer = await fs.readFile(zipPath);
    // Clean up temp file immediately after reading
    fs.unlink(zipPath).catch(() => {});
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    const entryMap = new Map(entries.map(e => [e.entryName.replace(/\\/g, '/'), e]));

    // Build Slack user ID → display name map (for text conversion)
    const slackUserNameMap = {};
    for (const su of session.slackUsers) {
      slackUserNameMap[su.id] = su.real_name || su.profile?.real_name || su.name || su.id;
    }

    // Build Slack user ID → bot flag
    const slackBotIds = new Set(session.slackUsers.filter(u => u.is_bot).map(u => u.id));

    // Get existing channels for conflict detection
    const existingChannels = await prisma.channel.findMany({
      where: { workspaceId },
      select: { name: true }
    });
    const existingNames = new Set(existingChannels.map(c => c.name));

    // Get workspace members for channel membership
    const workspaceMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { userId: true }
    });
    const workspaceMemberIds = new Set(workspaceMembers.map(m => m.userId));

    // Copy Slack avatars to mapped BandChat users who don't have one
    const slackUserMap = new Map(session.slackUsers.map(su => [su.id, su]));
    for (const [slackId, bcId] of Object.entries(userMapping || {})) {
      if (!bcId || !workspaceMemberIds.has(bcId)) continue;
      const slackUser = slackUserMap.get(slackId);
      const slackAvatar = slackUser?.profile?.image_192 || slackUser?.profile?.image_72;
      if (!slackAvatar) continue;
      try {
        await prisma.user.updateMany({
          where: { id: bcId, avatarUrl: null },
          data: { avatarUrl: slackAvatar }
        });
      } catch {
        // Non-critical — skip avatar copy failures
      }
    }

    const results = {
      channelsCreated: 0,
      channelsSkipped: 0,
      messagesImported: 0,
      threadsImported: 0,
      reactionsImported: 0,
      gigsCreated: 0,
      errors: []
    };

    // Determine which channels to import
    const channelsToImport = session.slackChannels.filter(sc => {
      const sel = channelSelection?.[sc.name];
      return sel && sel.import !== false;
    });

    const emitProgress = (stage, current, total, detail) => {
      io.to(`user:${userId}`).emit('slack-import:progress', {
        importSessionId, stage, current, total, detail
      });
    };

    emitProgress('channels', 0, channelsToImport.length, 'Starting import...');

    for (let ci = 0; ci < channelsToImport.length; ci++) {
      const slackChannel = channelsToImport[ci];
      const channelConfig = channelSelection[slackChannel.name] || {};
      const channelType = channelConfig.type || 'channel';

      emitProgress('channels', ci + 1, channelsToImport.length, slackChannel.name);

      try {
        // Resolve channel name (handle conflicts)
        const baseName = slackChannel.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-');
        let channelName = baseName;
        if (existingNames.has(channelName)) {
          channelName = `${baseName}-slack`;
          let suffix = 2;
          while (existingNames.has(channelName)) {
            channelName = `${baseName}-slack-${suffix++}`;
          }
        }

        // Build description from purpose and topic
        const descParts = [];
        if (slackChannel.purpose?.value) descParts.push(slackChannel.purpose.value);
        if (slackChannel.topic?.value) descParts.push(`Topic: ${slackChannel.topic.value}`);
        descParts.push('(Imported from Slack)');

        // Create the channel
        const channel = await prisma.channel.create({
          data: {
            name: channelName,
            workspaceId,
            description: descParts.join(' — '),
            isPrivate: false,
            isDirect: false
          }
        });
        existingNames.add(channelName);
        results.channelsCreated++;

        // Add mapped workspace members who were in this Slack channel as channel members
        const slackMemberIds = new Set(slackChannel.members || []);
        const channelMembersToAdd = [];
        for (const [slackId, bcId] of Object.entries(userMapping || {})) {
          if (bcId && slackMemberIds.has(slackId) && workspaceMemberIds.has(bcId)) {
            channelMembersToAdd.push(bcId);
          }
        }
        if (channelMembersToAdd.length > 0) {
          await prisma.channelMember.createMany({
            data: channelMembersToAdd.map(uid => ({
              userId: uid,
              channelId: channel.id
            })),
            skipDuplicates: true
          });
        }

        // Read and import messages for this channel
        const channelDirFiles = session.channelDirs[slackChannel.name] || [];
        const allMessages = [];

        for (const filePath of channelDirFiles) {
          const entry = entryMap.get(filePath);
          if (!entry) continue;
          try {
            const msgs = JSON.parse(entry.getData().toString('utf8'));
            if (Array.isArray(msgs)) {
              allMessages.push(...msgs);
            }
          } catch {
            // Skip unparseable date files
          }
        }

        // Sort by timestamp
        allMessages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

        // Filter messages
        const filteredMessages = allMessages.filter(msg => {
          if (msg.type !== 'message') return false;
          if (!importSystemMessages && msg.subtype && SYSTEM_SUBTYPES.has(msg.subtype)) return false;
          if (!importBotMessages && (msg.subtype === 'bot_message' || slackBotIds.has(msg.user))) return false;
          // Skip file_comment, me_message subtypes that are noise
          if (msg.subtype === 'file_comment') return false;
          return true;
        });

        // Two-pass thread import
        const slackTsToDbId = new Map();
        const parentMessages = [];
        const replyMessages = [];

        for (const msg of filteredMessages) {
          const isReply = msg.thread_ts && msg.thread_ts !== msg.ts;
          if (isReply) {
            replyMessages.push(msg);
          } else {
            parentMessages.push(msg);
          }
        }

        // Pass 1: Insert parent messages in batches
        const BATCH_SIZE = 500;
        for (let i = 0; i < parentMessages.length; i += BATCH_SIZE) {
          const batch = parentMessages.slice(i, i + BATCH_SIZE);
          const messageDataBatch = batch.map(msg => buildMessageData(msg, channel.id, null, userMapping, slackUserNameMap, preserveTimestamps, workspaceMemberIds));

          const created = await prisma.$transaction(
            messageDataBatch.map(data => prisma.message.create({ data }))
          );

          for (let j = 0; j < created.length; j++) {
            slackTsToDbId.set(batch[j].ts, created[j].id);
            results.messagesImported++;
          }
        }

        // Pass 2: Insert thread replies in batches
        for (let i = 0; i < replyMessages.length; i += BATCH_SIZE) {
          const batch = replyMessages.slice(i, i + BATCH_SIZE);
          const messageDataBatch = batch.map(msg => {
            const parentId = slackTsToDbId.get(msg.thread_ts) || null;
            return buildMessageData(msg, channel.id, parentId, userMapping, slackUserNameMap, preserveTimestamps, workspaceMemberIds);
          });

          const created = await prisma.$transaction(
            messageDataBatch.map(data => prisma.message.create({ data }))
          );

          for (let j = 0; j < created.length; j++) {
            slackTsToDbId.set(batch[j].ts, created[j].id);
            results.threadsImported++;
          }
        }

        // Import reactions
        const reactionCreates = [];
        for (const msg of filteredMessages) {
          if (!msg.reactions) continue;
          const dbMessageId = slackTsToDbId.get(msg.ts);
          if (!dbMessageId) continue;

          for (const reaction of msg.reactions) {
            const emoji = slackEmojiMap[reaction.name];
            if (!emoji) continue;

            for (const slackUserId of reaction.users) {
              const bcUserId = userMapping?.[slackUserId];
              if (!bcUserId || !workspaceMemberIds.has(bcUserId)) continue;

              reactionCreates.push({
                emoji,
                userId: bcUserId,
                messageId: dbMessageId
              });
            }
          }
        }

        // Batch create reactions (skip duplicates)
        if (reactionCreates.length > 0) {
          for (let i = 0; i < reactionCreates.length; i += BATCH_SIZE) {
            const batch = reactionCreates.slice(i, i + BATCH_SIZE);
            try {
              const result = await prisma.reaction.createMany({
                data: batch,
                skipDuplicates: true
              });
              results.reactionsImported += result.count;
            } catch {
              // Some reactions may fail due to unique constraints, count what we can
            }
          }
        }

        // Create gig record if this is a gig channel
        if (channelType === 'gig' && createGigs) {
          const gigMatch = GIG_DATE_REGEX.exec(slackChannel.name);
          if (gigMatch) {
            try {
              const gigDate = new Date(gigMatch[1] + 'T00:00:00.000Z');
              const venueSlug = gigMatch[2];
              const venue = venueSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

              await prisma.gig.create({
                data: {
                  title: venue,
                  date: gigDate,
                  venue: venue,
                  type: 'GIG',
                  status: gigDate < new Date() ? 'COMPLETED' : 'SCHEDULED',
                  workspaceId,
                  createdById: userId
                }
              });
              results.gigsCreated++;
            } catch (err) {
              results.errors.push({ type: 'gig', channel: slackChannel.name, error: err.message });
            }
          }
        }
      } catch (err) {
        results.errors.push({ type: 'channel', channel: slackChannel.name, error: err.message });
        console.error(`Error importing channel ${slackChannel.name}:`, err);
      }
    }


    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    emitProgress('done', channelsToImport.length, channelsToImport.length, 'Import complete!');

    res.json({ ...results, duration });
  } catch (error) {
    console.error('Slack import error:', error);
    res.status(500).json({ error: 'Failed to import Slack data' });
  }
});

/**
 * Build a Prisma message create data object from a Slack message.
 */
function buildMessageData(msg, channelId, parentId, userMapping, slackUserNameMap, preserveTimestamps, workspaceMemberIds) {
  const rawAuthorId = userMapping?.[msg.user] || null;
  const authorId = rawAuthorId && workspaceMemberIds.has(rawAuthorId) ? rawAuthorId : null;
  const slackDisplayName = slackUserNameMap[msg.user] || msg.user_profile?.real_name || msg.user_profile?.display_name || null;

  // Convert text
  let content = convertSlackText(msg.text || '', slackUserNameMap);

  // Append file references
  if (msg.files && msg.files.length > 0) {
    const fileRefs = msg.files
      .filter(f => !f.mode || f.mode !== 'tombstone')
      .map(f => `[📎 ${f.name || f.title || 'file'}]`)
      .join(' ');
    if (fileRefs) {
      content = content ? `${content}\n${fileRefs}` : fileRefs;
    }
  }

  // If message is empty after conversion (e.g. file-only message with no text), add a placeholder
  if (!content || !content.trim()) {
    if (msg.files && msg.files.length > 0) {
      content = msg.files.map(f => `[📎 ${f.name || f.title || 'file'}]`).join(' ');
    } else {
      content = '(empty message)';
    }
  }

  const data = {
    content,
    channelId,
    authorId,
    ...(parentId && { parentId }),
    ...(!authorId && slackDisplayName && { removedUserName: slackDisplayName })
  };

  if (preserveTimestamps && msg.ts) {
    const timestamp = new Date(parseFloat(msg.ts) * 1000);
    data.createdAt = timestamp;
    data.updatedAt = msg.edited?.ts
      ? new Date(parseFloat(msg.edited.ts) * 1000)
      : timestamp;
  }

  return data;
}

// Multer error handler
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message?.includes('ZIP')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

export default router;
