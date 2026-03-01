import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');

const bumpType = process.argv[2];

if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('Usage: node bump-version.js [patch|minor|major]');
  process.exit(1);
}

// Read current version from client/package.json (source of truth)
const clientPkgPath = join(rootDir, 'client', 'package.json');
const clientPkg = JSON.parse(readFileSync(clientPkgPath, 'utf-8'));
const [major, minor, patch] = clientPkg.version.split('.').map(Number);

let newVersion;
switch (bumpType) {
  case 'major':
    newVersion = `${major + 1}.00.00`;
    break;
  case 'minor':
    newVersion = `${major}.${String(minor + 1).padStart(2, '0')}.00`;
    break;
  case 'patch':
    if (patch + 1 >= 100) {
      newVersion = `${major}.${String(minor + 1).padStart(2, '0')}.00`;
    } else {
      newVersion = `${major}.${String(minor).padStart(2, '0')}.${String(patch + 1).padStart(2, '0')}`;
    }
    break;
}

// Update client/package.json
clientPkg.version = newVersion;
writeFileSync(clientPkgPath, JSON.stringify(clientPkg, null, 2) + '\n');

// Update server/package.json
const serverPkgPath = join(rootDir, 'server', 'package.json');
const serverPkg = JSON.parse(readFileSync(serverPkgPath, 'utf-8'));
serverPkg.version = newVersion;
writeFileSync(serverPkgPath, JSON.stringify(serverPkg, null, 2) + '\n');

// Update mobile/package.json
const mobilePkgPath = join(rootDir, 'mobile', 'package.json');
const mobilePkg = JSON.parse(readFileSync(mobilePkgPath, 'utf-8'));
mobilePkg.version = newVersion;
writeFileSync(mobilePkgPath, JSON.stringify(mobilePkg, null, 2) + '\n');

// Update mobile/app.config.js — version + buildNumber/versionCode
const appConfigPath = join(rootDir, 'mobile', 'app.config.js');
let appConfig = readFileSync(appConfigPath, 'utf-8');

// Calculate build number: total patch count (e.g., 1.03.72 → 372)
const [newMajor, newMinor, newPatch] = newVersion.split('.').map(Number);
const buildNumber = newMajor * 10000 + newMinor * 100 + newPatch;

appConfig = appConfig.replace(/version:\s*'[^']*'/, `version: '${newVersion}'`);
appConfig = appConfig.replace(/buildNumber:\s*'[^']*'/, `buildNumber: '${buildNumber}'`);
appConfig = appConfig.replace(/versionCode:\s*\d+/, `versionCode: ${buildNumber}`);
writeFileSync(appConfigPath, appConfig);

console.log(`Bumped version: v${newVersion} (build ${buildNumber})`);
