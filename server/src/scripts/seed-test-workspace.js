#!/usr/bin/env node
/**
 * Seed a test workspace with comprehensive data for backup testing.
 *
 * Usage:
 *   node src/scripts/seed-test-workspace.js <admin-user-email>
 *
 * This creates a workspace called "Backup Test Band" with:
 * - 3 band members
 * - 5 channels with 50+ messages each
 * - 10 songs with attachments
 * - 3 setlists
 * - 5 gigs (past and future) with attendees
 * - Band kitty with transactions
 * - Announcements and polls
 * - Timeline events
 * - Practice sessions
 * - Availability records
 *
 * Run this, then trigger a backup, delete the workspace, restore, and verify.
 */

import 'dotenv/config';
import prisma from '../lib/prisma.js';
import { randomUUID } from 'crypto';

const WORKSPACE_NAME = 'Backup Test Band';

async function main() {
  const adminEmail = process.argv[2];

  if (!adminEmail) {
    console.error('Usage: node src/scripts/seed-test-workspace.js <admin-user-email>');
    console.error('Example: node src/scripts/seed-test-workspace.js admin@example.com');
    process.exit(1);
  }

  // Find admin user
  const adminUser = await prisma.user.findUnique({
    where: { email: adminEmail }
  });

  if (!adminUser) {
    console.error(`User not found: ${adminEmail}`);
    process.exit(1);
  }

  console.log(`Creating test workspace for ${adminUser.displayName}...`);

  // Check if test workspace already exists
  const existing = await prisma.workspace.findFirst({
    where: { name: WORKSPACE_NAME }
  });

  if (existing) {
    console.log(`Test workspace already exists (ID: ${existing.id}). Delete it first to re-seed.`);
    console.log(`To delete: node -e "require('./src/lib/prisma.js').default.workspace.delete({where:{id:'${existing.id}'}}).then(console.log)"`);
    process.exit(1);
  }

  // Create test users (fake members)
  const testUsers = [];
  for (let i = 1; i <= 3; i++) {
    const user = await prisma.user.upsert({
      where: { email: `testmember${i}@backup-test.local` },
      create: {
        email: `testmember${i}@backup-test.local`,
        displayName: `Test Member ${i}`,
        authProvider: 'local',
        emailVerified: true,
      },
      update: {},
    });
    testUsers.push(user);
  }
  console.log(`Created/found ${testUsers.length} test users`);

  // Create workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: WORKSPACE_NAME,
      inviteCode: randomUUID().slice(0, 8),
      members: {
        create: [
          { userId: adminUser.id, role: 'ADMIN' },
          ...testUsers.map(u => ({ userId: u.id, role: 'MEMBER' }))
        ]
      }
    }
  });
  console.log(`Created workspace: ${workspace.name} (${workspace.id})`);

  const allUserIds = [adminUser.id, ...testUsers.map(u => u.id)];

  // Create channels with messages
  const channels = [];
  const channelNames = ['general', 'practice-notes', 'gig-planning', 'random', 'setlist-ideas'];

  for (const name of channelNames) {
    const channel = await prisma.channel.create({
      data: {
        name,
        workspaceId: workspace.id,
        description: `Test channel: ${name}`,
        members: {
          create: allUserIds.map(uid => ({ userId: uid }))
        }
      }
    });
    channels.push(channel);

    // Create 50+ messages per channel
    const messages = [];
    for (let i = 0; i < 55; i++) {
      const authorId = allUserIds[i % allUserIds.length];
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * 30));

      messages.push({
        content: `Test message ${i + 1} in #${name}. This is some sample content for backup testing. Lorem ipsum dolor sit amet.`,
        channelId: channel.id,
        authorId,
        createdAt: date,
        updatedAt: date,
      });
    }
    await prisma.message.createMany({ data: messages });
    console.log(`Created channel #${name} with ${messages.length} messages`);
  }

  // Create band members
  const instruments = ['Vocals', 'Guitar', 'Bass', 'Drums'];
  const bandMembers = [];
  for (let i = 0; i < allUserIds.length; i++) {
    const bm = await prisma.bandMember.create({
      data: {
        name: i === 0 ? adminUser.displayName : `Test Member ${i}`,
        workspaceId: workspace.id,
        linkedUserId: allUserIds[i],
        currentInstrument: instruments[i % instruments.length],
        stints: {
          create: {
            instrument: instruments[i % instruments.length],
            startDate: new Date('2020-01-01'),
          }
        }
      }
    });
    bandMembers.push(bm);
  }
  console.log(`Created ${bandMembers.length} band members`);

  // Create songs
  const songs = [];
  const songTitles = [
    'Test Song One', 'Backup Blues', 'Database Rock', 'Seed Data Shuffle',
    'The Migration', 'Schema Dreams', 'Query Queen', 'Transaction Tango',
    'The Rollback', 'Commit Song'
  ];

  for (const title of songTitles) {
    const song = await prisma.song.create({
      data: {
        title,
        artist: WORKSPACE_NAME,
        workspaceId: workspace.id,
        key: ['C', 'D', 'E', 'G', 'A'][Math.floor(Math.random() * 5)],
        tempo: 100 + Math.floor(Math.random() * 80),
        duration: 180 + Math.floor(Math.random() * 120),
        notes: `Notes for ${title}. This is test data for backup verification.`,
        createdById: adminUser.id,
      }
    });
    songs.push(song);
  }
  console.log(`Created ${songs.length} songs`);

  // Create setlists
  const setlists = [];
  for (let i = 1; i <= 3; i++) {
    const setlist = await prisma.setlist.create({
      data: {
        name: `Test Setlist ${i}`,
        workspaceId: workspace.id,
        createdById: adminUser.id,
        songs: {
          create: songs.slice(0, 5 + i).map((s, idx) => ({
            songId: s.id,
            position: idx,
            setNumber: Math.floor(idx / 4) + 1,
          }))
        },
        performers: {
          create: bandMembers.slice(0, 3).map(bm => ({ bandMemberId: bm.id }))
        }
      }
    });
    setlists.push(setlist);
  }
  console.log(`Created ${setlists.length} setlists`);

  // Create gigs (3 past, 2 future)
  const gigs = [];
  const venues = ['Test Venue A', 'Backup Bar', 'The Database Club', 'Schema Hall', 'Query Lounge'];

  for (let i = 0; i < 5; i++) {
    const date = new Date();
    date.setDate(date.getDate() + (i < 3 ? -(30 - i * 10) : (i - 2) * 15));

    const gig = await prisma.gig.create({
      data: {
        title: `Test Gig ${i + 1}`,
        venue: venues[i],
        date,
        type: 'GIG',
        status: i < 3 ? 'COMPLETED' : 'SCHEDULED',
        workspaceId: workspace.id,
        createdById: adminUser.id,
        notes: `Test gig notes for venue ${venues[i]}`,
        attendees: {
          create: bandMembers.map(bm => ({
            bandMemberId: bm.id,
            status: 'CONFIRMED',
          }))
        },
        setlists: i < 3 ? {
          create: { setlistId: setlists[i % setlists.length].id }
        } : undefined,
      }
    });
    gigs.push(gig);
  }
  console.log(`Created ${gigs.length} gigs`);

  // Create band kitty with transactions
  const kitty = await prisma.bandKitty.create({
    data: {
      workspaceId: workspace.id,
      currency: 'USD',
      transactions: {
        create: [
          { amount: 500, type: 'DEPOSIT', description: 'Initial seed money', createdById: adminUser.id },
          { amount: -50, type: 'EXPENSE', description: 'Test expense 1', createdById: adminUser.id },
          { amount: 200, type: 'GIG_PAYMENT', description: 'Gig payment test', createdById: adminUser.id },
          { amount: -30, type: 'EXPENSE', description: 'Test expense 2', createdById: testUsers[0].id },
        ]
      }
    }
  });
  console.log(`Created band kitty with transactions`);

  // Create announcements
  const announcement = await prisma.announcement.create({
    data: {
      title: 'Test Announcement',
      content: 'This is a test announcement for backup verification. Please acknowledge.',
      workspaceId: workspace.id,
      authorId: adminUser.id,
      isPinned: true,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }
  });
  console.log(`Created announcement`);

  // Create poll
  const poll = await prisma.poll.create({
    data: {
      question: 'Test Poll: Best backup frequency?',
      workspaceId: workspace.id,
      createdById: adminUser.id,
      isAnonymous: false,
      options: {
        create: [
          { text: 'Every hour' },
          { text: 'Every day' },
          { text: 'Every week' },
        ]
      }
    },
    include: { options: true }
  });

  // Add votes
  await prisma.pollVote.createMany({
    data: [
      { optionId: poll.options[1].id, voterId: adminUser.id },
      { optionId: poll.options[1].id, voterId: testUsers[0].id },
      { optionId: poll.options[0].id, voterId: testUsers[1].id },
    ]
  });
  console.log(`Created poll with votes`);

  // Create timeline events
  await prisma.timelineEvent.createMany({
    data: [
      {
        eventType: 'MEMBER_JOINED',
        title: 'Band formed',
        description: 'The test band was created',
        eventDate: new Date('2020-01-01'),
        workspaceId: workspace.id,
        createdById: adminUser.id,
      },
      {
        eventType: 'GIG_PLAYED',
        title: 'First test gig',
        description: 'We played our first test gig',
        eventDate: new Date('2020-06-15'),
        workspaceId: workspace.id,
        createdById: adminUser.id,
      },
    ]
  });
  console.log(`Created timeline events`);

  // Create practice sessions
  await prisma.practiceSession.createMany({
    data: allUserIds.flatMap(uid => [
      { date: new Date(), durationMinutes: 60, notes: 'Test practice 1', userId: uid, workspaceId: workspace.id },
      { date: new Date(Date.now() - 86400000), durationMinutes: 45, notes: 'Test practice 2', userId: uid, workspaceId: workspace.id },
    ])
  });
  console.log(`Created practice sessions`);

  // Create availability
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  await prisma.memberAvailability.createMany({
    data: bandMembers.flatMap(bm => [
      { bandMemberId: bm.id, date: nextMonth, status: 'AVAILABLE', workspaceId: workspace.id },
      { bandMemberId: bm.id, date: new Date(nextMonth.getTime() + 86400000), status: 'MAYBE', workspaceId: workspace.id },
    ])
  });
  console.log(`Created availability records`);

  // Summary
  console.log('\n=== Test Workspace Created Successfully ===');
  console.log(`Workspace: ${workspace.name} (ID: ${workspace.id})`);
  console.log(`Members: ${allUserIds.length}`);
  console.log(`Channels: ${channels.length}`);
  console.log(`Messages: ${channels.length * 55}`);
  console.log(`Songs: ${songs.length}`);
  console.log(`Setlists: ${setlists.length}`);
  console.log(`Gigs: ${gigs.length}`);
  console.log(`Band Members: ${bandMembers.length}`);
  console.log('\nTo test backup/restore:');
  console.log('1. Trigger a backup via admin dashboard or API');
  console.log('2. Delete this workspace');
  console.log('3. Restore from the backup');
  console.log('4. Verify all data is restored');
  console.log(`\nTo delete workspace: DELETE /api/workspaces/${workspace.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
