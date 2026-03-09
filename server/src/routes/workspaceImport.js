import express from 'express';
import multer from 'multer';
import { randomUUID, randomBytes } from 'crypto';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { isAllowedUploadUrl } from '../lib/validateUrl.js';

const router = express.Router();

// In-memory session storage with 30min TTL
const importSessions = new Map();
const SESSION_TTL = 30 * 60 * 1000;

function storeSession(id, userId, data) {
  // Remove any existing session for this user
  for (const [key, val] of importSessions) {
    if (val.userId === userId) {
      importSessions.delete(key);
    }
  }
  importSessions.set(id, { data, userId, createdAt: Date.now() });
  setTimeout(() => importSessions.delete(id), SESSION_TTL);
}

function getSession(id) {
  return importSessions.get(id) || null;
}

// Validate a URL is from an allowed provider, return null if invalid
function safeUrl(url) {
  if (!url) return null;
  const { valid } = isAllowedUploadUrl(url);
  return valid ? url : null;
}

// Multer for JSON upload (50MB limit)
const jsonUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'), false);
    }
  }
});

/**
 * POST /api/workspace-import/parse
 * Upload and parse a BandChat workspace export JSON.
 * Returns session ID, member mapping suggestions, and stats.
 */
router.post('/parse', authenticate, jsonUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No JSON file uploaded' });
    }

    let exportData;
    try {
      exportData = JSON.parse(req.file.buffer.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON file' });
    }

    // Validate structure
    if (!exportData.workspace || !exportData.members || !exportData.channels) {
      return res.status(400).json({ error: 'Invalid BandChat export format. Missing workspace, members, or channels.' });
    }

    // Auto-match members by email (only users who share a workspace with the requester)
    const coworkerLinks = await prisma.workspaceMember.findMany({
      where: { workspace: { members: { some: { userId: req.user.id } } } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const coworkerIds = new Set(coworkerLinks.map(c => c.userId));
    coworkerIds.add(req.user.id);

    const allBandChatUsers = await prisma.user.findMany({
      where: { id: { in: [...coworkerIds] } },
      select: { id: true, displayName: true, email: true }
    });
    const emailMap = new Map(allBandChatUsers.map(u => [u.email?.toLowerCase(), u]));

    const memberMapping = exportData.members.map(m => {
      const matched = m.email ? emailMap.get(m.email.toLowerCase()) || null : null;
      return {
        displayName: m.displayName,
        email: m.email || null,
        role: m.role || 'MEMBER',
        matchedUser: matched ? { id: matched.id, displayName: matched.displayName, email: matched.email } : null
      };
    });

    // Compute stats
    const totalMessages = (exportData.channels || []).reduce((sum, ch) => sum + (ch.messages?.length || 0), 0);
    const totalDMs = (exportData.directMessages || []).reduce((sum, ch) => sum + (ch.messages?.length || 0), 0);

    const stats = {
      members: exportData.members?.length || 0,
      channels: exportData.channels?.length || 0,
      messages: totalMessages,
      directMessages: totalDMs,
      songs: exportData.songs?.length || 0,
      setlists: exportData.setlists?.length || 0,
      gigs: exportData.gigs?.length || 0,
      bandMembers: exportData.bandMembers?.length || 0,
      contacts: exportData.contacts?.length || 0,
      announcements: exportData.announcements?.length || 0,
      polls: exportData.polls?.length || 0,
      timeline: exportData.timeline?.length || 0,
      recordings: exportData.recordings?.length || 0,
      medleys: exportData.medleys?.length || 0,
      hasKitty: !!exportData.kitty,
      autoMatchedMembers: memberMapping.filter(m => m.matchedUser).length,
    };

    const sessionId = randomUUID();
    storeSession(sessionId, req.user.id, exportData);

    res.json({
      sessionId,
      memberMapping,
      stats,
      bandchatUsers: allBandChatUsers.map(u => ({ id: u.id, displayName: u.displayName, email: u.email })),
      workspaceName: exportData.workspace.name,
    });
  } catch (error) {
    console.error('Workspace import parse error:', error);
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to parse workspace export' });
  }
});

/**
 * POST /api/workspace-import/execute
 * Execute the workspace import, creating a new workspace with all data.
 */
router.post('/execute', authenticate, async (req, res) => {
  const startTime = Date.now();
  const io = req.app.get('io');
  const userId = req.user.id;

  try {
    const { sessionId, userMapping, options } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    const sessionWrapper = getSession(sessionId);
    if (!sessionWrapper) {
      return res.status(404).json({ error: 'Import session expired. Please re-upload the file.' });
    }
    if (sessionWrapper.userId !== userId) {
      return res.status(403).json({ error: 'Session does not belong to this user' });
    }

    // Consume session immediately
    const exportData = sessionWrapper.data;
    importSessions.delete(sessionId);

    const {
      workspaceName = exportData.workspace.name,
      preserveTimestamps = true,
      importDMs = false,
    } = options || {};

    // userMapping: { displayName: bandchatUserId | null }
    const nameToUserId = new Map();
    if (userMapping) {
      for (const [name, bcUserId] of Object.entries(userMapping)) {
        if (bcUserId) nameToUserId.set(name, bcUserId);
      }
    }

    const resolveUser = (displayName) => nameToUserId.get(displayName) || null;

    const emitProgress = (stage, current, total, detail) => {
      io?.to(`user:${userId}`).emit('workspace-import:progress', {
        sessionId, stage, current, total, detail
      });
    };

    const results = {
      workspaceId: null,
      membersAdded: 0,
      channelsCreated: 0,
      messagesImported: 0,
      songsImported: 0,
      setlistsImported: 0,
      gigsImported: 0,
      bandMembersImported: 0,
      contactsImported: 0,
      announcementsImported: 0,
      pollsImported: 0,
      timelineImported: 0,
      recordingsImported: 0,
      medleysImported: 0,
      errors: [],
    };

    emitProgress('workspace', 0, 1, 'Creating workspace...');

    // --- Create workspace ---
    const slug = workspaceName.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 40) + '-' + randomBytes(2).toString('hex');
    const workspace = await prisma.workspace.create({
      data: {
        name: workspaceName,
        slug,
        createdAt: preserveTimestamps && exportData.workspace.createdAt
          ? new Date(exportData.workspace.createdAt) : new Date(),
      }
    });
    results.workspaceId = workspace.id;

    // --- Add members ---
    emitProgress('members', 0, 1, 'Adding members...');
    const memberIds = new Set();
    // Always add the importing user as admin
    await prisma.workspaceMember.create({
      data: { userId, workspaceId: workspace.id, role: 'ADMIN' }
    });
    memberIds.add(userId);
    results.membersAdded++;

    for (const member of (exportData.members || [])) {
      const bcUserId = resolveUser(member.displayName);
      if (bcUserId && !memberIds.has(bcUserId)) {
        try {
          await prisma.workspaceMember.create({
            data: {
              userId: bcUserId,
              workspaceId: workspace.id,
              role: member.role || 'MEMBER',
              joinedAt: preserveTimestamps && member.joinedAt ? new Date(member.joinedAt) : new Date(),
            }
          });
          memberIds.add(bcUserId);
          results.membersAdded++;
        } catch {
          // Skip duplicates
        }
      }
    }

    // --- Channels + Messages ---
    const channelsToImport = exportData.channels || [];
    const allChannels = importDMs
      ? [...channelsToImport, ...(exportData.directMessages || []).map(dm => ({ ...dm, isDirect: true }))]
      : channelsToImport;

    const BATCH = 500;

    for (let ci = 0; ci < allChannels.length; ci++) {
      const chData = allChannels[ci];
      emitProgress('channels', ci + 1, allChannels.length, chData.name || `DM ${ci + 1}`);

      try {
        const isDirect = chData.isDirect || false;
        // For DM channels, check that both participants are mapped
        if (isDirect) {
          const participants = chData.participants || [];
          const mappedParticipants = participants.filter(p => resolveUser(p));
          if (mappedParticipants.length < 2) continue; // Skip DMs where we can't map both users
        }

        const channel = await prisma.channel.create({
          data: {
            name: chData.name || `dm-${ci}`,
            description: chData.description || null,
            isPrivate: chData.isPrivate || false,
            isDirect,
            workspaceId: workspace.id,
            createdAt: preserveTimestamps && chData.createdAt ? new Date(chData.createdAt) : new Date(),
          }
        });
        results.channelsCreated++;

        // Add channel members
        const channelMembers = isDirect
          ? (chData.participants || [])
          : (chData.members || []);

        for (const memberName of channelMembers) {
          const bcId = resolveUser(memberName);
          if (bcId && memberIds.has(bcId)) {
            try {
              await prisma.channelMember.create({
                data: { userId: bcId, channelId: channel.id }
              });
            } catch {
              // Skip duplicates
            }
          }
        }

        // Import messages in batches
        const messages = chData.messages || [];
        for (let i = 0; i < messages.length; i += BATCH) {
          const batch = messages.slice(i, i + BATCH);
          for (const msg of batch) {
            const authorId = resolveUser(msg.author);
            const msgData = {
              content: msg.content || '(empty message)',
              channelId: channel.id,
              authorId: authorId && memberIds.has(authorId) ? authorId : null,
              ...(!authorId || !memberIds.has(authorId) ? { removedUserName: msg.author || 'Unknown' } : {}),
            };

            if (preserveTimestamps && msg.createdAt) {
              msgData.createdAt = new Date(msg.createdAt);
              msgData.updatedAt = new Date(msg.createdAt);
            }

            try {
              const created = await prisma.message.create({ data: msgData });
              results.messagesImported++;

              // Import reactions for this message
              if (msg.reactions?.length) {
                const reactionData = msg.reactions
                  .filter(r => r.emoji && r.user)
                  .map(r => {
                    const rUserId = resolveUser(r.user);
                    return rUserId && memberIds.has(rUserId) ? {
                      emoji: r.emoji,
                      userId: rUserId,
                      messageId: created.id,
                    } : null;
                  })
                  .filter(Boolean);

                if (reactionData.length) {
                  await prisma.reaction.createMany({ data: reactionData, skipDuplicates: true });
                }
              }
            } catch (err) {
              results.errors.push({ type: 'message', channel: chData.name, error: err.message });
            }
          }
        }
      } catch (err) {
        results.errors.push({ type: 'channel', channel: chData.name, error: err.message });
      }
    }

    // --- Songs ---
    // Build a lookup map: "Title - Artist" → songId for setlist/gig/recording/medley references
    const songLookup = new Map();

    if (exportData.songs?.length) {
      emitProgress('songs', 0, exportData.songs.length, 'Importing songs...');
      for (let i = 0; i < exportData.songs.length; i++) {
        const s = exportData.songs[i];
        try {
          const createdById = resolveUser(s.createdBy);
          const song = await prisma.song.create({
            data: {
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
              workspaceId: workspace.id,
              createdById: createdById && memberIds.has(createdById) ? createdById : null,
              removedCreatorName: !createdById || !memberIds.has(createdById) ? (s.createdBy || null) : null,
              createdAt: preserveTimestamps && s.createdAt ? new Date(s.createdAt) : new Date(),
            }
          });

          const lookupKey = `${s.title}${s.artist ? ` - ${s.artist}` : ''}`;
          songLookup.set(lookupKey, song.id);
          results.songsImported++;

          // Song attachments
          if (s.attachments?.length) {
            const validAttachments = s.attachments.filter(a => safeUrl(a.url));
            if (validAttachments.length) {
              await prisma.songAttachment.createMany({
                data: validAttachments.map(a => ({
                  url: a.url,
                  name: a.name || a.filename || null,
                  type: a.type || 'FILE',
                  size: a.size || null,
                  songId: song.id,
                })),
                skipDuplicates: true,
              });
            }
          }
        } catch (err) {
          results.errors.push({ type: 'song', title: s.title, error: err.message });
        }

        if (i % 100 === 0 && i > 0) {
          emitProgress('songs', i, exportData.songs.length, `Imported ${i} songs...`);
        }
      }
    }

    // --- Band Members ---
    const bandMemberLookup = new Map(); // name → id

    if (exportData.bandMembers?.length) {
      emitProgress('bandMembers', 0, 1, 'Importing band members...');
      for (const bm of exportData.bandMembers) {
        try {
          const member = await prisma.bandMember.create({
            data: {
              name: bm.name,
              imageUrl: safeUrl(bm.imageUrl),
              notes: bm.notes || null,
              workspaceId: workspace.id,
            }
          });
          bandMemberLookup.set(bm.name, member.id);
          results.bandMembersImported++;

          if (bm.stints?.length) {
            await prisma.instrumentStint.createMany({
              data: bm.stints.filter(s => s.startDate).map(s => ({
                instruments: s.instruments || (s.instrument ? [s.instrument] : []),
                startDate: new Date(s.startDate),
                endDate: s.endDate ? new Date(s.endDate) : null,
                bandMemberId: member.id,
              })),
            });
          }
        } catch (err) {
          results.errors.push({ type: 'bandMember', name: bm.name, error: err.message });
        }
      }
    }

    // --- Setlists ---
    const setlistLookup = new Map(); // name → id

    if (exportData.setlists?.length) {
      emitProgress('setlists', 0, exportData.setlists.length, 'Importing setlists...');
      for (const sl of exportData.setlists) {
        try {
          const createdById = resolveUser(sl.createdBy);
          const setlist = await prisma.setlist.create({
            data: {
              name: sl.name,
              description: sl.description || null,
              performedAt: sl.performedAt ? new Date(sl.performedAt) : null,
              venue: sl.venue || null,
              startTime: sl.startTime || null,
              workspaceId: workspace.id,
              createdById: createdById && memberIds.has(createdById) ? createdById : null,
              removedCreatorName: !createdById || !memberIds.has(createdById) ? (sl.createdBy || null) : null,
            }
          });
          setlistLookup.set(sl.name, setlist.id);
          results.setlistsImported++;

          // Setlist songs
          if (sl.songs?.length) {
            const songData = sl.songs.map(ss => ({
              position: ss.position ?? 0,
              type: ss.type || 'SONG',
              label: ss.label || null,
              songId: ss.song ? (songLookup.get(ss.song) || null) : null,
              setlistId: setlist.id,
            }));
            await prisma.setlistSong.createMany({ data: songData, skipDuplicates: true });
          }

          // Setlist performers
          if (sl.performers?.length) {
            const performerData = sl.performers
              .map(name => bandMemberLookup.get(name))
              .filter(Boolean)
              .map(bmId => ({ setlistId: setlist.id, bandMemberId: bmId }));
            if (performerData.length) {
              await prisma.setlistPerformer.createMany({ data: performerData, skipDuplicates: true });
            }
          }
        } catch (err) {
          results.errors.push({ type: 'setlist', name: sl.name, error: err.message });
        }
      }
    }

    // --- Gigs ---
    if (exportData.gigs?.length) {
      emitProgress('gigs', 0, exportData.gigs.length, 'Importing gigs...');
      for (const g of exportData.gigs) {
        try {
          const createdById = resolveUser(g.createdBy);
          const gig = await prisma.gig.create({
            data: {
              title: g.title,
              type: g.type || 'GIG',
              date: new Date(g.date),
              endDate: g.endDate ? new Date(g.endDate) : null,
              venue: g.venue || null,
              address: g.address || null,
              notes: g.notes || null,
              pay: g.pay || null,
              status: g.status || 'SCHEDULED',
              workspaceId: workspace.id,
              createdById: createdById && memberIds.has(createdById) ? createdById : null,
              removedCreatorName: !createdById || !memberIds.has(createdById) ? (g.createdBy || null) : null,
            }
          });
          results.gigsImported++;

          // Attendees
          if (g.attendees?.length) {
            const attendeeData = g.attendees
              .map(a => {
                const bmId = bandMemberLookup.get(a.name);
                return bmId ? { gigId: gig.id, bandMemberId: bmId, status: a.status || 'PENDING' } : null;
              })
              .filter(Boolean);
            if (attendeeData.length) {
              await prisma.gigAttendee.createMany({ data: attendeeData, skipDuplicates: true });
            }
          }

          // Gig setlists
          if (g.setlists?.length) {
            const gigSetlistData = g.setlists
              .map(gs => {
                const slId = setlistLookup.get(gs.name);
                return slId ? { gigId: gig.id, setlistId: slId, setNumber: gs.setNumber || 1 } : null;
              })
              .filter(Boolean);
            if (gigSetlistData.length) {
              await prisma.gigSetlist.createMany({ data: gigSetlistData, skipDuplicates: true });
            }
          }

          // Gig media
          if (g.media?.length) {
            const validMedia = g.media.filter(m => safeUrl(m.url));
            if (validMedia.length) {
              await prisma.gigMedia.createMany({
                data: validMedia.map(m => ({
                  url: m.url,
                  type: m.type || 'IMAGE',
                  caption: m.caption || null,
                  size: m.size || null,
                  gigId: gig.id,
                  createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
                })),
                skipDuplicates: true,
              });
            }
          }

          // Songs played
          if (g.songsPlayed?.length) {
            const gigSongData = g.songsPlayed
              .map((ref, idx) => {
                const songId = songLookup.get(ref);
                return songId ? { gigId: gig.id, songId, position: idx } : null;
              })
              .filter(Boolean);
            if (gigSongData.length) {
              await prisma.gigSong.createMany({ data: gigSongData, skipDuplicates: true });
            }
          }
        } catch (err) {
          results.errors.push({ type: 'gig', title: g.title, error: err.message });
        }
      }
    }

    // --- Contacts ---
    if (exportData.contacts?.length) {
      emitProgress('contacts', 0, 1, 'Importing contacts...');
      for (const c of exportData.contacts) {
        try {
          const createdById = resolveUser(c.createdBy);
          await prisma.contact.create({
            data: {
              name: c.name,
              category: c.category || null,
              email: c.email || null,
              phone: c.phone || null,
              website: c.website || null,
              address: c.address || null,
              notes: c.notes || null,
              workspaceId: workspace.id,
              createdById: createdById && memberIds.has(createdById) ? createdById : null,
              removedCreatorName: !createdById || !memberIds.has(createdById) ? (c.createdBy || null) : null,
            }
          });
          results.contactsImported++;
        } catch (err) {
          results.errors.push({ type: 'contact', name: c.name, error: err.message });
        }
      }
    }

    // --- Announcements ---
    if (exportData.announcements?.length) {
      emitProgress('announcements', 0, 1, 'Importing announcements...');
      for (const a of exportData.announcements) {
        try {
          const createdById = resolveUser(a.createdBy);
          const announcement = await prisma.announcement.create({
            data: {
              title: a.title,
              content: a.content,
              priority: a.priority || 'NORMAL',
              isPinned: a.isPinned || false,
              expiresAt: a.expiresAt ? new Date(a.expiresAt) : null,
              workspaceId: workspace.id,
              createdById: createdById && memberIds.has(createdById) ? createdById : null,
              removedCreatorName: !createdById || !memberIds.has(createdById) ? (a.createdBy || null) : null,
              createdAt: preserveTimestamps && a.createdAt ? new Date(a.createdAt) : new Date(),
            }
          });
          results.announcementsImported++;

          // Acknowledgments
          if (a.acknowledgedBy?.length) {
            const ackData = a.acknowledgedBy
              .map(ack => {
                const ackUserId = resolveUser(ack.user);
                return ackUserId && memberIds.has(ackUserId) ? {
                  announcementId: announcement.id,
                  userId: ackUserId,
                  acknowledgedAt: ack.at ? new Date(ack.at) : new Date(),
                } : null;
              })
              .filter(Boolean);
            if (ackData.length) {
              await prisma.announcementAcknowledgment.createMany({ data: ackData, skipDuplicates: true });
            }
          }
        } catch (err) {
          results.errors.push({ type: 'announcement', title: a.title, error: err.message });
        }
      }
    }

    // --- Polls ---
    if (exportData.polls?.length) {
      emitProgress('polls', 0, 1, 'Importing polls...');
      for (const p of exportData.polls) {
        try {
          const createdById = resolveUser(p.createdBy);
          const poll = await prisma.poll.create({
            data: {
              question: p.question,
              description: p.description || null,
              allowMultiple: p.allowMultiple || false,
              isAnonymous: p.isAnonymous || false,
              isClosed: p.isClosed || false,
              workspaceId: workspace.id,
              createdById: createdById && memberIds.has(createdById) ? createdById : null,
              removedCreatorName: !createdById || !memberIds.has(createdById) ? (p.createdBy || null) : null,
              createdAt: preserveTimestamps && p.createdAt ? new Date(p.createdAt) : new Date(),
            }
          });
          results.pollsImported++;

          if (p.options?.length) {
            for (const opt of p.options) {
              const option = await prisma.pollOption.create({
                data: {
                  text: opt.text,
                  position: opt.position ?? 0,
                  pollId: poll.id,
                }
              });

              // Votes (non-anonymous polls have user names; anonymous have count)
              if (Array.isArray(opt.votes) && opt.votes.length) {
                // Check if votes are strings (user names) or numbers (anonymous count)
                if (typeof opt.votes[0] === 'string') {
                  const voteData = opt.votes
                    .map(name => {
                      const vUserId = resolveUser(name);
                      return vUserId && memberIds.has(vUserId)
                        ? { optionId: option.id, userId: vUserId }
                        : null;
                    })
                    .filter(Boolean);
                  if (voteData.length) {
                    await prisma.pollVote.createMany({ data: voteData, skipDuplicates: true });
                  }
                }
                // Anonymous polls: votes is just a count, can't recreate individual votes
              }
            }
          }
        } catch (err) {
          results.errors.push({ type: 'poll', question: p.question, error: err.message });
        }
      }
    }

    // --- Timeline ---
    if (exportData.timeline?.length) {
      emitProgress('timeline', 0, 1, 'Importing timeline events...');
      for (const t of exportData.timeline) {
        try {
          const createdById = resolveUser(t.createdBy);
          await prisma.timelineEvent.create({
            data: {
              title: t.title,
              description: t.description || null,
              eventType: t.eventType || 'OTHER',
              eventDate: new Date(t.eventDate),
              imageUrl: safeUrl(t.imageUrl),
              workspaceId: workspace.id,
              createdById: createdById && memberIds.has(createdById) ? createdById : null,
              removedCreatorName: !createdById || !memberIds.has(createdById) ? (t.createdBy || null) : null,
            }
          });
          results.timelineImported++;
        } catch (err) {
          results.errors.push({ type: 'timeline', title: t.title, error: err.message });
        }
      }
    }

    // --- Recordings ---
    if (exportData.recordings?.length) {
      emitProgress('recordings', 0, 1, 'Importing recordings...');
      for (const r of exportData.recordings) {
        try {
          const createdById = resolveUser(r.createdBy);
          const songId = r.song ? (songLookup.get(r.song) || null) : null;
          const recordingUrl = safeUrl(r.url);
          if (!recordingUrl) continue; // Skip recordings with invalid URLs
          await prisma.recording.create({
            data: {
              title: r.title,
              description: r.description || null,
              url: recordingUrl,
              type: r.type || 'AUDIO',
              duration: r.duration || null,
              songId,
              workspaceId: workspace.id,
              createdById: createdById && memberIds.has(createdById) ? createdById : null,
              removedCreatorName: !createdById || !memberIds.has(createdById) ? (r.createdBy || null) : null,
              createdAt: preserveTimestamps && r.createdAt ? new Date(r.createdAt) : new Date(),
            }
          });
          results.recordingsImported++;
        } catch (err) {
          results.errors.push({ type: 'recording', title: r.title, error: err.message });
        }
      }
    }

    // --- Medleys ---
    if (exportData.medleys?.length) {
      emitProgress('medleys', 0, 1, 'Importing medleys...');
      for (const m of exportData.medleys) {
        try {
          const createdById = resolveUser(m.createdBy);
          const medley = await prisma.medley.create({
            data: {
              name: m.name,
              description: m.description || null,
              workspaceId: workspace.id,
              createdById: createdById && memberIds.has(createdById) ? createdById : null,
              removedCreatorName: !createdById || !memberIds.has(createdById) ? (m.createdBy || null) : null,
            }
          });
          results.medleysImported++;

          if (m.songs?.length) {
            const medleySongData = m.songs
              .map((ref, idx) => {
                const songId = songLookup.get(ref);
                return songId ? { medleyId: medley.id, songId, position: idx } : null;
              })
              .filter(Boolean);
            if (medleySongData.length) {
              await prisma.medleySong.createMany({ data: medleySongData, skipDuplicates: true });
            }
          }
        } catch (err) {
          results.errors.push({ type: 'medley', name: m.name, error: err.message });
        }
      }
    }

    // --- Band Kitty ---
    if (exportData.kitty) {
      emitProgress('kitty', 0, 1, 'Importing band kitty...');
      try {
        const kitty = await prisma.bandKitty.create({
          data: {
            startingBalance: exportData.kitty.startingBalance ?? 0,
            currency: exportData.kitty.currency || 'USD',
            workspaceId: workspace.id,
          }
        });

        if (exportData.kitty.transactions?.length) {
          for (const t of exportData.kitty.transactions) {
            const createdById = resolveUser(t.createdBy);
            await prisma.kittyTransaction.create({
              data: {
                type: t.type,
                category: t.category || null,
                amount: t.amount,
                description: t.description || null,
                date: new Date(t.date),
                kittyId: kitty.id,
                createdById: createdById && memberIds.has(createdById) ? createdById : null,
                removedCreatorName: !createdById || !memberIds.has(createdById) ? (t.createdBy || null) : null,
              }
            });
          }
        }
      } catch (err) {
        results.errors.push({ type: 'kitty', error: err.message });
      }
    }

    // --- Achievements ---
    if (exportData.achievements) {
      emitProgress('achievements', 0, 1, 'Importing achievements...');

      // Get or create achievements by name
      const achievementLookup = new Map();
      const existingAchievements = await prisma.achievement.findMany();
      for (const a of existingAchievements) {
        achievementLookup.set(a.name, a.id);
      }

      const allAchievementRefs = [
        ...(exportData.achievements.band || []),
        ...(exportData.achievements.member || []),
      ];
      for (const ref of allAchievementRefs) {
        if (!achievementLookup.has(ref.name)) {
          try {
            const ach = await prisma.achievement.create({
              data: {
                name: ref.name,
                icon: ref.icon || null,
                category: ref.category || null,
              }
            });
            achievementLookup.set(ref.name, ach.id);
          } catch {
            // May already exist due to race condition
            const existing = await prisma.achievement.findFirst({ where: { name: ref.name } });
            if (existing) achievementLookup.set(ref.name, existing.id);
          }
        }
      }

      // Band achievements
      if (exportData.achievements.band?.length) {
        for (const a of exportData.achievements.band) {
          const achId = achievementLookup.get(a.name);
          if (achId) {
            try {
              await prisma.bandAchievement.create({
                data: {
                  achievementId: achId,
                  workspaceId: workspace.id,
                  earnedAt: a.earnedAt ? new Date(a.earnedAt) : new Date(),
                }
              });
            } catch { /* skip duplicates */ }
          }
        }
      }

      // Member achievements
      if (exportData.achievements.member?.length) {
        for (const a of exportData.achievements.member) {
          const achId = achievementLookup.get(a.name);
          const achUserId = resolveUser(a.user);
          if (achId && achUserId && memberIds.has(achUserId)) {
            try {
              await prisma.memberAchievement.create({
                data: {
                  achievementId: achId,
                  userId: achUserId,
                  workspaceId: workspace.id,
                  earnedAt: a.earnedAt ? new Date(a.earnedAt) : new Date(),
                }
              });
            } catch { /* skip duplicates */ }
          }
        }
      }
    }

    // --- Availability ---
    if (exportData.availability?.length) {
      emitProgress('availability', 0, 1, 'Importing availability...');
      for (const a of exportData.availability) {
        const avUserId = resolveUser(a.user);
        if (avUserId && memberIds.has(avUserId)) {
          try {
            await prisma.memberAvailability.create({
              data: {
                userId: avUserId,
                workspaceId: workspace.id,
                date: new Date(a.date),
                status: a.status || 'AVAILABLE',
                note: a.note || null,
              }
            });
          } catch { /* skip duplicates */ }
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    emitProgress('done', 1, 1, 'Import complete!');

    res.json({ ...results, duration });
  } catch (error) {
    console.error('Workspace import error:', error);
    res.status(500).json({ error: 'Failed to import workspace data' });
  }
});

// Multer error handler
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message?.includes('JSON')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

export default router;
