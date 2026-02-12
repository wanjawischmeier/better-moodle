/**
 * Main entry point for Better-Moodle Firefox Extension
 * Loads scripts in the correct order to ensure dependencies are available
 *
 * NOTE: Firefox CSP blocks eval(), so we inject scripts via script tags instead
 */

(async function () {
    'use strict';

    console.log('[Better-Moodle Extension] Main script starting');

    // Get extension URL from current script
    const extensionUrl = browser.runtime.getURL('');
    console.log('[Better-Moodle Extension] Extension URL:', extensionUrl);

    // Helper to load script by creating script tag
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = () => {
                console.log(`[Better-Moodle Extension] Loaded ${url}`);
                resolve();
            };
            script.onerror = error => {
                console.error(
                    `[Better-Moodle Extension] Failed to load ${url}:`,
                    error
                );
                reject(error);
            };
            (document.head || document.documentElement).appendChild(script);
        });
    }

    try {
        // 1. Load polyfills (GM_* APIs)
        console.log('[Better-Moodle Extension] Loading polyfills...');
        await loadScript(browser.runtime.getURL('scripts/polyfills.js'));

        // Wait for storage cache to initialize
        if (window.GM_ready) {
            console.log(
                '[Better-Moodle Extension] Waiting for storage cache...'
            );
            await window.GM_ready;
            console.log('[Better-Moodle Extension] Storage cache ready');
        }

        // 2. Load DarkReader (with AMD prevention)
        console.log('[Better-Moodle Extension] Loading DarkReader...');
        const originalDefine = window.define;
        window.define = undefined;

        try {
            await loadScript(browser.runtime.getURL('scripts/darkreader.js'));
            console.log('[Better-Moodle Extension] DarkReader loaded');
        } finally {
            window.define = originalDefine;
        }

        // 3. Load userscript
        console.log('[Better-Moodle Extension] Loading userscript...');
        await loadScript(
            browser.runtime.getURL('scripts/better-moodle-uzl.user.js')
        );

        console.log(
            '[Better-Moodle Extension] All scripts loaded successfully'
        );
    } catch (error) {
        console.error(
            '[Better-Moodle Extension] Failed to load scripts:',
            error
        );
    }
})();
