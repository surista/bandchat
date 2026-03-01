import { PrismaClient } from '@prisma/client';

// Singleton test Prisma client
const prisma = new PrismaClient();

export default prisma;
