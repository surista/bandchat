import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  // Load .env.test from server root
  const serverRoot = resolve(__dirname, '../../');
  config({ path: resolve(serverRoot, '.env.test') });

  // Safety guard: refuse to run tests against a non-test database
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl || (!dbUrl.includes('test') && !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1') && !dbUrl.includes('rlwy.net'))) {
    throw new Error(
      'SAFETY: Refusing to run tests — DATABASE_URL does not appear to be a test database. ' +
      'Ensure .env.test exists and DATABASE_URL contains "test", "localhost", or "127.0.0.1".'
    );
  }

  // Reset the test database using raw SQL migration.
  // Prisma's db push has a bug with FK constraint ordering on complex schemas,
  // so we generate the migration SQL and run it directly.
  console.log('\nResetting test database...');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

  // Drop and recreate schema
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public');

  await prisma.$disconnect();

  // Generate migration SQL and apply it via prisma db execute
  const migrationSql = execSync('npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script', {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    encoding: 'utf-8',
  });

  // Write SQL to temp file and execute via prisma db execute
  const { writeFileSync, unlinkSync } = await import('fs');
  const tmpSql = resolve(serverRoot, 'tests/setup/_migration.sql');
  writeFileSync(tmpSql, migrationSql);
  try {
    execSync(`npx prisma db execute --file "${tmpSql}" --schema prisma/schema.prisma`, {
      cwd: serverRoot,
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      stdio: 'pipe',
    });
  } finally {
    try { unlinkSync(tmpSql); } catch { /* ignore */ }
  }
  console.log('Test database ready.\n');
}
