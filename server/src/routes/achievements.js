import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, isWorkspaceMember, isWorkspaceAdmin } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Default achievements to seed
const DEFAULT_ACHIEVEMENTS = [
  // Band achievements
  { code: 'first_gig', name: 'First Show', description: 'Played your first gig', icon: '🎤', category: 'gigs', threshold: 1, isBandWide: true },
  { code: 'ten_gigs', name: 'Getting Started', description: 'Played 10 gigs', icon: '🎸', category: 'gigs', threshold: 10, isBandWide: true },
  { code: 'twentyfive_gigs', name: 'Building Momentum', description: 'Played 25 gigs', icon: '🎵', category: 'gigs', threshold: 25, isBandWide: true },
  { code: 'fifty_gigs', name: 'Half Century', description: 'Played 50 gigs', icon: '🔥', category: 'gigs', threshold: 50, isBandWide: true },
  { code: 'hundred_gigs', name: '100 Gigs Club', description: 'Played 100 gigs', icon: '💯', category: 'gigs', threshold: 100, isBandWide: true },
  { code: 'twofifty_gigs', name: 'Road Warriors', description: 'Played 250 gigs', icon: '🚐', category: 'gigs', threshold: 250, isBandWide: true },
  { code: 'five_hundred_gigs', name: 'Legendary', description: 'Played 500 gigs', icon: '🏆', category: 'gigs', threshold: 500, isBandWide: true },
  { code: 'thousand_gigs', name: 'Hall of Fame', description: 'Played 1000 gigs', icon: '👑', category: 'gigs', threshold: 1000, isBandWide: true },

  { code: 'ten_songs', name: 'Building Repertoire', description: 'Added 10 songs', icon: '📝', category: 'songs', threshold: 10, isBandWide: true },
  { code: 'fifty_songs', name: 'Jukebox', description: 'Added 50 songs', icon: '🎹', category: 'songs', threshold: 50, isBandWide: true },
  { code: 'hundred_songs', name: 'Walking Setlist', description: 'Added 100 songs', icon: '📚', category: 'songs', threshold: 100, isBandWide: true },

  { code: 'first_rehearsal', name: 'Practice Makes Perfect', description: 'Logged first rehearsal', icon: '🥁', category: 'rehearsals', threshold: 1, isBandWide: true },
  { code: 'five_rehearsals', name: 'Getting Tight', description: 'Logged 5 rehearsals', icon: '🎵', category: 'rehearsals', threshold: 5, isBandWide: true },
  { code: 'ten_rehearsals', name: 'Regular Practice', description: 'Logged 10 rehearsals', icon: '🎸', category: 'rehearsals', threshold: 10, isBandWide: true },
  { code: 'twentyfive_rehearsals', name: 'Committed', description: 'Logged 25 rehearsals', icon: '🎯', category: 'rehearsals', threshold: 25, isBandWide: true },
  { code: 'fifty_rehearsals', name: 'Dedicated', description: 'Logged 50 rehearsals', icon: '💪', category: 'rehearsals', threshold: 50, isBandWide: true },
  { code: 'hundred_rehearsals', name: 'Practice Legends', description: 'Logged 100 rehearsals', icon: '🏆', category: 'rehearsals', threshold: 100, isBandWide: true },

  { code: 'first_revenue', name: 'First Paycheck', description: 'Earned your first dollar', icon: '💵', category: 'milestones', threshold: null, isBandWide: true },
  { code: 'thousand_revenue', name: 'Making Bank', description: 'Earned $1,000 total', icon: '💰', category: 'milestones', threshold: 1000, isBandWide: true },
  { code: 'ten_thousand_revenue', name: 'Big Money', description: 'Earned $10,000 total', icon: '🤑', category: 'milestones', threshold: 10000, isBandWide: true },

  { code: 'road_warrior', name: 'Road Warrior', description: 'Played 5 gigs in 7 days', icon: '🛣️', category: 'milestones', threshold: null, isBandWide: true },
  { code: 'marathon', name: 'Marathon', description: 'Played a 3+ hour setlist', icon: '⏱️', category: 'milestones', threshold: null, isBandWide: true },
  { code: 'crowd_favorite', name: 'Crowd Favorite', description: 'Played the same song 50 times', icon: '⭐', category: 'milestones', threshold: null, isBandWide: true },

  // Hours gigged
  { code: 'ten_hours_gigged', name: 'Stage Time', description: 'Played 10 hours of gigs', icon: '⏰', category: 'gigs', threshold: 10, isBandWide: true },
  { code: 'fifty_hours_gigged', name: 'Seasoned Performers', description: 'Played 50 hours of gigs', icon: '🎭', category: 'gigs', threshold: 50, isBandWide: true },
  { code: 'hundred_hours_gigged', name: 'Stage Veterans', description: 'Played 100 hours of gigs', icon: '🌟', category: 'gigs', threshold: 100, isBandWide: true },
  { code: 'fivehundred_hours_gigged', name: 'Live Legends', description: 'Played 500 hours of gigs', icon: '🎪', category: 'gigs', threshold: 500, isBandWide: true },

  // Hours rehearsed
  { code: 'ten_hours_rehearsed', name: 'Practice Time', description: 'Logged 10 hours of rehearsals', icon: '🔧', category: 'rehearsals', threshold: 10, isBandWide: true },
  { code: 'fifty_hours_rehearsed', name: 'Woodshedding', description: 'Logged 50 hours of rehearsals', icon: '🛠️', category: 'rehearsals', threshold: 50, isBandWide: true },
  { code: 'hundred_hours_rehearsed', name: 'Perfectionists', description: 'Logged 100 hours of rehearsals', icon: '🏋️', category: 'rehearsals', threshold: 100, isBandWide: true },
  { code: 'fivehundred_hours_rehearsed', name: 'Practice Masters', description: 'Logged 500 hours of rehearsals', icon: '🧘', category: 'rehearsals', threshold: 500, isBandWide: true },

  // Songs played at gigs
  { code: 'hundred_songs_played', name: 'Century of Songs', description: 'Played 100 songs at gigs', icon: '🎶', category: 'gigs', threshold: 100, isBandWide: true },
  { code: 'fivehundred_songs_played', name: 'Jukebox Band', description: 'Played 500 songs at gigs', icon: '📻', category: 'gigs', threshold: 500, isBandWide: true },
  { code: 'thousand_songs_played', name: 'Endless Setlist', description: 'Played 1000 songs at gigs', icon: '🎰', category: 'gigs', threshold: 1000, isBandWide: true },

  // Member achievements
  { code: 'member_first_gig', name: 'Stage Debut', description: 'Performed your first gig with the band', icon: '🌟', category: 'gigs', threshold: 1, isBandWide: false },
  { code: 'member_ten_gigs', name: 'Regular', description: 'Performed in 10 gigs', icon: '🎯', category: 'gigs', threshold: 10, isBandWide: false },
  { code: 'member_fifty_gigs', name: 'Veteran', description: 'Performed in 50 gigs', icon: '🎖️', category: 'gigs', threshold: 50, isBandWide: false },
  { code: 'member_hundred_gigs', name: 'Centurion', description: 'Performed in 100 gigs', icon: '🏅', category: 'gigs', threshold: 100, isBandWide: false },

  { code: 'song_master', name: 'Song Master', description: 'Added 25 songs to the repertoire', icon: '🎼', category: 'songs', threshold: 25, isBandWide: false },
  { code: 'setlist_architect', name: 'Setlist Architect', description: 'Created 10 setlists', icon: '📋', category: 'songs', threshold: 10, isBandWide: false },

  { code: 'always_available', name: 'Always Available', description: 'Marked available for 30 days in a row', icon: '✅', category: 'social', threshold: 30, isBandWide: false },
  { code: 'communicator', name: 'Communicator', description: 'Sent 100 messages', icon: '💬', category: 'social', threshold: 100, isBandWide: false },
  { code: 'super_communicator', name: 'Super Communicator', description: 'Sent 1000 messages', icon: '📢', category: 'social', threshold: 1000, isBandWide: false },

  // Anniversary badges (by month, so 12 months = 1 year)
  { code: 'one_year_member', name: 'First Anniversary', description: 'Been a member for 1 year', icon: '🎂', category: 'milestones', threshold: 12, isBandWide: false },
  { code: 'two_year_member', name: 'Two Years Strong', description: 'Been a member for 2 years', icon: '🎊', category: 'milestones', threshold: 24, isBandWide: false },
  { code: 'five_year_member', name: 'Half Decade', description: 'Been a member for 5 years', icon: '🏅', category: 'milestones', threshold: 60, isBandWide: false },
  { code: 'ten_year_member', name: 'Decade Legend', description: 'Been a member for 10 years', icon: '🏆', category: 'milestones', threshold: 120, isBandWide: false },

  // Emoji/reaction badges
  { code: 'emoji_fan', name: 'Emoji Fan', description: 'Added 50 emoji reactions', icon: '😄', category: 'social', threshold: 50, isBandWide: false },
  { code: 'emoji_enthusiast', name: 'Emoji Enthusiast', description: 'Added 250 emoji reactions', icon: '🤩', category: 'social', threshold: 250, isBandWide: false },
  { code: 'emoji_master', name: 'Emoji Master', description: 'Added 1000 emoji reactions', icon: '🎭', category: 'social', threshold: 1000, isBandWide: false },
];

// Seed achievements - update existing records to ensure icons are set
async function seedAchievements() {
  console.log('Seeding achievements...');
  for (const achievement of DEFAULT_ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { code: achievement.code },
      update: {
        icon: achievement.icon,
        name: achievement.name,
        description: achievement.description
      },
      create: achievement
    });
  }
  console.log('Achievements seeded:', DEFAULT_ACHIEVEMENTS.length);
}

// Initialize achievements on startup
seedAchievements().catch(console.error);

// Get all achievement definitions
router.get('/definitions', authenticate, async (req, res) => {
  try {
    const achievements = await prisma.achievement.findMany({
      orderBy: [{ category: 'asc' }, { threshold: 'asc' }]
    });
    res.json(achievements);
  } catch (error) {
    console.error('Error fetching achievements:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// Force reseed achievements (fixes icons)
router.post('/reseed', authenticate, async (req, res) => {
  try {
    console.log('Force reseeding achievements...');
    for (const achievement of DEFAULT_ACHIEVEMENTS) {
      const result = await prisma.achievement.upsert({
        where: { code: achievement.code },
        update: {
          icon: achievement.icon,
          name: achievement.name,
          description: achievement.description,
          category: achievement.category,
          threshold: achievement.threshold,
          isBandWide: achievement.isBandWide
        },
        create: achievement
      });
      console.log(`Reseeded ${achievement.code}: icon="${result.icon}"`);
    }
    console.log('Force reseed complete');
    res.json({ success: true, count: DEFAULT_ACHIEVEMENTS.length });
  } catch (error) {
    console.error('Error reseeding achievements:', error);
    res.status(500).json({ error: 'Failed to reseed achievements' });
  }
});

// Get band achievements for a workspace
router.get('/workspace/:workspaceId/band', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const achievements = await prisma.bandAchievement.findMany({
      where: { workspaceId: req.params.workspaceId },
      include: {
        achievement: true
      },
      orderBy: { earnedAt: 'desc' }
    });
    res.json(achievements);
  } catch (error) {
    console.error('Error fetching band achievements:', error);
    res.status(500).json({ error: 'Failed to fetch band achievements' });
  }
});

// Get member achievements for a workspace
router.get('/workspace/:workspaceId/members', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const achievements = await prisma.memberAchievement.findMany({
      where: { workspaceId: req.params.workspaceId },
      include: {
        achievement: true,
        user: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      },
      orderBy: { earnedAt: 'desc' }
    });
    res.json(achievements);
  } catch (error) {
    console.error('Error fetching member achievements:', error);
    res.status(500).json({ error: 'Failed to fetch member achievements' });
  }
});

// Get my achievements in a workspace
router.get('/workspace/:workspaceId/me', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const achievements = await prisma.memberAchievement.findMany({
      where: {
        workspaceId: req.params.workspaceId,
        userId: req.user.id
      },
      include: {
        achievement: true
      },
      orderBy: { earnedAt: 'desc' }
    });
    res.json(achievements);
  } catch (error) {
    console.error('Error fetching my achievements:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// Check and award achievements for a workspace
router.post('/workspace/:workspaceId/check', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;
    const newAchievements = [];
    const now = new Date();

    // Get all achievement definitions
    const allAchievements = await prisma.achievement.findMany();

    // Get existing achievements
    const existingBandAchievements = await prisma.bandAchievement.findMany({
      where: { workspaceId },
      select: { achievementId: true }
    });
    const existingBandIds = new Set(existingBandAchievements.map(a => a.achievementId));

    // Get ALL gigs ordered by date (for finding milestone dates)
    const allGigs = await prisma.gig.findMany({
      where: {
        workspaceId,
        type: 'GIG',
        date: { lt: now },
        status: { not: 'CANCELLED' }
      },
      orderBy: { date: 'asc' }
    });

    // Get ALL rehearsals ordered by date
    const allRehearsals = await prisma.gig.findMany({
      where: {
        workspaceId,
        type: 'REHEARSAL',
        date: { lt: now },
        status: { not: 'CANCELLED' }
      },
      orderBy: { date: 'asc' }
    });

    // Get songs ordered by creation date
    const allSongs = await prisma.song.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' }
    });

    // Calculate cumulative hours for each rehearsal
    let cumulativeRehearsalHours = 0;
    const rehearsalHourMilestones = {}; // { hours: date }
    for (const rehearsal of allRehearsals) {
      if (rehearsal.endDate) {
        const hours = (new Date(rehearsal.endDate) - new Date(rehearsal.date)) / (1000 * 60 * 60);
        if (hours > 0) {
          const prevHours = cumulativeRehearsalHours;
          cumulativeRehearsalHours += hours;
          // Track when we crossed each milestone
          for (const milestone of [10, 50, 100, 500]) {
            if (prevHours < milestone && cumulativeRehearsalHours >= milestone) {
              rehearsalHourMilestones[milestone] = rehearsal.date;
            }
          }
        }
      }
    }

    // Calculate cumulative hours for gigs based on SETLIST DURATION (not start/end time)
    // Get gigs with their setlists and song durations
    const gigsWithSetlists = await prisma.gig.findMany({
      where: {
        workspaceId,
        type: 'GIG',
        date: { lt: now },
        status: { not: 'CANCELLED' }
      },
      include: {
        setlist: {
          include: {
            songs: {
              include: { song: true }
            }
          }
        },
        setlists: {
          include: {
            setlist: {
              include: {
                songs: {
                  include: { song: true }
                }
              }
            }
          }
        }
      },
      orderBy: { date: 'asc' }
    });

    let cumulativeGigHours = 0;
    const gigHourMilestones = {};
    for (const gig of gigsWithSetlists) {
      let gigDurationSeconds = 0;

      // Check single setlist (setlistId)
      if (gig.setlist?.songs) {
        gigDurationSeconds = gig.setlist.songs.reduce((sum, item) => {
          return sum + (item.song?.duration || item.duration || 0);
        }, 0);
      }

      // Check multi-set (GigSetlist join table)
      if (gig.setlists?.length > 0) {
        for (const gs of gig.setlists) {
          if (gs.setlist?.songs) {
            gigDurationSeconds += gs.setlist.songs.reduce((sum, item) => {
              return sum + (item.song?.duration || item.duration || 0);
            }, 0);
          }
        }
      }

      if (gigDurationSeconds > 0) {
        const hours = gigDurationSeconds / 3600; // Convert seconds to hours
        const prevHours = cumulativeGigHours;
        cumulativeGigHours += hours;
        for (const milestone of [10, 50, 100, 500]) {
          if (prevHours < milestone && cumulativeGigHours >= milestone) {
            gigHourMilestones[milestone] = gig.date;
          }
        }
      }
    }
    // Find first paid gig
    const firstPaidGig = allGigs.find(g => g.pay && g.pay > 0);

    // Calculate total revenue and track when milestones were hit
    let cumulativeRevenue = 0;
    const revenueMilestones = {};
    for (const gig of allGigs) {
      if (gig.pay && gig.pay > 0) {
        const prevRevenue = cumulativeRevenue;
        cumulativeRevenue += gig.pay;
        if (prevRevenue === 0 && cumulativeRevenue > 0) {
          revenueMilestones['first'] = gig.date;
        }
        for (const milestone of [1000, 10000]) {
          if (prevRevenue < milestone && cumulativeRevenue >= milestone) {
            revenueMilestones[milestone] = gig.date;
          }
        }
      }
    }

    // Helper to get the date of the Nth item
    const getNthDate = (items, n) => items[n - 1]?.date || items[n - 1]?.createdAt || now;

    // Award band achievements with proper dates
    for (const achievement of allAchievements.filter(a => a.isBandWide)) {
      if (existingBandIds.has(achievement.id)) continue;

      let shouldAward = false;
      let earnedAt = now;

      switch (achievement.code) {
        // Gig count achievements
        case 'first_gig':
          shouldAward = allGigs.length >= 1;
          earnedAt = getNthDate(allGigs, 1);
          break;
        case 'ten_gigs':
          shouldAward = allGigs.length >= 10;
          earnedAt = getNthDate(allGigs, 10);
          break;
        case 'twentyfive_gigs':
          shouldAward = allGigs.length >= 25;
          earnedAt = getNthDate(allGigs, 25);
          break;
        case 'fifty_gigs':
          shouldAward = allGigs.length >= 50;
          earnedAt = getNthDate(allGigs, 50);
          break;
        case 'hundred_gigs':
          shouldAward = allGigs.length >= 100;
          earnedAt = getNthDate(allGigs, 100);
          break;
        case 'twofifty_gigs':
          shouldAward = allGigs.length >= 250;
          earnedAt = getNthDate(allGigs, 250);
          break;
        case 'five_hundred_gigs':
          shouldAward = allGigs.length >= 500;
          earnedAt = getNthDate(allGigs, 500);
          break;
        case 'thousand_gigs':
          shouldAward = allGigs.length >= 1000;
          earnedAt = getNthDate(allGigs, 1000);
          break;

        // Rehearsal count achievements
        case 'first_rehearsal':
          shouldAward = allRehearsals.length >= 1;
          earnedAt = getNthDate(allRehearsals, 1);
          break;
        case 'five_rehearsals':
          shouldAward = allRehearsals.length >= 5;
          earnedAt = getNthDate(allRehearsals, 5);
          break;
        case 'ten_rehearsals':
          shouldAward = allRehearsals.length >= 10;
          earnedAt = getNthDate(allRehearsals, 10);
          break;
        case 'twentyfive_rehearsals':
          shouldAward = allRehearsals.length >= 25;
          earnedAt = getNthDate(allRehearsals, 25);
          break;
        case 'fifty_rehearsals':
          shouldAward = allRehearsals.length >= 50;
          earnedAt = getNthDate(allRehearsals, 50);
          break;
        case 'hundred_rehearsals':
          shouldAward = allRehearsals.length >= 100;
          earnedAt = getNthDate(allRehearsals, 100);
          break;

        // Song count achievements
        case 'ten_songs':
          shouldAward = allSongs.length >= 10;
          earnedAt = allSongs[9]?.createdAt || now;
          break;
        case 'fifty_songs':
          shouldAward = allSongs.length >= 50;
          earnedAt = allSongs[49]?.createdAt || now;
          break;
        case 'hundred_songs':
          shouldAward = allSongs.length >= 100;
          earnedAt = allSongs[99]?.createdAt || now;
          break;

        // Revenue achievements
        case 'first_revenue':
          shouldAward = cumulativeRevenue > 0;
          earnedAt = revenueMilestones['first'] || now;
          break;
        case 'thousand_revenue':
          shouldAward = cumulativeRevenue >= 1000;
          earnedAt = revenueMilestones[1000] || now;
          break;
        case 'ten_thousand_revenue':
          shouldAward = cumulativeRevenue >= 10000;
          earnedAt = revenueMilestones[10000] || now;
          break;

        // Hours gigged
        case 'ten_hours_gigged':
          shouldAward = cumulativeGigHours >= 10;
          earnedAt = gigHourMilestones[10] || now;
          break;
        case 'fifty_hours_gigged':
          shouldAward = cumulativeGigHours >= 50;
          earnedAt = gigHourMilestones[50] || now;
          break;
        case 'hundred_hours_gigged':
          shouldAward = cumulativeGigHours >= 100;
          earnedAt = gigHourMilestones[100] || now;
          break;
        case 'fivehundred_hours_gigged':
          shouldAward = cumulativeGigHours >= 500;
          earnedAt = gigHourMilestones[500] || now;
          break;

        // Hours rehearsed
        case 'ten_hours_rehearsed':
          shouldAward = cumulativeRehearsalHours >= 10;
          earnedAt = rehearsalHourMilestones[10] || now;
          break;
        case 'fifty_hours_rehearsed':
          shouldAward = cumulativeRehearsalHours >= 50;
          earnedAt = rehearsalHourMilestones[50] || now;
          break;
        case 'hundred_hours_rehearsed':
          shouldAward = cumulativeRehearsalHours >= 100;
          earnedAt = rehearsalHourMilestones[100] || now;
          break;
        case 'fivehundred_hours_rehearsed':
          shouldAward = cumulativeRehearsalHours >= 500;
          earnedAt = rehearsalHourMilestones[500] || now;
          break;

        // These are harder to date precisely, use now
        case 'road_warrior':
        case 'marathon':
        case 'crowd_favorite':
        case 'hundred_songs_played':
        case 'fivehundred_songs_played':
        case 'thousand_songs_played':
          // Skip for now - complex to date
          break;
      }

      if (shouldAward) {
        const awarded = await prisma.bandAchievement.create({
          data: {
            achievementId: achievement.id,
            workspaceId,
            earnedAt: new Date(earnedAt)
          },
          include: { achievement: true }
        });
        newAchievements.push({ type: 'band', ...awarded });
      }
    }

    // Check member achievements for ALL workspace members
    const allMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { userId: true, joinedAt: true }
    });

    const memberAchievementDefs = allAchievements.filter(a => !a.isBandWide);
    const gigCount = allGigs.length;

    for (const member of allMembers) {
      const userId = member.userId;

      // Get existing achievements for this member
      const existingMemberAchievements = await prisma.memberAchievement.findMany({
        where: { workspaceId, userId },
        select: { achievementId: true }
      });
      const existingMemberIds = new Set(existingMemberAchievements.map(a => a.achievementId));

      // Get member's songs ordered by date
      const memberSongs = await prisma.song.findMany({
        where: { workspaceId, createdById: userId },
        orderBy: { createdAt: 'asc' }
      });

      // Get member's setlists ordered by date
      const memberSetlists = await prisma.setlist.findMany({
        where: { workspaceId, createdById: userId },
        orderBy: { createdAt: 'asc' }
      });

      // Get member's messages ordered by date
      const memberMessages = await prisma.message.findMany({
        where: {
          channel: { workspaceId },
          authorId: userId
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true }
      });

      // Get member's reactions
      const memberReactions = await prisma.reaction.findMany({
        where: {
          message: { channel: { workspaceId } },
          userId
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true }
      });

      // Calculate months as member and anniversary dates
      const joinDate = member.joinedAt ? new Date(member.joinedAt) : null;
      const memberMonths = joinDate ? Math.floor(
        (now - joinDate) / (1000 * 60 * 60 * 24 * 30)
      ) : 0;

      // Award member achievements with proper dates
      for (const achievement of memberAchievementDefs) {
        if (existingMemberIds.has(achievement.id)) continue;

        let shouldAward = false;
        let earnedAt = now;

        switch (achievement.code) {
          case 'member_first_gig':
            shouldAward = gigCount >= 1;
            earnedAt = getNthDate(allGigs, 1);
            break;
          case 'member_ten_gigs':
            shouldAward = gigCount >= 10;
            earnedAt = getNthDate(allGigs, 10);
            break;
          case 'member_fifty_gigs':
            shouldAward = gigCount >= 50;
            earnedAt = getNthDate(allGigs, 50);
            break;
          case 'member_hundred_gigs':
            shouldAward = gigCount >= 100;
            earnedAt = getNthDate(allGigs, 100);
            break;
          case 'song_master':
            shouldAward = memberSongs.length >= 25;
            earnedAt = memberSongs[24]?.createdAt || now;
            break;
          case 'setlist_architect':
            shouldAward = memberSetlists.length >= 10;
            earnedAt = memberSetlists[9]?.createdAt || now;
            break;
          case 'communicator':
            shouldAward = memberMessages.length >= 100;
            earnedAt = memberMessages[99]?.createdAt || now;
            break;
          case 'super_communicator':
            shouldAward = memberMessages.length >= 1000;
            earnedAt = memberMessages[999]?.createdAt || now;
            break;
          case 'emoji_fan':
            shouldAward = memberReactions.length >= 50;
            earnedAt = memberReactions[49]?.createdAt || now;
            break;
          case 'emoji_enthusiast':
            shouldAward = memberReactions.length >= 250;
            earnedAt = memberReactions[249]?.createdAt || now;
            break;
          case 'emoji_master':
            shouldAward = memberReactions.length >= 1000;
            earnedAt = memberReactions[999]?.createdAt || now;
            break;
          case 'one_year_member':
            shouldAward = memberMonths >= 12;
            if (joinDate) {
              earnedAt = new Date(joinDate);
              earnedAt.setFullYear(earnedAt.getFullYear() + 1);
            }
            break;
          case 'two_year_member':
            shouldAward = memberMonths >= 24;
            if (joinDate) {
              earnedAt = new Date(joinDate);
              earnedAt.setFullYear(earnedAt.getFullYear() + 2);
            }
            break;
          case 'five_year_member':
            shouldAward = memberMonths >= 60;
            if (joinDate) {
              earnedAt = new Date(joinDate);
              earnedAt.setFullYear(earnedAt.getFullYear() + 5);
            }
            break;
          case 'ten_year_member':
            shouldAward = memberMonths >= 120;
            if (joinDate) {
              earnedAt = new Date(joinDate);
              earnedAt.setFullYear(earnedAt.getFullYear() + 10);
            }
            break;
        }

        if (shouldAward) {
          const awarded = await prisma.memberAchievement.create({
            data: {
              achievementId: achievement.id,
              userId,
              workspaceId,
              earnedAt: new Date(earnedAt)
            },
            include: { achievement: true }
          });
          newAchievements.push({ type: 'member', userId, ...awarded });
        }
      }
    }

    // Emit socket events for new achievements
    if (newAchievements.length > 0) {
      const io = req.app.get('io');
      for (const achievement of newAchievements) {
        io.to(`workspace:${workspaceId}`).emit('achievement:earned', achievement);
      }
    }

    res.json({
      newAchievements,
      stats: {
        gigs: allGigs.length,
        rehearsals: allRehearsals.length,
        songs: allSongs.length,
        revenue: cumulativeRevenue,
        hoursRehearsed: Math.round(cumulativeRehearsalHours * 10) / 10,
        hoursGigged: Math.round(cumulativeGigHours * 10) / 10
      }
    });
  } catch (error) {
    console.error('Error checking achievements:', error);
    res.status(500).json({ error: 'Failed to check achievements' });
  }
});

// Manually award an achievement (admin only)
router.post('/workspace/:workspaceId/award', authenticate, isWorkspaceAdmin, async (req, res) => {
  try {
    const { achievementCode, userId } = req.body;
    const workspaceId = req.params.workspaceId;

    const achievement = await prisma.achievement.findUnique({
      where: { code: achievementCode }
    });

    if (!achievement) {
      return res.status(404).json({ error: 'Achievement not found' });
    }

    if (achievement.isBandWide) {
      // Award to band
      const existing = await prisma.bandAchievement.findUnique({
        where: {
          achievementId_workspaceId: {
            achievementId: achievement.id,
            workspaceId
          }
        }
      });

      if (existing) {
        return res.status(400).json({ error: 'Band already has this achievement' });
      }

      const awarded = await prisma.bandAchievement.create({
        data: {
          achievementId: achievement.id,
          workspaceId
        },
        include: { achievement: true }
      });

      const io = req.app.get('io');
      io.to(`workspace:${workspaceId}`).emit('achievement:earned', { type: 'band', ...awarded });

      res.json(awarded);
    } else {
      // Award to member
      if (!userId) {
        return res.status(400).json({ error: 'userId required for member achievements' });
      }

      const existing = await prisma.memberAchievement.findUnique({
        where: {
          achievementId_userId_workspaceId: {
            achievementId: achievement.id,
            userId,
            workspaceId
          }
        }
      });

      if (existing) {
        return res.status(400).json({ error: 'Member already has this achievement' });
      }

      const awarded = await prisma.memberAchievement.create({
        data: {
          achievementId: achievement.id,
          userId,
          workspaceId
        },
        include: {
          achievement: true,
          user: {
            select: { id: true, displayName: true, avatarUrl: true }
          }
        }
      });

      const io = req.app.get('io');
      io.to(`workspace:${workspaceId}`).emit('achievement:earned', { type: 'member', ...awarded });

      res.json(awarded);
    }
  } catch (error) {
    console.error('Error awarding achievement:', error);
    res.status(500).json({ error: 'Failed to award achievement' });
  }
});

// Reset ALL band badges (to fix incorrect earnedAt dates)
router.post('/workspace/:workspaceId/reset-band-badges', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;

    // Delete ALL band achievements for this workspace
    const deleted = await prisma.bandAchievement.deleteMany({
      where: { workspaceId }
    });

    console.log(`Reset ${deleted.count} band badges for workspace ${workspaceId}`);

    res.json({
      success: true,
      deleted: deleted.count,
      message: `Reset ${deleted.count} band badges. Click "Check for New" to recalculate with correct dates.`
    });
  } catch (error) {
    console.error('Error resetting band badges:', error);
    res.status(500).json({ error: 'Failed to reset band badges' });
  }
});

// Get achievement leaderboard
router.get('/workspace/:workspaceId/leaderboard', authenticate, isWorkspaceMember, async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;

    // Get members with their achievement counts
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            memberAchievements: {
              where: { workspaceId },
              include: { achievement: true }
            }
          }
        }
      }
    });

    const leaderboard = members.map(m => ({
      user: {
        id: m.user.id,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl
      },
      achievementCount: m.user.memberAchievements.length,
      achievements: m.user.memberAchievements.map(a => a.achievement)
    })).sort((a, b) => b.achievementCount - a.achievementCount);

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

export default router;
