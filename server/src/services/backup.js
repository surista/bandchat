import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { promisify } from 'util';
import { gzip } from 'zlib';
import prisma from '../lib/prisma.js';

const gzipAsync = promisify(gzip);

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'bandchat';

const BACKUP_PREFIX = 'backups/';
const KEEP_DAILY = 7;
const KEEP_WEEKLY = 4;

let s3Client = null;

function getClient() {
  if (!s3Client) {
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 storage not configured');
    }
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

/**
 * Create a full database backup, gzip it, and upload to R2.
 * @returns {{ key: string, size: number, timestamp: string, stats: object }}
 */
export async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `${BACKUP_PREFIX}backup-${timestamp}.json.gz`;

  // Query all data sequentially to avoid memory spikes
  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, displayName: true, avatarUrl: true, bio: true,
      createdAt: true, authProvider: true, isSystemAdmin: true,
    }
  });

  const workspaces = await prisma.workspace.findMany({
    include: {
      members: { include: { user: { select: { id: true, displayName: true, email: true } } } },
      channelGroups: true,
    }
  });

  // Channels (without messages — fetched separately in batches)
  const channels = await prisma.channel.findMany({
    include: {
      members: { include: { user: { select: { id: true, displayName: true } } } },
      pinnedMessages: { include: { message: { select: { id: true } }, pinnedBy: { select: { id: true, displayName: true } } } },
    }
  });

  // Messages in batches of 5000
  const messages = [];
  let skip = 0;
  const batchSize = 5000;
  while (true) {
    const batch = await prisma.message.findMany({
      include: {
        attachments: true,
        reactions: { include: { user: { select: { id: true, displayName: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      skip,
      take: batchSize,
    });
    messages.push(...batch);
    if (batch.length < batchSize) break;
    skip += batchSize;
  }

  const songs = await prisma.song.findMany({
    include: { attachments: true }
  });

  const setlists = await prisma.setlist.findMany({
    include: {
      songs: { include: { song: { select: { id: true, title: true } } }, orderBy: { position: 'asc' } },
      performers: { include: { bandMember: { select: { id: true, name: true } } } },
    }
  });

  const gigs = await prisma.gig.findMany({
    include: {
      attendees: true,
      media: true,
      setlists: true,
      songsPlayed: true,
    }
  });

  const bandMembers = await prisma.bandMember.findMany({
    include: { stints: true }
  });

  const contacts = await prisma.contact.findMany();
  const announcements = await prisma.announcement.findMany({
    include: { acknowledgments: true }
  });
  const polls = await prisma.poll.findMany({
    include: { options: { include: { votes: true } } }
  });
  const timeline = await prisma.timelineEvent.findMany();
  const recordings = await prisma.recording.findMany();
  const medleys = await prisma.medley.findMany({
    include: { songs: true }
  });
  const kitties = await prisma.bandKitty.findMany();
  const kittyTransactions = await prisma.kittyTransaction.findMany();
  const achievements = await prisma.achievement.findMany();
  const memberAchievements = await prisma.memberAchievement.findMany();
  const bandAchievements = await prisma.bandAchievement.findMany();
  const availability = await prisma.memberAvailability.findMany();
  const practice = await prisma.practiceSession.findMany();

  const backup = {
    version: 1,
    createdAt: new Date().toISOString(),
    stats: {
      users: users.length,
      workspaces: workspaces.length,
      channels: channels.length,
      messages: messages.length,
      songs: songs.length,
      setlists: setlists.length,
      gigs: gigs.length,
    },
    data: {
      users,
      workspaces,
      channels,
      messages,
      songs,
      setlists,
      gigs,
      bandMembers,
      contacts,
      announcements,
      polls,
      timeline,
      recordings,
      medleys,
      kitties,
      kittyTransactions,
      achievements,
      memberAchievements,
      bandAchievements,
      availability,
      practice,
    }
  };

  const json = JSON.stringify(backup);
  const compressed = await gzipAsync(Buffer.from(json));

  const client = getClient();
  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: compressed,
    ContentType: 'application/gzip',
  }));

  return {
    key,
    size: compressed.length,
    uncompressedSize: json.length,
    timestamp: new Date().toISOString(),
    stats: backup.stats,
  };
}

/**
 * List all backups stored in R2.
 * @returns {Array<{ key: string, size: number, lastModified: Date }>}
 */
export async function listBackups() {
  const client = getClient();
  const objects = [];
  let continuationToken;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: BACKUP_PREFIX,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));

    if (response.Contents) {
      for (const obj of response.Contents) {
        objects.push({
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified,
        });
      }
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  // Sort newest first
  objects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
  return objects;
}

/**
 * Stream a backup file from R2.
 * @param {string} key - R2 object key
 * @returns {ReadableStream}
 */
export async function getBackupStream(key) {
  // Validate key is within backups prefix to prevent path traversal
  if (!key.startsWith(BACKUP_PREFIX)) {
    throw new Error('Invalid backup key');
  }

  const client = getClient();
  const response = await client.send(new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  }));

  return {
    stream: response.Body,
    size: response.ContentLength,
    contentType: response.ContentType,
  };
}

/**
 * Delete old backups beyond the retention policy.
 * Keeps KEEP_DAILY most recent daily backups + KEEP_WEEKLY weekly backups (Sundays).
 */
export async function cleanupOldBackups() {
  const backups = await listBackups(); // already sorted newest first
  if (backups.length === 0) return { deleted: 0 };

  const keep = new Set();

  // Keep the N most recent daily backups
  for (let i = 0; i < Math.min(KEEP_DAILY, backups.length); i++) {
    keep.add(backups[i].key);
  }

  // Keep the most recent backup from each of the last KEEP_WEEKLY weeks (by Sunday)
  const weeklySeen = new Set();
  for (const backup of backups) {
    const date = new Date(backup.lastModified);
    // Get the Sunday of that week
    const sunday = new Date(date);
    sunday.setDate(sunday.getDate() - sunday.getDay());
    const weekKey = sunday.toISOString().slice(0, 10);

    if (!weeklySeen.has(weekKey) && weeklySeen.size < KEEP_WEEKLY) {
      weeklySeen.add(weekKey);
      keep.add(backup.key);
    }
  }

  // Delete everything not in the keep set
  const toDelete = backups.filter(b => !keep.has(b.key));
  const client = getClient();

  for (const backup of toDelete) {
    await client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: backup.key,
    }));
  }

  return { deleted: toDelete.length, kept: keep.size };
}
