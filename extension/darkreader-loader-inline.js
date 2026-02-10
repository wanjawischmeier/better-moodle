/**
 * DarkReader Loader - Inline version for chrome.scripting
 * Prevents RequireJS from consuming DarkReader as an AMD module
 * 
 * This version loads DarkReader synchronously to ensure it's available
 * before the userscript runs.
 */

(function() {
  'use strict';
  
  // Get the extension URL - we need to construct it
  // In MAIN world, we don't have access to chrome.runtime, but we can use a known URL pattern
  // The DarkReader script will be made web_accessible
  
  // Find our own script element to get the extension ID
  const scripts = document.querySelectorAll('script[src*="chrome-extension://"]');
  let extensionId = null;
  
  for (const script of scripts) {
    const match = script.src.match(/chrome-extension:\/\/([^\/]+)\//);
    if (match) {
      extensionId = match[1];
      break;
    }
  }
  
  if (!extensionId) {
    // Fallback: use a different method to get extension ID
    console.warn('[Better-Moodle Extension] Could not determine extension ID for DarkReader');
    return;
  }
  
  const darkReaderUrl = `chrome-extension://${extensionId}/scripts/darkreader.js`;
  
  // Temporarily disable AMD define
  const originalDefine = window.define;
  window.define = undefined;

  try {
    // Load DarkReader synchronously using XHR
    const xhr = new XMLHttpRequest();
    xhr.open('GET', darkReaderUrl, false); // false = synchronous
    xhr.send();
    
    if (xhr.status === 200) {
      // Execute DarkReader code
      eval(xhr.responseText);
      console.log('[Better-Moodle Extension] DarkReader loaded synchronously');
    } else {
      console.error('[Better-Moodle Extension] Failed to load DarkReader:', xhr.status);
    }
  } catch (error) {
    console.error('[Better-Moodle Extension] Error loading DarkReader:', error);
  } finally {
    // Restore AMD define
    window.define = originalDefine;
  }
})();
