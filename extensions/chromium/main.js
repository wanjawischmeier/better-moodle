/**
 * Main entry point for Better-Moodle Chrome Extension
 * Loads scripts in the correct order to ensure dependencies are available
 */

(async function () {
    'use strict';

    console.log('[Better-Moodle Extension] Main script starting');

    // Get extension ID from Error stack trace
    const error = new Error();
    const stackMatch = error.stack.match(/chrome-extension:\/\/([^\/]+)\//);

    if (!stackMatch) {
        console.error(
            '[Better-Moodle Extension] Could not determine extension ID from stack trace'
        );
        return;
    }

    const extensionId = stackMatch[1];
    console.log('[Better-Moodle Extension] Extension ID:', extensionId);

    // Helper to load script synchronously
    function loadScriptSync(url) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, false); // synchronous
        xhr.send();

        if (xhr.status === 200) {
            eval(xhr.responseText);
            return true;
        } else {
            console.error(
                `[Better-Moodle Extension] Failed to load ${url}:`,
                xhr.status
            );
            return false;
        }
    }

    // 1. Load polyfills (GM_* APIs)
    console.log('[Better-Moodle Extension] Loading polyfills...');
    loadScriptSync(`chrome-extension://${extensionId}/scripts/polyfills.js`);

    // Wait for storage cache to initialize
    if (window.GM_ready) {
        console.log('[Better-Moodle Extension] Waiting for storage cache...');
        await window.GM_ready;
        console.log('[Better-Moodle Extension] Storage cache ready');
    }

    // 2. Load DarkReader (with AMD prevention)
    console.log('[Better-Moodle Extension] Loading DarkReader...');
    const originalDefine = window.define;
    window.define = undefined;

    try {
        loadScriptSync(
            `chrome-extension://${extensionId}/scripts/darkreader.js`
        );
        console.log('[Better-Moodle Extension] DarkReader loaded');
    } finally {
        window.define = originalDefine;
    }

    // 3. Load userscript
    console.log('[Better-Moodle Extension] Loading userscript...');
    loadScriptSync(
        `chrome-extension://${extensionId}/scripts/better-moodle-uzl.user.js`
    );

    console.log('[Better-Moodle Extension] All scripts loaded successfully');
})();
