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

// Release-notes drift guard.
//
// The "What's new" dialog reads client/src/data/releaseNotes.js (mirrored in
// mobile/). That file silently fell 19 versions behind between v1.07.26 and
// v1.07.45 — every one of those releases shipped without telling users
// anything — because nothing connected bumping the version to writing a note.
//
// Deliberately NOT "the newest note must equal the new version": that file's
// own policy is to omit versions with no user-visible changes (security-only
// patches, no-op redeploys), and a rule forcing a note on every bump would
// either be wrong or get routinely bypassed. This fails instead when the notes
// fall more than DRIFT_LIMIT versions behind, which is drift rather than a
// deliberate omission. Pass --allow-stale-notes for a genuine run of no-op
// releases.
//
// Runs before anything is written, so a failure leaves the tree untouched.
const DRIFT_LIMIT = 3;
const versionOrdinal = (v) => {
  const [a, b, c] = String(v).split('.').map(Number);
  return (a || 0) * 10000 + (b || 0) * 100 + (c || 0);
};

const NOTES_FILES = [
  join(rootDir, 'client', 'src', 'data', 'releaseNotes.js'),
  join(rootDir, 'mobile', 'src', 'data', 'releaseNotes.js'),
];

const notesBodies = NOTES_FILES.map((f) => {
  const text = readFileSync(f, 'utf-8');
  return text.slice(text.indexOf('export const RELEASE_NOTES'));
});

if (notesBodies[0] !== notesBodies[1]) {
  console.error('\nRelease notes are out of sync between web and mobile.');
  console.error('  client/src/data/releaseNotes.js and mobile/src/data/releaseNotes.js');
  console.error('  must have identical RELEASE_NOTES content. Reconcile them, then bump.\n');
  process.exit(1);
}

const topNote = notesBodies[0].match(/version:\s*'([\d.]+)'/);
if (!topNote) {
  console.error('\nCould not find any entry in RELEASE_NOTES. Refusing to bump.\n');
  process.exit(1);
}

const drift = versionOrdinal(newVersion) - versionOrdinal(topNote[1]);
if (drift > DRIFT_LIMIT && !process.argv.includes('--allow-stale-notes')) {
  console.error(`\nRelease notes are ${drift} versions behind.`);
  console.error(`  Newest note: v${topNote[1]}   Bumping to: v${newVersion}`);
  console.error("\n  Users see these in the \"What's new\" dialog. Add an entry for the");
  console.error('  user-visible work to BOTH of:');
  console.error('    client/src/data/releaseNotes.js');
  console.error('    mobile/src/data/releaseNotes.js');
  console.error('\n  If this really is a run of releases with nothing user-visible,');
  console.error('  re-run with --allow-stale-notes.\n');
  process.exit(1);
}

// Update client/package.json
clientPkg.version = newVersion;
clientPkg.displayVersion = newVersion;
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
