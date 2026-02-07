import prisma from '../lib/prisma.js';

const email = process.argv[2];
const newName = process.argv[3];

if (!email || !newName) {
  console.error('Usage: node src/scripts/_rename-user.js <email> <newName>');
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email }, select: { id: true, displayName: true } });
if (!user) {
  console.error(`User not found: ${email}`);
  process.exit(1);
}

console.log(`Renaming "${user.displayName}" → "${newName}"`);
await prisma.user.update({ where: { id: user.id }, data: { displayName: newName } });
console.log('Done');
await prisma.$disconnect();
