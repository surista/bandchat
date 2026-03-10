import { PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getClient, R2_BUCKET_NAME } from '../lib/storage.js';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import { Resend } from 'resend';
import prisma from '../lib/prisma.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// Email alerting
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@bandchat.app';

const BACKUP_PREFIX = 'backups/';
const KEEP_DAILY = 7;
const KEEP_WEEKLY = 4;


/**
 * Create a full database backup, gzip it, and upload to R2.
 * @returns {{ key: string, size: number, timestamp: string, stats: object }}
 */
export async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `${BACKUP_PREFIX}backup-${timestamp}.json.gz`;

  // Query all data sequentially to avoid memory spikes
  // Note: passwordHash is intentionally excluded — local-auth users must use password reset after restore.
  // Google OAuth users can sign in normally.
  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, displayName: true, avatarUrl: true, bio: true,
      createdAt: true, authProvider: true, isSystemAdmin: true, emailVerified: true,
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
  const savedMessages = await prisma.savedMessage.findMany();
  const expoPushTokens = await prisma.expoPushToken.findMany();
  const threadReads = await prisma.threadRead.findMany();
  const reports = await prisma.report.findMany();
  const blockedUsers = await prisma.blockedUser.findMany();

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
      savedMessages,
      expoPushTokens,
      threadReads,
      reports,
      blockedUsers,
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

/**
 * Download and decompress a backup from R2, return stats without the full data.
 * @param {string} key - R2 object key
 * @returns {{ createdAt: string, stats: object, entityCounts: object }}
 */
export async function previewBackup(key) {
  if (!key.startsWith(BACKUP_PREFIX)) {
    throw new Error('Invalid backup key');
  }

  const client = getClient();
  const response = await client.send(new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  }));

  // Read the full stream into a buffer
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  const compressed = Buffer.concat(chunks);
  const decompressed = await gunzipAsync(compressed);
  const backup = JSON.parse(decompressed.toString('utf8'));

  // Return stats + detailed entity counts
  const data = backup.data || {};
  const entityCounts = {
    users: data.users?.length || 0,
    workspaces: data.workspaces?.length || 0,
    channels: data.channels?.length || 0,
    messages: data.messages?.length || 0,
    songs: data.songs?.length || 0,
    setlists: data.setlists?.length || 0,
    gigs: data.gigs?.length || 0,
    bandMembers: data.bandMembers?.length || 0,
    contacts: data.contacts?.length || 0,
    announcements: data.announcements?.length || 0,
    polls: data.polls?.length || 0,
    timeline: data.timeline?.length || 0,
    recordings: data.recordings?.length || 0,
    medleys: data.medleys?.length || 0,
    kitties: data.kitties?.length || 0,
    kittyTransactions: data.kittyTransactions?.length || 0,
    achievements: data.achievements?.length || 0,
    memberAchievements: data.memberAchievements?.length || 0,
    bandAchievements: data.bandAchievements?.length || 0,
    availability: data.availability?.length || 0,
    practice: data.practice?.length || 0,
    savedMessages: data.savedMessages?.length || 0,
    expoPushTokens: data.expoPushTokens?.length || 0,
    threadReads: data.threadReads?.length || 0,
    reports: data.reports?.length || 0,
    blockedUsers: data.blockedUsers?.length || 0,
  };

  return {
    version: backup.version,
    createdAt: backup.createdAt,
    stats: backup.stats || {},
    entityCounts,
  };
}

/**
 * Restore the database from a backup file stored in R2.
 * 1. Download + decompress + parse backup
 * 2. Create a safety backup first
 * 3. TRUNCATE all tables
 * 4. Re-insert data in dependency order
 * @param {string} key - R2 object key
 * @param {function} onProgress - Optional progress callback (stage, detail)
 * @returns {{ success: boolean, safetyBackupKey: string, stats: object }}
 */
export async function restoreFromBackup(key, onProgress) {
  if (!key.startsWith(BACKUP_PREFIX)) {
    throw new Error('Invalid backup key');
  }

  const emit = onProgress || (() => {});

  // Step 1: Download and decompress
  emit('downloading', 'Downloading backup from R2...');
  const client = getClient();
  const response = await client.send(new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  }));

  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  const compressed = Buffer.concat(chunks);

  emit('decompressing', 'Decompressing backup data...');
  const decompressed = await gunzipAsync(compressed);
  const backup = JSON.parse(decompressed.toString('utf8'));
  const data = backup.data;

  if (!data || !data.users) {
    throw new Error('Invalid backup format: missing data');
  }

  // Step 2: Create safety backup
  emit('safety-backup', 'Creating safety backup of current database...');
  const safetyResult = await createBackup();

  // Step 3 & 4: Truncate and restore inside a transaction
  emit('restoring', 'Truncating tables and restoring data...');

  await prisma.$transaction(async (tx) => {
    // TRUNCATE all tables in one statement with CASCADE
    await tx.$executeRawUnsafe(`
      TRUNCATE TABLE
        "PracticeSession",
        "MemberAvailability",
        "BandAchievement",
        "MemberAchievement",
        "Achievement",
        "KittyTransaction",
        "BandKitty",
        "MedleySong",
        "Medley",
        "Recording",
        "TimelineEvent",
        "PollVote",
        "PollOption",
        "Poll",
        "AnnouncementAcknowledgment",
        "Announcement",
        "Contact",
        "GigSong",
        "GigMedia",
        "GigSetlist",
        "GigAttendee",
        "Gig",
        "SetlistPerformer",
        "SetlistSong",
        "Setlist",
        "SavedMessage",
        "PinnedMessage",
        "Reaction",
        "ThreadRead",
        "Attachment",
        "Message",
        "ChannelMember",
        "Channel",
        "InstrumentStint",
        "BandMember",
        "SongAttachment",
        "Song",
        "ChannelGroup",
        "WorkspaceMember",
        "Workspace",
        "ExpoPushToken",
        "PushSubscription",
        "RefreshToken",
        "Report",
        "BlockedUser",
        "User"
      CASCADE
    `);

    const BATCH = 500;

    // --- Users ---
    emit('restoring', `Inserting ${data.users.length} users...`);
    for (let i = 0; i < data.users.length; i += BATCH) {
      const batch = data.users.slice(i, i + BATCH);
      await Promise.all(batch.map(u =>
        tx.user.create({
          data: {
            id: u.id,
            email: u.email,
            displayName: u.displayName,
            avatarUrl: u.avatarUrl || null,
            bio: u.bio || null,
            createdAt: new Date(u.createdAt),
            authProvider: u.authProvider,
            isSystemAdmin: u.isSystemAdmin || false,
            emailVerified: u.emailVerified || false,
          }
        })
      ));
    }

    // --- Workspaces (without nested relations first) ---
    emit('restoring', `Inserting ${data.workspaces.length} workspaces...`);
    for (const ws of data.workspaces) {
      await tx.workspace.create({
        data: {
          id: ws.id,
          name: ws.name,
          slug: ws.slug || null,
          inviteCode: ws.inviteCode,
          inviteCodeExpiresAt: ws.inviteCodeExpiresAt ? new Date(ws.inviteCodeExpiresAt) : null,
          inviteMaxUses: ws.inviteMaxUses ?? null,
          inviteUsedCount: ws.inviteUsedCount ?? 0,
          storageUsedBytes: ws.storageUsedBytes ? BigInt(ws.storageUsedBytes) : 0n,
          calendarToken: ws.calendarToken || null,
          currency: ws.currency || 'USD',
          defaultEventType: ws.defaultEventType || 'GIG',
          defaultStartTime: ws.defaultStartTime || '19:00',
          defaultEndTime: ws.defaultEndTime || '21:00',
          defaultVenue: ws.defaultVenue || null,
          plan: ws.plan || 'FREE',
          planSource: ws.planSource || null,
          planProductId: ws.planProductId || null,
          planExpiresAt: ws.planExpiresAt ? new Date(ws.planExpiresAt) : null,
          planOriginalTxId: ws.planOriginalTxId || null,
          planUpdatedAt: ws.planUpdatedAt ? new Date(ws.planUpdatedAt) : null,
          createdAt: new Date(ws.createdAt),
          updatedAt: ws.updatedAt ? new Date(ws.updatedAt) : new Date(ws.createdAt),
        }
      });

      // WorkspaceMembers
      if (ws.members?.length) {
        await tx.workspaceMember.createMany({
          data: ws.members.map(m => ({
            userId: m.userId,
            workspaceId: ws.id,
            role: m.role,
            joinedAt: m.joinedAt ? new Date(m.joinedAt) : new Date(),
          })),
          skipDuplicates: true,
        });
      }

      // ChannelGroups
      if (ws.channelGroups?.length) {
        await tx.channelGroup.createMany({
          data: ws.channelGroups.map(g => ({
            id: g.id,
            name: g.name,
            position: g.position,
            isCollapsed: g.isCollapsed || false,
            workspaceId: ws.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    // --- Channels ---
    emit('restoring', `Inserting ${data.channels.length} channels...`);
    for (let i = 0; i < data.channels.length; i += BATCH) {
      const batch = data.channels.slice(i, i + BATCH);
      await tx.channel.createMany({
        data: batch.map(ch => ({
          id: ch.id,
          name: ch.name,
          description: ch.description || null,
          isPrivate: ch.isPrivate || false,
          isDirect: ch.isDirect || false,
          workspaceId: ch.workspaceId,
          channelGroupId: ch.channelGroupId || null,
          createdAt: new Date(ch.createdAt),
          updatedAt: ch.updatedAt ? new Date(ch.updatedAt) : new Date(ch.createdAt),
        })),
        skipDuplicates: true,
      });

      // ChannelMembers for this batch
      const memberData = batch.flatMap(ch =>
        (ch.members || []).map(m => ({
          userId: m.userId,
          channelId: ch.id,
          lastReadAt: m.lastReadAt ? new Date(m.lastReadAt) : null,
        }))
      );
      if (memberData.length) {
        await tx.channelMember.createMany({ data: memberData, skipDuplicates: true });
      }
    }

    // --- Songs ---
    emit('restoring', `Inserting ${data.songs.length} songs...`);
    for (let i = 0; i < data.songs.length; i += BATCH) {
      const batch = data.songs.slice(i, i + BATCH);
      for (const s of batch) {
        await tx.song.create({
          data: {
            id: s.id,
            title: s.title,
            shortName: s.shortName || null,
            artist: s.artist || null,
            duration: s.duration || null,
            key: s.key || null,
            bpm: s.bpm || null,
            notes: s.notes || null,
            lyrics: s.lyrics || null,
            arrangement: s.arrangement || null,
            youtubeUrl: s.youtubeUrl || null,
            spotifyUrl: s.spotifyUrl || null,
            workspaceId: s.workspaceId,
            createdById: s.createdById || null,
            removedCreatorName: s.removedCreatorName || null,
            createdAt: new Date(s.createdAt),
            updatedAt: s.updatedAt ? new Date(s.updatedAt) : new Date(s.createdAt),
          }
        });

        // SongAttachments
        if (s.attachments?.length) {
          await tx.songAttachment.createMany({
            data: s.attachments.map(a => ({
              id: a.id,
              url: a.url,
              name: a.name || null,
              type: a.type || 'FILE',
              size: a.size || null,
              songId: s.id,
              uploadedById: a.uploadedById || null,
              createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    // --- BandMembers ---
    emit('restoring', `Inserting ${data.bandMembers.length} band members...`);
    for (const bm of data.bandMembers) {
      await tx.bandMember.create({
        data: {
          id: bm.id,
          name: bm.name,
          imageUrl: bm.imageUrl || null,
          notes: bm.notes || null,
          isGuest: bm.isGuest || false,
          linkedUserId: bm.linkedUserId || null,
          userId: bm.userId || null,
          workspaceId: bm.workspaceId,
          createdAt: bm.createdAt ? new Date(bm.createdAt) : new Date(),
          updatedAt: bm.updatedAt ? new Date(bm.updatedAt) : new Date(),
        }
      });

      if (bm.stints?.length) {
        await tx.instrumentStint.createMany({
          data: bm.stints.map(s => ({
            id: s.id,
            instruments: s.instruments || (s.instrument ? [s.instrument] : []),
            startDate: s.startDate ? new Date(s.startDate) : null,
            endDate: s.endDate ? new Date(s.endDate) : null,
            bandMemberId: bm.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    // --- Messages (batched) ---
    emit('restoring', `Inserting ${data.messages.length} messages...`);
    // First pass: messages without parentId (or all, since parentId refs other messages)
    // Sort by createdAt to ensure parents come before children
    const sortedMessages = [...data.messages].sort((a, b) =>
      new Date(a.createdAt) - new Date(b.createdAt)
    );

    for (let i = 0; i < sortedMessages.length; i += BATCH) {
      const batch = sortedMessages.slice(i, i + BATCH);
      for (const msg of batch) {
        await tx.message.create({
          data: {
            id: msg.id,
            content: msg.content,
            channelId: msg.channelId,
            authorId: msg.authorId || null,
            parentId: msg.parentId || null,
            removedUserName: msg.removedUserName || null,
            isEdited: msg.isEdited || false,
            createdAt: new Date(msg.createdAt),
            updatedAt: msg.updatedAt ? new Date(msg.updatedAt) : new Date(msg.createdAt),
          }
        });

        // Attachments
        if (msg.attachments?.length) {
          await tx.attachment.createMany({
            data: msg.attachments.map(a => ({
              id: a.id,
              url: a.url,
              filename: a.filename || null,
              type: a.type || 'FILE',
              size: a.size || null,
              messageId: msg.id,
              createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
            })),
            skipDuplicates: true,
          });
        }

        // Reactions
        if (msg.reactions?.length) {
          await tx.reaction.createMany({
            data: msg.reactions.map(r => ({
              id: r.id,
              emoji: r.emoji,
              userId: r.userId,
              messageId: msg.id,
              createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
            })),
            skipDuplicates: true,
          });
        }
      }

      if (i % 5000 === 0 && i > 0) {
        emit('restoring', `Inserted ${i} of ${sortedMessages.length} messages...`);
      }
    }

    // --- PinnedMessages ---
    const pinnedData = data.channels.flatMap(ch =>
      (ch.pinnedMessages || []).map(pm => ({
        id: pm.id,
        messageId: pm.messageId || pm.message?.id,
        channelId: ch.id,
        pinnedById: pm.pinnedById || pm.pinnedBy?.id || null,
        pinnedAt: pm.pinnedAt ? new Date(pm.pinnedAt) : new Date(),
      }))
    ).filter(pm => pm.messageId);
    if (pinnedData.length) {
      emit('restoring', `Inserting ${pinnedData.length} pinned messages...`);
      await tx.pinnedMessage.createMany({ data: pinnedData, skipDuplicates: true });
    }

    // --- Setlists ---
    emit('restoring', `Inserting ${data.setlists.length} setlists...`);
    for (const sl of data.setlists) {
      await tx.setlist.create({
        data: {
          id: sl.id,
          name: sl.name,
          description: sl.description || null,
          performedAt: sl.performedAt ? new Date(sl.performedAt) : null,
          venue: sl.venue || null,
          startTime: sl.startTime || null,
          workspaceId: sl.workspaceId,
          createdById: sl.createdById || null,
          removedCreatorName: sl.removedCreatorName || null,
          createdAt: sl.createdAt ? new Date(sl.createdAt) : new Date(),
          updatedAt: sl.updatedAt ? new Date(sl.updatedAt) : new Date(),
        }
      });

      if (sl.songs?.length) {
        await tx.setlistSong.createMany({
          data: sl.songs.map(ss => ({
            id: ss.id,
            position: ss.position,
            type: ss.type || 'SONG',
            label: ss.label || null,
            songId: ss.songId || ss.song?.id || null,
            setlistId: sl.id,
          })),
          skipDuplicates: true,
        });
      }

      if (sl.performers?.length) {
        await tx.setlistPerformer.createMany({
          data: sl.performers.map(p => ({
            id: p.id,
            setlistId: sl.id,
            bandMemberId: p.bandMemberId || p.bandMember?.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    // --- Gigs ---
    emit('restoring', `Inserting ${data.gigs.length} gigs...`);
    for (const g of data.gigs) {
      await tx.gig.create({
        data: {
          id: g.id,
          title: g.title,
          type: g.type || 'GIG',
          date: new Date(g.date),
          endDate: g.endDate ? new Date(g.endDate) : null,
          venue: g.venue || null,
          address: g.address || null,
          notes: g.notes || null,
          pay: g.pay || null,
          status: g.status || 'SCHEDULED',
          isLocked: g.isLocked || false,
          workspaceId: g.workspaceId,
          createdById: g.createdById || null,
          removedCreatorName: g.removedCreatorName || null,
          createdAt: g.createdAt ? new Date(g.createdAt) : new Date(),
          updatedAt: g.updatedAt ? new Date(g.updatedAt) : new Date(),
        }
      });

      if (g.attendees?.length) {
        await tx.gigAttendee.createMany({
          data: g.attendees.map(a => ({
            id: a.id,
            gigId: g.id,
            bandMemberId: a.bandMemberId,
            status: a.status || 'PENDING',
          })),
          skipDuplicates: true,
        });
      }

      if (g.setlists?.length) {
        await tx.gigSetlist.createMany({
          data: g.setlists.map(gs => ({
            id: gs.id,
            gigId: g.id,
            setlistId: gs.setlistId,
            setNumber: gs.setNumber || 1,
          })),
          skipDuplicates: true,
        });
      }

      if (g.media?.length) {
        await tx.gigMedia.createMany({
          data: g.media.map(m => ({
            id: m.id,
            url: m.url,
            type: m.type || 'IMAGE',
            caption: m.caption || null,
            size: m.size || null,
            gigId: g.id,
            uploadedById: m.uploadedById || null,
            createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
          })),
          skipDuplicates: true,
        });
      }

      if (g.songsPlayed?.length) {
        await tx.gigSong.createMany({
          data: g.songsPlayed.map(gs => ({
            id: gs.id,
            gigId: g.id,
            songId: gs.songId,
            position: gs.position ?? 0,
          })),
          skipDuplicates: true,
        });
      }
    }

    // --- Contacts ---
    if (data.contacts?.length) {
      emit('restoring', `Inserting ${data.contacts.length} contacts...`);
      await tx.contact.createMany({
        data: data.contacts.map(c => ({
          id: c.id,
          name: c.name,
          category: c.category || null,
          email: c.email || null,
          phone: c.phone || null,
          website: c.website || null,
          address: c.address || null,
          notes: c.notes || null,
          workspaceId: c.workspaceId,
          createdById: c.createdById || null,
          removedCreatorName: c.removedCreatorName || null,
          createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
        })),
        skipDuplicates: true,
      });
    }

    // --- Announcements ---
    if (data.announcements?.length) {
      emit('restoring', `Inserting ${data.announcements.length} announcements...`);
      for (const a of data.announcements) {
        await tx.announcement.create({
          data: {
            id: a.id,
            title: a.title,
            content: a.content,
            priority: a.priority || 'NORMAL',
            isPinned: a.isPinned || false,
            expiresAt: a.expiresAt ? new Date(a.expiresAt) : null,
            workspaceId: a.workspaceId,
            createdById: a.createdById || null,
            removedCreatorName: a.removedCreatorName || null,
            createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
          }
        });

        if (a.acknowledgments?.length) {
          await tx.announcementAcknowledgment.createMany({
            data: a.acknowledgments.map(ack => ({
              id: ack.id,
              announcementId: a.id,
              userId: ack.userId,
              acknowledgedAt: ack.acknowledgedAt ? new Date(ack.acknowledgedAt) : new Date(),
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    // --- Polls ---
    if (data.polls?.length) {
      emit('restoring', `Inserting ${data.polls.length} polls...`);
      for (const p of data.polls) {
        await tx.poll.create({
          data: {
            id: p.id,
            question: p.question,
            description: p.description || null,
            allowMultiple: p.allowMultiple || false,
            isAnonymous: p.isAnonymous || false,
            isClosed: p.isClosed || false,
            workspaceId: p.workspaceId,
            createdById: p.createdById || null,
            removedCreatorName: p.removedCreatorName || null,
            createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
          }
        });

        if (p.options?.length) {
          for (const opt of p.options) {
            await tx.pollOption.create({
              data: {
                id: opt.id,
                text: opt.text,
                position: opt.position ?? 0,
                pollId: p.id,
              }
            });

            if (opt.votes?.length) {
              await tx.pollVote.createMany({
                data: opt.votes.map(v => ({
                  id: v.id,
                  optionId: opt.id,
                  userId: v.userId,
                  createdAt: v.createdAt ? new Date(v.createdAt) : new Date(),
                })),
                skipDuplicates: true,
              });
            }
          }
        }
      }
    }

    // --- Timeline Events ---
    if (data.timeline?.length) {
      emit('restoring', `Inserting ${data.timeline.length} timeline events...`);
      await tx.timelineEvent.createMany({
        data: data.timeline.map(t => ({
          id: t.id,
          title: t.title,
          description: t.description || null,
          eventType: t.eventType || 'OTHER',
          eventDate: new Date(t.eventDate),
          imageUrl: t.imageUrl || null,
          workspaceId: t.workspaceId,
          createdById: t.createdById || null,
          removedCreatorName: t.removedCreatorName || null,
          createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
        })),
        skipDuplicates: true,
      });
    }

    // --- Recordings ---
    if (data.recordings?.length) {
      emit('restoring', `Inserting ${data.recordings.length} recordings...`);
      await tx.recording.createMany({
        data: data.recordings.map(r => ({
          id: r.id,
          title: r.title,
          description: r.description || null,
          url: r.url,
          type: r.type || 'AUDIO',
          duration: r.duration || null,
          size: r.size || null,
          songId: r.songId || null,
          workspaceId: r.workspaceId,
          createdById: r.createdById || null,
          removedCreatorName: r.removedCreatorName || null,
          createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
        })),
        skipDuplicates: true,
      });
    }

    // --- Medleys ---
    if (data.medleys?.length) {
      emit('restoring', `Inserting ${data.medleys.length} medleys...`);
      for (const m of data.medleys) {
        await tx.medley.create({
          data: {
            id: m.id,
            name: m.name,
            description: m.description || null,
            workspaceId: m.workspaceId,
            createdById: m.createdById || null,
            removedCreatorName: m.removedCreatorName || null,
            createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
          }
        });

        if (m.songs?.length) {
          await tx.medleySong.createMany({
            data: m.songs.map(ms => ({
              id: ms.id,
              medleyId: m.id,
              songId: ms.songId,
              position: ms.position ?? 0,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    // --- Band Kitty ---
    if (data.kitties?.length) {
      emit('restoring', `Inserting ${data.kitties.length} kitties...`);
      await tx.bandKitty.createMany({
        data: data.kitties.map(k => ({
          id: k.id,
          startingBalance: k.startingBalance ?? 0,
          currency: k.currency || 'USD',
          workspaceId: k.workspaceId,
          createdAt: k.createdAt ? new Date(k.createdAt) : new Date(),
        })),
        skipDuplicates: true,
      });
    }

    if (data.kittyTransactions?.length) {
      emit('restoring', `Inserting ${data.kittyTransactions.length} kitty transactions...`);
      await tx.kittyTransaction.createMany({
        data: data.kittyTransactions.map(t => ({
          id: t.id,
          type: t.type,
          category: t.category || null,
          amount: t.amount,
          description: t.description || null,
          date: new Date(t.date),
          kittyId: t.kittyId,
          createdById: t.createdById || null,
          removedCreatorName: t.removedCreatorName || null,
          createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
        })),
        skipDuplicates: true,
      });
    }

    // --- Achievements ---
    if (data.achievements?.length) {
      emit('restoring', `Inserting ${data.achievements.length} achievements...`);
      await tx.achievement.createMany({
        data: data.achievements.map(a => ({
          id: a.id,
          name: a.name,
          description: a.description || null,
          icon: a.icon || null,
          category: a.category || null,
        })),
        skipDuplicates: true,
      });
    }

    if (data.memberAchievements?.length) {
      await tx.memberAchievement.createMany({
        data: data.memberAchievements.map(a => ({
          id: a.id,
          userId: a.userId,
          achievementId: a.achievementId,
          workspaceId: a.workspaceId,
          earnedAt: a.earnedAt ? new Date(a.earnedAt) : new Date(),
        })),
        skipDuplicates: true,
      });
    }

    if (data.bandAchievements?.length) {
      await tx.bandAchievement.createMany({
        data: data.bandAchievements.map(a => ({
          id: a.id,
          achievementId: a.achievementId,
          workspaceId: a.workspaceId,
          earnedAt: a.earnedAt ? new Date(a.earnedAt) : new Date(),
        })),
        skipDuplicates: true,
      });
    }

    // --- Availability ---
    if (data.availability?.length) {
      emit('restoring', `Inserting ${data.availability.length} availability records...`);
      await tx.memberAvailability.createMany({
        data: data.availability.map(a => ({
          id: a.id,
          userId: a.userId,
          workspaceId: a.workspaceId,
          date: new Date(a.date),
          status: a.status || 'AVAILABLE',
          note: a.note || null,
        })),
        skipDuplicates: true,
      });
    }

    // --- Practice Sessions ---
    if (data.practice?.length) {
      emit('restoring', `Inserting ${data.practice.length} practice sessions...`);
      await tx.practiceSession.createMany({
        data: data.practice.map(p => ({
          id: p.id,
          userId: p.userId,
          workspaceId: p.workspaceId,
          date: new Date(p.date),
          durationMinutes: p.durationMinutes || 0,
          notes: p.notes || null,
          createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
        })),
        skipDuplicates: true,
      });
    }

    // --- Saved Messages ---
    if (data.savedMessages?.length) {
      emit('restoring', `Inserting ${data.savedMessages.length} saved messages...`);
      await tx.savedMessage.createMany({
        data: data.savedMessages.map(sm => ({
          id: sm.id,
          userId: sm.userId,
          messageId: sm.messageId,
          createdAt: sm.createdAt ? new Date(sm.createdAt) : new Date(),
        })),
        skipDuplicates: true,
      });
    }

    // --- Expo Push Tokens ---
    if (data.expoPushTokens?.length) {
      emit('restoring', `Inserting ${data.expoPushTokens.length} expo push tokens...`);
      await tx.expoPushToken.createMany({
        data: data.expoPushTokens.map(t => ({
          id: t.id,
          userId: t.userId,
          token: t.token,
          platform: t.platform,
          createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
        })),
        skipDuplicates: true,
      });
    }

    // --- Thread Reads ---
    if (data.threadReads?.length) {
      emit('restoring', `Inserting ${data.threadReads.length} thread reads...`);
      await tx.threadRead.createMany({
        data: data.threadReads.map(tr => ({
          userId: tr.userId,
          messageId: tr.messageId,
          lastRead: tr.lastRead ? new Date(tr.lastRead) : new Date(),
        })),
        skipDuplicates: true,
      });
    }

    // --- Reports ---
    if (data.reports?.length) {
      emit('restoring', `Inserting ${data.reports.length} reports...`);
      await tx.report.createMany({
        data: data.reports.map(r => ({
          id: r.id,
          reporterId: r.reporterId,
          messageId: r.messageId,
          reason: r.reason,
          createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
        })),
        skipDuplicates: true,
      });
    }

    // --- Blocked Users ---
    if (data.blockedUsers?.length) {
      emit('restoring', `Inserting ${data.blockedUsers.length} blocked users...`);
      await tx.blockedUser.createMany({
        data: data.blockedUsers.map(b => ({
          id: b.id,
          blockerId: b.blockerId,
          blockedUserId: b.blockedUserId,
          createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
        })),
        skipDuplicates: true,
      });
    }

    emit('restoring', 'Finalizing restore...');
  }, {
    timeout: 600000, // 10 minute timeout for large restores
    maxWait: 60000,
  });

  emit('done', 'Restore complete!');

  return {
    success: true,
    safetyBackupKey: safetyResult.key,
    stats: backup.stats,
  };
}

/**
 * Verify a backup by reading it back and checking structure + integrity.
 * @param {string} key - R2 object key
 * @returns {{ valid: boolean, errors: string[], entityCounts: object }}
 */
export async function verifyBackup(key) {
  const errors = [];

  try {
    if (!key.startsWith(BACKUP_PREFIX)) {
      return { valid: false, errors: ['Invalid backup key'], entityCounts: {} };
    }

    const client = getClient();
    const response = await client.send(new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }));

    // Read the full stream
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const compressed = Buffer.concat(chunks);

    // Verify decompression
    let decompressed;
    try {
      decompressed = await gunzipAsync(compressed);
    } catch (err) {
      return { valid: false, errors: ['Failed to decompress: ' + err.message], entityCounts: {} };
    }

    // Verify JSON parsing
    let backup;
    try {
      backup = JSON.parse(decompressed.toString('utf8'));
    } catch (err) {
      return { valid: false, errors: ['Failed to parse JSON: ' + err.message], entityCounts: {} };
    }

    // Check required structure
    if (!backup.version) errors.push('Missing version field');
    if (!backup.createdAt) errors.push('Missing createdAt field');
    if (!backup.data) errors.push('Missing data field');
    if (!backup.stats) errors.push('Missing stats field');

    if (!backup.data) {
      return { valid: false, errors, entityCounts: {} };
    }

    const data = backup.data;
    const entityCounts = {
      users: data.users?.length || 0,
      workspaces: data.workspaces?.length || 0,
      channels: data.channels?.length || 0,
      messages: data.messages?.length || 0,
      songs: data.songs?.length || 0,
      setlists: data.setlists?.length || 0,
      gigs: data.gigs?.length || 0,
      bandMembers: data.bandMembers?.length || 0,
    };

    // Basic sanity checks
    if (entityCounts.users === 0) errors.push('No users in backup');
    if (entityCounts.workspaces === 0) errors.push('No workspaces in backup');

    // Verify stats match actual counts
    if (backup.stats.users !== entityCounts.users) {
      errors.push(`Stats mismatch: users (${backup.stats.users} vs ${entityCounts.users})`);
    }
    if (backup.stats.messages !== entityCounts.messages) {
      errors.push(`Stats mismatch: messages (${backup.stats.messages} vs ${entityCounts.messages})`);
    }

    return {
      valid: errors.length === 0,
      errors,
      entityCounts,
      size: compressed.length,
      uncompressedSize: decompressed.length,
    };
  } catch (err) {
    return { valid: false, errors: ['Verification failed: ' + err.message], entityCounts: {} };
  }
}

/**
 * Send an email alert for backup failures.
 * @param {string} type - 'failure' or 'verification_failed'
 * @param {object} details - Error details
 */
function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function sendBackupAlert(type, details) {
  if (!resend) {
    console.warn('Cannot send backup alert: Resend not configured');
    return;
  }

  const subject = type === 'failure'
    ? '[BandChat] Backup Failed'
    : '[BandChat] Backup Verification Failed';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #ef4444;">${type === 'failure' ? 'Backup Failed' : 'Backup Verification Failed'}</h2>
      <p>A scheduled backup encountered an issue:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px 0; color: #6b7280; width: 120px;">Time</td><td style="padding: 8px 0; font-weight: 600;">${new Date().toISOString()}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Error</td><td style="padding: 8px 0; font-weight: 600; color: #ef4444;">${escapeHtml(details.error || 'Unknown')}</td></tr>
        ${details.key ? `<tr><td style="padding: 8px 0; color: #6b7280;">Backup Key</td><td style="padding: 8px 0;">${escapeHtml(details.key)}</td></tr>` : ''}
        ${details.errors?.length ? `<tr><td style="padding: 8px 0; color: #6b7280;">Details</td><td style="padding: 8px 0;">${details.errors.map(e => escapeHtml(e)).join('<br>')}</td></tr>` : ''}
      </table>
      <p style="color: #6b7280; font-size: 14px;">Please check the server logs and R2 storage for more details.</p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: `BandChat <noreply@${process.env.RESEND_DOMAIN || 'resend.dev'}>`,
      to: ADMIN_EMAIL,
      subject,
      html,
    });
    console.log(`Backup alert sent to ${ADMIN_EMAIL}`);
  } catch (err) {
    console.error('Failed to send backup alert email:', err);
  }
}

/**
 * Create a backup with automatic verification and alerting.
 * @returns {{ key: string, size: number, timestamp: string, stats: object, verified: boolean }}
 */
export async function createBackupWithVerification() {
  const result = await createBackup();

  // Verify the backup
  const verification = await verifyBackup(result.key);

  if (!verification.valid) {
    console.error('Backup verification failed:', verification.errors);
    await sendBackupAlert('verification_failed', {
      key: result.key,
      errors: verification.errors,
    });
  }

  return {
    ...result,
    verified: verification.valid,
    verificationErrors: verification.errors,
  };
}
