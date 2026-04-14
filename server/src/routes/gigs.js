import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import prisma, { USER_SELECT_BRIEF } from '../lib/prisma.js';
import { deleteFile, isR2Url } from '../lib/storage.js';
import { safeDecrementStorage } from './uploads.js';
import { parseICS, parseICSMultiple } from '../lib/icsParser.js';
import { isAllowedUploadUrl } from '../lib/validateUrl.js';
import { getPlanLimits } from '../lib/planLimits.js';
import { triggerWebsiteSync } from '../services/websiteDeployment.js';
import { sendPushToUser } from './push.js';
import { logAudit } from '../lib/audit.js';
import { getConflictsForUser, getAffectedWorkspaceIds } from '../services/calendarConflicts.js';

const router = express.Router();

const VALID_GIG_TYPES = ['GIG', 'REHEARSAL', 'RECORDING', 'OTHER'];
const VALID_GIG_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'];

const calendarLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, skip: process.env.NODE_ENV === 'test' ? () => true : undefined, message: { error: 'Too many requests' } });

// Get all gigs for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { type, status, from, to } = req.query;

    if (from && isNaN(Date.parse(from))) {
      return res.status(400).json({ error: 'Invalid from date' });
    }
    if (to && isNaN(Date.parse(to))) {
      return res.status(400).json({ error: 'Invalid to date' });
    }

    // Validate enum query params against allowed values (supports comma-separated types)
    const validTypes = type
      ? type.split(',').filter(t => VALID_GIG_TYPES.includes(t))
      : [];
    const validStatus = status && VALID_GIG_STATUSES.includes(status) ? status : undefined;

    // Filter: show non-personal events OR personal events created by current user
    const where = {
      workspaceId: req.params.workspaceId,
      OR: [
        { isPersonal: false },
        { isPersonal: true, createdById: req.user.id }
      ],
      ...(validTypes.length === 1 && { type: validTypes[0] }),
      ...(validTypes.length > 1 && { type: { in: validTypes } }),
      ...(validStatus && { status: validStatus }),
      ...(from || to) && {
        date: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) })
        }
      }
    };

    const gigs = await prisma.gig.findMany({
      where,
      include: {
        createdBy: {
          select: USER_SELECT_BRIEF
        },
        venueRecord: {
          select: { id: true, name: true, address: true, city: true, imageUrl: true }
        },
        setlists: {
          include: {
            setlist: {
              include: {
                songs: {
                  include: { song: true },
                  orderBy: { position: 'asc' }
                }
              }
            }
          },
          orderBy: { setNumber: 'asc' }
        },
        media: {
          orderBy: { createdAt: 'desc' }
        },
        attendees: {
          include: {
            bandMember: {
              select: { id: true, name: true, imageUrl: true }
            }
          }
        },
        _count: {
          select: { songsPlayed: true }
        }
      },
      orderBy: { date: 'asc' },
      take: 500
    });

    res.json(gigs);
  } catch (error) {
    console.error('Get gigs error:', error);
    res.status(500).json({ error: 'Failed to get gigs' });
  }
});

// Get the next upcoming gig/rehearsal for a workspace
router.get('/workspace/:workspaceId/next', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const gig = await prisma.gig.findFirst({
      where: {
        workspaceId: req.params.workspaceId,
        status: 'SCHEDULED',
        date: { gte: new Date() },
        isPersonal: false,
      },
      include: {
        venueRecord: {
          select: { id: true, name: true, address: true, city: true, imageUrl: true }
        },
        setlists: {
          include: {
            setlist: { select: { id: true, name: true } }
          },
          orderBy: { setNumber: 'asc' }
        },
        attendees: {
          where: { bandMember: { linkedUserId: req.user.id } },
          select: { status: true }
        },
        _count: { select: { attendees: true } }
      },
      orderBy: { date: 'asc' },
    });

    if (gig) {
      gig.myAttendance = gig.attendees?.[0]?.status || null;
      delete gig.attendees;
    }

    res.json(gig || null);
  } catch (error) {
    console.error('Get next gig error:', error);
    res.status(500).json({ error: 'Failed to get next gig' });
  }
});

// Get gigs from all user's workspaces (for cross-workspace calendar view)
router.get('/all-workspaces', authenticate, async (req, res) => {
  try {
    const { type, status, from, to, excludeWorkspaceId } = req.query;

    if (from && isNaN(Date.parse(from))) {
      return res.status(400).json({ error: 'Invalid from date' });
    }
    if (to && isNaN(Date.parse(to))) {
      return res.status(400).json({ error: 'Invalid to date' });
    }

    // Get all workspace IDs user belongs to (exclude soft-deleted workspaces)
    const memberships = await prisma.workspaceMember.findMany({
      where: {
        userId: req.user.id,
        workspace: { deletedAt: null }
      },
      select: { workspaceId: true }
    });

    let workspaceIds = memberships.map(m => m.workspaceId);

    // Optionally exclude current workspace
    if (excludeWorkspaceId) {
      workspaceIds = workspaceIds.filter(id => id !== excludeWorkspaceId);
    }

    if (workspaceIds.length === 0) {
      return res.json([]);
    }

    // Validate enum query params against allowed values (supports comma-separated types)
    const validTypes = type
      ? type.split(',').filter(t => VALID_GIG_TYPES.includes(t))
      : [];
    const validStatus = status && VALID_GIG_STATUSES.includes(status) ? status : undefined;

    const where = {
      workspaceId: { in: workspaceIds },
      // Filter: show non-personal events OR personal events created by current user
      OR: [
        { isPersonal: false },
        { isPersonal: true, createdById: req.user.id }
      ],
      ...(validTypes.length === 1 && { type: validTypes[0] }),
      ...(validTypes.length > 1 && { type: { in: validTypes } }),
      ...(validStatus && { status: validStatus }),
      ...(from || to) && {
        date: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) })
        }
      }
    };

    const gigs = await prisma.gig.findMany({
      where,
      include: {
        workspace: {
          select: { id: true, name: true }
        },
        createdBy: {
          select: USER_SELECT_BRIEF
        },
        venueRecord: {
          select: { id: true, name: true, address: true, city: true, imageUrl: true }
        },
        setlists: {
          include: {
            setlist: {
              include: {
                songs: {
                  include: { song: true },
                  orderBy: { position: 'asc' }
                }
              }
            }
          },
          orderBy: { setNumber: 'asc' }
        },
        media: {
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: { songsPlayed: true }
        }
      },
      orderBy: { date: 'asc' },
      take: 500
    });

    res.json(gigs);
  } catch (error) {
    console.error('Get all workspaces gigs error:', error);
    res.status(500).json({ error: 'Failed to get gigs from all workspaces' });
  }
});

// Get gig statistics
router.get('/workspace/:workspaceId/stats', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;
    const now = new Date();

    // Check plan feature access
    const wsForStats = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true, planExpiresAt: true } });
    const statsLimits = getPlanLimits(wsForStats);
    if (!statsLimits.features.stats) {
      return res.status(403).json({ error: 'Stats is a Pro feature. Upgrade to unlock.', upgrade: true });
    }

    // Get setlists with performedAt dates and full song details (limit 500 for performance)
    const performedSetlists = await prisma.setlist.findMany({
      where: {
        workspaceId,
        performedAt: { not: null, lte: now }
      },
      include: {
        songs: {
          where: { type: 'SONG', songId: { not: null } },
          include: {
            song: {
              select: { id: true, title: true, artist: true, duration: true }
            }
          }
        }
      },
      orderBy: { performedAt: 'asc' },
      take: 500
    });

    const totalGigs = performedSetlists.length;

    // Count song plays and calculate total time
    const songPlayCounts = {};
    const songTotalTime = {};
    let totalTimeSeconds = 0;
    const venueCounts = {};
    let totalSongsPlayed = 0;
    let longestSetlistCount = 0;
    let longestSetlistName = null;

    for (const setlist of performedSetlists) {
      const songCount = setlist.songs.length;
      totalSongsPlayed += songCount;

      if (songCount > longestSetlistCount) {
        longestSetlistCount = songCount;
        longestSetlistName = setlist.name;
      }

      // Count venues
      if (setlist.venue) {
        venueCounts[setlist.venue] = (venueCounts[setlist.venue] || 0) + 1;
      }

      for (const item of setlist.songs) {
        if (item.song) {
          const songId = item.song.id;
          const duration = item.song.duration || 0;

          songPlayCounts[songId] = (songPlayCounts[songId] || 0) + 1;
          songTotalTime[songId] = (songTotalTime[songId] || 0) + duration;
          totalTimeSeconds += duration;
        }
      }
    }

    // Most played songs (top 10)
    const sortedSongIds = Object.entries(songPlayCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const allSongIds = [...new Set([
      ...sortedSongIds.map(([id]) => id),
      ...Object.entries(songTotalTime).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id)
    ])];

    const songs = await prisma.song.findMany({
      where: { id: { in: allSongIds } },
      select: { id: true, title: true, artist: true, duration: true }
    });

    const mostPlayedWithDetails = sortedSongIds.map(([songId, count]) => ({
      ...songs.find(s => s.id === songId),
      playCount: count,
      totalTime: songTotalTime[songId] || 0
    }));

    // Most time spent on a single song
    const mostTimeSongEntry = Object.entries(songTotalTime).sort((a, b) => b[1] - a[1])[0];
    const mostTimeSong = mostTimeSongEntry ? {
      ...songs.find(s => s.id === mostTimeSongEntry[0]),
      totalTime: mostTimeSongEntry[1],
      playCount: songPlayCounts[mostTimeSongEntry[0]]
    } : null;

    // Most common venues (top 5) - will be enhanced with setlist details below

    // Busiest stretch - find max gigs in a 14-day window
    let busiestStretch = null;
    let busiestSetlists = [];
    if (performedSetlists.length >= 2) {
      let maxGigsInWindow = 0;
      let busiestStart = null;
      let busiestEnd = null;
      let busiestWindowSetlists = [];

      for (let i = 0; i < performedSetlists.length; i++) {
        const windowStart = new Date(performedSetlists[i].performedAt);
        const windowEnd = new Date(windowStart);
        windowEnd.setDate(windowEnd.getDate() + 14); // 2 week window

        let gigsInWindow = 0;
        let lastGigInWindow = performedSetlists[i].performedAt;
        let windowSetlists = [];

        for (let j = i; j < performedSetlists.length; j++) {
          const gigDate = new Date(performedSetlists[j].performedAt);
          if (gigDate <= windowEnd) {
            gigsInWindow++;
            lastGigInWindow = performedSetlists[j].performedAt;
            windowSetlists.push({
              id: performedSetlists[j].id,
              name: performedSetlists[j].name,
              venue: performedSetlists[j].venue,
              performedAt: performedSetlists[j].performedAt
            });
          } else {
            break;
          }
        }

        if (gigsInWindow > maxGigsInWindow && gigsInWindow >= 2) {
          maxGigsInWindow = gigsInWindow;
          busiestStart = windowStart;
          busiestEnd = new Date(lastGigInWindow);
          busiestWindowSetlists = windowSetlists;
        }
      }

      if (maxGigsInWindow >= 2) {
        const days = Math.round((busiestEnd - busiestStart) / (1000 * 60 * 60 * 24)) + 1;
        busiestStretch = {
          gigs: maxGigsInWindow,
          days,
          startDate: busiestStart,
          endDate: busiestEnd,
          setlists: busiestWindowSetlists
        };
      }
    }

    // First and last gig dates
    const firstGig = performedSetlists.length > 0 ? performedSetlists[0].performedAt : null;
    const lastGig = performedSetlists.length > 0 ? performedSetlists[performedSetlists.length - 1].performedAt : null;

    // Longest gap between gigs
    let longestGap = null;
    if (performedSetlists.length >= 2) {
      let maxGapDays = 0;
      let gapStart = null;
      let gapEnd = null;
      for (let i = 1; i < performedSetlists.length; i++) {
        const prev = new Date(performedSetlists[i - 1].performedAt);
        const curr = new Date(performedSetlists[i].performedAt);
        const gapDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
        if (gapDays > maxGapDays) {
          maxGapDays = gapDays;
          gapStart = prev;
          gapEnd = curr;
        }
      }
      if (maxGapDays > 0) {
        longestGap = { days: maxGapDays, startDate: gapStart, endDate: gapEnd };
      }
    }

    // Most played artist - need to fetch ALL played songs for accurate count
    const allPlayedSongIds = Object.keys(songPlayCounts);
    const allPlayedSongs = allPlayedSongIds.length > 0 ? await prisma.song.findMany({
      where: { id: { in: allPlayedSongIds } },
      select: { id: true, artist: true }
    }) : [];

    const artistCounts = {};
    for (const [songId, count] of Object.entries(songPlayCounts)) {
      const song = allPlayedSongs.find(s => s.id === songId);
      if (song?.artist) {
        artistCounts[song.artist] = (artistCounts[song.artist] || 0) + count;
      }
    }
    const topArtistEntry = Object.entries(artistCounts).sort((a, b) => b[1] - a[1])[0];
    const mostPlayedArtist = topArtistEntry ? { name: topArtistEntry[0], playCount: topArtistEntry[1] } : null;

    // Shortest setlist (with at least 1 song)
    let shortestSetlist = null;
    for (const setlist of performedSetlists) {
      const songCount = setlist.songs.length;
      if (songCount > 0 && (!shortestSetlist || songCount < shortestSetlist.songCount)) {
        shortestSetlist = { name: setlist.name, songCount, id: setlist.id, venue: setlist.venue, performedAt: setlist.performedAt };
      }
    }

    // Most songs in shortest time (highest song density)
    let mostSongsShortestTime = null;
    if (performedSetlists.length >= 2) {
      let bestDensity = 0;

      // Look at all possible consecutive gig stretches (2+ gigs)
      for (let i = 0; i < performedSetlists.length; i++) {
        let totalSongs = performedSetlists[i].songs.length;
        const windowSetlists = [{
          id: performedSetlists[i].id,
          name: performedSetlists[i].name,
          venue: performedSetlists[i].venue,
          performedAt: performedSetlists[i].performedAt,
          songCount: performedSetlists[i].songs.length
        }];

        for (let j = i + 1; j < performedSetlists.length; j++) {
          totalSongs += performedSetlists[j].songs.length;
          windowSetlists.push({
            id: performedSetlists[j].id,
            name: performedSetlists[j].name,
            venue: performedSetlists[j].venue,
            performedAt: performedSetlists[j].performedAt,
            songCount: performedSetlists[j].songs.length
          });

          const startDate = new Date(performedSetlists[i].performedAt);
          const endDate = new Date(performedSetlists[j].performedAt);
          const days = Math.max(1, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1);
          const density = totalSongs / days;

          // Only consider stretches within 14 days and with meaningful song density
          if (days <= 14 && density > bestDensity && totalSongs >= 10) {
            bestDensity = density;
            mostSongsShortestTime = {
              totalSongs,
              days,
              songsPerDay: Math.round(density * 10) / 10,
              startDate,
              endDate,
              setlists: [...windowSetlists]
            };
          }
        }
      }
    }

    // Days since last gig
    const daysSinceLastGig = lastGig ? Math.round((now - new Date(lastGig)) / (1000 * 60 * 60 * 24)) : null;

    // Top venues with setlist details
    const venueSetlists = {};
    for (const setlist of performedSetlists) {
      if (setlist.venue) {
        if (!venueSetlists[setlist.venue]) {
          venueSetlists[setlist.venue] = [];
        }
        venueSetlists[setlist.venue].push({
          id: setlist.id,
          name: setlist.name,
          performedAt: setlist.performedAt
        });
      }
    }

    // Songs never played
    const playedSongIds = Object.keys(songPlayCounts);
    const neverPlayed = await prisma.song.count({
      where: {
        workspaceId,
        id: { notIn: playedSongIds.length > 0 ? playedSongIds : ['none'] }
      }
    });

    // Upcoming gigs from calendar
    const upcomingGigs = await prisma.gig.count({
      where: {
        workspaceId,
        status: 'SCHEDULED',
        date: { gte: now }
      }
    });

    // Total rehearsals
    const totalRehearsals = await prisma.gig.count({
      where: { workspaceId, status: 'COMPLETED', type: 'REHEARSAL' }
    });

    // Total revenue (all gigs with pay, regardless of status)
    const [revenue, kitty] = await Promise.all([
      prisma.gig.aggregate({
        where: { workspaceId, pay: { not: null } },
        _sum: { pay: true }
      }),
      prisma.bandKitty.findUnique({ where: { workspaceId }, select: { currency: true } })
    ]);

    // Calculate total time in hours and minutes
    const totalHours = Math.floor(totalTimeSeconds / 3600);
    const totalMinutes = Math.floor((totalTimeSeconds % 3600) / 60);

    // Build topVenues with setlist details
    const topVenues = Object.entries(venueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([venue, count]) => ({ venue, count, setlists: venueSetlists[venue] || [] }));

    res.json({
      totalGigs,
      totalRehearsals,
      totalRevenue: Number(revenue._sum.pay) || 0,
      currency: kitty?.currency || 'USD',
      mostPlayedSongs: mostPlayedWithDetails,
      songsNeverPlayed: neverPlayed,
      upcomingGigs,
      // Fun stats
      totalTimeGigged: {
        hours: totalHours,
        minutes: totalMinutes,
        totalSeconds: totalTimeSeconds
      },
      mostTimeSong,
      topVenues,
      busiestStretch,
      firstGig,
      lastGig,
      uniqueSongsPlayed: Object.keys(songPlayCounts).length,
      averageSongsPerGig: totalGigs > 0 ? Math.round(totalSongsPlayed / totalGigs) : 0,
      longestSetlist: longestSetlistCount > 0 ? { name: longestSetlistName, songCount: longestSetlistCount, id: performedSetlists.find(s => s.name === longestSetlistName)?.id } : null,
      // Additional fun stats
      longestGap,
      mostPlayedArtist,
      shortestSetlist,
      mostSongsShortestTime,
      daysSinceLastGig
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Create a gig
router.post('/workspace/:workspaceId', authenticate, apiLimiter, isWorkspaceMember, async (req, res) => {
  try {
    const { title, type, date, endDate, soundCheckTime, eventStartTime, performanceStartTime, venue, address, notes, pay, setlistId, setlistIds, isLocked, isPersonal, bandMemberIds, venueId } = req.body;

    if (!title || !date) {
      return res.status(400).json({ error: 'Title and date are required' });
    }

    // Input length validation
    if (title.length > 200) return res.status(400).json({ error: 'Title must be 200 characters or less' });
    if (venue && venue.length > 200) return res.status(400).json({ error: 'Venue must be 200 characters or less' });
    if (address && address.length > 500) return res.status(400).json({ error: 'Address must be 500 characters or less' });
    if (notes && notes.length > 5000) return res.status(400).json({ error: 'Notes must be 5,000 characters or less' });

    // Validate enum values
    if (type && !VALID_GIG_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Invalid gig type' });
    }

    // Only admins can create locked events
    const canLock = req.workspaceMembership?.role === 'ADMIN';
    const gigType = type || 'GIG';
    const gigDate = new Date(date);

    // Auto-create a blank setlist for GIG events (if no setlist already provided)
    let autoSetlistId = null;
    if (gigType === 'GIG' && !setlistId && (!setlistIds || setlistIds.length === 0)) {
      // Generate unique setlist name (title + date to avoid conflicts)
      const dateStr = gigDate.toISOString().split('T')[0]; // YYYY-MM-DD
      let setlistName = title;

      // Check if a setlist with this name already exists
      const existingSetlist = await prisma.setlist.findUnique({
        where: {
          workspaceId_name: {
            workspaceId: req.params.workspaceId,
            name: title
          }
        }
      });

      // If exists, append date to make it unique
      if (existingSetlist) {
        setlistName = `${title} (${dateStr})`;
      }

      try {
        const autoSetlist = await prisma.setlist.create({
          data: {
            name: setlistName,
            performedAt: gigDate,
            venue: venue || null,
            isAutoCreated: true,
            workspaceId: req.params.workspaceId,
            createdById: req.user.id
          }
        });
        autoSetlistId = autoSetlist.id;
      } catch (err) {
        // If still fails (e.g., name with date also exists), log but continue without auto-setlist
        console.error('Failed to auto-create setlist:', err.message);
      }
    }

    // Consolidate all setlist IDs into a single array (setlistIds, setlistId, or autoSetlistId)
    const setlistIdsToLink = [
      ...(setlistIds || []),
      ...(setlistId && !setlistIds?.includes(setlistId) ? [setlistId] : []),
      ...(autoSetlistId && !setlistIds?.includes(autoSetlistId) && setlistId !== autoSetlistId ? [autoSetlistId] : [])
    ].filter(Boolean);

    // Verify setlists belong to this workspace
    if (setlistIdsToLink.length > 0) {
      const validSetlists = await prisma.setlist.count({
        where: { id: { in: setlistIdsToLink }, workspaceId: req.params.workspaceId }
      });
      if (validSetlists !== setlistIdsToLink.length) {
        return res.status(400).json({ error: 'One or more setlists not found in this workspace' });
      }
    }

    // If venueId provided, verify it belongs to this workspace and auto-populate name/address
    let resolvedVenue = venue;
    let resolvedAddress = address;
    if (venueId) {
      const venueRecord = await prisma.venue.findUnique({ where: { id: venueId }, select: { name: true, address: true, workspaceId: true } });
      if (!venueRecord || venueRecord.workspaceId !== req.params.workspaceId) {
        return res.status(400).json({ error: 'Venue not found in this workspace' });
      }
      resolvedVenue = venueRecord.name;
      resolvedAddress = resolvedAddress || venueRecord.address;
    }

    // Create gig with GigSetlist entries (consolidated approach - no legacy setlistId)
    const gig = await prisma.gig.create({
      data: {
        title,
        type: gigType,
        date: gigDate,
        endDate: endDate ? new Date(endDate) : null,
        soundCheckTime: soundCheckTime || null,
        eventStartTime: eventStartTime || null,
        performanceStartTime: performanceStartTime || null,
        venue: resolvedVenue,
        address: resolvedAddress,
        venueId: venueId || null,
        notes,
        pay,
        isLocked: canLock ? (isLocked || false) : false,
        isPersonal: isPersonal || false,
        workspaceId: req.params.workspaceId,
        createdById: req.user.id,
        // Create GigSetlist entries for all setlists (single or multiple)
        ...(setlistIdsToLink.length > 0 && {
          setlists: {
            create: setlistIdsToLink.map((id, index) => ({
              setlistId: id,
              setNumber: index + 1
            }))
          }
        }),
        // Create attendee entries if bandMemberIds provided
        ...(bandMemberIds && bandMemberIds.length > 0 && {
          attendees: {
            create: bandMemberIds.map(bandMemberId => ({
              bandMemberId,
              status: 'ATTENDING'
            }))
          }
        })
      },
      include: {
        createdBy: {
          select: USER_SELECT_BRIEF
        },
        venueRecord: {
          select: { id: true, name: true, address: true, city: true, imageUrl: true, phone: true, email: true, website: true, capacity: true }
        },
        setlists: {
          include: {
            setlist: {
              select: { id: true, name: true }
            }
          },
          orderBy: { setNumber: 'asc' }
        },
        attendees: {
          include: {
            bandMember: {
              select: { id: true, name: true, imageUrl: true }
            }
          }
        },
        media: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('gig:created', gig);

    // Send push notification to workspace members
    const wsMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId: req.params.workspaceId, userId: { not: req.user.id } },
      select: { userId: true }
    });
    const gigDateStr = gig.date ? new Date(gig.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const pushBody = [gig.title, gigDateStr, gig.venue].filter(Boolean).join(' · ');
    wsMembers.forEach(m => {
      sendPushToUser(m.userId, {
        title: 'New Gig',
        body: pushBody,
        tag: `gig-${gig.id}`,
        url: `/workspace/${req.params.workspaceId}`,
        workspaceId: req.params.workspaceId,
        threadId: req.params.workspaceId
      }, { category: 'gig', workspaceId: req.params.workspaceId });
    });

    logAudit('gig.created', { actorId: req.user.id, targetId: gig.id, metadata: { title } });

    // Notify affected workspaces about potential conflicts
    if (gig.attendees?.length > 0) {
      const attendeeUserIds = gig.attendees
        .filter(a => a.bandMember?.linkedUserId)
        .map(a => a.bandMember.linkedUserId);
      for (const uid of [...new Set(attendeeUserIds)]) {
        const wsIds = await getAffectedWorkspaceIds(uid);
        for (const wsId of wsIds) {
          if (wsId !== req.params.workspaceId) {
            io.to(`workspace:${wsId}`).emit('calendar:conflictsChanged', { userId: uid });
          }
        }
      }
    }

    res.status(201).json(gig);
    triggerWebsiteSync(req.params.workspaceId);
  } catch (error) {
    console.error('Create gig error:', error);
    res.status(500).json({ error: 'Failed to create gig' });
  }
});

// Get my scheduling conflicts across all workspaces
// IMPORTANT: Must be registered before /:gigId to avoid route shadowing
router.get('/my-conflicts', authenticate, apiLimiter, async (req, res) => {
  try {
    const { from, to } = req.query;

    if (from && isNaN(Date.parse(from))) {
      return res.status(400).json({ error: 'Invalid from date' });
    }
    if (to && isNaN(Date.parse(to))) {
      return res.status(400).json({ error: 'Invalid to date' });
    }

    const conflicts = await getConflictsForUser(req.user.id, { from, to });

    const formatted = conflicts.map(({ gigA, gigB }) => ({
      gigs: [
        {
          gigId: gigA.gigId,
          gigTitle: gigA.gigTitle,
          gigType: gigA.gigType,
          workspaceId: gigA.workspaceId,
          workspaceName: gigA.workspaceName,
          venue: gigA.venue,
          effectiveStart: gigA.effectiveStart,
          effectiveEnd: gigA.effectiveEnd,
        },
        {
          gigId: gigB.gigId,
          gigTitle: gigB.gigTitle,
          gigType: gigB.gigType,
          workspaceId: gigB.workspaceId,
          workspaceName: gigB.workspaceName,
          venue: gigB.venue,
          effectiveStart: gigB.effectiveStart,
          effectiveEnd: gigB.effectiveEnd,
        },
      ],
    }));

    res.json({ conflicts: formatted });
  } catch (error) {
    console.error('Get conflicts error:', error);
    res.status(500).json({ error: 'Failed to get conflicts' });
  }
});

// Get a single gig
router.get('/:gigId', authenticate, async (req, res) => {
  try {
    const gig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: {
        createdBy: {
          select: USER_SELECT_BRIEF
        },
        venueRecord: {
          select: { id: true, name: true, address: true, city: true, imageUrl: true, phone: true, email: true, website: true, capacity: true }
        },
        setlists: {
          include: {
            setlist: {
              include: {
                songs: {
                  include: { song: true },
                  orderBy: { position: 'asc' }
                }
              }
            }
          },
          orderBy: { setNumber: 'asc' }
        },
        songsPlayed: {
          include: {
            song: true
          }
        },
        attendees: {
          include: {
            bandMember: {
              select: { id: true, name: true, imageUrl: true, linkedUserId: true }
            }
          }
        },
        media: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    // Verify user is a workspace member
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: gig.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Filter out personal events from other users
    if (gig.isPersonal && gig.createdById !== req.user.id) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    // Include current user's padding times
    const myBandMember = await prisma.bandMember.findFirst({
      where: { workspaceId: gig.workspaceId, linkedUserId: req.user.id },
    });
    if (myBandMember) {
      const myAttendee = gig.attendees?.find(a => a.bandMemberId === myBandMember.id);
      gig.myPaddingBefore = myAttendee?.paddingBefore || 0;
      gig.myPaddingAfter = myAttendee?.paddingAfter || 0;
    }

    res.json(gig);
  } catch (error) {
    console.error('Get gig error:', error);
    res.status(500).json({ error: 'Failed to get gig' });
  }
});

// Update a gig
router.put('/:gigId', authenticate, async (req, res) => {
  try {
    const { title, type, date, endDate, soundCheckTime, eventStartTime, performanceStartTime, venue, address, notes, pay, status, setlistId, setlistIds, isLocked, isPersonal, bandMemberIds, venueId } = req.body;

    // Get the existing gig and check permissions
    const existingGig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: {
        workspace: {
          include: { members: true }
        },
        setlists: {
          include: { setlist: true }
        }
      }
    });

    if (!existingGig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    // Validate enum values
    if (type && !VALID_GIG_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Invalid gig type' });
    }
    if (status && !VALID_GIG_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid gig status' });
    }

    // Input length validation
    if (title && title.length > 200) return res.status(400).json({ error: 'Title must be 200 characters or less' });
    if (venue && venue.length > 200) return res.status(400).json({ error: 'Venue must be 200 characters or less' });
    if (address && address.length > 500) return res.status(400).json({ error: 'Address must be 500 characters or less' });
    if (notes && notes.length > 5000) return res.status(400).json({ error: 'Notes must be 5,000 characters or less' });

    // Check if user is a member and get their role
    const membership = existingGig.workspace.members.find(m => m.userId === req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    const isAdmin = membership.role === 'ADMIN';
    const isCreator = existingGig.createdById === req.user.id;

    // Non-admins cannot modify locked events
    if (existingGig.isLocked && !isAdmin) {
      return res.status(403).json({ error: 'This event is locked and can only be modified by an admin' });
    }

    // Non-admins can only modify events they created (personal or shared). Admins can modify anything.
    if (!isCreator && !isAdmin) {
      return res.status(403).json({ error: 'Only the event creator or a workspace admin can modify this event' });
    }

    // If type is changing from GIG to something else, delete auto-created setlists
    if (type && type !== 'GIG' && existingGig.type === 'GIG') {
      const autoSetlistIds = [];
      for (const gs of existingGig.setlists || []) {
        if (gs.setlist?.isAutoCreated) {
          autoSetlistIds.push(gs.setlist.id);
        }
      }
      if (autoSetlistIds.length > 0) {
        // Delete GigSetlist entries first
        await prisma.gigSetlist.deleteMany({
          where: { gigId: req.params.gigId }
        });
        // Delete auto-created setlists
        await prisma.setlist.deleteMany({
          where: { id: { in: autoSetlistIds } }
        });
      }
    }

    // Consolidate setlistIds and setlistId into a single array
    const setlistIdsToUpdate = setlistIds !== undefined
      ? setlistIds
      : (setlistId !== undefined ? [setlistId].filter(Boolean) : undefined);

    // Verify setlists belong to this workspace
    if (setlistIdsToUpdate && setlistIdsToUpdate.length > 0) {
      const validSetlists = await prisma.setlist.count({
        where: { id: { in: setlistIdsToUpdate }, workspaceId: existingGig.workspaceId }
      });
      if (validSetlists !== setlistIdsToUpdate.length) {
        return res.status(400).json({ error: 'One or more setlists not found in this workspace' });
      }
    }

    // Build transaction operations for atomic update
    const txOps = [];

    // If setlists are being updated, handle via GigSetlist (consolidated approach)
    if (setlistIdsToUpdate !== undefined) {
      txOps.push(prisma.gigSetlist.deleteMany({ where: { gigId: req.params.gigId } }));
      if (setlistIdsToUpdate.length > 0) {
        txOps.push(prisma.gigSetlist.createMany({
          data: setlistIdsToUpdate.map((id, index) => ({
            gigId: req.params.gigId,
            setlistId: id,
            setNumber: index + 1
          }))
        }));
      }
    }

    // If bandMemberIds provided, handle attendee update
    if (bandMemberIds !== undefined) {
      txOps.push(prisma.gigAttendee.deleteMany({ where: { gigId: req.params.gigId } }));
      if (bandMemberIds && bandMemberIds.length > 0) {
        txOps.push(prisma.gigAttendee.createMany({
          data: bandMemberIds.map(bandMemberId => ({
            gigId: req.params.gigId,
            bandMemberId,
            status: 'ATTENDING'
          }))
        }));
      }
    }

    // Execute related ops in a transaction, then update the gig
    if (txOps.length > 0) {
      await prisma.$transaction(txOps);
    }

    // If venueId is changing, verify workspace and auto-populate venue/address strings
    let resolvedVenue = venue;
    let resolvedAddress = address;
    if (venueId) {
      const venueRec = await prisma.venue.findUnique({ where: { id: venueId }, select: { name: true, address: true, workspaceId: true } });
      if (!venueRec || venueRec.workspaceId !== existingGig.workspaceId) {
        return res.status(400).json({ error: 'Venue not found in this workspace' });
      }
      if (venue === undefined) resolvedVenue = venueRec.name;
      if (address === undefined) resolvedAddress = venueRec.address;
    }

    const gig = await prisma.gig.update({
      where: { id: req.params.gigId },
      data: {
        ...(title && { title }),
        ...(type && { type }),
        ...(date && { date: new Date(date) }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(soundCheckTime !== undefined && { soundCheckTime: soundCheckTime || null }),
        ...(eventStartTime !== undefined && { eventStartTime: eventStartTime || null }),
        ...(performanceStartTime !== undefined && { performanceStartTime: performanceStartTime || null }),
        ...(venueId !== undefined && { venueId: venueId || null }),
        ...(resolvedVenue !== undefined && { venue: resolvedVenue }),
        ...(resolvedAddress !== undefined && { address: resolvedAddress }),
        ...(notes !== undefined && { notes }),
        ...(pay !== undefined && { pay }),
        ...(status && { status }),
        // Only admins can toggle isLocked
        ...(isAdmin && isLocked !== undefined && { isLocked }),
        // Creator or admin can toggle isPersonal
        ...((isCreator || isAdmin) && isPersonal !== undefined && { isPersonal })
      },
      include: {
        createdBy: {
          select: USER_SELECT_BRIEF
        },
        venueRecord: {
          select: { id: true, name: true, address: true, city: true, imageUrl: true, phone: true, email: true, website: true, capacity: true }
        },
        setlists: {
          include: {
            setlist: {
              select: { id: true, name: true }
            }
          },
          orderBy: { setNumber: 'asc' }
        },
        attendees: {
          include: {
            bandMember: {
              select: { id: true, name: true, imageUrl: true }
            }
          }
        },
        media: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${gig.workspaceId}`).emit('gig:updated', gig);

    // Send push notification for gig update
    const wsMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId: gig.workspaceId, userId: { not: req.user.id } },
      select: { userId: true }
    });
    const gigDateStr = gig.date ? new Date(gig.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const pushBody = [gig.title, gigDateStr, gig.venue].filter(Boolean).join(' · ');
    wsMembers.forEach(m => {
      sendPushToUser(m.userId, {
        title: 'Gig Updated',
        body: pushBody,
        tag: `gig-${gig.id}`,
        url: `/workspace/${gig.workspaceId}`,
        workspaceId: gig.workspaceId,
        threadId: gig.workspaceId
      }, { category: 'gig', workspaceId: gig.workspaceId });
    });

    // Notify affected workspaces about potential conflict changes
    if (gig.attendees?.length > 0) {
      const attendeeUserIds = gig.attendees
        .filter(a => a.bandMember?.linkedUserId)
        .map(a => a.bandMember.linkedUserId);
      for (const uid of [...new Set(attendeeUserIds)]) {
        const wsIds = await getAffectedWorkspaceIds(uid);
        for (const wsId of wsIds) {
          if (wsId !== gig.workspaceId) {
            io.to(`workspace:${wsId}`).emit('calendar:conflictsChanged', { userId: uid });
          }
        }
      }
    }

    res.json(gig);
    triggerWebsiteSync(gig.workspaceId);
  } catch (error) {
    console.error('Update gig error:', error);
    res.status(500).json({ error: 'Failed to update gig' });
  }
});

// Mark gig as complete with songs played
router.put('/:gigId/complete', authenticate, async (req, res) => {
  try {
    let { songIds } = req.body;

    // Get the gig with its setlists
    const existingGig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: {
        setlists: {
          include: {
            setlist: {
              include: {
                songs: {
                  where: { type: 'SONG' }, // Only actual songs, not MC sections
                  select: { songId: true }
                }
              }
            }
          },
          orderBy: { setNumber: 'asc' }
        }
      }
    });

    if (!existingGig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    if (existingGig.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Gig is already completed' });
    }

    // Verify user is a workspace member
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: existingGig.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Only admins can complete locked gigs
    if (existingGig.isLocked && membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can modify locked gigs' });
    }

    // If no songIds provided but gig has setlists, use all setlist songs
    if ((!songIds || songIds.length === 0) && existingGig.setlists?.length > 0) {
      songIds = existingGig.setlists
        .flatMap(gs => gs.setlist?.songs || [])
        .map(s => s.songId)
        .filter(Boolean);
    }

    // Update status to completed
    const gig = await prisma.gig.update({
      where: { id: req.params.gigId },
      data: { status: 'COMPLETED' }
    });

    // Record songs played
    if (songIds && songIds.length > 0) {
      await prisma.gigSong.createMany({
        data: songIds.map(songId => ({
          gigId: req.params.gigId,
          songId
        })),
        skipDuplicates: true
      });
    }

    // Sync setlists with gig completion data (performedAt, venue, performers)
    const gigSetlists = await prisma.gigSetlist.findMany({
      where: { gigId: gig.id },
      select: { setlistId: true }
    });
    const linkedSetlists = gigSetlists.map(gs => gs.setlistId);

    // Update all linked setlists with performedAt and venue
    if (linkedSetlists.length > 0) {
      await prisma.setlist.updateMany({
        where: { id: { in: linkedSetlists } },
        data: {
          performedAt: existingGig.date,
          venue: existingGig.venue
        }
      });
    }

    // Sync performers from attendees (those who attended = those who performed)
    const attendees = await prisma.gigAttendee.findMany({
      where: { gigId: gig.id, status: 'ATTENDING' },
      select: { bandMemberId: true }
    });

    if (attendees.length > 0 && linkedSetlists.length > 0) {
      for (const setlistId of linkedSetlists) {
        // Replace existing performers with attendees
        await prisma.setlistPerformer.deleteMany({
          where: { setlistId }
        });

        await prisma.setlistPerformer.createMany({
          data: attendees.map(a => ({
            setlistId,
            bandMemberId: a.bandMemberId
          })),
          skipDuplicates: true
        });
      }
    }

    const updatedGig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: {
        createdBy: {
          select: USER_SELECT_BRIEF
        },
        setlists: {
          include: {
            setlist: { select: { id: true, name: true } }
          },
          orderBy: { setNumber: 'asc' }
        },
        songsPlayed: {
          include: { song: true }
        },
        media: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${gig.workspaceId}`).emit('gig:completed', updatedGig);

    // Auto-create kitty transaction for gig pay
    if (existingGig.pay && existingGig.pay > 0) {
      try {
        // Get or create band kitty
        let kitty = await prisma.bandKitty.findUnique({
          where: { workspaceId: existingGig.workspaceId }
        });

        if (!kitty) {
          kitty = await prisma.bandKitty.create({
            data: { workspaceId: existingGig.workspaceId }
          });
        }

        // Check if transaction already exists for this gig
        const existingTransaction = await prisma.kittyTransaction.findFirst({
          where: { gigId: req.params.gigId }
        });

        if (!existingTransaction) {
          const transaction = await prisma.kittyTransaction.create({
            data: {
              kittyId: kitty.id,
              type: 'GIG_PAY',
              amount: existingGig.pay,
              description: `Gig: ${existingGig.title}`,
              date: existingGig.date,
              gigId: req.params.gigId,
              createdById: req.user.id
            },
            include: {
              gig: { select: { id: true, title: true, date: true } },
              createdBy: { select: USER_SELECT_BRIEF }
            }
          });

          io.to(`workspace:${existingGig.workspaceId}`).emit('kitty:transaction:created', transaction);
        }
      } catch (kittyError) {
        console.error('Auto-create kitty transaction error:', kittyError);
        // Don't fail the gig completion if kitty transaction fails
      }
    }

    res.json(updatedGig);
  } catch (error) {
    console.error('Complete gig error:', error);
    res.status(500).json({ error: 'Failed to complete gig' });
  }
});

// Delete a gig
router.delete('/:gigId', authenticate, async (req, res) => {
  try {
    const gig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: {
        workspace: {
          include: { members: true }
        },
        setlists: {
          include: { setlist: true }
        },
        attendees: {
          include: { bandMember: { select: { linkedUserId: true } } }
        }
      }
    });

    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    // Capture attendee user IDs before deletion (cascade will remove them)
    const attendeeUserIds = (gig.attendees || [])
      .filter(a => a.bandMember?.linkedUserId)
      .map(a => a.bandMember.linkedUserId);

    // Check if user is a member and get their role
    const membership = gig.workspace.members.find(m => m.userId === req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    const isAdmin = membership.role === 'ADMIN';
    const isCreator = gig.createdById === req.user.id;

    // Non-admins cannot delete locked events
    if (gig.isLocked && !isAdmin) {
      return res.status(403).json({ error: 'This event is locked and can only be deleted by an admin' });
    }

    // Non-admins can only delete events they created. Admins can delete anything.
    if (!isCreator && !isAdmin) {
      return res.status(403).json({ error: 'Only the event creator or a workspace admin can delete this event' });
    }

    // Collect auto-created setlist IDs to delete
    const autoSetlistIds = [];
    for (const gs of gig.setlists || []) {
      if (gs.setlist?.isAutoCreated) {
        autoSetlistIds.push(gs.setlist.id);
      }
    }

    // Before cascade delete: clean up R2 files + decrement storage
    const gigMediaFiles = await prisma.gigMedia.findMany({
      where: { gigId: req.params.gigId },
      select: { url: true, size: true },
    });
    let freedBytes = 0;
    for (const m of gigMediaFiles) {
      if (isR2Url(m.url)) {
        try { await deleteFile(m.url); } catch { /* best effort */ }
      }
      freedBytes += m.size || 0;
    }
    if (freedBytes > 0) {
      await safeDecrementStorage(gig.workspaceId, freedBytes).catch(() => {});
    }

    // Delete the gig (this will cascade delete GigSetlist entries, GigMedia, etc.)
    await prisma.gig.delete({
      where: { id: req.params.gigId }
    });

    // Then delete any auto-created setlists
    if (autoSetlistIds.length > 0) {
      await prisma.setlist.deleteMany({
        where: { id: { in: autoSetlistIds } }
      });
    }

    const io = req.app.get('io');
    io.to(`workspace:${gig.workspaceId}`).emit('gig:deleted', { gigId: req.params.gigId });

    // Notify affected workspaces that conflicts may have cleared
    for (const uid of [...new Set(attendeeUserIds)]) {
      const wsIds = await getAffectedWorkspaceIds(uid);
      for (const wsId of wsIds) {
        if (wsId !== gig.workspaceId) {
          io.to(`workspace:${wsId}`).emit('calendar:conflictsChanged', { userId: uid });
        }
      }
    }

    logAudit('gig.deleted', { actorId: req.user.id, targetId: req.params.gigId, metadata: { title: gig.title } });

    res.json({ message: 'Gig deleted' });
    triggerWebsiteSync(gig.workspaceId);
  } catch (error) {
    console.error('Delete gig error:', error);
    res.status(500).json({ error: 'Failed to delete gig' });
  }
});

// Duplicate a gig
router.post('/:gigId/duplicate', authenticate, async (req, res) => {
  try {
    const { date, title } = req.body;

    // Get source gig with setlists
    const source = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: {
        setlists: {
          orderBy: { setNumber: 'asc' }
        }
      }
    });

    if (!source) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    // Verify user is a workspace member
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: source.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Don't allow duplicating another user's personal event
    if (source.isPersonal && source.createdById !== req.user.id) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    // Calculate new dates preserving the original time of day
    let newStartDate = source.date;
    let newEndDate = source.endDate;

    if (date) {
      const sourceDate = new Date(source.date);
      const targetDate = new Date(date);

      // Preserve time from original, just change the date
      newStartDate = new Date(targetDate);
      newStartDate.setHours(sourceDate.getHours(), sourceDate.getMinutes(), sourceDate.getSeconds());

      // Calculate new end date preserving duration
      if (source.endDate) {
        const duration = new Date(source.endDate) - sourceDate;
        newEndDate = new Date(newStartDate.getTime() + duration);
      }
    }

    // Create new gig with copied data (using GigSetlist for all setlist links)
    const newGig = await prisma.gig.create({
      data: {
        title: title || source.title,
        type: source.type,
        date: newStartDate,
        endDate: newEndDate,
        venue: source.venue,
        address: source.address,
        venueId: source.venueId,
        notes: source.notes,
        pay: source.pay,
        status: 'SCHEDULED',
        workspaceId: source.workspaceId,
        createdById: req.user.id,
        // Copy setlists via GigSetlist
        setlists: source.setlists.length > 0 ? {
          create: source.setlists.map(gs => ({
            setlistId: gs.setlistId,
            setNumber: gs.setNumber
          }))
        } : undefined
      },
      include: {
        createdBy: {
          select: USER_SELECT_BRIEF
        },
        venueRecord: {
          select: { id: true, name: true, address: true, city: true, imageUrl: true }
        },
        setlists: {
          include: {
            setlist: {
              include: {
                songs: {
                  include: { song: true },
                  orderBy: { position: 'asc' }
                }
              }
            }
          },
          orderBy: { setNumber: 'asc' }
        },
        media: {
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: { songsPlayed: true }
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${source.workspaceId}`).emit('gig:created', newGig);

    res.status(201).json(newGig);
  } catch (error) {
    console.error('Duplicate gig error:', error);
    res.status(500).json({ error: 'Failed to duplicate gig' });
  }
});

// Get all media for a gig
router.get('/:gigId/media', authenticate, async (req, res) => {
  try {
    const gig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: { workspace: { include: { members: true } } }
    });

    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    const isMember = gig.workspace.members.some(m => m.userId === req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    const media = await prisma.gigMedia.findMany({
      where: { gigId: req.params.gigId },
      include: {
        uploadedBy: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(media);
  } catch (error) {
    console.error('Get gig media error:', error);
    res.status(500).json({ error: 'Failed to get media' });
  }
});

// Add media to a gig
router.post('/:gigId/media', authenticate, apiLimiter, async (req, res) => {
  try {
    const { type, url, caption } = req.body;

    if (!type || !url) {
      return res.status(400).json({ error: 'Type and URL are required' });
    }
    if (url.length > 2048) return res.status(400).json({ error: 'URL must be 2,048 characters or less' });
    if (caption && caption.length > 500) return res.status(400).json({ error: 'Caption must be 500 characters or less' });

    const VALID_MEDIA_TYPES = ['image', 'video', 'youtube', 'link', 'audio'];
    if (!VALID_MEDIA_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Invalid media type' });
    }

    // Verify gig exists and user has access
    const gig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: { workspace: { include: { members: true } } }
    });

    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    const isMember = gig.workspace.members.some(m => m.userId === req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Uploaded files (image, audio, video) must come from allowed storage providers
    // External references (youtube, link) just need valid HTTPS URLs
    if (type === 'youtube' || type === 'link') {
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return res.status(400).json({ error: 'URL must use HTTP or HTTPS' });
        }
      } catch {
        return res.status(400).json({ error: 'Invalid URL' });
      }
    } else {
      const urlCheck = isAllowedUploadUrl(url);
      if (!urlCheck.valid) {
        return res.status(400).json({ error: urlCheck.error || 'Invalid URL' });
      }
    }

    const media = await prisma.gigMedia.create({
      data: {
        gigId: req.params.gigId,
        type,
        url,
        caption,
        uploadedById: req.user.id
      },
      include: {
        uploadedBy: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      }
    });

    // Emit socket event
    const io = req.app.get('io');
    io.to(`workspace:${gig.workspaceId}`).emit('gig:mediaAdded', {
      gigId: req.params.gigId,
      media
    });

    res.status(201).json(media);
  } catch (error) {
    console.error('Add gig media error:', error);
    res.status(500).json({ error: 'Failed to add media' });
  }
});

// Delete media from a gig
router.delete('/:gigId/media/:mediaId', authenticate, async (req, res) => {
  try {
    const media = await prisma.gigMedia.findUnique({
      where: { id: req.params.mediaId },
      include: {
        gig: {
          include: { workspace: { include: { members: true } } }
        }
      }
    });

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const membership = media.gig.workspace.members.find(m => m.userId === req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // L5: Only the uploader or a workspace admin can delete gig media
    const isUploader = media.uploadedById === req.user.id;
    const isAdmin = membership.role === 'ADMIN';
    if (!isUploader && !isAdmin) {
      return res.status(403).json({ error: 'Only the uploader or an admin can delete media' });
    }

    // Clean up R2 file and decrement storage
    if (isR2Url(media.url)) {
      try { await deleteFile(media.url); } catch { /* best effort */ }
    }
    if (media.size) {
      await safeDecrementStorage(media.gig.workspaceId, media.size).catch(() => {});
    }

    await prisma.gigMedia.delete({
      where: { id: req.params.mediaId }
    });

    // Emit socket event
    const io = req.app.get('io');
    io.to(`workspace:${media.gig.workspaceId}`).emit('gig:mediaDeleted', {
      gigId: req.params.gigId,
      mediaId: req.params.mediaId
    });

    res.json({ message: 'Media deleted' });
  } catch (error) {
    console.error('Delete gig media error:', error);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

// Add a setlist to a gig (multi-set support)
router.post('/:gigId/setlists', authenticate, async (req, res) => {
  try {
    const { setlistId, setNumber } = req.body;

    if (!setlistId) {
      return res.status(400).json({ error: 'setlistId is required' });
    }

    const gig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: {
        workspace: { include: { members: true } },
        setlists: true
      }
    });

    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    const isMember = gig.workspace.members.some(m => m.userId === req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Check lock status
    if (gig.isLocked) {
      const isAdmin = gig.workspace.members.find(m => m.userId === req.user.id)?.role === 'ADMIN';
      if (!isAdmin) {
        return res.status(403).json({ error: 'This event is locked and can only be modified by an admin' });
      }
    }

    // Validate setlist belongs to the same workspace
    const setlistRecord = await prisma.setlist.findFirst({
      where: { id: setlistId, workspaceId: gig.workspaceId }
    });
    if (!setlistRecord) {
      return res.status(400).json({ error: 'Setlist not found in this workspace' });
    }

    // Determine set number if not provided
    const actualSetNumber = setNumber || (gig.setlists.length + 1);

    const gigSetlist = await prisma.gigSetlist.create({
      data: {
        gigId: req.params.gigId,
        setlistId,
        setNumber: actualSetNumber
      },
      include: {
        setlist: {
          include: {
            songs: {
              include: { song: true },
              orderBy: { position: 'asc' }
            }
          }
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${gig.workspaceId}`).emit('gig:setlistAdded', {
      gigId: req.params.gigId,
      gigSetlist
    });

    res.status(201).json(gigSetlist);
  } catch (error) {
    console.error('Add gig setlist error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Setlist already added to this gig or set number taken' });
    }
    res.status(500).json({ error: 'Failed to add setlist to gig' });
  }
});

// Remove a setlist from a gig
router.delete('/:gigId/setlists/:gigSetlistId', authenticate, async (req, res) => {
  try {
    const gigSetlist = await prisma.gigSetlist.findUnique({
      where: { id: req.params.gigSetlistId },
      include: {
        gig: {
          include: { workspace: { include: { members: true } } }
        }
      }
    });

    if (!gigSetlist) {
      return res.status(404).json({ error: 'Gig setlist not found' });
    }

    const isMember = gigSetlist.gig.workspace.members.some(m => m.userId === req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Check lock status
    if (gigSetlist.gig.isLocked) {
      const isAdmin = gigSetlist.gig.workspace.members.find(m => m.userId === req.user.id)?.role === 'ADMIN';
      if (!isAdmin) {
        return res.status(403).json({ error: 'This event is locked and can only be modified by an admin' });
      }
    }

    await prisma.gigSetlist.delete({
      where: { id: req.params.gigSetlistId }
    });

    const io = req.app.get('io');
    io.to(`workspace:${gigSetlist.gig.workspaceId}`).emit('gig:setlistRemoved', {
      gigId: req.params.gigId,
      gigSetlistId: req.params.gigSetlistId
    });

    res.json({ message: 'Setlist removed from gig' });
  } catch (error) {
    console.error('Remove gig setlist error:', error);
    res.status(500).json({ error: 'Failed to remove setlist from gig' });
  }
});

// Reorder setlists in a gig
router.put('/:gigId/setlists/reorder', authenticate, async (req, res) => {
  try {
    const { gigSetlistIds } = req.body;

    if (!gigSetlistIds || !Array.isArray(gigSetlistIds)) {
      return res.status(400).json({ error: 'gigSetlistIds array is required' });
    }

    // Verify gig exists and user is a workspace member
    const gig = await prisma.gig.findUnique({
      where: { id: req.params.gigId }
    });

    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: gig.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // Check lock status
    if (gig.isLocked && membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'This event is locked and can only be modified by an admin' });
    }

    // Update set numbers in a transaction
    await prisma.$transaction(
      gigSetlistIds.map((id, index) =>
        prisma.gigSetlist.update({
          where: { id },
          data: { setNumber: index + 1 }
        })
      )
    );

    const updatedGig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: {
        setlists: {
          include: {
            setlist: {
              include: {
                songs: {
                  include: { song: true },
                  orderBy: { position: 'asc' }
                }
              }
            }
          },
          orderBy: { setNumber: 'asc' }
        }
      }
    });

    res.json(updatedGig);
  } catch (error) {
    console.error('Reorder gig setlists error:', error);
    res.status(500).json({ error: 'Failed to reorder setlists' });
  }
});

// Auto-link unlinked gigs to matching setlists by date/venue
// This fixes data where gigs and setlists were created separately
router.post('/workspace/:workspaceId/auto-link-setlists', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    // Get all gigs without setlists
    const unlinkedGigs = await prisma.gig.findMany({
      where: {
        workspaceId,
        type: 'GIG',
        setlistId: null,
        setlists: { none: {} }
      }
    });

    // Get all setlists
    const setlists = await prisma.setlist.findMany({
      where: { workspaceId },
      include: {
        gigs: { select: { id: true } },
        gigSetlists: { select: { gigId: true } }
      }
    });

    // Find setlists not attached to any gig
    const unlinkedSetlists = setlists.filter(s =>
      s.gigs.length === 0 && s.gigSetlists.length === 0
    );

    let linkedCount = 0;
    const links = [];

    for (const gig of unlinkedGigs) {
      const gigDate = new Date(gig.date).toDateString();

      // Find matching setlist by date and venue/title
      const matchingSetlist = unlinkedSetlists.find(s => {
        if (!s.performedAt) return false;
        const setlistDate = new Date(s.performedAt).toDateString();
        if (setlistDate !== gigDate) return false;

        // Match by venue or title
        const venueMatch = s.venue && gig.venue &&
          s.venue.toLowerCase().includes(gig.venue.toLowerCase());
        const titleMatch = s.name && gig.title &&
          (s.name.toLowerCase().includes(gig.title.toLowerCase()) ||
           gig.title.toLowerCase().includes(s.name.toLowerCase()));

        return venueMatch || titleMatch;
      });

      if (matchingSetlist) {
        await prisma.gig.update({
          where: { id: gig.id },
          data: { setlistId: matchingSetlist.id }
        });
        linkedCount++;
        links.push({ gig: gig.title, setlist: matchingSetlist.name });

        // Remove from unlinkedSetlists so we don't match it again
        const idx = unlinkedSetlists.indexOf(matchingSetlist);
        if (idx > -1) unlinkedSetlists.splice(idx, 1);
      }
    }

    console.log(`Auto-linked ${linkedCount} gigs to setlists:`, links);
    res.json({ linkedCount, links });
  } catch (error) {
    console.error('Auto-link setlists error:', error);
    res.status(500).json({ error: 'Failed to auto-link setlists' });
  }
});

// Generate/regenerate calendar token for a workspace
router.post('/workspace/:workspaceId/calendar-token', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.workspace.update({
      where: { id: req.params.workspaceId },
      data: { calendarToken: token }
    });
    res.json({ token });
  } catch (error) {
    console.error('Generate calendar token error:', error);
    res.status(500).json({ error: 'Failed to generate calendar token' });
  }
});

// Get existing calendar token
router.get('/workspace/:workspaceId/calendar-token', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: req.params.workspaceId },
      select: { calendarToken: true }
    });
    res.json({ token: workspace?.calendarToken || null });
  } catch (error) {
    console.error('Get calendar token error:', error);
    res.status(500).json({ error: 'Failed to get calendar token' });
  }
});

// Public iCal feed (no auth, uses token)
router.get('/workspace/:workspaceId/calendar.ics', calendarLimiter, async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: req.params.workspaceId },
      select: { calendarToken: true, name: true }
    });

    const storedBuf = workspace?.calendarToken ? Buffer.from(workspace.calendarToken) : null;
    const suppliedBuf = Buffer.from(token);
    if (!workspace || !storedBuf || storedBuf.length !== suppliedBuf.length || !crypto.timingSafeEqual(storedBuf, suppliedBuf)) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    const gigs = await prisma.gig.findMany({
      where: {
        workspaceId: req.params.workspaceId,
        status: { not: 'CANCELLED' },
        isPersonal: false
      },
      orderBy: { date: 'asc' }
    });

    const now = new Date();
    const formatDate = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

    let ical = 'BEGIN:VCALENDAR\r\n';
    ical += 'VERSION:2.0\r\n';
    ical += `PRODID:-//BandChat//${workspace.name}//EN\r\n`;
    ical += `X-WR-CALNAME:${workspace.name} Gigs\r\n`;
    ical += 'CALSCALE:GREGORIAN\r\n';
    ical += 'METHOD:PUBLISH\r\n';

    for (const gig of gigs) {
      ical += 'BEGIN:VEVENT\r\n';
      ical += `UID:${gig.id}@bandchat.app\r\n`;
      ical += `DTSTAMP:${formatDate(now)}\r\n`;
      ical += `DTSTART:${formatDate(gig.date)}\r\n`;
      if (gig.endDate) {
        ical += `DTEND:${formatDate(gig.endDate)}\r\n`;
      }
      ical += `SUMMARY:(${workspace.name.replace(/[,;\\]/g, '\\$&')}) ${(gig.title || '').replace(/[,;\\]/g, '\\$&')}\r\n`;
      if (gig.venue || gig.address) {
        const location = [gig.venue, gig.address].filter(Boolean).join(', ');
        ical += `LOCATION:${location.replace(/[,;\\]/g, '\\$&')}\r\n`;
      }
      if (gig.notes) {
        ical += `DESCRIPTION:${gig.notes.replace(/\n/g, '\\n').replace(/[,;\\]/g, '\\$&')}\r\n`;
      }
      ical += 'END:VEVENT\r\n';
    }

    ical += 'END:VCALENDAR\r\n';

    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="calendar.ics"');
    res.send(ical);
  } catch (error) {
    console.error('iCal feed error:', error);
    res.status(500).json({ error: 'Failed to generate calendar feed' });
  }
});

// Import calendar event from ICS file (admin only)
router.post('/workspace/:workspaceId/import-ics', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { icsContent, type = 'REHEARSAL' } = req.body;

    if (!icsContent) {
      return res.status(400).json({ error: 'ICS content is required' });
    }

    // Validate type
    const validTypes = ['GIG', 'REHEARSAL', 'MEETING', 'OTHER'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    }

    // Parse ICS content
    let events;
    try {
      events = parseICSMultiple(icsContent);
    } catch (parseError) {
      return res.status(400).json({ error: `Failed to parse ICS: ${parseError.message}` });
    }

    // Create gigs for each event
    const createdGigs = [];
    const errors = [];

    for (const event of events) {
      try {
        const gig = await prisma.gig.create({
          data: {
            title: event.title || 'Imported Event',
            type,
            date: event.date,
            endDate: event.endDate || null,
            venue: event.venue || null,
            address: event.address || null,
            notes: event.notes || null,
            workspaceId: req.params.workspaceId,
            createdById: req.user.id,
          },
          include: {
            createdBy: {
              select: USER_SELECT_BRIEF
            }
          }
        });
        createdGigs.push(gig);
      } catch (err) {
        errors.push({ event: event.title, error: err.message });
      }
    }

    res.status(201).json({
      created: createdGigs,
      errors: errors.length > 0 ? errors : undefined,
      message: `Created ${createdGigs.length} event(s)${errors.length > 0 ? `, ${errors.length} failed` : ''}`
    });
  } catch (error) {
    console.error('Import ICS error:', error);
    res.status(500).json({ error: 'Failed to import calendar event' });
  }
});

// Preview ICS content without creating (for UI preview)
router.post('/workspace/:workspaceId/preview-ics', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { icsContent } = req.body;

    if (!icsContent) {
      return res.status(400).json({ error: 'ICS content is required' });
    }

    let events;
    try {
      events = parseICSMultiple(icsContent);
    } catch (parseError) {
      return res.status(400).json({ error: `Failed to parse ICS: ${parseError.message}` });
    }

    res.json({ events });
  } catch (error) {
    console.error('Preview ICS error:', error);
    res.status(500).json({ error: 'Failed to preview calendar event' });
  }
});

// ── Calendar Teaming ────────────────────────────────────────────────────

// Set my attendance + padding for a gig
router.put('/:gigId/my-attendance', authenticate, apiLimiter, async (req, res) => {
  try {
    const { status, paddingBefore, paddingAfter } = req.body;

    if (status && !['ATTENDING', 'NOT_ATTENDING', 'MAYBE'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (paddingBefore !== undefined && (typeof paddingBefore !== 'number' || !Number.isInteger(paddingBefore) || paddingBefore < 0 || paddingBefore > 480)) {
      return res.status(400).json({ error: 'paddingBefore must be an integer 0-480 minutes' });
    }
    if (paddingAfter !== undefined && (typeof paddingAfter !== 'number' || !Number.isInteger(paddingAfter) || paddingAfter < 0 || paddingAfter > 480)) {
      return res.status(400).json({ error: 'paddingAfter must be an integer 0-480 minutes' });
    }

    // Get the gig and verify user is a workspace member
    const gig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      select: { id: true, workspaceId: true },
    });
    if (!gig) return res.status(404).json({ error: 'Gig not found' });

    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: gig.workspaceId } },
    });
    if (!membership) return res.status(403).json({ error: 'Not a workspace member' });

    // Find the user's BandMember in this workspace
    const bandMember = await prisma.bandMember.findFirst({
      where: { workspaceId: gig.workspaceId, linkedUserId: req.user.id },
    });
    if (!bandMember) return res.status(404).json({ error: 'No band member profile linked to your account' });

    // Upsert the attendance record
    const attendee = await prisma.gigAttendee.upsert({
      where: { gigId_bandMemberId: { gigId: gig.id, bandMemberId: bandMember.id } },
      update: {
        ...(status && { status }),
        ...(paddingBefore !== undefined && { paddingBefore }),
        ...(paddingAfter !== undefined && { paddingAfter }),
      },
      create: {
        gigId: gig.id,
        bandMemberId: bandMember.id,
        status: status || 'ATTENDING',
        paddingBefore: paddingBefore || 0,
        paddingAfter: paddingAfter || 0,
      },
      include: {
        bandMember: { select: { id: true, name: true, linkedUserId: true } },
      },
    });

    // Emit attendance update to current workspace
    const io = req.app.get('io');
    io.to(`workspace:${gig.workspaceId}`).emit('gig:attendanceUpdated', {
      gigId: gig.id,
      attendee,
    });

    // Emit conflict changes to all affected workspaces
    const affectedWs = await getAffectedWorkspaceIds(req.user.id);
    for (const wsId of affectedWs) {
      io.to(`workspace:${wsId}`).emit('calendar:conflictsChanged', {
        userId: req.user.id,
      });
    }

    res.json(attendee);
  } catch (error) {
    console.error('Set attendance error:', error);
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

// ============================================================================
// Gig Comments
// Any workspace member can add a comment.
// Only the author can edit their own comment.
// The author or a workspace admin can delete a comment.
// ============================================================================

const COMMENT_MAX_LENGTH = 2000;

async function loadGigWithMembership(gigId, userId) {
  const gig = await prisma.gig.findUnique({
    where: { id: gigId },
    include: { workspace: { include: { members: true } } },
  });
  if (!gig) return { error: { status: 404, message: 'Gig not found' } };
  const membership = gig.workspace.members.find(m => m.userId === userId);
  if (!membership) return { error: { status: 403, message: 'Not a workspace member' } };
  if (gig.isPersonal && gig.createdById !== userId && membership.role !== 'ADMIN') {
    return { error: { status: 403, message: 'Not authorized to view this event' } };
  }
  return { gig, membership };
}

// List comments for a gig
router.get('/:gigId/comments', authenticate, async (req, res) => {
  try {
    const { error } = await loadGigWithMembership(req.params.gigId, req.user.id);
    if (error) return res.status(error.status).json({ error: error.message });

    const comments = await prisma.gigComment.findMany({
      where: { gigId: req.params.gigId },
      orderBy: { createdAt: 'asc' },
      include: { createdBy: { select: USER_SELECT_BRIEF } },
    });
    res.json(comments);
  } catch (err) {
    console.error('List gig comments error:', err);
    res.status(500).json({ error: 'Failed to load comments' });
  }
});

// Add a comment to a gig
router.post('/:gigId/comments', authenticate, apiLimiter, async (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Comment content is required' });
    }
    if (content.length > COMMENT_MAX_LENGTH) {
      return res.status(400).json({ error: `Comment must be ${COMMENT_MAX_LENGTH} characters or less` });
    }

    const { error, gig } = await loadGigWithMembership(req.params.gigId, req.user.id);
    if (error) return res.status(error.status).json({ error: error.message });

    const comment = await prisma.gigComment.create({
      data: {
        gigId: gig.id,
        content: content.trim(),
        createdById: req.user.id,
      },
      include: { createdBy: { select: USER_SELECT_BRIEF } },
    });

    const io = req.app.get('io');
    io.to(`workspace:${gig.workspaceId}`).emit('gig:commentAdded', { gigId: gig.id, comment });

    res.status(201).json(comment);
  } catch (err) {
    console.error('Add gig comment error:', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Edit own comment
router.put('/:gigId/comments/:commentId', authenticate, apiLimiter, async (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Comment content is required' });
    }
    if (content.length > COMMENT_MAX_LENGTH) {
      return res.status(400).json({ error: `Comment must be ${COMMENT_MAX_LENGTH} characters or less` });
    }

    const existing = await prisma.gigComment.findUnique({
      where: { id: req.params.commentId },
      include: { gig: { select: { id: true, workspaceId: true } } },
    });
    if (!existing || existing.gigId !== req.params.gigId) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (existing.createdById !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own comments' });
    }

    const comment = await prisma.gigComment.update({
      where: { id: existing.id },
      data: { content: content.trim() },
      include: { createdBy: { select: USER_SELECT_BRIEF } },
    });

    const io = req.app.get('io');
    io.to(`workspace:${existing.gig.workspaceId}`).emit('gig:commentUpdated', {
      gigId: existing.gig.id,
      comment,
    });

    res.json(comment);
  } catch (err) {
    console.error('Edit gig comment error:', err);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// Delete own comment, or any comment if workspace admin
router.delete('/:gigId/comments/:commentId', authenticate, apiLimiter, async (req, res) => {
  try {
    const existing = await prisma.gigComment.findUnique({
      where: { id: req.params.commentId },
      include: {
        gig: {
          select: {
            id: true,
            workspaceId: true,
            workspace: { select: { members: true } },
          },
        },
      },
    });
    if (!existing || existing.gigId !== req.params.gigId) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const membership = existing.gig.workspace.members.find(m => m.userId === req.user.id);
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }
    const isAdmin = membership.role === 'ADMIN';
    const isAuthor = existing.createdById === req.user.id;
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: 'Only the author or a workspace admin can delete this comment' });
    }

    await prisma.gigComment.delete({ where: { id: existing.id } });

    const io = req.app.get('io');
    io.to(`workspace:${existing.gig.workspaceId}`).emit('gig:commentDeleted', {
      gigId: existing.gig.id,
      commentId: existing.id,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Delete gig comment error:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

export default router;
