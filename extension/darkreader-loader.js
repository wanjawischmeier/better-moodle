/**
 * DarkReader Loader Wrapper
 * Prevents RequireJS from consuming DarkReader as an AMD module
 * 
 * This script is injected by content-script-loader.js and runs in page context.
 * The DarkReader script URL is passed as a data attribute.
 */

(function() {
  'use strict';
  
  // Get the script element that loaded this file
  const loaderScript = document.currentScript;
  const darkReaderUrl = loaderScript.dataset.darkReaderUrl;
  
  if (!darkReaderUrl) {
    console.error('[Better-Moodle Extension] DarkReader URL not provided');
    return;
  }
  
  // Temporarily disable AMD define
  window.__amdDefine = window.define;
  window.define = undefined;

  // Load DarkReader script
  const script = document.createElement('script');
  script.src = darkReaderUrl;
  script.onload = function() {
    // Restore AMD define after DarkReader loads
    window.define = window.__amdDefine;
    delete window.__amdDefine;
    script.remove();
    console.log('[Better-Moodle Extension] DarkReader loaded and available globally');
  };
  script.onerror = function() {
    // Restore define even on error
    window.define = window.__amdDefine;
    delete window.__amdDefine;
    console.error('[Better-Moodle Extension] Failed to load DarkReader');
  };
  (document.head || document.documentElement).appendChild(script);
})();
