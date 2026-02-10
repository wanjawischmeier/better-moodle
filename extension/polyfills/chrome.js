/**
 * Chrome Extension Polyfills for Page Context
 * 
 * This script runs in the PAGE CONTEXT (injected) and provides GM_* APIs
 * by communicating with the content script via window.postMessage.
 * 
 * IMPORTANT: This file is injected into the page and does NOT have access to chrome APIs!
 */

(function() {
  'use strict';

  // Storage cache (synchronized via message passing)
  const storageCache = {};
  let cacheInitialized = false;
  let initPromise = null;
  
  // Request ID counter for async operations
  let requestId = 0;
  const pendingRequests = new Map();
  
  /**
   * Send a message to the content script bridge
   */
  function sendMessage(type, data) {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      pendingRequests.set(id, { resolve, reject });
      
      window.postMessage({
        source: 'better-moodle-page',
        type,
        data,
        id
      }, '*');
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${type}`));
        }
      }, 10000);
    });
  }
  
  /**
   * Listen for responses from content script
   */
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'better-moodle-content') return;
    
    const { id, type, success, result, error, data } = event.data;
    
    // Handle storage change notifications
    if (type === 'STORAGE_CHANGED') {
      const { key, oldValue, newValue } = data;
      
      // Update cache
      if (newValue === undefined) {
        delete storageCache[key];
      } else {
        storageCache[key] = newValue;
      }
      
      // Notify listeners
      if (valueChangeListeners[key]) {
        valueChangeListeners[key].forEach(listener => {
          try {
            listener.callback(key, oldValue, newValue, true);
          } catch (error) {
            console.error('GM_addValueChangeListener callback error:', error);
          }
        });
      }
      return;
    }
    
    // Handle responses to our requests
    if (pendingRequests.has(id)) {
      const { resolve, reject } = pendingRequests.get(id);
      pendingRequests.delete(id);
      
      if (success) {
        resolve(result);
      } else {
        reject(new Error(error || 'Unknown error'));
      }
    }
  });
  
  /**
   * Initialize storage cache from content script
   */
  async function initializeCache() {
    if (cacheInitialized) return;
    if (initPromise) return initPromise;
    
    initPromise = (async () => {
      // Wait for content script bridge to be ready
      let retries = 0;
      while (retries < 50) { // 50 * 100ms = 5 seconds max
        try {
          const allData = await sendMessage('STORAGE_GET_ALL', {});
          Object.assign(storageCache, allData);
          cacheInitialized = true;
          console.log('[Better-Moodle Extension] Storage cache initialized');
          return;
        } catch (error) {
          retries++;
          if (retries >= 50) {
            console.error('[Better-Moodle Extension] Failed to initialize cache after retries:', error);
            throw error;
          }
          // Wait 100ms before retry
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    })();
    
    return initPromise;
  }
  
  // Start initialization immediately
  initializeCache();
  
  // Expose a ready promise for main.js to wait on
  window.GM_ready = initPromise;

  // GM_getValue - synchronous API using cache
  window.GM_getValue = function(key, defaultValue) {
    const value = storageCache[key];
    return value !== undefined ? value : defaultValue;
  };

  // GM_setValue - synchronous wrapper with async backend
  window.GM_setValue = function(key, value) {
    storageCache[key] = value;
    sendMessage('STORAGE_SET', { key, value }).catch(error => {
      console.error('GM_setValue error:', error);
    });
  };

  // GM_deleteValue
  window.GM_deleteValue = function(key) {
    delete storageCache[key];
    sendMessage('STORAGE_DELETE', { key }).catch(error => {
      console.error('GM_deleteValue error:', error);
    });
  };

  // GM_listValues
  window.GM_listValues = function() {
    return Object.keys(storageCache);
  };

  // GM_addValueChangeListener
  const valueChangeListeners = {};
  window.GM_addValueChangeListener = function(key, callback) {
    const listenerId = `listener_${key}_${Date.now()}_${Math.random()}`;
    
    if (!valueChangeListeners[key]) {
      valueChangeListeners[key] = [];
    }
    
    valueChangeListeners[key].push({
      id: listenerId,
      callback: callback
    });
    
    return listenerId;
  };

  // GM_notification
  window.GM_notification = function(options) {
    const notificationOptions = typeof options === 'string' ? 
      { text: options } : options;

    sendMessage('NOTIFICATION', notificationOptions).catch(error => {
      console.error('GM_notification error:', error);
    });
  };

  // GM.xmlHttpRequest - Route through content script to bypass CORS
  window.GM = {
    xmlHttpRequest: function(details) {
      const xhrRequestId = ++requestId;
      
      // Send request to content script
      sendMessage('XHR_REQUEST', {
        requestId: xhrRequestId,
        method: details.method || 'GET',
        url: details.url,
        headers: details.headers || {},
        data: details.data,
        responseType: details.responseType || 'text',
        timeout: details.timeout || 0,
        user: details.user,
        password: details.password,
        overrideMimeType: details.overrideMimeType,
        context: details.context
      }).then(result => {
        // Request initiated successfully
        if (details.onloadstart) {
          details.onloadstart({ context: details.context });
        }
      }).catch(error => {
        console.error('GM.xmlHttpRequest setup error:', error);
        if (details.onerror) {
          details.onerror({
            status: 0,
            statusText: 'setup error',
            error: error.message,
            context: details.context
          });
        }
      });
      
      // Listen for response events
      const responseListener = (event) => {
        if (event.source !== window) return;
        if (!event.data || event.data.source !== 'better-moodle-content') return;
        if (!event.data.type || !event.data.type.startsWith('XHR_')) return;
        if (event.data.requestId !== xhrRequestId) return;
        
        const { type, data } = event.data;
        
        switch (type) {
          case 'XHR_LOAD':
            if (details.onload) {
              // Convert response to Blob if response is a string (which it will be from message passing)
              let responseData = data.response;
              if (typeof responseData === 'string' && data.responseType !== 'text') {
                // Create a Blob for compatibility with fetch polyfill expectations
                responseData = new Blob([responseData], { 
                  type: data.contentType || 'text/plain' 
                });
              }
              
              details.onload({
                status: data.status,
                statusText: data.statusText,
                responseText: data.responseText,
                response: responseData,
                responseHeaders: data.responseHeaders,
                finalUrl: data.finalUrl,
                context: data.context
              });
            }
            window.removeEventListener('message', responseListener);
            break;
            
          case 'XHR_ERROR':
            if (details.onerror) {
              details.onerror(data);
            }
            window.removeEventListener('message', responseListener);
            break;
            
          case 'XHR_ABORT':
            if (details.onabort) {
              details.onabort(data);
            }
            window.removeEventListener('message', responseListener);
            break;
            
          case 'XHR_TIMEOUT':
            if (details.ontimeout) {
              details.ontimeout(data);
            }
            window.removeEventListener('message', responseListener);
            break;
            
          case 'XHR_PROGRESS':
            if (details.onprogress) {
              details.onprogress(data);
            }
            break;
            
          case 'XHR_READYSTATECHANGE':
            if (details.onreadystatechange) {
              details.onreadystatechange(data);
            }
            break;
        }
      };
      
      window.addEventListener('message', responseListener);
      
      // Return abort handle
      return {
        abort: () => {
          sendMessage('XHR_ABORT', { requestId: xhrRequestId }).catch(() => {});
          window.removeEventListener('message', responseListener);
        }
      };
    }
  };

  // GM_addStyle
  window.GM_addStyle = function(css) {
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    return style;
  };

  // GM_info
  window.GM_info = {
    script: {
      name: '🎓️ UzL: better-moodle',
      version: '2.6.5',
      description: 'Improves UzL-Moodle by cool features and design improvements.',
      author: 'Jan (jxn_30), Yorik (YorikHansen)',
      homepage: 'https://github.com/jxn-30/better-moodle',
      downloadURL: 'https://github.com/jxn-30/better-moodle/releases/latest/download/better-moodle-uzl.user.js',
      updateURL: 'https://github.com/jxn-30/better-moodle/releases/latest/download/better-moodle-uzl.meta.js',
      namespace: 'https://uni-luebeck.de',
      includes: ['https://moodle.uni-luebeck.de/*'],
      matches: ['https://moodle.uni-luebeck.de/*'],
      runAt: 'document-start'
    },
    scriptMetaStr: '// @name 🎓️ UzL: better-moodle\n// @version 2.6.5\n// @description Improves UzL-Moodle by cool features and design improvements.',
    scriptHandler: 'Chrome Extension',
    version: '2.6.5'
  };

  // unsafeWindow
  window.unsafeWindow = window;

  console.log('[Better-Moodle Extension] GM_* APIs initialized (page context)');
})();
