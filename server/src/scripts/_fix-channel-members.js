import prisma from '../lib/prisma.js';

const WORKSPACE_ID = '07b05f6d-0818-4505-9cb3-413f6d6c10ed';

// Get all workspace members
const wsMembers = await prisma.workspaceMember.findMany({
  where: { workspaceId: WORKSPACE_ID },
  select: { userId: true }
});

// Get all public non-DM channels in workspace
const channels = await prisma.channel.findMany({
  where: { workspaceId: WORKSPACE_ID, isDirect: false, isPrivate: false },
  select: { id: true, name: true }
});

let added = 0;
for (const channel of channels) {
  for (const { userId } of wsMembers) {
    try {
      await prisma.channelMember.upsert({
        where: { userId_channelId: { userId, channelId: channel.id } },
        update: {},
        create: { userId, channelId: channel.id }
      });
      added++;
    } catch (err) {
      // already exists
    }
  }
}

console.log(`Ensured ${wsMembers.length} members in ${channels.length} channels (${added} upserts)`);
await prisma.$disconnect();
