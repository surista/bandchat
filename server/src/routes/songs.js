import express from 'express';
import { authenticate, isWorkspaceMember } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import prisma, { USER_SELECT_BRIEF } from '../lib/prisma.js';
import { isAllowedUploadUrl } from '../lib/validateUrl.js';
import { deleteFile, isR2Url } from '../lib/storage.js';
import { safeDecrementStorage } from './uploads.js';
import { getEffectivePlan, getPlanLimits } from '../lib/planLimits.js';
import { triggerWebsiteSync } from '../services/websiteDeployment.js';
import songBPMScraperService from '../services/songbpm-scraper.js';
import deezerService from '../services/deezer.js';
import itunesService from '../services/itunes.js';
import youtubeService from '../services/youtube.js';
import spotifyService from '../services/spotify.js';
import { logAudit } from '../lib/audit.js';

const router = express.Router();

// Per-workspace lock to prevent concurrent enrichment/bulk-import-with-metadata
// Uses Map with timestamps for TTL-based auto-expiry (10 min) to prevent permanent lockout
const enrichmentLocks = new Map();
const ENRICHMENT_LOCK_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Enrich a single song with metadata from external services.
 * Returns { updates, fieldsUpdated } where updates is the object to pass to prisma.song.update.
 */
async function enrichSong(song, { needsBpm, needsKey, needsDuration, needsYoutube, needsSpotify } = {}) {
  // Default: enrich whatever is missing
  if (needsBpm === undefined) needsBpm = !song.bpm;
  if (needsKey === undefined) needsKey = !song.key;
  if (needsDuration === undefined) needsDuration = !song.duration;
  if (needsYoutube === undefined) needsYoutube = !song.youtubeUrl;
  if (needsSpotify === undefined) needsSpotify = !song.spotifyUrl;

  const updates = {};
  const fieldsUpdated = [];

  // Fetch BPM and Key from SongBPM.com scraper
  if (needsBpm || needsKey) {
    try {
      const scraperData = await songBPMScraperService.getTrackMetadata(song.title, song.artist);
      if (scraperData?.bpm && needsBpm) {
        updates.bpm = scraperData.bpm;
        fieldsUpdated.push('bpm');
      }
      if (scraperData?.key && needsKey) {
        updates.key = scraperData.key;
        fieldsUpdated.push('key');
      }
      await delay(1500);
    } catch (err) {
      console.error('SongBPM scraper failed for:', song.title, err.message);
    }
  }

  // Fallback to Deezer for BPM if still missing
  if (needsBpm && !updates.bpm) {
    try {
      const deezerData = await deezerService.getTrackMetadata(song.title, song.artist);
      if (deezerData?.bpm) {
        updates.bpm = deezerData.bpm;
        fieldsUpdated.push('bpm');
      }
      await delay(500);
    } catch (err) {
      console.error('Deezer lookup failed for:', song.title, err.message);
    }
  }

  // Fetch duration from iTunes
  if (needsDuration) {
    try {
      const itunesData = await itunesService.searchTrack(song.title, song.artist);
      if (itunesData?.duration) {
        updates.duration = itunesData.duration;
        fieldsUpdated.push('duration');
      }
      await delay(300);
    } catch (err) {
      console.error('iTunes lookup failed for:', song.title, err.message);
    }
  }

  // Fetch YouTube link
  if (needsYoutube) {
    try {
      const ytData = await youtubeService.searchVideo(song.title, song.artist);
      if (ytData?.url) {
        updates.youtubeUrl = ytData.url;
        fieldsUpdated.push('youtube');
      }
      await delay(500);
    } catch (err) {
      console.error('YouTube lookup failed for:', song.title, err.message);
    }
  }

  // Generate Spotify search URL
  if (needsSpotify) {
    updates.spotifyUrl = spotifyService.generateSearchUrl(song.title, song.artist);
    fieldsUpdated.push('spotify');
  }

  return { updates, fieldsUpdated };
}

// Get all songs for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const songs = await prisma.song.findMany({
      where: { workspaceId: req.params.workspaceId },
      include: {
        createdBy: {
          select: USER_SELECT_BRIEF
        },
        _count: {
          select: { setlistSongs: true, gigSongs: true }
        }
      },
      orderBy: { title: 'asc' },
      take: 500
    });

    res.json(songs);
  } catch (error) {
    console.error('Get songs error:', error);
    res.status(500).json({ error: 'Failed to get songs' });
  }
});

// Create a song
router.post('/workspace/:workspaceId', authenticate, apiLimiter, isWorkspaceMember, async (req, res) => {
  try {
    const { title, shortName, artist, duration, key, bpm, notes, lyrics, arrangement, youtubeUrl, spotifyUrl } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Input length validation
    if (title.length > 200) return res.status(400).json({ error: 'Title must be 200 characters or less' });
    if (shortName && shortName.length > 50) return res.status(400).json({ error: 'Short name must be 50 characters or less' });
    if (artist && artist.length > 200) return res.status(400).json({ error: 'Artist must be 200 characters or less' });
    if (notes && notes.length > 5000) return res.status(400).json({ error: 'Notes must be 5,000 characters or less' });
    if (lyrics && lyrics.length > 50000) return res.status(400).json({ error: 'Lyrics must be 50,000 characters or less' });
    if (arrangement && arrangement.length > 5000) return res.status(400).json({ error: 'Arrangement must be 5,000 characters or less' });
    if (youtubeUrl && youtubeUrl.length > 2048) return res.status(400).json({ error: 'URL must be 2,048 characters or less' });
    if (spotifyUrl && spotifyUrl.length > 2048) return res.status(400).json({ error: 'URL must be 2,048 characters or less' });
    if (key && key.length > 10) return res.status(400).json({ error: 'Key must be 10 characters or less' });

    // Check plan song limit
    const workspace = await prisma.workspace.findUnique({ where: { id: req.params.workspaceId }, select: { plan: true, planExpiresAt: true } });
    const limits = getPlanLimits(workspace);
    if (limits.maxSongs !== Infinity) {
      const songCount = await prisma.song.count({ where: { workspaceId: req.params.workspaceId } });
      if (songCount >= limits.maxSongs) {
        return res.status(403).json({ error: `Free plan allows up to ${limits.maxSongs} songs. Upgrade to Pro for unlimited.`, upgrade: true });
      }
    }

    if (youtubeUrl && !youtubeUrl.startsWith('https://')) return res.status(400).json({ error: 'YouTube URL must use HTTPS' });
    if (spotifyUrl && !spotifyUrl.startsWith('https://')) return res.status(400).json({ error: 'Spotify URL must use HTTPS' });

    const song = await prisma.song.create({
      data: {
        title,
        shortName,
        artist,
        duration,
        key,
        bpm,
        notes,
        lyrics,
        arrangement,
        youtubeUrl,
        spotifyUrl,
        workspaceId: req.params.workspaceId,
        createdById: req.user.id
      },
      include: {
        createdBy: {
          select: USER_SELECT_BRIEF
        }
      }
    });

    // Broadcast to workspace
    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('song:created', song);

    res.status(201).json(song);
    triggerWebsiteSync(req.params.workspaceId);
  } catch (error) {
    console.error('Create song error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A song with this title and artist already exists' });
    }
    res.status(500).json({ error: 'Failed to create song' });
  }
});

// Check if metadata services are configured (must be before /:songId route)
router.get('/metadata-status', authenticate, async (req, res) => {
  res.json({
    configured: true,
    services: {
      songbpm: true,  // Scrapes songbpm.com for BPM and Key
      deezer: true,   // Fallback for BPM
      youtube: youtubeService.isConfigured(),
      itunes: true,
      spotify: true
    }
  });
});

// Helper to delay between API calls
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Enrich songs with missing metadata
router.post('/workspace/:workspaceId/enrich', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;

    // Prevent concurrent enrichment for the same workspace (with TTL to prevent permanent lockout)
    const lockTime = enrichmentLocks.get(workspaceId);
    if (lockTime && Date.now() - lockTime < ENRICHMENT_LOCK_TTL) {
      return res.status(409).json({ error: 'Enrichment is already running for this workspace. Please wait for it to complete.' });
    }
    enrichmentLocks.set(workspaceId, Date.now());

    try {
    const { songIds } = req.body; // Optional: specific song IDs to enrich

    // Get songs to enrich
    const where = {
      workspaceId: req.params.workspaceId,
      ...(songIds?.length > 0 && { id: { in: songIds } })
    };

    const MAX_ENRICH_BATCH = 50;
    const songs = await prisma.song.findMany({ where, take: MAX_ENRICH_BATCH });
    console.log(`Enriching ${songs.length} songs (max ${MAX_ENRICH_BATCH} per batch)...`);

    const results = {
      processed: 0,
      updated: 0,
      errors: 0,
      details: []
    };

    for (const song of songs) {
      results.processed++;

      // Skip if nothing is missing
      if (song.bpm && song.key && song.duration && song.youtubeUrl && song.spotifyUrl) {
        continue;
      }

      const { updates, fieldsUpdated } = await enrichSong(song);

      // Update the song if we have any updates
      if (Object.keys(updates).length > 0) {
        await prisma.song.update({
          where: { id: song.id },
          data: updates
        });
        results.updated++;
        results.details.push({
          id: song.id,
          title: song.title,
          artist: song.artist,
          fieldsUpdated
        });
      }
    }

    // Broadcast that songs were updated
    if (results.updated > 0) {
      const io = req.app.get('io');
      io.to(`workspace:${workspaceId}`).emit('songs:enriched', results);
    }

    res.json(results);
    } finally {
      enrichmentLocks.delete(workspaceId);
    }
  } catch (error) {
    console.error('Enrich songs error:', error);
    res.status(500).json({ error: 'Failed to enrich songs' });
  }
});

// Get a single song
router.get('/:songId', authenticate, async (req, res) => {
  try {
    const song = await prisma.song.findUnique({
      where: { id: req.params.songId },
      include: {
        createdBy: {
          select: USER_SELECT_BRIEF
        },
        attachments: {
          orderBy: { createdAt: 'desc' }
        },
        setlistSongs: {
          include: {
            setlist: {
              select: { id: true, name: true }
            }
          }
        },
        gigSongs: {
          include: {
            gig: {
              select: { id: true, title: true, date: true }
            }
          }
        }
      }
    });

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Verify user is a workspace member
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: song.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    res.json(song);
  } catch (error) {
    console.error('Get song error:', error);
    res.status(500).json({ error: 'Failed to get song' });
  }
});

// Update a song
router.put('/:songId', authenticate, async (req, res) => {
  try {
    const { title, shortName, artist, duration, key, bpm, notes, lyrics, arrangement, youtubeUrl, spotifyUrl } = req.body;

    // First fetch the song to check workspace membership
    const existingSong = await prisma.song.findUnique({
      where: { id: req.params.songId }
    });

    if (!existingSong) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Verify user is a workspace member
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: existingSong.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Input length validation
    if (title && title.length > 200) return res.status(400).json({ error: 'Title must be 200 characters or less' });
    if (shortName && shortName.length > 50) return res.status(400).json({ error: 'Short name must be 50 characters or less' });
    if (artist && artist.length > 200) return res.status(400).json({ error: 'Artist must be 200 characters or less' });
    if (notes && notes.length > 5000) return res.status(400).json({ error: 'Notes must be 5,000 characters or less' });
    if (lyrics && lyrics.length > 50000) return res.status(400).json({ error: 'Lyrics must be 50,000 characters or less' });
    if (arrangement && arrangement.length > 5000) return res.status(400).json({ error: 'Arrangement must be 5,000 characters or less' });
    if (youtubeUrl && youtubeUrl.length > 2048) return res.status(400).json({ error: 'URL must be 2,048 characters or less' });
    if (spotifyUrl && spotifyUrl.length > 2048) return res.status(400).json({ error: 'URL must be 2,048 characters or less' });
    if (key && key.length > 10) return res.status(400).json({ error: 'Key must be 10 characters or less' });
    if (youtubeUrl && !youtubeUrl.startsWith('https://')) return res.status(400).json({ error: 'YouTube URL must use HTTPS' });
    if (spotifyUrl && !spotifyUrl.startsWith('https://')) return res.status(400).json({ error: 'Spotify URL must use HTTPS' });

    const song = await prisma.song.update({
      where: { id: req.params.songId },
      data: {
        ...(title && { title }),
        ...(shortName !== undefined && { shortName }),
        ...(artist !== undefined && { artist }),
        ...(duration !== undefined && { duration }),
        ...(key !== undefined && { key }),
        ...(bpm !== undefined && { bpm }),
        ...(notes !== undefined && { notes }),
        ...(lyrics !== undefined && { lyrics }),
        ...(arrangement !== undefined && { arrangement }),
        ...(youtubeUrl !== undefined && { youtubeUrl }),
        ...(spotifyUrl !== undefined && { spotifyUrl })
      },
      include: {
        createdBy: {
          select: USER_SELECT_BRIEF
        }
      }
    });

    // Broadcast update
    const io = req.app.get('io');
    io.to(`workspace:${song.workspaceId}`).emit('song:updated', song);

    res.json(song);
    triggerWebsiteSync(song.workspaceId);
  } catch (error) {
    console.error('Update song error:', error);
    res.status(500).json({ error: 'Failed to update song' });
  }
});

// Bulk import songs
router.post('/workspace/:workspaceId/bulk', authenticate, apiLimiter, isWorkspaceMember, async (req, res) => {
  try {
    const { songs, fetchMetadata = true } = req.body;
    const workspaceId = req.params.workspaceId;
    const userId = req.user.id;

    if (!songs || !Array.isArray(songs) || songs.length === 0) {
      return res.status(400).json({ error: 'Songs array is required' });
    }

    if (songs.length > 200) {
      return res.status(400).json({ error: 'Maximum 200 songs per import' });
    }

    // Check plan song limit
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true, planExpiresAt: true } });
    const limits = getPlanLimits(workspace);
    if (limits.maxSongs !== Infinity) {
      const currentSongCount = await prisma.song.count({ where: { workspaceId } });
      if (currentSongCount + songs.length > limits.maxSongs) {
        const remaining = Math.max(0, limits.maxSongs - currentSongCount);
        return res.status(403).json({ error: `Free plan allows up to ${limits.maxSongs} songs. You have ${currentSongCount} and are trying to add ${songs.length}. ${remaining > 0 ? `You can add ${remaining} more.` : 'Upgrade to Pro for unlimited.'}`, upgrade: true });
      }
    }

    // Prevent concurrent metadata fetching for the same workspace (with TTL)
    if (fetchMetadata) {
      const lockTime = enrichmentLocks.get(workspaceId);
      if (lockTime && Date.now() - lockTime < ENRICHMENT_LOCK_TTL) {
        return res.status(409).json({ error: 'Enrichment is already running for this workspace. Please wait for it to complete.' });
      }
    }

    const results = {
      created: [],
      skipped: [],
      errors: [],
      metadataMatches: 0
    };

    // Step 1: Create all songs in DB immediately (without metadata)
    for (const songData of songs) {
      if (!songData.title || !songData.title.trim()) {
        results.errors.push({ song: songData, error: 'Title is required' });
        continue;
      }

      try {
        const title = songData.title.trim();
        const shortName = songData.shortName?.trim() || null;
        const artist = songData.artist?.trim() || null;

        const song = await prisma.song.create({
          data: {
            title,
            shortName,
            artist,
            workspaceId,
            createdById: userId
          },
          include: {
            createdBy: {
              select: USER_SELECT_BRIEF
            }
          }
        });
        results.created.push(song);
      } catch (error) {
        if (error.code === 'P2002') {
          results.skipped.push({
            title: songData.title,
            artist: songData.artist,
            reason: 'Already exists'
          });
        } else {
          results.errors.push({
            song: songData,
            error: 'Failed to create'
          });
        }
      }
    }

    // Broadcast all created songs
    const io = req.app.get('io');
    if (results.created.length > 0) {
      io.to(`workspace:${workspaceId}`).emit('songs:bulkCreated', results.created);
    }

    // Step 2: Return immediately with the created songs
    res.status(201).json(results);

    // Step 3: Enrich metadata in the background (non-blocking)
    if (fetchMetadata && results.created.length > 0) {
      const bgLockTime = enrichmentLocks.get(workspaceId);
      if (bgLockTime && Date.now() - bgLockTime < ENRICHMENT_LOCK_TTL) {
        // Another enrichment started between check and here, skip metadata
        return;
      }
      enrichmentLocks.set(workspaceId, Date.now());

      const emitProgress = (current, total, detail) => {
        io.to(`user:${userId}`).emit('songs:import-progress', {
          workspaceId, current, total, detail
        });
      };

      setImmediate(async () => {
        try {
          const songsToEnrich = results.created;
          let metadataMatches = 0;

          for (let i = 0; i < songsToEnrich.length; i++) {
            const song = songsToEnrich[i];
            emitProgress(i + 1, songsToEnrich.length, song.title);

            const { updates, fieldsUpdated } = await enrichSong(song);

            if (fieldsUpdated.length > 1) { // More than just spotify
              metadataMatches++;
            }

            // Update the song with metadata
            if (Object.keys(updates).length > 0) {
              try {
                const updatedSong = await prisma.song.update({
                  where: { id: song.id },
                  data: updates,
                  include: {
                    createdBy: {
                      select: USER_SELECT_BRIEF
                    }
                  }
                });
                io.to(`workspace:${workspaceId}`).emit('song:updated', updatedSong);
              } catch (err) {
                console.error('Failed to update song metadata for:', song.title, err.message);
              }
            }
          }

          // Emit completion event
          io.to(`user:${userId}`).emit('songs:import-progress', {
            workspaceId,
            current: songsToEnrich.length,
            total: songsToEnrich.length,
            detail: 'Metadata enrichment complete',
            done: true,
            metadataMatches
          });
        } catch (err) {
          console.error('Background metadata enrichment error:', err);
        } finally {
          enrichmentLocks.delete(workspaceId);
        }
      });
    }
  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json({ error: 'Failed to import songs' });
  }
});

// Delete a song
router.delete('/:songId', authenticate, async (req, res) => {
  try {
    const song = await prisma.song.findUnique({
      where: { id: req.params.songId }
    });

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Verify user is a workspace member
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: song.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    if (song.createdById !== req.user.id && membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only the creator or an admin can delete songs' });
    }

    // Before cascade delete: clean up R2 files + decrement storage
    const songAttachments = await prisma.songAttachment.findMany({
      where: { songId: req.params.songId },
      select: { url: true, size: true },
    });
    let freedBytes = 0;
    for (const att of songAttachments) {
      if (isR2Url(att.url)) {
        try { await deleteFile(att.url); } catch { /* best effort */ }
      }
      freedBytes += att.size || 0;
    }
    if (freedBytes > 0) {
      await safeDecrementStorage(song.workspaceId, freedBytes).catch(() => {});
    }

    await prisma.song.delete({
      where: { id: req.params.songId }
    });

    // Broadcast deletion
    const io = req.app.get('io');
    io.to(`workspace:${song.workspaceId}`).emit('song:deleted', { songId: req.params.songId });

    logAudit('song.deleted', { actorId: req.user.id, targetId: req.params.songId, metadata: { title: song.title } });

    res.json({ message: 'Song deleted' });
    triggerWebsiteSync(song.workspaceId);
  } catch (error) {
    console.error('Delete song error:', error);
    res.status(500).json({ error: 'Failed to delete song' });
  }
});

// Song Attachments

// Get attachments for a song
router.get('/:songId/attachments', authenticate, async (req, res) => {
  try {
    // Verify song exists and user is a workspace member
    const song = await prisma.song.findUnique({
      where: { id: req.params.songId }
    });

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: song.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    const attachments = await prisma.songAttachment.findMany({
      where: { songId: req.params.songId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(attachments);
  } catch (error) {
    console.error('Get attachments error:', error);
    res.status(500).json({ error: 'Failed to get attachments' });
  }
});

// Add attachment to a song
router.post('/:songId/attachments', authenticate, async (req, res) => {
  try {
    const { filename, url, type, size } = req.body;

    if (!filename || !url) {
      return res.status(400).json({ error: 'Filename and URL are required' });
    }

    const song = await prisma.song.findUnique({
      where: { id: req.params.songId }
    });

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Verify user is a workspace member
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: song.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Validate that URL is from an allowed upload provider
    const urlCheck = isAllowedUploadUrl(url);
    if (!urlCheck.valid) {
      return res.status(400).json({ error: urlCheck.error || 'Invalid URL' });
    }

    const attachment = await prisma.songAttachment.create({
      data: {
        songId: req.params.songId,
        filename,
        url,
        type: type || 'file',
        size
      }
    });

    // Broadcast update
    const io = req.app.get('io');
    io.to(`workspace:${song.workspaceId}`).emit('song:attachmentAdded', {
      songId: req.params.songId,
      attachment
    });

    res.status(201).json(attachment);
  } catch (error) {
    console.error('Add attachment error:', error);
    res.status(500).json({ error: 'Failed to add attachment' });
  }
});

// Delete attachment
router.delete('/:songId/attachments/:attachmentId', authenticate, async (req, res) => {
  try {
    const attachment = await prisma.songAttachment.findUnique({
      where: { id: req.params.attachmentId },
      include: { song: true }
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Verify user is a workspace member
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: attachment.song.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    if (attachment.song.createdById !== req.user.id && membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only the song creator or an admin can delete attachments' });
    }

    // Clean up R2 file and track storage
    if (isR2Url(attachment.url)) {
      try { await deleteFile(attachment.url); } catch { /* best effort */ }
    }
    if (attachment.size) {
      await safeDecrementStorage(attachment.song.workspaceId, attachment.size).catch(() => {});
    }

    await prisma.songAttachment.delete({
      where: { id: req.params.attachmentId }
    });

    // Broadcast update
    const io = req.app.get('io');
    io.to(`workspace:${attachment.song.workspaceId}`).emit('song:attachmentDeleted', {
      songId: req.params.songId,
      attachmentId: req.params.attachmentId
    });

    res.json({ message: 'Attachment deleted' });
  } catch (error) {
    console.error('Delete attachment error:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

export default router;
