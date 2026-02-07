import prisma from '../lib/prisma.js';

const workspaces = await prisma.workspace.findMany({
  select: { id: true, name: true, _count: { select: { members: true } } }
});

for (const w of workspaces) {
  console.log(`${w.id} | ${w.name} | ${w._count.members} members`);
}

await prisma.$disconnect();
