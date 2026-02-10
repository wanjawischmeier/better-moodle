/**
 * Central update script for Firefox extension metadata and files
 * This script:
 * 1. Updates manifest.json version from package.json
 * 2. Updates polyfill with manifest.json metadata
 * 3. Copies the built userscript to extension/scripts
 */

import { copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');

console.log('Updating firefox extension metadata...\n');

// 1. Update manifest.json from package.json
console.log('Updating manifest.json from package.json...');
execSync('node firefox/build-scripts/update-manifest.js', { 
  cwd: rootDir, 
  stdio: 'inherit' 
});

// 2. Update polyfill from manifest.json
console.log('Updating polyfills.js from manifest.json...');
execSync('node firefox/build-scripts/update-polyfills.js', { 
  cwd: rootDir, 
  stdio: 'inherit' 
});

// 3. Copy userscript if it exists
const userscriptSrc = join(rootDir, '../dist', 'better-moodle-uzl.user.js');
const userscriptDest = join(rootDir, 'firefox/scripts', 'better-moodle-uzl.user.js');

try {
  copyFileSync(userscriptSrc, userscriptDest);
  console.log('Copied userscript to extensions/firefox/scripts');
} catch (error) {
  // File might not exist yet if running before build
  console.log('Skipping userscript copy (file not found)');
}

console.log('\nFirefox extension metadata update complete!');
