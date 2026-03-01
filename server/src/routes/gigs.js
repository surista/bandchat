import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { isWorkspaceMember } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get all gigs for a workspace
router.get('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { type, status, from, to } = req.query;

    // Filter: show non-personal events OR personal events created by current user
    const where = {
      workspaceId: req.params.workspaceId,
      OR: [
        { isPersonal: false },
        { isPersonal: true, createdById: req.user.id }
      ],
      ...(type && { type }),
      ...(status && { status }),
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
          select: { id: true, displayName: true }
        },
        setlist: {
          include: {
            songs: {
              include: { song: true },
              orderBy: { position: 'asc' }
            }
          }
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
      orderBy: { date: 'asc' }
    });

    res.json(gigs);
  } catch (error) {
    console.error('Get gigs error:', error);
    res.status(500).json({ error: 'Failed to get gigs' });
  }
});

// Get gigs from all user's workspaces (for cross-workspace calendar view)
router.get('/all-workspaces', authenticate, async (req, res) => {
  try {
    const { type, status, from, to, excludeWorkspaceId } = req.query;

    // Get all workspace IDs user belongs to
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: req.user.id },
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

    const where = {
      workspaceId: { in: workspaceIds },
      ...(type && { type }),
      ...(status && { status }),
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
          select: { id: true, displayName: true }
        },
        setlist: {
          include: {
            songs: {
              include: { song: true },
              orderBy: { position: 'asc' }
            }
          }
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
        _count: {
          select: { songsPlayed: true }
        }
      },
      orderBy: { date: 'asc' }
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

    // Get all setlists with performedAt dates and full song details
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
      orderBy: { performedAt: 'asc' }
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
    const revenue = await prisma.gig.aggregate({
      where: { workspaceId, pay: { not: null } },
      _sum: { pay: true }
    });

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
      totalRevenue: revenue._sum.pay || 0,
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
router.post('/workspace/:workspaceId', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const { title, type, date, endDate, venue, address, notes, pay, setlistId, setlistIds, isLocked, isPersonal, bandMemberIds } = req.body;

    if (!title || !date) {
      return res.status(400).json({ error: 'Title and date are required' });
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

    // Create gig with optional multi-set support
    const gig = await prisma.gig.create({
      data: {
        title,
        type: gigType,
        date: gigDate,
        endDate: endDate ? new Date(endDate) : null,
        venue,
        address,
        notes,
        pay,
        isLocked: canLock ? (isLocked || false) : false,
        isPersonal: isPersonal || false,
        setlistId: setlistIds && setlistIds.length > 0 ? null : (setlistId || autoSetlistId), // Use auto-created setlist if no manual one
        workspaceId: req.params.workspaceId,
        createdById: req.user.id,
        // Create GigSetlist entries if setlistIds provided
        ...(setlistIds && setlistIds.length > 0 && {
          setlists: {
            create: setlistIds.filter(id => id).map((id, index) => ({
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
          select: { id: true, displayName: true }
        },
        setlist: {
          select: { id: true, name: true }
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
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${req.params.workspaceId}`).emit('gig:created', gig);

    res.status(201).json(gig);
  } catch (error) {
    console.error('Create gig error:', error);
    res.status(500).json({ error: 'Failed to create gig' });
  }
});

// Get a single gig
router.get('/:gigId', authenticate, async (req, res) => {
  try {
    const gig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        setlist: {
          include: {
            songs: {
              include: { song: true },
              orderBy: { position: 'asc' }
            }
          }
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
              select: { id: true, name: true, imageUrl: true }
            }
          }
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

    res.json(gig);
  } catch (error) {
    console.error('Get gig error:', error);
    res.status(500).json({ error: 'Failed to get gig' });
  }
});

// Update a gig
router.put('/:gigId', authenticate, async (req, res) => {
  try {
    const { title, type, date, endDate, venue, address, notes, pay, status, setlistId, setlistIds, isLocked, isPersonal, bandMemberIds } = req.body;

    // Get the existing gig and check permissions
    const existingGig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: {
        workspace: {
          include: { members: true }
        },
        setlist: true, // Include legacy setlist to check isAutoCreated
        setlists: {    // Include multi-set setlists
          include: { setlist: true }
        }
      }
    });

    if (!existingGig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

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

    // Non-admins can only modify their own personal events or non-locked shared events
    if (existingGig.isPersonal && !isCreator && !isAdmin) {
      return res.status(403).json({ error: 'You can only modify your own personal events' });
    }

    // If type is changing from GIG to something else, delete auto-created setlists
    if (type && type !== 'GIG' && existingGig.type === 'GIG') {
      const autoSetlistIds = [];
      if (existingGig.setlist?.isAutoCreated) {
        autoSetlistIds.push(existingGig.setlist.id);
      }
      for (const gs of existingGig.setlists || []) {
        if (gs.setlist?.isAutoCreated) {
          autoSetlistIds.push(gs.setlist.id);
        }
      }
      if (autoSetlistIds.length > 0) {
        // Clear the setlist reference first
        await prisma.gig.update({
          where: { id: req.params.gigId },
          data: { setlistId: null }
        });
        // Delete GigSetlist entries
        await prisma.gigSetlist.deleteMany({
          where: { gigId: req.params.gigId }
        });
        // Delete auto-created setlists
        await prisma.setlist.deleteMany({
          where: { id: { in: autoSetlistIds } }
        });
      }
    }

    // Build transaction operations for atomic update
    const txOps = [];

    // If setlistIds provided, handle multi-set update
    if (setlistIds !== undefined) {
      txOps.push(prisma.gigSetlist.deleteMany({ where: { gigId: req.params.gigId } }));
      if (setlistIds && setlistIds.length > 0) {
        txOps.push(prisma.gigSetlist.createMany({
          data: setlistIds.filter(id => id).map((id, index) => ({
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

    const gig = await prisma.gig.update({
      where: { id: req.params.gigId },
      data: {
        ...(title && { title }),
        ...(type && { type }),
        ...(date && { date: new Date(date) }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(venue !== undefined && { venue }),
        ...(address !== undefined && { address }),
        ...(notes !== undefined && { notes }),
        ...(pay !== undefined && { pay }),
        ...(status && { status }),
        // Only admins can toggle isLocked
        ...(isAdmin && isLocked !== undefined && { isLocked }),
        // Creator or admin can toggle isPersonal
        ...((isCreator || isAdmin) && isPersonal !== undefined && { isPersonal }),
        // Clear legacy setlistId if using multi-set, otherwise update it
        ...(setlistIds !== undefined
          ? { setlistId: null }
          : setlistId !== undefined && { setlistId })
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        setlist: {
          select: { id: true, name: true }
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
        }
      }
    });

    const io = req.app.get('io');
    io.to(`workspace:${gig.workspaceId}`).emit('gig:updated', gig);

    res.json(gig);
  } catch (error) {
    console.error('Update gig error:', error);
    res.status(500).json({ error: 'Failed to update gig' });
  }
});

// Mark gig as complete with songs played
router.put('/:gigId/complete', authenticate, async (req, res) => {
  try {
    let { songIds } = req.body;

    // Get the gig with its setlist
    const existingGig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: {
        setlist: {
          include: {
            songs: {
              where: { type: 'SONG' }, // Only actual songs, not MC sections
              select: { songId: true }
            }
          }
        }
      }
    });

    if (!existingGig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

    // Verify user is a workspace member
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId: existingGig.workspaceId } }
    });
    if (!membership) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    // If no songIds provided but gig has a setlist, use setlist songs
    if ((!songIds || songIds.length === 0) && existingGig.setlist?.songs?.length > 0) {
      songIds = existingGig.setlist.songs.map(s => s.songId).filter(Boolean);
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

    const updatedGig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        setlist: {
          select: { id: true, name: true }
        },
        songsPlayed: {
          include: { song: true }
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
              createdBy: { select: { id: true, displayName: true } }
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
        setlist: true, // Include legacy setlist
        setlists: {    // Include multi-set setlists
          include: { setlist: true }
        }
      }
    });

    if (!gig) {
      return res.status(404).json({ error: 'Gig not found' });
    }

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

    // Non-admins can only delete their own personal events or non-locked shared events they created
    if (gig.isPersonal && !isCreator && !isAdmin) {
      return res.status(403).json({ error: 'You can only delete your own personal events' });
    }

    // Collect auto-created setlist IDs to delete
    const autoSetlistIds = [];
    if (gig.setlist?.isAutoCreated) {
      autoSetlistIds.push(gig.setlist.id);
    }
    for (const gs of gig.setlists || []) {
      if (gs.setlist?.isAutoCreated) {
        autoSetlistIds.push(gs.setlist.id);
      }
    }

    // Delete the gig first (this will cascade delete GigSetlist entries)
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

    res.json({ message: 'Gig deleted' });
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

    // Create new gig with copied data
    const newGig = await prisma.gig.create({
      data: {
        title: title || source.title,
        type: source.type,
        date: newStartDate,
        endDate: newEndDate,
        venue: source.venue,
        address: source.address,
        notes: source.notes,
        pay: source.pay,
        status: 'SCHEDULED',
        workspaceId: source.workspaceId,
        createdById: req.user.id,
        // Copy multi-set setlists
        setlists: source.setlists.length > 0 ? {
          create: source.setlists.map(gs => ({
            setlistId: gs.setlistId,
            setNumber: gs.setNumber
          }))
        } : undefined,
        // Copy legacy single setlist if present
        setlistId: source.setlistId
      },
      include: {
        createdBy: {
          select: { id: true, displayName: true }
        },
        setlist: {
          include: {
            songs: {
              include: { song: true },
              orderBy: { position: 'asc' }
            }
          }
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
        media: true,
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

// Add media to a gig
router.post('/:gigId/media', authenticate, async (req, res) => {
  try {
    const { type, url, caption } = req.body;

    if (!type || !url) {
      return res.status(400).json({ error: 'Type and URL are required' });
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

    // Validate that URL is a valid Cloudinary URL
    try {
      const parsedUrl = new URL(url);
      if (!parsedUrl.hostname.endsWith('cloudinary.com')) {
        return res.status(400).json({ error: 'Invalid attachment URL' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    const media = await prisma.gigMedia.create({
      data: {
        gigId: req.params.gigId,
        type,
        url,
        caption
      }
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

    const isMember = media.gig.workspace.members.some(m => m.userId === req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a workspace member' });
    }

    await prisma.gigMedia.delete({
      where: { id: req.params.mediaId }
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

export default router;
