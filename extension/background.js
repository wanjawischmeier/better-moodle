/**
 * Background Service Worker for Better-Moodle Chrome Extension
 * 
 * This script runs in the background and has full access to cross-origin requests
 * without CORS restrictions. It handles XHR requests from the content script.
 * It also registers scripts to run in MAIN world for fast injection.
 */

console.log('[Better-Moodle Extension] Background service worker started');

/**
 * Register content scripts to run in MAIN world (page context)
 * This allows them to run as fast as Tampermonkey userscripts
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Better-Moodle Extension] Registering MAIN world scripts');
  
  try {
    // Unregister any existing scripts first
    await chrome.scripting.unregisterContentScripts();
    
    // Register main script to run in MAIN world at document_start
    // This single script loads all dependencies in the correct order
    await chrome.scripting.registerContentScripts([
      {
        id: 'better-moodle-main',
        matches: ['https://moodle.uni-luebeck.de/*'],
        js: ['main.js'],
        runAt: 'document_start',
        world: 'MAIN',
        allFrames: false
      }
    ]);
    
    console.log('[Better-Moodle Extension] MAIN world scripts registered successfully');
  } catch (error) {
    console.error('[Better-Moodle Extension] Failed to register scripts:', error);
  }
});

/**
 * Handle XHR requests from content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'XHR_REQUEST') {
    handleXHRRequest(message.details, sender.tab.id)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep the message channel open for async response
  }
  
  if (message.type === 'XHR_ABORT') {
    // Handle abort requests
    sendResponse({ success: true });
    return false;
  }
});

/**
 * Handle XHR request using fetch API with full extension permissions
 */
async function handleXHRRequest(details, tabId) {
  const {
    requestId,
    method,
    url,
    headers,
    data,
    responseType,
    timeout
  } = details;

  const controller = new AbortController();
  const signal = controller.signal;
  
  // Set up timeout
  let timeoutId;
  if (timeout > 0) {
    timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);
  }

  try {
    const fetchOptions = {
      method,
      signal,
      // Don't include credentials for cross-origin requests
      credentials: 'omit',
      // Use cors mode with extension permissions
      mode: 'cors'
    };
    
    // Only add headers if provided and not empty
    if (headers && Object.keys(headers).length > 0) {
      fetchOptions.headers = headers;
    }
    
    if (data) {
      fetchOptions.body = data;
    }

    const response = await fetch(url, fetchOptions);
    
    if (timeoutId) clearTimeout(timeoutId);
    
    // Get response text first (always needed)
    const responseText = await response.text();
    
    // Build response headers string
    const responseHeaders = Array.from(response.headers.entries())
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');
    
    // Send success event to content script
    // Note: We send responseText, not complex objects, as Chrome message passing
    // doesn't support Blob/ArrayBuffer directly
    chrome.tabs.sendMessage(tabId, {
      type: 'XHR_LOAD',
      requestId,
      data: {
        status: response.status,
        statusText: response.statusText,
        responseText: responseText,
        response: responseText, // Always send as text, will be converted in page context
        responseHeaders: responseHeaders,
        finalUrl: response.url,
        responseType: responseType,
        contentType: response.headers.get('content-type') || 'text/plain',
        context: details.context
      }
    }).catch(() => {
      // Tab might be closed, ignore error
    });
    
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      chrome.tabs.sendMessage(tabId, {
        type: 'XHR_TIMEOUT',
        requestId,
        data: {
          status: 0,
          statusText: 'timeout',
          context: details.context
        }
      }).catch(() => {});
      return;
    }
    
    chrome.tabs.sendMessage(tabId, {
      type: 'XHR_ERROR',
      requestId,
      data: {
        status: 0,
        statusText: error.message,
        error: error.message,
        context: details.context
      }
    }).catch(() => {});
  }
}
