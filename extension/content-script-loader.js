/**
 * Content Script Loader for Better-Moodle Chrome Extension
 * 
 * This script runs in the content script context and injects the userscript
 * into the page context so it has access to page globals like requirejs, M, etc.
 * 
 * The scripts are injected at document_start to match Tampermonkey behavior.
 */

(function() {
  'use strict';

  console.log('[Better-Moodle Extension] Content script loader starting...');

  /**
   * Inject a script into the page context
   * @param {string} src - The script URL
   * @param {Object} dataset - Optional data attributes to add to the script element
   * @returns {Promise} Resolves when script is loaded
   */
  function injectScript(src, dataset = null) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(src);
      
      // Add data attributes if provided
      if (dataset) {
        Object.keys(dataset).forEach(key => {
          script.dataset[key] = dataset[key];
        });
      }
      
      script.onload = () => {
        script.remove(); // Clean up
        console.log(`[Better-Moodle Extension] Loaded: ${src}`);
        resolve();
      };
      script.onerror = () => {
        console.error(`[Better-Moodle Extension] Failed to load: ${src}`);
        reject(new Error(`Failed to load ${src}`));
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  /**
   * Load scripts in sequence at document_start
   */
  async function loadScripts() {
    try {
      // Load polyfills first (sets up GM_* APIs in page context)
      await injectScript('polyfills/chrome.js');
      
      // Load DarkReader using wrapper that prevents AMD consumption
      // Pass the DarkReader URL as a data attribute
      await injectScript('darkreader-loader.js', {
        darkReaderUrl: chrome.runtime.getURL('scripts/darkreader.js')
      });
      
      // Small delay to ensure DarkReader is fully loaded
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Load the main userscript (skip the polyfills file - it conflicts with RequireJS)
      await injectScript('scripts/better-moodle-uzl.user.js');
      
      console.log('[Better-Moodle Extension] All scripts loaded successfully');
    } catch (error) {
      console.error('[Better-Moodle Extension] Script loading failed:', error);
    }
  }

  // Start loading immediately at document_start (matching Tampermonkey behavior)
  loadScripts();
})();
