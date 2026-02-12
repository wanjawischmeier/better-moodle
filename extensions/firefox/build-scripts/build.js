/**
 * Build script for Firefox extension
 * Calls the shared build logic with firefox-specific parameters
 */

import { buildExtension } from '../../shared-build.js';

buildExtension('firefox').catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
