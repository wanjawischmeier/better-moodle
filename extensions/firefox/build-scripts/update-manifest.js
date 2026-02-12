/**
 * Update manifest.json with version and metadata from package.json
 * Run this as part of the build process to keep manifest.json in sync
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Read package.json
const packageJson = JSON.parse(
    readFileSync(join(rootDir, '../../package.json'), 'utf-8')
);

// Read current manifest.json
const manifestPath = join(rootDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

// Update version
manifest.version = packageJson.version;

// Write updated manifest
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

console.log(`Updated manifest.json to version ${packageJson.version}`);
