import express from 'express';
import { authenticate, isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Key compatibility chart (circle of fifths distance)
const KEY_CIRCLE = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const MINOR_MAP = {
  'Am': 'C', 'Em': 'G', 'Bm': 'D', 'F#m': 'A', 'C#m': 'E', 'G#m': 'B',
  'D#m': 'F#', 'Bbm': 'Db', 'Fm': 'Ab', 'Cm': 'Eb', 'Gm': 'Bb', 'Dm': 'F'
};

function normalizeKey(key) {
  if (!key) return null;
  const cleaned = key.trim();
  // Convert minor keys to relative major
  if (MINOR_MAP[cleaned]) return MINOR_MAP[cleaned];
  // Handle variations
  const normalized = cleaned.replace('\u266D', 'b').replace('\u266F', '#');
  // Map enharmonic equivalents
  const enharmonics = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
  return enharmonics[normalized] || normalized;
}

function getKeyDistance(key1, key2) {
  const norm1 = normalizeKey(key1);
  const norm2 = normalizeKey(key2);
  if (!norm1 || !norm2) return null;

  const idx1 = KEY_CIRCLE.indexOf(norm1);
  const idx2 = KEY_CIRCLE.indexOf(norm2);
  if (idx1 === -1 || idx2 === -1) return null;

  const dist = Math.abs(idx1 - idx2);
  return Math.min(dist, 12 - dist); // Shortest distance around circle
}

function getBpmCompatibility(bpm1, bpm2) {
  if (!bpm1 || !bpm2) return null;

  // Calculate compatibility score (0-100)
  const diff = Math.abs(bpm1 - bpm2);

  // Check half-time / double-time relationships
  const halfTime = Math.abs(bpm1 - bpm2 / 2);
  const doubleTime = Math.abs(bpm1 - bpm2 * 2);

  const minDiff = Math.min(diff, halfTime, doubleTime);

  if (minDiff <= 3) return 100; // Perfect match
  if (minDiff <= 5) return 90;
  if (minDiff <= 10) return 75;
  if (minDiff <= 15) return 60;
  if (minDiff <= 20) return 40;
  if (minDiff <= 30) return 20;
  return 0;
}

// Get mashup suggestions for a song
router.get('/workspace/:workspaceId/mashups/:songId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const sourceSong = await prisma.song.findFirst({
      where: {
        id: req.params.songId,
        workspaceId: req.params.workspaceId
      }
    });

    if (!sourceSong) {
      return res.status(404).json({ error: 'Song not found' });
    }

    // Get all other songs in workspace
    const allSongs = await prisma.song.findMany({
      where: {
        workspaceId: req.params.workspaceId,
        id: { not: sourceSong.id }
      }
    });

    // Calculate compatibility scores
    const suggestions = allSongs.map(song => {
      const keyDistance = getKeyDistance(sourceSong.key, song.key);
      const bpmScore = getBpmCompatibility(sourceSong.bpm, song.bpm);

      // Calculate overall score
      let score = 0;
      let factors = [];

      if (keyDistance !== null) {
        // Same key or relative minor = 40 points, adjacent keys = 30, etc.
        const keyScore = Math.max(0, 40 - (keyDistance * 10));
        score += keyScore;
        factors.push({
          type: 'key',
          score: keyScore,
          reason: keyDistance === 0 ? 'Same key' :
                  keyDistance === 1 ? 'Adjacent keys' :
                  keyDistance <= 2 ? 'Compatible keys' : 'Different keys'
        });
      }

      if (bpmScore !== null) {
        // BPM contributes up to 40 points
        const normalizedBpmScore = (bpmScore / 100) * 40;
        score += normalizedBpmScore;

        const bpmDiff = Math.abs(sourceSong.bpm - song.bpm);
        factors.push({
          type: 'bpm',
          score: normalizedBpmScore,
          reason: bpmDiff <= 3 ? 'Matching tempo' :
                  bpmDiff <= 10 ? 'Similar tempo' :
                  bpmScore >= 75 ? 'Half/double time match' : 'Different tempo'
        });
      }

      // Bonus for same artist (potential medley)
      if (sourceSong.artist && song.artist &&
          sourceSong.artist.toLowerCase() === song.artist.toLowerCase()) {
        score += 20;
        factors.push({
          type: 'artist',
          score: 20,
          reason: 'Same artist medley potential'
        });
      }

      return {
        song,
        score: Math.round(score),
        maxScore: 100,
        keyMatch: keyDistance === 0,
        keyDistance,
        bpmDiff: sourceSong.bpm && song.bpm ? Math.abs(sourceSong.bpm - song.bpm) : null,
        factors
      };
    })
    .filter(s => s.score > 0 || s.song.key || s.song.bpm)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

    res.json({
      sourceSong: {
        id: sourceSong.id,
        title: sourceSong.title,
        artist: sourceSong.artist,
        key: sourceSong.key,
        bpm: sourceSong.bpm
      },
      suggestions
    });
  } catch (error) {
    console.error('Error getting mashup suggestions:', error);
    res.status(500).json({ error: 'Failed to get mashup suggestions' });
  }
});

// Get all compatible transitions for setlist optimization
router.get('/workspace/:workspaceId/transitions', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { minScore = 50 } = req.query;

    const songs = await prisma.song.findMany({
      where: {
        workspaceId: req.params.workspaceId,
        OR: [
          { key: { not: null } },
          { bpm: { not: null } }
        ]
      }
    });

    const transitions = [];

    // Calculate all pair-wise transitions
    for (let i = 0; i < songs.length; i++) {
      for (let j = i + 1; j < songs.length; j++) {
        const song1 = songs[i];
        const song2 = songs[j];

        const keyDistance = getKeyDistance(song1.key, song2.key);
        const bpmScore = getBpmCompatibility(song1.bpm, song2.bpm);

        let score = 0;
        if (keyDistance !== null) {
          score += Math.max(0, 50 - (keyDistance * 12));
        }
        if (bpmScore !== null) {
          score += (bpmScore / 100) * 50;
        }

        if (score >= parseInt(minScore)) {
          transitions.push({
            from: { id: song1.id, title: song1.title, artist: song1.artist, key: song1.key, bpm: song1.bpm },
            to: { id: song2.id, title: song2.title, artist: song2.artist, key: song2.key, bpm: song2.bpm },
            score: Math.round(score),
            keyDistance,
            bpmDiff: song1.bpm && song2.bpm ? Math.abs(song1.bpm - song2.bpm) : null
          });
        }
      }
    }

    transitions.sort((a, b) => b.score - a.score);

    res.json({
      count: transitions.length,
      transitions: transitions.slice(0, 100) // Limit response size
    });
  } catch (error) {
    console.error('Error getting transitions:', error);
    res.status(500).json({ error: 'Failed to get transitions' });
  }
});

// Get song suggestions based on repertoire analysis
router.get('/workspace/:workspaceId/recommendations', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    // Analyze current repertoire
    const songs = await prisma.song.findMany({
      where: { workspaceId: req.params.workspaceId }
    });

    if (songs.length < 3) {
      return res.json({
        message: 'Add more songs to get personalized recommendations',
        recommendations: []
      });
    }

    // Calculate repertoire statistics
    const artists = {};
    const decades = {};
    const keys = {};
    const bpmRanges = { slow: 0, medium: 0, fast: 0, verySlow: 0, veryFast: 0 };
    const genres = {}; // Inferred from artist patterns

    songs.forEach(song => {
      // Count artists
      if (song.artist) {
        artists[song.artist] = (artists[song.artist] || 0) + 1;
      }

      // Count keys
      if (song.key) {
        keys[song.key] = (keys[song.key] || 0) + 1;
      }

      // Categorize BPM
      if (song.bpm) {
        if (song.bpm < 80) bpmRanges.verySlow++;
        else if (song.bpm < 100) bpmRanges.slow++;
        else if (song.bpm < 130) bpmRanges.medium++;
        else if (song.bpm < 160) bpmRanges.fast++;
        else bpmRanges.veryFast++;
      }
    });

    // Sort artists by frequency
    const topArtists = Object.entries(artists)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Sort keys by frequency
    const topKeys = Object.entries(keys)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Calculate average BPM
    const songsWithBpm = songs.filter(s => s.bpm);
    const avgBpm = songsWithBpm.length > 0
      ? Math.round(songsWithBpm.reduce((sum, s) => sum + s.bpm, 0) / songsWithBpm.length)
      : null;

    // Determine dominant tempo category
    const dominantTempo = Object.entries(bpmRanges)
      .sort((a, b) => b[1] - a[1])[0][0];

    // Generate recommendations based on analysis
    const recommendations = [];

    // Recommend more songs by top artists
    topArtists.slice(0, 3).forEach(([artist, count]) => {
      recommendations.push({
        type: 'artist',
        priority: 'high',
        suggestion: `More songs by ${artist}`,
        reason: `You have ${count} songs by this artist - fans clearly love them!`,
        searchTerm: artist
      });
    });

    // Recommend songs in frequently used keys
    if (topKeys.length > 0) {
      const [topKey, keyCount] = topKeys[0];
      recommendations.push({
        type: 'key',
        priority: 'medium',
        suggestion: `Songs in ${topKey}`,
        reason: `${keyCount} of your songs are in ${topKey} - good for smooth transitions`,
        searchTerm: `songs in key of ${topKey}`
      });
    }

    // Tempo-based recommendations
    if (avgBpm) {
      const tempoSuggestions = {
        verySlow: 'Some uptempo songs to energize the crowd',
        slow: 'Medium-tempo songs for variety',
        medium: 'You have a balanced tempo selection!',
        fast: 'A few ballads to give the crowd a breather',
        veryFast: 'Some mid-tempo songs for pacing'
      };

      if (dominantTempo !== 'medium') {
        recommendations.push({
          type: 'tempo',
          priority: 'medium',
          suggestion: tempoSuggestions[dominantTempo],
          reason: `Average BPM is ${avgBpm} - diversify your energy levels`,
          searchTerm: dominantTempo === 'fast' || dominantTempo === 'veryFast'
            ? 'ballads' : 'uptempo hits'
        });
      }
    }

    // Gap analysis - suggest filling holes
    if (bpmRanges.slow < 2) {
      recommendations.push({
        type: 'gap',
        priority: 'low',
        suggestion: 'Add some slow jams (80-100 BPM)',
        reason: 'Great for romantic moments or giving dancers a break',
        searchTerm: 'slow dance songs'
      });
    }

    if (bpmRanges.fast < 2) {
      recommendations.push({
        type: 'gap',
        priority: 'low',
        suggestion: 'Add some high-energy bangers (130-160 BPM)',
        reason: 'Perfect for peak party moments',
        searchTerm: 'high energy dance songs'
      });
    }

    // Diversity suggestions
    const uniqueArtists = Object.keys(artists).length;
    const totalSongs = songs.length;
    const diversityRatio = uniqueArtists / totalSongs;

    if (diversityRatio < 0.3) {
      recommendations.push({
        type: 'diversity',
        priority: 'low',
        suggestion: 'Branch out to new artists',
        reason: `Only ${uniqueArtists} unique artists across ${totalSongs} songs`,
        searchTerm: 'popular cover songs'
      });
    }

    res.json({
      analysis: {
        totalSongs: songs.length,
        uniqueArtists: Object.keys(artists).length,
        topArtists: topArtists.slice(0, 5),
        topKeys: topKeys,
        averageBpm: avgBpm,
        tempoDistribution: bpmRanges
      },
      recommendations: recommendations.slice(0, parseInt(limit))
    });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

// Suggest optimal setlist order based on musical flow
router.post('/workspace/:workspaceId/optimize-setlist', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { songIds } = req.body;

    if (!songIds || songIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 songs required' });
    }

    const songs = await prisma.song.findMany({
      where: {
        id: { in: songIds },
        workspaceId: req.params.workspaceId
      }
    });

    if (songs.length !== songIds.length) {
      return res.status(400).json({ error: 'Some songs not found' });
    }

    // Simple greedy optimization: start with random, then find best next song
    const remaining = [...songs];
    const ordered = [];

    // Start with a medium-tempo song if possible
    remaining.sort((a, b) => {
      const aDist = a.bpm ? Math.abs(a.bpm - 120) : 100;
      const bDist = b.bpm ? Math.abs(b.bpm - 120) : 100;
      return aDist - bDist;
    });

    ordered.push(remaining.shift());

    while (remaining.length > 0) {
      const lastSong = ordered[ordered.length - 1];
      let bestIdx = 0;
      let bestScore = -1;

      remaining.forEach((song, idx) => {
        let score = 0;

        // Key compatibility
        const keyDist = getKeyDistance(lastSong.key, song.key);
        if (keyDist !== null) {
          score += Math.max(0, 50 - (keyDist * 12));
        }

        // BPM compatibility - prefer gradual energy changes
        if (lastSong.bpm && song.bpm) {
          const bpmDiff = Math.abs(lastSong.bpm - song.bpm);
          // Ideal is 5-15 BPM change for energy flow
          if (bpmDiff >= 5 && bpmDiff <= 15) score += 30;
          else if (bpmDiff < 5) score += 20; // Similar energy
          else if (bpmDiff <= 25) score += 10;
        }

        // Avoid same artist back-to-back (unless it's a medley)
        if (lastSong.artist && song.artist &&
            lastSong.artist.toLowerCase() === song.artist.toLowerCase()) {
          score -= 10;
        }

        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      });

      ordered.push(remaining.splice(bestIdx, 1)[0]);
    }

    // Calculate flow score for the ordering
    let totalFlowScore = 0;
    for (let i = 1; i < ordered.length; i++) {
      const keyDist = getKeyDistance(ordered[i-1].key, ordered[i].key);
      const bpmScore = getBpmCompatibility(ordered[i-1].bpm, ordered[i].bpm);

      if (keyDist !== null) totalFlowScore += Math.max(0, 50 - (keyDist * 12));
      if (bpmScore !== null) totalFlowScore += (bpmScore / 100) * 50;
    }

    const avgFlowScore = Math.round(totalFlowScore / (ordered.length - 1));

    res.json({
      optimizedOrder: ordered.map(s => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        key: s.key,
        bpm: s.bpm
      })),
      flowScore: avgFlowScore,
      maxPossibleScore: 100,
      tip: avgFlowScore >= 70 ? 'Great flow!' :
           avgFlowScore >= 50 ? 'Good transitions' :
           'Consider adding more songs with similar keys/tempos'
    });
  } catch (error) {
    console.error('Error optimizing setlist:', error);
    res.status(500).json({ error: 'Failed to optimize setlist' });
  }
});

export default router;
