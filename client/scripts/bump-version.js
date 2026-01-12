import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packagePath = join(__dirname, '..', 'package.json');

const bumpType = process.argv[2];

if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('Usage: node bump-version.js [patch|minor|major]');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);

let newVersion;
switch (bumpType) {
  case 'major':
    newVersion = `${major + 1}.00.00`;
    break;
  case 'minor':
    newVersion = `${major}.${String(minor + 1).padStart(2, '0')}.00`;
    break;
  case 'patch':
    newVersion = `${major}.${String(minor).padStart(2, '0')}.${String(patch + 1).padStart(2, '0')}`;
    break;
}

pkg.version = newVersion;
writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`Bumped version: v${pkg.version}`);
