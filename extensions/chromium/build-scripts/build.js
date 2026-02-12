/**
 * Build script for Chromium extension
 * Calls the shared build logic with chromium-specific parameters
 */

import { buildExtension } from '../../shared-build.js';

buildExtension('chromium').catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
