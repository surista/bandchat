import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import songBPMService from '../services/songbpm.js';
import itunesService from '../services/itunes.js';
import youtubeService from '../services/youtube.js';
import spotifyService from '../services/spotify.js';

const router = express.Router();

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
      orderBy: { title: 'asc' }
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
    const { title, shortName, artist, duration, key, bpm, notes, youtubeUrl, spotifyUrl } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const song = await prisma.song.create({
      data: {
        title,
        shortName,
        artist,
        duration,
        key,
        bpm,
        notes,
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
    configured: songBPMService.isConfigured(), // Legacy - true if any service available
    services: {
      getSongBPM: songBPMService.isConfigured(),
      youtube: youtubeService.isConfigured(),
      itunes: true, // Always available, no API key needed
      spotify: false // API access restricted, using search URLs
    }
  });
});

// Enrich songs with missing metadata
router.post('/workspace/:workspaceId/enrich', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { songIds } = req.body; // Optional: specific song IDs to enrich

    // Get songs to enrich
    const where = {
      workspaceId: req.params.workspaceId,
      ...(songIds?.length > 0 && { id: { in: songIds } })
    };

    const songs = await prisma.song.findMany({ where });

    const results = {
      processed: 0,
      updated: 0,
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

      // Fetch BPM and Key from GetSongBPM
      if ((needsBpm || needsKey) && songBPMService.isConfigured()) {
        try {
          const bpmData = await songBPMService.getTrackMetadata(song.title, song.artist);
          if (bpmData) {
            if (needsBpm && bpmData.bpm) {
              updates.bpm = bpmData.bpm;
              fieldsUpdated.push('bpm');
            }
            if (needsKey && bpmData.key) {
              updates.key = bpmData.key;
              fieldsUpdated.push('key');
            }
          }
        } catch (err) {
          console.error('BPM lookup failed for:', song.title, err.message);
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
      io.to(`workspace:${req.params.workspaceId}`).emit('songs:enriched', results);
    }

    res.json(results);
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

    res.json(song);
  } catch (error) {
    console.error('Get song error:', error);
    res.status(500).json({ error: 'Failed to get song' });
  }
});

// Update a song
router.put('/:songId', authenticate, async (req, res) => {
  try {
    const { title, shortName, artist, duration, key, bpm, notes, youtubeUrl, spotifyUrl } = req.body;

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

    if (!songs || !Array.isArray(songs) || songs.length === 0) {
      return res.status(400).json({ error: 'Songs array is required' });
    }

    if (songs.length > 200) {
      return res.status(400).json({ error: 'Maximum 200 songs per import' });
    }

    const results = {
      created: [],
      skipped: [],
      errors: [],
      metadataMatches: 0
    };

    for (const songData of songs) {
      if (!songData.title || !songData.title.trim()) {
        results.errors.push({ song: songData, error: 'Title is required' });
        continue;
      }

      try {
        const title = songData.title.trim();
        const artist = songData.artist?.trim() || null;

        let bpm = null;
        let key = null;
        let duration = null;
        let youtubeUrl = null;
        let spotifyUrl = null;
        let gotMetadata = false;

        if (fetchMetadata) {
          // Fetch BPM and Key from GetSongBPM
          if (songBPMService.isConfigured()) {
            try {
              const bpmData = await songBPMService.getTrackMetadata(title, artist);
              if (bpmData) {
                bpm = bpmData.bpm;
                key = bpmData.key;
                if (bpm || key) gotMetadata = true;
              }
            } catch (err) {
              console.error('BPM lookup failed for:', title, err.message);
            }
          }

          // Fetch duration from iTunes
          try {
            const itunesData = await itunesService.searchTrack(title, artist);
            if (itunesData?.duration) {
              duration = itunesData.duration;
              gotMetadata = true;
            }
          } catch (err) {
            console.error('iTunes lookup failed for:', title, err.message);
          }

          // Fetch YouTube link
          try {
            const ytData = await youtubeService.searchVideo(title, artist);
            if (ytData?.url) {
              youtubeUrl = ytData.url;
              gotMetadata = true;
            }
          } catch (err) {
            console.error('YouTube lookup failed for:', title, err.message);
          }

          // Generate Spotify search URL
          spotifyUrl = spotifyService.generateSearchUrl(title, artist);

          if (gotMetadata) {
            results.metadataMatches++;
          }
        }

        const song = await prisma.song.create({
          data: {
            title,
            artist,
            duration,
            bpm,
            key,
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
    if (results.created.length > 0) {
      const io = req.app.get('io');
      io.to(`workspace:${req.params.workspaceId}`).emit('songs:bulkCreated', results.created);
    }

    res.status(201).json(results);
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

export default router;
