import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import songBPMScraperService from '../services/songbpm-scraper.js';
import deezerService from '../services/deezer.js';
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
    const { songIds } = req.body; // Optional: specific song IDs to enrich

    // Get songs to enrich
    const where = {
      workspaceId: req.params.workspaceId,
      ...(songIds?.length > 0 && { id: { in: songIds } })
    };

    const songs = await prisma.song.findMany({ where });
    console.log(`Enriching ${songs.length} songs...`);

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
        const shortName = songData.shortName?.trim() || null;
        const artist = songData.artist?.trim() || null;

        let bpm = null;
        let key = null;
        let duration = null;
        let youtubeUrl = null;
        let spotifyUrl = null;
        let gotMetadata = false;

        if (fetchMetadata) {
          // Fetch BPM and Key from SongBPM.com scraper
          try {
            const scraperData = await songBPMScraperService.getTrackMetadata(title, artist);
            if (scraperData?.bpm) {
              bpm = scraperData.bpm;
              gotMetadata = true;
            }
            if (scraperData?.key) {
              key = scraperData.key;
              gotMetadata = true;
            }
          } catch (err) {
            console.error('SongBPM scraper failed for:', title, err.message);
          }

          // Fallback to Deezer for BPM if missing
          if (!bpm) {
            try {
              const deezerData = await deezerService.getTrackMetadata(title, artist);
              if (deezerData?.bpm) {
                bpm = deezerData.bpm;
                gotMetadata = true;
              }
            } catch (err) {
              console.error('Deezer lookup failed for:', title, err.message);
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
            shortName,
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
