#!/usr/bin/env node
/**
 * Generate PWA icons from SVG sources.
 * Run: npx sharp-cli or node with sharp installed
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../public');

const sizes = [48, 72, 96, 128, 144, 152, 192, 384, 512];

// Generate regular icons from favicon.svg
for (const size of sizes) {
  const input = resolve(publicDir, 'favicon.svg');
  const output = resolve(publicDir, `icon-${size}.png`);
  execSync(`npx sharp-cli -i "${input}" -o "${output}" resize ${size} ${size}`, { stdio: 'inherit' });
  console.log(`Generated icon-${size}.png`);
}

// Generate maskable icons from icon-maskable.svg
for (const size of [192, 512]) {
  const input = resolve(publicDir, 'icon-maskable.svg');
  const output = resolve(publicDir, `icon-maskable-${size}.png`);
  execSync(`npx sharp-cli -i "${input}" -o "${output}" resize ${size} ${size}`, { stdio: 'inherit' });
  console.log(`Generated icon-maskable-${size}.png`);
}

// Generate apple-touch-icon (180x180)
const appleInput = resolve(publicDir, 'favicon.svg');
const appleOutput = resolve(publicDir, 'apple-touch-icon.png');
execSync(`npx sharp-cli -i "${appleInput}" -o "${appleOutput}" resize 180 180`, { stdio: 'inherit' });
console.log('Generated apple-touch-icon.png');

console.log('\nAll icons generated successfully!');
