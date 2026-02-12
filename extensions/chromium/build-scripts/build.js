/**
 * Build script for Chromium extension
 * Calls the shared build logic with chromium-specific parameters
 */

import { buildExtension } from '../../shared-build.js';

const config = process.argv[2];

buildExtension('chromium', config).catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
