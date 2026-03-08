import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { isAllowedUploadUrl } from '../lib/validateUrl.js';
import { deleteFile, isR2Url } from '../lib/storage.js';
import { safeDecrementStorage } from './uploads.js';
import { getEffectivePlan, getPlanLimits } from '../lib/planLimits.js';
import songBPMScraperService from '../services/songbpm-scraper.js';
import deezerService from '../services/deezer.js';
import itunesService from '../services/itunes.js';
import youtubeService from '../services/youtube.js';
import spotifyService from '../services/spotify.js';

const router = express.Router();

// Per-workspace lock to prevent concurrent enrichment/bulk-import-with-metadata
const enrichmentLocks = new Set();

// Get all songs for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const songs = await prisma.song.findMany({
      where: { workspaceId: req.params.workspaceId },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
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
router.post('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { title, shortName, artist, duration, key, bpm, notes, lyrics, arrangement, youtubeUrl, spotifyUrl } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

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
          select: { id: true, displayName: true }
        }
      }
    });

    // Broadcast to workspace
    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('song:created', song);

    res.status(201).json(song);
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

    // Prevent concurrent enrichment for the same workspace
    if (enrichmentLocks.has(workspaceId)) {
      return res.status(409).json({ error: 'Enrichment is already running for this workspace. Please wait for it to complete.' });
    }
    enrichmentLocks.add(workspaceId);

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
      const updates = {};
      const fieldsUpdated = [];

      // Check what's missing and try to fill it
      const needsBpm = !song.bpm;
      const needsKey = !song.key;
      const needsDuration = !song.duration;
      const needsYoutube = !song.youtubeUrl;
      const needsSpotify = !song.spotifyUrl;

      // Skip if nothing is missing
      if (!needsBpm && !needsKey && !needsDuration && !needsYoutube && !needsSpotify) {
        continue;
      }

      // Fetch BPM and Key from SongBPM.com scraper
      if (needsBpm || needsKey) {
        try {
          console.log(`Fetching BPM/Key for "${song.title}" by "${song.artist}"`);
          const scraperData = await songBPMScraperService.getTrackMetadata(song.title, song.artist);
          console.log(`SongBPM scraper data for "${song.title}":`, scraperData);
          if (scraperData?.bpm && needsBpm) {
            updates.bpm = scraperData.bpm;
            fieldsUpdated.push('bpm');
          }
          if (scraperData?.key && needsKey) {
            updates.key = scraperData.key;
            fieldsUpdated.push('key');
          }
          // Rate limit: wait 1.5s between songbpm requests
          await delay(1500);
        } catch (err) {
          console.error('SongBPM scraper failed for:', song.title, err.message);
        }
      }

      // Fallback to Deezer for BPM if still missing
      if (needsBpm && !updates.bpm) {
        try {
          console.log(`Trying Deezer for "${song.title}"`);
          const deezerData = await deezerService.getTrackMetadata(song.title, song.artist);
          console.log(`Deezer data for "${song.title}":`, deezerData);
          if (deezerData?.bpm) {
            updates.bpm = deezerData.bpm;
            fieldsUpdated.push('bpm');
          }
          // Rate limit: wait 500ms between Deezer requests
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
        const spotifyUrl = spotifyService.generateSearchUrl(song.title, song.artist);
        updates.spotifyUrl = spotifyUrl;
        fieldsUpdated.push('spotify');
      }

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
          select: { id: true, displayName: true }
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
          select: { id: true, displayName: true }
        }
      }
    });

    // Broadcast update
    const io = req.app.get('io');
    io.to(`workspace:${song.workspaceId}`).emit('song:updated', song);

    res.json(song);
  } catch (error) {
    console.error('Update song error:', error);
    res.status(500).json({ error: 'Failed to update song' });
  }
});

// Bulk import songs
router.post('/workspace/:workspaceId/bulk', authenticate, isWorkspaceMember, async (req, res) => {
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

    // Prevent concurrent metadata fetching for the same workspace
    if (fetchMetadata) {
      if (enrichmentLocks.has(workspaceId)) {
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
              select: { id: true, displayName: true }
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
      if (enrichmentLocks.has(workspaceId)) {
        // Another enrichment started between check and here, skip metadata
        return;
      }
      enrichmentLocks.add(workspaceId);

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
            const updates = {};
            const fieldsUpdated = [];

            emitProgress(i + 1, songsToEnrich.length, song.title);

            // Fetch BPM and Key from SongBPM.com scraper
            try {
              const scraperData = await songBPMScraperService.getTrackMetadata(song.title, song.artist);
              if (scraperData?.bpm) {
                updates.bpm = scraperData.bpm;
                fieldsUpdated.push('bpm');
              }
              if (scraperData?.key) {
                updates.key = scraperData.key;
                fieldsUpdated.push('key');
              }
              await delay(1500);
            } catch (err) {
              console.error('SongBPM scraper failed for:', song.title, err.message);
            }

            // Fallback to Deezer for BPM if missing
            if (!updates.bpm) {
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

            // Fetch YouTube link
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

            // Generate Spotify search URL
            updates.spotifyUrl = spotifyService.generateSearchUrl(song.title, song.artist);
            fieldsUpdated.push('spotify');

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
                      select: { id: true, displayName: true }
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

    res.json({ message: 'Song deleted' });
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
