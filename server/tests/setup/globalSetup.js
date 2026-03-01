import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  // Load .env.test from server root
  const serverRoot = resolve(__dirname, '../../');
  config({ path: resolve(serverRoot, '.env.test') });

  // Reset the test database and push schema
  console.log('\nResetting test database...');
  execSync('npx prisma db push --force-reset --accept-data-loss', {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'pipe',
  });
  console.log('Test database ready.\n');
}
