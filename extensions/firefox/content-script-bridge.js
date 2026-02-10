/**
 * Content Script Bridge for Better-Moodle Firefox Extension
 * 
 * This script runs in the CONTENT SCRIPT CONTEXT and has access to browser APIs.
 * It handles messages from the injected page script and performs browser.storage
 * and browser.notifications operations.
 * It also injects scripts into the page context.
 */

(function() {
  'use strict';

  const STORAGE_PREFIX = 'bm_';
  const activeXHRRequests = new Map();

  console.log('[Better-Moodle Extension] Content script bridge initialized');

  /**
   * Inject scripts into page context via script tags
   */
  function injectPageScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = browser.runtime.getURL(src);
      script.onload = () => {
        console.log(`[Better-Moodle Extension] Injected ${src}`);
        resolve();
      };
      script.onerror = reject;
      (document.head || document.documentElement).appendChild(script);
    });
  }

  /**
   * Initialize and inject scripts
   */
  async function initializeScripts() {
    try {
      // 1. Inject polyfills immediately
      await injectPageScript('scripts/polyfills.js');
      
      // Wait for storage cache
      if (typeof window.wrappedJSObject !== 'undefined' && window.wrappedJSObject.GM_ready) {
        await window.wrappedJSObject.GM_ready;
      }
      
      // 2. Inject DarkReader with AMD prevention wrapper
      // Save define, load DarkReader, restore define
      const darkReaderWrapper = document.createElement('script');
      darkReaderWrapper.textContent = `
        (function() {
          const originalDefine = window.define;
          const originalExports = window.exports;
          const originalModule = window.module;
          
          window.define = undefined;
          window.exports = undefined;
          window.module = undefined;
          
          const script = document.createElement('script');
          script.src = '${browser.runtime.getURL('scripts/darkreader.js')}';
          script.onload = () => {
            console.log('[Better-Moodle Extension] DarkReader loaded, restoring AMD');
            window.define = originalDefine;
            window.exports = originalExports;
            window.module = originalModule;
          };
          (document.head || document.documentElement).appendChild(script);
        })();
      `;
      (document.head || document.documentElement).appendChild(darkReaderWrapper);
      
      // 3. Wait for DOM and inject userscript
      const waitAndInject = () => {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => injectPageScript('scripts/better-moodle-uzl.user.js'), 100);
          });
        } else {
          setTimeout(() => injectPageScript('scripts/better-moodle-uzl.user.js'), 100);
        }
      };
      
      waitAndInject();
      
    } catch (error) {
      console.error('[Better-Moodle Extension] Failed to inject scripts:', error);
    }
  }

  // Start injection immediately
  initializeScripts();

  /**
   * Send a response back to the page context
   */
  function sendResponse(id, success, result, error) {
    window.postMessage({
      source: 'better-moodle-content',
      id,
      success,
      result,
      error
    }, '*');
  }

  /**
   * Send an event back to the page context (for XHR events)
   */
  function sendEvent(type, requestId, data) {
    window.postMessage({
      source: 'better-moodle-content',
      type,
      requestId,
      data
    }, '*');
  }

  /**
   * Handle XHR request by forwarding to background script
   */
  async function handleXHRRequest(details) {
    try {
      // Forward request to background script which has full CORS bypass
      await browser.runtime.sendMessage({
        type: 'XHR_REQUEST',
        details: details
      });
    } catch (error) {
      console.error('[Better-Moodle Extension] Failed to send XHR request to background:', error);
      sendEvent('XHR_ERROR', details.requestId, {
        status: 0,
        statusText: error.message,
        error: error.message,
        context: details.context
      });
    }
  }

  /**
   * Listen for XHR responses from background script
   */
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type && message.type.startsWith('XHR_')) {
      // Forward XHR events to page context
      sendEvent(message.type, message.requestId, message.data);
    }
  });

  /**
   * Handle messages from page context
   */
  window.addEventListener('message', async (event) => {
    // Only accept messages from same window
    if (event.source !== window) return;
    
    // Only accept messages from our page script
    if (!event.data || event.data.source !== 'better-moodle-page') return;
    
    const { type, data, id } = event.data;
    
    try {
      switch (type) {
        case 'STORAGE_GET_ALL': {
          const result = await browser.storage.local.get(null);
          const filtered = {};
          Object.keys(result).forEach(key => {
            if (key.startsWith(STORAGE_PREFIX)) {
              filtered[key.substring(STORAGE_PREFIX.length)] = result[key];
            }
          });
          sendResponse(id, true, filtered);
          break;
        }
        
        case 'STORAGE_SET': {
          const { key, value } = data;
          await browser.storage.local.set({ [STORAGE_PREFIX + key]: value });
          sendResponse(id, true, null);
          break;
        }
        
        case 'STORAGE_DELETE': {
          const { key } = data;
          await browser.storage.local.remove(STORAGE_PREFIX + key);
          sendResponse(id, true, null);
          break;
        }
        
        case 'NOTIFICATION': {
          const {
            text = '',
            title = 'Better-Moodle',
            image,
            onclick,
            ondone
          } = data;

          const browserNotificationOptions = {
            type: 'basic',
            iconUrl: image || browser.runtime.getURL('icon-128.png'),
            title: title,
            message: text
          };

          await browser.notifications.create('', browserNotificationOptions);
          sendResponse(id, true, null);
          break;
        }
        
        case 'XHR_REQUEST': {
          handleXHRRequest(data);
          sendResponse(id, true, null);
          break;
        }
        
        case 'XHR_ABORT': {
          const { requestId } = data;
          if (activeXHRRequests.has(requestId)) {
            activeXHRRequests.get(requestId).abort();
            activeXHRRequests.delete(requestId);
          }
          sendResponse(id, true, null);
          break;
        }
        
        default:
          sendResponse(id, false, null, `Unknown message type: ${type}`);
      }
    } catch (error) {
      console.error('[Better-Moodle Extension] Bridge error:', error);
      sendResponse(id, false, null, error.message);
    }
  });

  /**
   * Listen for storage changes and notify page context
   */
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      Object.keys(changes).forEach(prefixedKey => {
        if (prefixedKey.startsWith(STORAGE_PREFIX)) {
          const key = prefixedKey.substring(STORAGE_PREFIX.length);
          const change = changes[prefixedKey];
          
          window.postMessage({
            source: 'better-moodle-content',
            type: 'STORAGE_CHANGED',
            data: {
              key,
              oldValue: change.oldValue,
              newValue: change.newValue
            }
          }, '*');
        }
      });
    }
  });

})();
