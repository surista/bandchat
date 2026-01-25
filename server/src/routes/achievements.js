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

    // Get all achievement definitions
    const allAchievements = await prisma.achievement.findMany();
    console.log('DEBUG achievements - total definitions found:', allAchievements.length);

    // Get existing achievements
    const existingBandAchievements = await prisma.bandAchievement.findMany({
      where: { workspaceId },
      select: { achievementId: true }
    });
    const existingBandIds = new Set(existingBandAchievements.map(a => a.achievementId));
    console.log('DEBUG achievements - existing band achievements:', existingBandAchievements.length);

    // Get stats - count completed OR past events (date before now)
    const now = new Date();
    console.log('DEBUG achievements - checking workspace:', workspaceId);
    console.log('DEBUG achievements - current date:', now);

    const gigCount = await prisma.gig.count({
      where: {
        workspaceId,
        type: 'GIG',
        OR: [
          { status: 'COMPLETED' },
          { date: { lt: now }, status: { not: 'CANCELLED' } }
        ]
      }
    });
    console.log('DEBUG achievements - gigCount:', gigCount);

    const rehearsalCount = await prisma.gig.count({
      where: {
        workspaceId,
        type: 'REHEARSAL',
        OR: [
          { status: 'COMPLETED' },
          { date: { lt: now }, status: { not: 'CANCELLED' } }
        ]
      }
    });

    const songCount = await prisma.song.count({
      where: { workspaceId }
    });

    const totalRevenue = await prisma.gig.aggregate({
      where: { workspaceId, type: 'GIG', status: 'COMPLETED', pay: { not: null } },
      _sum: { pay: true }
    });

    // Calculate hours gigged (from completed gigs with start and end times)
    const completedGigs = await prisma.gig.findMany({
      where: { workspaceId, type: 'GIG', status: 'COMPLETED', endDate: { not: null } },
      select: { date: true, endDate: true }
    });
    const hoursGigged = completedGigs.reduce((total, gig) => {
      const duration = (new Date(gig.endDate) - new Date(gig.date)) / (1000 * 60 * 60);
      return total + (duration > 0 ? duration : 0);
    }, 0);

    // Calculate hours rehearsed (completed OR past rehearsals with end times)
    const countableRehearsals = await prisma.gig.findMany({
      where: {
        workspaceId,
        type: 'REHEARSAL',
        endDate: { not: null },
        OR: [
          { status: 'COMPLETED' },
          { date: { lt: now }, status: { not: 'CANCELLED' } }
        ]
      },
      select: { date: true, endDate: true }
    });
    console.log('DEBUG achievements - rehearsals with end times:', countableRehearsals.length);
    const hoursRehearsed = countableRehearsals.reduce((total, rehearsal) => {
      const duration = (new Date(rehearsal.endDate) - new Date(rehearsal.date)) / (1000 * 60 * 60);
      return total + (duration > 0 ? duration : 0);
    }, 0);
    console.log('DEBUG achievements - hoursRehearsed:', hoursRehearsed);
    console.log('DEBUG achievements - rehearsalCount:', rehearsalCount);

    // Total songs played at gigs
    const songsPlayedCount = await prisma.gigSong.count({
      where: { gig: { workspaceId, type: 'GIG', status: 'COMPLETED' } }
    });

    // Check for road warrior (5 gigs in 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentGigs = await prisma.gig.count({
      where: {
        workspaceId,
        type: 'GIG',
        status: 'COMPLETED',
        date: { gte: sevenDaysAgo }
      }
    });

    // Check for marathon (3+ hour setlist)
    const longestSetlist = await prisma.setlist.findFirst({
      where: { workspaceId },
      include: {
        songs: {
          include: { song: true }
        }
      }
    });

    let hasMarathon = false;
    if (longestSetlist) {
      const allSetlists = await prisma.setlist.findMany({
        where: { workspaceId },
        include: {
          songs: {
            include: { song: true }
          }
        }
      });

      for (const setlist of allSetlists) {
        const totalDuration = setlist.songs.reduce((sum, item) => {
          if (item.song?.duration) return sum + item.song.duration;
          if (item.duration) return sum + item.duration;
          return sum;
        }, 0);
        if (totalDuration >= 10800) { // 3 hours in seconds
          hasMarathon = true;
          break;
        }
      }
    }

    // Check for crowd favorite (same song 50 times)
    const mostPlayedSong = await prisma.gigSong.groupBy({
      by: ['songId'],
      where: {
        gig: { workspaceId }
      },
      _count: { songId: true },
      orderBy: { _count: { songId: 'desc' } },
      take: 1
    });

    const hasCrowdFavorite = mostPlayedSong.length > 0 && mostPlayedSong[0]._count.songId >= 50;

    // Award band achievements
    for (const achievement of allAchievements.filter(a => a.isBandWide)) {
      if (existingBandIds.has(achievement.id)) continue;

      let shouldAward = false;

      switch (achievement.code) {
        case 'first_gig':
        case 'ten_gigs':
        case 'twentyfive_gigs':
        case 'fifty_gigs':
        case 'hundred_gigs':
        case 'twofifty_gigs':
        case 'five_hundred_gigs':
        case 'thousand_gigs':
          shouldAward = gigCount >= achievement.threshold;
          break;
        case 'first_rehearsal':
        case 'five_rehearsals':
        case 'ten_rehearsals':
        case 'twentyfive_rehearsals':
        case 'fifty_rehearsals':
        case 'hundred_rehearsals':
          shouldAward = rehearsalCount >= achievement.threshold;
          break;
        case 'ten_songs':
        case 'fifty_songs':
        case 'hundred_songs':
          shouldAward = songCount >= achievement.threshold;
          break;
        case 'first_revenue':
          shouldAward = (totalRevenue._sum.pay || 0) > 0;
          break;
        case 'thousand_revenue':
        case 'ten_thousand_revenue':
          shouldAward = (totalRevenue._sum.pay || 0) >= achievement.threshold;
          break;
        case 'road_warrior':
          shouldAward = recentGigs >= 5;
          break;
        case 'marathon':
          shouldAward = hasMarathon;
          break;
        case 'crowd_favorite':
          shouldAward = hasCrowdFavorite;
          break;
        // Hours gigged
        case 'ten_hours_gigged':
        case 'fifty_hours_gigged':
        case 'hundred_hours_gigged':
        case 'fivehundred_hours_gigged':
          shouldAward = hoursGigged >= achievement.threshold;
          break;
        // Hours rehearsed
        case 'ten_hours_rehearsed':
        case 'fifty_hours_rehearsed':
        case 'hundred_hours_rehearsed':
        case 'fivehundred_hours_rehearsed':
          shouldAward = hoursRehearsed >= achievement.threshold;
          break;
        // Songs played at gigs
        case 'hundred_songs_played':
        case 'fivehundred_songs_played':
        case 'thousand_songs_played':
          shouldAward = songsPlayedCount >= achievement.threshold;
          break;
      }

      if (shouldAward) {
        console.log('DEBUG achievements - awarding band achievement:', achievement.code);
        const awarded = await prisma.bandAchievement.create({
          data: {
            achievementId: achievement.id,
            workspaceId
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
    console.log('DEBUG achievements - checking', allMembers.length, 'members');

    const memberAchievementDefs = allAchievements.filter(a => !a.isBandWide);

    for (const member of allMembers) {
      const userId = member.userId;

      // Get existing achievements for this member
      const existingMemberAchievements = await prisma.memberAchievement.findMany({
        where: { workspaceId, userId },
        select: { achievementId: true }
      });
      const existingMemberIds = new Set(existingMemberAchievements.map(a => a.achievementId));

      // Get member stats
      const memberSongCount = await prisma.song.count({
        where: { workspaceId, createdById: userId }
      });

      const memberSetlistCount = await prisma.setlist.count({
        where: { workspaceId, createdById: userId }
      });

      const memberMessageCount = await prisma.message.count({
        where: {
          channel: { workspaceId },
          authorId: userId
        }
      });

      const memberReactionCount = await prisma.reaction.count({
        where: {
          message: { channel: { workspaceId } },
          userId
        }
      });

      // Calculate months as member
      const memberMonths = member.joinedAt ? Math.floor(
        (new Date() - new Date(member.joinedAt)) / (1000 * 60 * 60 * 24 * 30)
      ) : 0;

      // Award member achievements
      for (const achievement of memberAchievementDefs) {
        if (existingMemberIds.has(achievement.id)) continue;

        let shouldAward = false;

        switch (achievement.code) {
          case 'member_first_gig':
          case 'member_ten_gigs':
          case 'member_fifty_gigs':
          case 'member_hundred_gigs':
            // Use band gig count as proxy (all members get credit)
            shouldAward = gigCount >= achievement.threshold;
            break;
          case 'song_master':
            shouldAward = memberSongCount >= achievement.threshold;
            break;
          case 'setlist_architect':
            shouldAward = memberSetlistCount >= achievement.threshold;
            break;
          case 'communicator':
          case 'super_communicator':
            shouldAward = memberMessageCount >= achievement.threshold;
            break;
          case 'emoji_fan':
          case 'emoji_enthusiast':
          case 'emoji_master':
            shouldAward = memberReactionCount >= achievement.threshold;
            break;
          case 'one_year_member':
          case 'two_year_member':
          case 'five_year_member':
          case 'ten_year_member':
            shouldAward = memberMonths >= achievement.threshold;
            break;
        }

        if (shouldAward) {
          console.log('DEBUG achievements - awarding member achievement:', achievement.code, 'to user:', userId);
          const awarded = await prisma.memberAchievement.create({
            data: {
              achievementId: achievement.id,
              userId,
              workspaceId
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
        gigs: gigCount,
        rehearsals: rehearsalCount,
        songs: songCount,
        revenue: totalRevenue._sum.pay || 0,
        hoursRehearsed: Math.round(hoursRehearsed * 10) / 10
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
