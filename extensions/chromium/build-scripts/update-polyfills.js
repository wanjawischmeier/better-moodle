/**
 * Generate polyfills/chrome.js from manifest.json
 * This ensures GM_info has the correct version and metadata
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Read manifest.json
const manifestPath = join(rootDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

// Read the template (first 302 lines are static, last 32 lines are static)
const polyfillPath = join(rootDir, 'scripts', 'polyfills.js');
const polyfillContent = readFileSync(polyfillPath, 'utf-8');
const lines = polyfillContent.split('\n');

// Find the GM_info section (should be around line 303-327)
const gmInfoStart = lines.findIndex(line => line.includes('// GM_info'));
const gmInfoEnd = lines.findIndex((line, i) => i > gmInfoStart && line.includes('// unsafeWindow'));

if (gmInfoStart === -1 || gmInfoEnd === -1) {
  throw new Error('Could not find GM_info section in chrome.js');
}

// Extract static parts
const staticStart = lines.slice(0, gmInfoStart).join('\n');
const staticEnd = lines.slice(gmInfoEnd).join('\n');

// Build GM_info from manifest
const gmInfo = `  // GM_info
  window.GM_info = {
    script: {
      name: '${manifest.name}',
      version: '${manifest.version}',
      description: '${manifest.description}',
      author: '${manifest.author}',
      homepage: '${manifest.homepage_url}',
      downloadURL: '${manifest.homepage_url}/releases/latest/download/better-moodle-uzl.user.js',
      updateURL: '${manifest.homepage_url}/releases/latest/download/better-moodle-uzl.meta.js',
      namespace: 'https://uni-luebeck.de',
      includes: ['https://moodle.uni-luebeck.de/*'],
      matches: ['https://moodle.uni-luebeck.de/*'],
      runAt: 'document-start'
    },
    scriptMetaStr: '// @name ${manifest.name}\\n// @version ${manifest.version}\\n// @description ${manifest.description}',
    scriptHandler: 'Extension',
    version: '${manifest.version}'
  };

`;

// Combine
const newContent = staticStart + '\n' + gmInfo + staticEnd;

// Write back
writeFileSync(polyfillPath, newContent, 'utf-8');

console.log(`Updated polyfills.js to version ${manifest.version}`);
