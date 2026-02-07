import prisma from '../lib/prisma.js';

const users = await prisma.user.findMany({
  select: { id: true, email: true, displayName: true },
  orderBy: { displayName: 'asc' }
});

for (const u of users) {
  console.log(`${u.id} | ${u.email} | ${u.displayName}`);
}

await prisma.$disconnect();
